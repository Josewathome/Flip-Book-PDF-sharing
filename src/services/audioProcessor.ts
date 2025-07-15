import { PodcastSegment } from '../types/podcast';

export class AudioProcessor {
  private audioContext: AudioContext;
  private openAIKey: string;

  constructor(openAIKey: string) {
    this.audioContext = new AudioContext();
    this.openAIKey = openAIKey;
  }

  async generateFullPodcast(segments: PodcastSegment[]): Promise<Blob> {
    try {
      console.log(`🎙️ Starting podcast generation with ${segments.length} segments`);
      
      // Generate all audio segments in parallel with progress tracking
      const audioPromises = segments.map((segment, index) => 
        this.generateSegment(segment, index)
          .then(buffer => {
            console.log(`✓ Segment ${index + 1}/${segments.length} completed`);
            return buffer;
          })
          .catch(error => {
            console.error(`✗ Segment ${index + 1} failed:`, error);
            throw error;
          })
      );

      // Wait for all segments to complete
      const audioBuffers = await Promise.all(audioPromises);
      console.log('🎬 All segments generated, combining audio...');

      // Combine all audio buffers
      const combinedBuffer = await this.combineAudioBuffers(audioBuffers);
      console.log('✨ Audio combination complete');

      // Convert to MP3 blob
      const finalBlob = await this.audioBufferToMP3Blob(combinedBuffer);
      console.log('📦 Final audio file created');

      return finalBlob;
    } catch (error) {
      console.error('❌ Audio processing failed:', error);
      throw error;
    }
  }

  private async generateSegment(segment: PodcastSegment, index: number): Promise<AudioBuffer> {
    console.log(`🎤 Generating segment ${index + 1} for ${segment.speaker}`);
    
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.openAIKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'tts-1',
        voice: segment.speaker === 'Alex' ? 'alloy' : 'echo',
        input: segment.text,
        response_format: 'mp3',
        speed: 1.0
      })
    });

    if (!response.ok) {
      throw new Error(`TTS API error: ${response.status} ${await response.text()}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return await this.audioContext.decodeAudioData(arrayBuffer);
  }

  private async combineAudioBuffers(buffers: AudioBuffer[]): Promise<AudioBuffer> {
    // Calculate total duration
    const totalLength = buffers.reduce((sum, buffer) => sum + buffer.length, 0);
    
    // Create a new buffer for the combined audio
    const combinedBuffer = this.audioContext.createBuffer(
      1, // mono
      totalLength,
      this.audioContext.sampleRate
    );

    // Combine all buffers
    let offset = 0;
    const combinedChannel = combinedBuffer.getChannelData(0);

    buffers.forEach((buffer, index) => {
      console.log(`📝 Combining segment ${index + 1}/${buffers.length}`);
      const channelData = buffer.getChannelData(0);
      combinedChannel.set(channelData, offset);
      offset += buffer.length;
    });

    return combinedBuffer;
  }

  private async audioBufferToMP3Blob(audioBuffer: AudioBuffer): Promise<Blob> {
    // Create a temporary source node
    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;

    // Create a media stream destination
    const destination = this.audioContext.createMediaStreamDestination();
    source.connect(destination);

    // Create a media recorder
    const mediaRecorder = new MediaRecorder(destination.stream, {
      mimeType: 'audio/webm'
    });

    return new Promise((resolve, reject) => {
      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        resolve(blob);
      };

      mediaRecorder.onerror = (event) => {
        reject(new Error('MediaRecorder error'));
      };

      // Start recording and playing
      mediaRecorder.start();
      source.start(0);

      // Stop after the duration of the buffer
      setTimeout(() => {
        mediaRecorder.stop();
        source.stop();
      }, (audioBuffer.duration * 1000) + 100); // Add 100ms buffer
    });
  }
} 