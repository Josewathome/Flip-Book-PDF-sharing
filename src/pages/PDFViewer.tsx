import React, { useEffect, useState, useRef, TouchEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, 
  Lock, 
  AlertTriangle, 
  ChevronLeft, 
  ChevronRight, 
  Maximize,
  Minimize,
  ZoomIn,
  ZoomOut,
  MessageCircle,
  Volume2
} from 'lucide-react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import Layout from '@/components/layout/pdfviewlayout';
import { PDFDocument } from '@/types/pdf';
import { getPDFById, checkPDFPassword } from '@/services/supabaseService';
import { supabase } from '@/integrations/supabase/client';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocumentProxy } from 'pdfjs-dist';
import { useFullScreen } from '@/hooks/useFullScreen';
import { cn } from '@/lib/utils';
import ChatbotPopup from '@/components/pdf/ChatbotPopup';
import PodcastDialog from '@/components/pdf/PodcastDialog';

pdfjsLib.GlobalWorkerOptions.workerSrc = 
  `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

const PDFViewer = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [pdf, setPdf] = useState<PDFDocument | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { isFullScreen, element: fullScreenRef, toggleFullScreen } = useFullScreen();
  
  const [touchStartDistance, setTouchStartDistance] = useState<number | null>(null);
  const [touchStartScale, setTouchStartScale] = useState<number>(1.0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [scrollPosition, setScrollPosition] = useState({ x: 0, y: 0 });
  const [isChatbotOpen, setIsChatbotOpen] = useState(false);
  const [pdfSummary, setPdfSummary] = useState<string>('');
  const [isChatAnalyzing, setIsChatAnalyzing] = useState(false);
  const [isPodcastOpen, setIsPodcastOpen] = useState(false);

  useEffect(() => {
    const fetchPDF = async () => {
      if (!id) return;
      
      try {
        setIsLoading(true);
        const pdfDoc = await getPDFById(id);
        
        if (!pdfDoc) {
          setError('PDF not found');
          return;
        }
        
        setPdf(pdfDoc);
        
        if (!pdfDoc.password_protected) {
          setIsAuthenticated(true);
        }
      } catch (error) {
        console.error('Error fetching PDF:', error);
        setError('Failed to load PDF');
      } finally {
        setIsLoading(false);
      }
    };

    fetchPDF();
  }, [id]);

  useEffect(() => {
    if (pdf && isAuthenticated) {
      loadPDF(pdf.file_path);
    }
  }, [pdf, isAuthenticated]);

  useEffect(() => {
    if (pdfDocument && currentPage > 0 && currentPage <= totalPages) {
      renderPage(currentPage);
    }
  }, [currentPage, pdfDocument, totalPages, scale]);

  useEffect(() => {
    const handleResize = () => {
      if (pdfDocument && currentPage > 0 && currentPage <= totalPages) {
        renderPage(currentPage);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [currentPage, pdfDocument, totalPages]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        if (currentPage < totalPages) setCurrentPage(p => p + 1);
      } else if (e.key === 'ArrowLeft') {
        if (currentPage > 1) setCurrentPage(p => p - 1);
      } else if (e.key === '+') {
        handleZoomIn();
      } else if (e.key === '-') {
        handleZoomOut();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPage, totalPages]);

  const loadPDF = async (pdfUrl: string) => {
    try {
      const loadingTask = pdfjsLib.getDocument(pdfUrl);
      const pdfDoc = await loadingTask.promise;
      setPdfDocument(pdfDoc);
      setTotalPages(pdfDoc.numPages);
      setCurrentPage(1);
    } catch (error) {
      console.error('Error loading PDF:', error);
      setError('Failed to load PDF document');
    }
  };

  const renderPage = async (pageNumber: number) => {
    if (!pdfDocument || !canvasRef.current) return;
    
    try {
      const page = await pdfDocument.getPage(pageNumber);
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      if (!context) return;

      const viewport = page.getViewport({ scale });
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      context.clearRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: context, viewport }).promise;
    } catch (error) {
      console.error('Error rendering page:', error);
      toast.error('Failed to render PDF page');
    }
  };

  const handleTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      const distance = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      setTouchStartDistance(distance);
      setTouchStartScale(scale);
    } else if (e.touches.length === 1) {
      setIsDragging(true);
      setDragStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
      if (containerRef.current) {
        setScrollPosition({
          x: containerRef.current.scrollLeft,
          y: containerRef.current.scrollTop
        });
      }
    }
  };

  const handleTouchMove = (e: TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && touchStartDistance !== null) {
      const distance = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const delta = distance / touchStartDistance;
      const newScale = Math.max(0.5, Math.min(3.0, touchStartScale * delta));
      setScale(newScale);
      e.preventDefault();
    } else if (e.touches.length === 1 && isDragging) {
      if (containerRef.current) {
        const deltaX = e.touches[0].clientX - dragStart.x;
        const deltaY = e.touches[0].clientY - dragStart.y;
        containerRef.current.scrollLeft = scrollPosition.x - deltaX;
        containerRef.current.scrollTop = scrollPosition.y - deltaY;
      }
      e.preventDefault();
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pdf || !id) return;
    
    try {
      setIsSubmitting(true);
      const isValid = await checkPDFPassword(id, { password });
      if (isValid) {
        setIsAuthenticated(true);
        setPassword('');
      } else {
        toast.error('Invalid password');
      }
    } catch (error) {
      toast.error('Failed to validate password');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrevPage = () => currentPage > 1 && setCurrentPage(p => p - 1);
  const handleNextPage = () => currentPage < totalPages && setCurrentPage(p => p + 1);
  const handleZoomIn = () => setScale(s => Math.min(s + 0.2, 3.0));
  const handleZoomOut = () => setScale(s => Math.max(s - 0.2, 0.5));

  const handleChatbotClick = async () => {
    if (!pdf) return;
    
    setIsChatAnalyzing(true);
    setIsChatbotOpen(true);
    
    try {
      // Analyze PDF and get summary
      const { data, error } = await supabase.functions.invoke('pdf-chat', {
        body: {
          action: 'analyze_pdf',
          pdfId: pdf.id,
          pdfUrl: pdf.file_path,
          pdfName: pdf.name
        }
      });

      if (error) {
        console.error('Error analyzing PDF:', error);
        toast.error('Failed to analyze PDF');
        return;
      }

      setPdfSummary(data.summary);
    } catch (error) {
      console.error('Error:', error);
      toast.error('Failed to open chatbot');
    } finally {
      setIsChatAnalyzing(false);
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="max-w-5xl mx-auto text-center py-12 space-y-4">
          <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-pdf-primary border-t-transparent"></div>
          <p className="text-lg text-gray-600 font-medium">Loading document...</p>
        </div>
      </Layout>
    );
  }

  if (error || !pdf) {
    return (
      <Layout>
        <div className="max-w-md mx-auto">
          <Card className="text-center border-red-100 bg-red-50">
            <CardHeader>
              <AlertTriangle className="h-16 w-16 text-pdf-danger mx-auto mb-4" strokeWidth={1.5} />
              <CardTitle className="text-2xl font-semibold text-pdf-danger">Unable to load PDF</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-700 font-medium">{error || 'PDF not found'}</p>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  if (pdf.password_protected && !isAuthenticated) {
    return (
      <Layout>
        <div className="max-w-md mx-auto">
          <Card className="border-blue-100 bg-blue-50">
            <CardHeader className="text-center space-y-4">
              <Lock className="h-16 w-16 text-pdf-primary mx-auto" strokeWidth={1.5} />
              <CardTitle className="text-2xl font-semibold">Protected Document</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePasswordSubmit}>
                <div className="space-y-6">
                  <Input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-12 text-center font-mono text-lg"
                    required
                  />
                  <Button 
                    type="submit" 
                    className="w-full h-12 bg-pdf-primary hover:bg-pdf-primary/90 text-white font-semibold text-lg"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Verifying...' : 'Continue'}
                  </Button>
                </div>
              </form>
            </CardContent>
            <CardFooter className="justify-center">
              <Button 
                variant="ghost" 
                onClick={() => navigate('/info')}
                className="text-pdf-primary hover:bg-blue-100"
              >
                <ArrowLeft className="h-5 w-5 mr-2" />
                Back
              </Button>
            </CardFooter>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div 
        ref={fullScreenRef} 
        className={cn(
          "max-w-5xl mx-auto relative bg-white rounded-xl",
          isFullScreen && "fixed inset-0 z-50 bg-gray-50 rounded-none"
        )}
      >
        <div className={cn(
          "flex justify-between items-center p-4 bg-white/90 backdrop-blur-sm border-b shadow-sm",
          isFullScreen && "sticky top-0 left-0 right-0 z-50"
        )}>
          

          <div className="flex items-center gap-4">
            <div className="flex items-center bg-gray-100 rounded-lg p-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleZoomOut}
                disabled={scale <= 0.5}
                className="h-9 w-9 rounded-md hover:bg-gray-200"
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium text-gray-700 w-16 text-center">
                {Math.round(scale * 100)}%
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleZoomIn}
                disabled={scale >= 3.0}
                className="h-9 w-9 rounded-md hover:bg-gray-200"
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={toggleFullScreen}
              className="rounded-lg gap-2 px-4 py-2 hover:bg-gray-100"
            >
              {isFullScreen ? (
                <Minimize className="h-5 w-5 text-gray-700" />
              ) : (
                <Maximize className="h-5 w-5 text-gray-700" />
              )}
              <span className="text-gray-700 font-medium">
                {isFullScreen ? 'Exit' : 'Fullscreen'}
              </span>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleChatbotClick}
              className="rounded-lg gap-2 px-4 py-2 hover:bg-gray-100"
            >
              <MessageCircle className="h-5 w-5 text-gray-700" />
              <span className="text-gray-700 font-medium">
                Chat
              </span>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsPodcastOpen(true)}
              className="rounded-lg gap-2 px-4 py-2 hover:bg-gray-100"
            >
              <Volume2 className="h-5 w-5 text-gray-700" />
              <span className="text-gray-700 font-medium">
                Podcast
              </span>
            </Button>
          </div>
        </div>

        <div className={cn("p-4", isFullScreen && "h-full p-0")}>
          <div 
            ref={containerRef}
            className={cn(
              "relative bg-gray-50 rounded-lg border overflow-auto",
              isFullScreen ? "h-full rounded-none" : "max-h-[calc(100vh-200px)]"
            )}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={() => {
              setTouchStartDistance(null);
              setIsDragging(false);
            }}
            style={{ touchAction: scale !== 1 ? 'none' : 'auto' }}
          >
            {!isFullScreen && (
              <div className="sticky bottom-6 left-1/2 -translate-x-1/2 z-10 w-fit mx-auto">
                <div className="flex items-center gap-2 bg-white/90 backdrop-blur-sm px-4 py-2 rounded-full shadow-lg border">
                  <Button 
                    variant="ghost"
                    size="icon"
                    onClick={handlePrevPage}
                    disabled={currentPage <= 1}
                    className="h-9 w-9 rounded-full hover:bg-gray-100"
                  >
                    <ChevronLeft className="h-5 w-5 text-gray-700" />
                  </Button>
                  <span className="text-sm font-medium text-gray-700 min-w-[100px] text-center">
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button 
                    variant="ghost"
                    size="icon"
                    onClick={handleNextPage}
                    disabled={currentPage >= totalPages}
                    className="h-9 w-9 rounded-full hover:bg-gray-100"
                  >
                    <ChevronRight className="h-5 w-5 text-gray-700" />
                  </Button>
                </div>
              </div>
            )}

            {isFullScreen && (
              <>
                {/* Side-click navigation overlay */}
                <div className="absolute inset-0 z-20 flex">
                  <div 
                    className="w-1/2 h-full cursor-pointer" 
                    onClick={handlePrevPage}
                  />
                  <div 
                    className="w-1/2 h-full cursor-pointer" 
                    onClick={handleNextPage}
                  />
                </div>

                {/* Floating page indicator */}
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-white/90 backdrop-blur-sm px-6 py-2 rounded-full shadow-lg border text-sm font-medium text-gray-700">
                  Page {currentPage} of {totalPages}
                </div>

                {/* Floating navigation controls */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handlePrevPage}
                  disabled={currentPage <= 1}
                  className="fixed left-4 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full bg-white/90 backdrop-blur-sm shadow-lg hover:bg-white z-50"
                >
                  <ChevronLeft className="h-6 w-6 text-gray-700" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleNextPage}
                  disabled={currentPage >= totalPages}
                  className="fixed right-4 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full bg-white/90 backdrop-blur-sm shadow-lg hover:bg-white z-50"
                >
                  <ChevronRight className="h-6 w-6 text-gray-700" />
                </Button>

                {/* Floating zoom controls */}
                <div className="fixed left-4 bottom-6 flex flex-col gap-4 z-50">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleZoomIn}
                    disabled={scale >= 3.0}
                    className="h-12 w-12 rounded-full bg-white/90 backdrop-blur-sm shadow-lg hover:bg-white"
                  >
                    <ZoomIn className="h-6 w-6 text-gray-700" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleZoomOut}
                    disabled={scale <= 0.5}
                    className="h-12 w-12 rounded-full bg-white/90 backdrop-blur-sm shadow-lg hover:bg-white"
                  >
                    <ZoomOut className="h-6 w-6 text-gray-700" />
                  </Button>
                </div>
              </>
            )}

            <div className="flex justify-center p-4">
              <canvas 
                ref={canvasRef} 
                className="bg-white rounded-lg shadow-lg transition-transform duration-300" 
                style={{ 
                  maxWidth: '100%',
                  touchAction: scale !== 1 ? 'none' : 'auto',
                  transform: `scale(${scale})`,
                  transformOrigin: '0 0'
                }} 
              />
            </div>
          </div>
        </div>

        <ChatbotPopup
          isOpen={isChatbotOpen}
          onClose={() => setIsChatbotOpen(false)}
          pdfId={pdf?.id || ''}
          pdfName={pdf?.name || ''}
          pdfUrl={pdf?.file_path}
          summary={pdfSummary}
          isAnalyzing={isChatAnalyzing}
        />

        <PodcastDialog
          isOpen={isPodcastOpen}
          onClose={() => setIsPodcastOpen(false)}
          pdfId={pdf?.id || ''}
          pdfName={pdf?.name || ''}
          pdfUrl={pdf?.file_path || ''}
        />
      </div>
    </Layout>
  );
};

export default PDFViewer;
