import React, { useState } from 'react';
import { PodcastGenerator } from './PodcastGenerator';
import { AudioProcessor } from '../services/audioProcessor';
import { PodcastSegment } from '../types/podcast';

interface PodcastScriptPlayerProps {
  script: string;
  segments: PodcastSegment[];
  openAIKey: string;
  onAudioGenerated: (audioUrl: string) => void;
}

export const PodcastScriptPlayer: React.FC<PodcastScriptPlayerProps> = ({
  script,
  segments,
  openAIKey,
  onAudioGenerated
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerateAudio = async () => {
    setIsGenerating(true);
    setError(null);
    console.log('Starting audio generation with segments:', segments);

    try {
      const processor = new AudioProcessor(openAIKey);
      const audioBlob = await processor.generateFullPodcast(segments);
      console.log('Audio generation completed');
      const audioUrl = URL.createObjectURL(audioBlob);
      onAudioGenerated(audioUrl);
      setIsGenerating(false);
    } catch (error) {
      console.error('Failed to generate audio:', error);
      setError(error instanceof Error ? error.message : 'Failed to generate audio');
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Podcast Script</h2>
        <pre className="whitespace-pre-wrap font-mono text-sm bg-gray-50 p-4 rounded">
          {script}
        </pre>
      </div>

      <div className="flex flex-col items-center gap-4">
        {!isGenerating && (
          <button
            onClick={handleGenerateAudio}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            disabled={isGenerating}
          >
            Generate Audio
          </button>
        )}

        {isGenerating && (
          <PodcastGenerator 
            openAIKey={openAIKey} 
            onComplete={(blob) => {
              const url = URL.createObjectURL(blob);
              onAudioGenerated(url);
              setIsGenerating(false);
            }}
            onError={(err) => {
              setError(err.message);
              setIsGenerating(false);
            }}
          />
        )}

        {error && (
          <div className="text-red-600 bg-red-50 p-4 rounded-lg">
            Error: {error}
          </div>
        )}
      </div>
    </div>
  );
};

export default PodcastScriptPlayer; 