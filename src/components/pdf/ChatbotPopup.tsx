import React, { useState, useRef, useEffect } from 'react';
import { X, MessageCircle, Send, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface Message {
  id: string;
  message: string;
  sender: 'user' | 'assistant';
  timestamp: string;
}

interface ChatbotPopupProps {
  isOpen: boolean;
  onClose: () => void;
  pdfId: string;
  pdfName: string;
  pdfUrl?: string;
  summary?: string;
  isAnalyzing?: boolean;
}

const STORAGE_KEY_PREFIX = 'pdf_chat_history_';

const ChatbotPopup: React.FC<ChatbotPopupProps> = ({
  isOpen,
  onClose,
  pdfId,
  pdfName,
  pdfUrl,
  summary,
  isAnalyzing = false
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load chat history from localStorage when component mounts
  useEffect(() => {
    const loadChatHistory = () => {
      if (!isOpen || !pdfId) return;
      
      setIsLoadingHistory(true);
      try {
        // Get chat history from localStorage
        const storageKey = `${STORAGE_KEY_PREFIX}${pdfId}`;
        const storedHistory = localStorage.getItem(storageKey);
        
        if (storedHistory) {
          const parsedHistory = JSON.parse(storedHistory) as Message[];
          setMessages(parsedHistory);
        } else {
          // If no chat history, and we have a summary, add it as the first assistant message
          if (summary) {
            const initialMessage: Message = {
              id: 'summary',
              message: `Here's a summary of the document:\n\n${summary}\n\nHow can I help you with this document?`,
              sender: 'assistant',
              timestamp: new Date().toISOString()
            };
            setMessages([initialMessage]);
            // Store initial message in localStorage
            localStorage.setItem(storageKey, JSON.stringify([initialMessage]));
          }
        }
      } catch (error) {
        console.error('Error loading chat history:', error);
        toast.error('Failed to load chat history');
        
        // Fallback to summary only
        if (summary) {
          const initialMessage: Message = {
            id: 'summary',
            message: `Here's a summary of the document:\n\n${summary}\n\nHow can I help you with this document?`,
            sender: 'assistant',
            timestamp: new Date().toISOString()
          };
          setMessages([initialMessage]);
        }
      } finally {
        setIsLoadingHistory(false);
      }
    };

    loadChatHistory();
  }, [isOpen, pdfId, summary]);

  // Save messages to localStorage whenever they change
  useEffect(() => {
    if (pdfId && messages.length > 0) {
      const storageKey = `${STORAGE_KEY_PREFIX}${pdfId}`;
      localStorage.setItem(storageKey, JSON.stringify(messages));
    }
  }, [messages, pdfId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage = inputMessage.trim();
    setInputMessage('');
    setIsLoading(true);

    // Add user message to UI immediately
    const newUserMessage: Message = {
      id: `user_${Date.now()}`,
      message: userMessage,
      sender: 'user',
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, newUserMessage]);

    try {
      // Get previous context from chat history
      const previousMessages = messages
        .slice(-10) // Get last 10 messages for context
        .map(msg => `${msg.sender.toUpperCase()}: ${msg.message}`)
        .join('\n');

      // Get AI response with RAG and chat history context
      const { data, error } = await supabase.functions.invoke('pdf-chat', {
        body: {
          action: 'chat',
          pdfId,
          message: userMessage,
          context: previousMessages // Include chat history as context
        }
      });

      if (error) throw error;

      // Handle need for embeddings error
      if (data.needsEmbeddings) {
        const errorMessage: Message = {
          id: `error_${Date.now()}`,
          message: 'Unable to process this PDF. Please try re-uploading the document.',
          sender: 'assistant',
          timestamp: new Date().toISOString()
        };
        setMessages(prev => [...prev, errorMessage]);
        return;
      }

      // Add assistant response
      const assistantMessage: Message = {
        id: `assistant_${Date.now()}`,
        message: data.message,
        sender: 'assistant',
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, assistantMessage]);

    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Failed to get response');
      // Remove the user message on error
      setMessages(prev => prev.filter(msg => msg.id !== newUserMessage.id));
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <Card className="w-full max-w-2xl h-[80vh] mx-4 flex flex-col">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 shrink-0">
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-primary" />
            Chat about: {pdfName}
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <CardContent className="flex-1 flex flex-col overflow-hidden p-6">
          <ScrollArea className="flex-1 -mr-6 pr-6">
            <div className="space-y-4 min-h-full">
              {isAnalyzing || isLoadingHistory ? (
                <div className="flex justify-center items-center h-32">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">
                      {isAnalyzing ? 'Analyzing document and preparing chat...' : 'Loading chat history...'}
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${
                        message.sender === 'user' ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      <div
                        className={`max-w-[80%] rounded-lg px-4 py-2 ${
                          message.sender === 'user'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted'
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap">{message.message}</p>
                      </div>
                    </div>
                  ))}
                  {isLoading && (
                    <div className="flex justify-start">
                      <div className="bg-muted rounded-lg px-4 py-2 flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm">Thinking...</span>
                      </div>
                    </div>
                  )}
                </>
              )}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          <div className="flex gap-2 mt-4 shrink-0">
            <Input
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask a question about this PDF..."
              disabled={isLoading || isAnalyzing || isLoadingHistory}
              className="flex-1"
            />
            <Button 
              onClick={sendMessage} 
              disabled={!inputMessage.trim() || isLoading || isAnalyzing || isLoadingHistory}
              size="icon"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ChatbotPopup;