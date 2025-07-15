import React, { useState, useCallback, useEffect } from 'react';
import { AudioProcessor } from '../services/audioProcessor';
import { PodcastSegment } from '../types/podcast';

interface PodcastGeneratorProps {
  openAIKey: string;
  segments?: PodcastSegment[];
  onComplete: (audioBlob: Blob) => void;
  onError: (error: Error) => void;
}

export const PodcastGenerator: React.FC<PodcastGeneratorProps> = ({
  openAIKey,
  segments = [],
  onComplete,
  onError
}) => {
  const [status, setStatus] = useState<string>('');
  const [progress, setProgress] = useState<number>(0);

  useEffect(() => {
    if (segments.length > 0) {
      generatePodcast(segments).catch(error => {
        console.error('Failed to generate podcast:', error);
        onError(error instanceof Error ? error : new Error('Failed to generate podcast'));
      });
    }
  }, [segments]);

  const generatePodcast = async (podcastSegments: PodcastSegment[]) => {
    try {
      setStatus('Initializing audio processor...');
      console.log('Starting audio generation for segments:', podcastSegments);
      
      const processor = new AudioProcessor(openAIKey);
      
      // Process the audio
      setStatus('Starting audio generation...');
      const audioBlob = await processor.generateFullPodcast(podcastSegments);
      
      console.log('Audio generation complete');
      setStatus('Audio generation complete!');
      setProgress(100);
      onComplete(audioBlob);
    } catch (error) {
      console.error('Error generating audio:', error);
      setStatus('Error generating audio');
      onError(error instanceof Error ? error : new Error('Unknown error occurred'));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center space-y-2">
        <div className="w-full bg-gray-200 rounded-full h-2.5">
          <div 
            className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" 
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-sm text-gray-600">{status}</p>
      </div>
    </div>
  );
};

export default PodcastGenerator; 