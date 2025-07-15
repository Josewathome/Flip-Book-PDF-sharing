
import { useState, useRef, useEffect } from 'react';

interface UseFullScreenReturn {
  isFullScreen: boolean;
  element: React.RefObject<HTMLDivElement>;
  toggleFullScreen: () => Promise<void>;
}

export const useFullScreen = (): UseFullScreenReturn => {
  const [isFullScreen, setIsFullScreen] = useState(false);
  const element = useRef<HTMLDivElement>(null);

  // Update state when fullscreen changes externally (e.g., Esc key)
  useEffect(() => {
    const handleFullScreenChange = () => {
      setIsFullScreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullScreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullScreenChange);
    };
  }, []);

  // Handle keyboard shortcuts (Esc already works by default for exiting)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isFullScreen) {
        // Arrow keys for navigation when in full screen
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          // Prevent default browser behavior (scrolling)
          e.preventDefault();
          
          // We'll dispatch a custom event that the PDFViewer can listen for
          const eventType = e.key === 'ArrowRight' ? 'pdf-next-page' : 'pdf-prev-page';
          window.dispatchEvent(new CustomEvent(eventType));
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFullScreen]);

  const toggleFullScreen = async (): Promise<void> => {
    if (!element.current) return;

    try {
      if (!document.fullscreenElement) {
        await element.current.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (error) {
      console.error('Error toggling fullscreen:', error);
    }
  };

  return { isFullScreen, element, toggleFullScreen };
};
