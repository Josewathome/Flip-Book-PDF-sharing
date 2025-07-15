import React, { useState, useEffect } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Volume2, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface PodcastDialogProps {
  isOpen: boolean;
  onClose: () => void;
  pdfId: string;
  pdfName: string;
  pdfUrl: string;
}

interface PodcastData {
  script: string | null;
  audioUrl: string | null;
  error?: string;
}

const PodcastDialog: React.FC<PodcastDialogProps> = ({
  isOpen,
  onClose,
  pdfId,
  pdfName,
  pdfUrl
}): JSX.Element => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [podcastData, setPodcastData] = useState<PodcastData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && pdfId) {
      checkExistingPodcast();
    }
  }, [isOpen, pdfId]);

  const checkExistingPodcast = async () => {
    setIsChecking(true);
    setError(null);
    try {
      console.log('Checking for existing podcast:', pdfId);
      const { data, error } = await supabase.functions.invoke('pdf-chat', {
        body: {
          action: 'check_podcast_status',
          pdfId
        }
      });

      if (error) {
        throw error;
      }

      if (data?.script && data?.audioUrl) {
        console.log('Found complete existing podcast');
        setPodcastData(data);
        toast.success('Loaded existing podcast');
      } else {
        console.log('No complete podcast found');
        setPodcastData(null);
      }
    } catch (error) {
      console.error('Error checking podcast:', error);
      setError('Failed to check for existing podcast');
      toast.error('Failed to check for existing podcast');
    } finally {
      setIsChecking(false);
    }
  };

  const generatePodcast = async () => {
    if (isGenerating || isChecking) return;
    
    console.log('Starting podcast generation');
    setIsGenerating(true);
    setError(null);
    
    try {
      const { data, error } = await supabase.functions.invoke('pdf-chat', {
        body: {
          action: 'generate_podcast',
          pdfId,
          pdfUrl,
          pdfName,
          forceRegenerate: true
        }
      });

      if (error || !data) {
        throw new Error(error?.message || 'Failed to generate podcast');
      }

      if (data.script && data.audioUrl) {
        console.log('Podcast generated successfully');
        setPodcastData(data);
        toast.success('Generated new podcast successfully');
      } else {
        throw new Error('Generated podcast is incomplete');
      }
    } catch (error) {
      console.error('Generation error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to generate podcast';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsGenerating(false);
    }
  };

  const formatScript = (script: string | null) => {
    if (!script) return null;
    
    return script.split('\n').map((line, index) => {
      const isAlex = line.includes('[ALEX:]');
      const isJordan = line.includes('[JORDAN:]');
      
      if (isAlex || isJordan) {
        const speaker = isAlex ? 'Alex' : 'Jordan';
        const colorClass = isAlex ? 'blue' : 'green';
        const text = line.replace(/^\[.*?\]/, '').trim();
        
        return (
          <div key={index} className={`mb-4 p-3 bg-${colorClass}-50 rounded-lg border-l-4 border-${colorClass}-400`}>
            <span className={`font-semibold text-${colorClass}-700`}>{speaker}:</span>
            <p className="text-gray-700 mt-1">{text}</p>
          </div>
        );
      }
      
      return line.trim() ? (
        <p key={index} className="mb-2 text-gray-600 italic">
          {line.trim()}
        </p>
      ) : null;
    }).filter(Boolean);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Volume2 className="h-5 w-5" />
            PDF Podcast: {pdfName}
          </DialogTitle>
          <DialogDescription>
            Generate and listen to an AI-generated podcast discussing the content of your PDF document.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <Card className="border-destructive">
              <CardContent>
                <div className="flex items-center gap-2 text-destructive">
                  <AlertCircle className="h-5 w-5" />
                  <p>{error}</p>
                </div>
                <Button 
                  onClick={checkExistingPodcast} 
                  className="mt-4"
                >
                  Try Again
                </Button>
              </CardContent>
            </Card>
          )}

          {(isChecking || isGenerating) && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-center gap-3">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <p className="text-gray-600">
                    {isChecking ? 'Checking for existing podcast...' : 'Generating podcast...'}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {podcastData?.audioUrl && (
            <Card>
              <CardHeader>
                <CardTitle>Audio Player</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <audio 
                    controls 
                    className="w-full" 
                    src={podcastData.audioUrl}
                  />
                  <div className="flex gap-2">
                    <Button
                      onClick={generatePodcast}
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      disabled={isGenerating || isChecking}
                    >
                      {isGenerating ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Volume2 className="h-4 w-4 mr-2" />
                          Generate New Version
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {podcastData?.script && (
            <Card>
              <CardHeader>
                <CardTitle>Podcast Script</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-96 overflow-y-auto pr-4">
                  {formatScript(podcastData.script)}
                </div>
              </CardContent>
            </Card>
          )}

          {!isChecking && !isGenerating && !podcastData && !error && (
            <Card>
              <CardHeader>
                <CardTitle>Generate AI Podcast</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600 mb-4">
                  Generate an engaging podcast-style discussion about this PDF document. 
                  Two AI hosts (Alex and Jordan) will review and discuss the content in detail.
                </p>
                <Button 
                  onClick={generatePodcast} 
                  disabled={isGenerating || isChecking}
                  className="w-full"
                >
                  Generate Podcast
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PodcastDialog;