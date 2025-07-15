import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle, Cpu, Zap } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ProcessingResult {
  summary: string;
  cached: boolean;
  enhanced: boolean;
  processing_method: string;
  error?: string;
}

export const WasmTester: React.FC = () => {
  const [pdfUrl, setPdfUrl] = useState('');
  const [pdfName, setPdfName] = useState('');
  const [loading, setLoading] = useState(false);
  const [standardResult, setStandardResult] = useState<ProcessingResult | null>(null);
  const [wasmResult, setWasmResult] = useState<ProcessingResult | null>(null);

  const generateTestId = () => `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const testStandardProcessing = async () => {
    if (!pdfUrl || !pdfName) {
      toast.error('Please provide PDF URL and name');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('pdf-chat', {
        body: {
          action: 'analyze_pdf',
          pdfId: generateTestId(),
          pdfUrl,
          pdfName,
        }
      });

      if (error) throw error;
      
      setStandardResult(data);
      toast.success('Standard processing completed');
    } catch (error) {
      console.error('Standard processing failed:', error);
      toast.error(`Standard processing failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const testWasmProcessing = async () => {
    if (!pdfUrl || !pdfName) {
      toast.error('Please provide PDF URL and name');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('pdf-chat', {
        body: {
          action: 'analyze_pdf_enhanced',
          pdfId: generateTestId(),
          pdfUrl,
          pdfName,
          useWasm: true,
        }
      });

      if (error) throw error;
      
      setWasmResult(data);
      toast.success('WebAssembly processing completed');
    } catch (error) {
      console.error('WASM processing failed:', error);
      toast.error(`WASM processing failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const testWasmFunctionality = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('pdf-chat', {
        body: { action: 'test_wasm' }
      });

      if (error) throw error;
      
      toast.success(`WASM Test: ${data.wasmTest.overallStatus}`);
      console.log('WASM Test Results:', data);
    } catch (error) {
      console.error('WASM test failed:', error);
      toast.error(`WASM test failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const ResultCard: React.FC<{ 
    title: string; 
    result: ProcessingResult | null; 
    icon: React.ReactNode;
  }> = ({ title, result, icon }) => (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {result ? (
          <>
            <div className="flex flex-wrap gap-2">
              <Badge variant={result.enhanced ? "default" : "secondary"}>
                {result.enhanced ? "Enhanced" : "Standard"}
              </Badge>
              <Badge variant={result.cached ? "outline" : "default"}>
                {result.cached ? "Cached" : "Fresh"}
              </Badge>
              <Badge variant="outline">
                {result.processing_method || 'unknown'}
              </Badge>
            </div>
            
            {result.error ? (
              <div className="flex items-start gap-2 p-3 bg-destructive/10 rounded-lg">
                <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
                <div className="text-sm text-destructive">{result.error}</div>
              </div>
            ) : (
              <div className="flex items-start gap-2 p-3 bg-muted rounded-lg">
                <CheckCircle className="h-4 w-4 text-green-600 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium mb-2">Summary:</p>
                  <p className="text-muted-foreground line-clamp-6">
                    {result.summary}
                  </p>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            No results yet. Click the test button above.
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">WebAssembly + Python Integration Tester</h1>
        <p className="text-muted-foreground">
          Compare standard PDF processing with enhanced WebAssembly + Python processing
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Test Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">PDF URL</label>
              <Input
                placeholder="https://example.com/document.pdf"
                value={pdfUrl}
                onChange={(e) => setPdfUrl(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">PDF Name</label>
              <Input
                placeholder="Document Name"
                value={pdfName}
                onChange={(e) => setPdfName(e.target.value)}
              />
            </div>
          </div>
          
          <div className="flex gap-4">
            <Button 
              onClick={testStandardProcessing}
              disabled={loading}
              variant="outline"
              className="flex-1"
            >
              <Cpu className="h-4 w-4 mr-2" />
              Test Standard Processing
            </Button>
            <Button 
              onClick={testWasmProcessing}
              disabled={loading}
              className="flex-1"
            >
              <Zap className="h-4 w-4 mr-2" />
              Test WebAssembly + Python
            </Button>
          </div>
          
          <Button 
            onClick={testWasmFunctionality}
            disabled={loading}
            variant="secondary"
            className="w-full"
          >
            <AlertCircle className="h-4 w-4 mr-2" />
            Test WebAssembly Functionality
          </Button>
          
          {loading && (
            <div className="text-center py-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
              <p className="text-sm text-muted-foreground mt-2">Processing PDF...</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ResultCard
          title="Standard Processing"
          result={standardResult}
          icon={<Cpu className="h-5 w-5" />}
        />
        <ResultCard
          title="WebAssembly + Python"
          result={wasmResult}
          icon={<Zap className="h-5 w-5" />}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Integration Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold mb-2">Standard Processing</h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• TypeScript/JavaScript in Edge Functions</li>
                <li>• OpenAI Vision API for OCR</li>
                <li>• Standard text processing</li>
                <li>• Reliable and fast</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-2">WebAssembly + Python</h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Pyodide runtime in Edge Functions</li>
                <li>• Python PDF processing libraries</li>
                <li>• Enhanced text extraction</li>
                <li>• Advanced analytics capabilities</li>
              </ul>
            </div>
          </div>
          
          <div className="p-4 bg-muted rounded-lg">
            <p className="text-sm">
              <strong>Note:</strong> The WebAssembly integration allows your FastAPI Python logic 
              to run directly in the Supabase Edge Function, providing enhanced processing 
              capabilities while maintaining the serverless architecture.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};