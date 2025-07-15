// Import types for Deno
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { corsHeaders } from '../_shared/cors.ts';
import { generatePodcast, checkPodcastStatus } from './podcast.ts';
import { 
  processAndStoreEmbeddings, 
  getStoredEmbeddings, 
  generateEmbeddings,
  calculateCosineSimilarity,
  splitTextIntoChunks
} from './embeddings.ts';

// Define types for embeddings data
interface EmbeddingChunk {
  text: string;
  embedding: number[];
}

interface EmbeddingData {
  document_embedding?: number[];
  documentEmbedding?: number[];
  chunks: EmbeddingChunk[];
  metadata: any;
}

// WebAssembly Python Integration
let pyodide: any = null;
let pyodideReady = false;

// Single implementation of initializePyodide
async function initializePyodide() {
  if (pyodideReady) return pyodide;
  
  try {
    console.log('[WASM] Starting Pyodide initialization...');
    
    // Load Pyodide from CDN
    console.log('[WASM] Fetching Pyodide script...');
    const pyodideScript = await fetch('https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js');
    if (!pyodideScript.ok) {
      throw new Error(`Failed to fetch Pyodide script: ${pyodideScript.status}`);
    }
    const pyodideCode = await pyodideScript.text();
    
    // Create a more complete mock environment
    console.log('[WASM] Setting up Pyodide environment...');
    const mockWindow = {
      document: {
        currentScript: { src: 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js' },
        getElementsByTagName: () => [],
        createElement: () => ({ setAttribute: () => {} }),
        head: { appendChild: () => {} }
      },
      navigator: { userAgent: 'Deno/Edge' },
      location: { href: 'https://edge.function' },
      fetch: fetch.bind(globalThis),
      performance: { now: () => Date.now() },
      TextDecoder,
      TextEncoder,
      crypto: { getRandomValues: () => new Uint8Array(32) },
      indexedDB: undefined,
      Worker: undefined
    };

    // Create global scope with enhanced mock environment
    const pyodideGlobal = new Function('self', 'window', pyodideCode);
    pyodideGlobal(mockWindow, mockWindow);
    
    // Initialize Pyodide with specific configuration
    console.log('[WASM] Loading Pyodide...');
    const loadPyodide = (mockWindow as any).loadPyodide;
    pyodide = await loadPyodide({
      indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/',
      stdout: (msg: string) => console.log('[Python]', msg),
      stderr: (msg: string) => console.error('[Python Error]', msg)
    });
    
    // Run a simple test to verify Python is working
    try {
      console.log('[WASM] Testing Python execution...');
      const testResult = await pyodide.runPythonAsync(`
        print("Python test starting...")
        test_result = {"status": "success", "message": "Python is working"}
        print("Python test completed")
        test_result
      `);
      console.log('[WASM] Python test result:', testResult.toJs());
    } catch (testError) {
      console.error('[WASM] Python test failed:', testError);
      throw new Error(`Python test failed: ${testError}`);
    }
    
    console.log('[WASM] Installing required packages...');
    
    // Install core packages
    try {
      console.log('[WASM] Installing numpy and micropip...');
      await pyodide.loadPackage(['numpy', 'micropip']);
      console.log('[WASM] Core packages installed');
    } catch (error) {
      console.error('[WASM] Failed to install core packages:', error);
      throw error;
    }
    
    // Install additional packages via micropip
    try {
      console.log('[WASM] Installing additional packages...');
      await pyodide.runPythonAsync(`
        import micropip
        print("[WASM] Available packages before install:", micropip.list())
        print("[WASM] Installing packages via micropip...")
        await micropip.install(['requests', 'pypdf'])
        print("[WASM] Available packages after install:", micropip.list())
        print("[WASM] Packages installed successfully")
      `);
      console.log('[WASM] Additional packages installed');
    } catch (error) {
      console.error('[WASM] Failed to install additional packages:', error);
      throw error;
    }
    
    // Verify installations
    const verificationCode = `
import sys
print("[WASM] Verifying package installation:")
for pkg in ['numpy', 'requests', 'pypdf']:
    try:
        __import__(pkg)
        print(f"✓ {pkg} successfully imported")
        # Print package version
        pkg_module = __import__(pkg)
        version = getattr(pkg_module, '__version__', 'unknown')
        print(f"  Version: {version}")
    except ImportError as e:
        print(f"✗ {pkg}: {str(e)}")
        raise ImportError(f"Failed to import {pkg}: {str(e)}")
    `;
    
    try {
      console.log('[WASM] Verifying package installation...');
      await pyodide.runPythonAsync(verificationCode);
    } catch (error) {
      console.error('[WASM] Package verification failed:', error);
      throw error;
    }
    
    // Load and verify the PDF processor module
    try {
      console.log('[WASM] Loading PDF processor module...');
      const processorCode = await getPythonPDFProcessor();
      await pyodide.runPythonAsync(processorCode);
      
      // Test the PDF processor with a simple base64 string
      console.log('[WASM] Testing PDF processor...');
      const testPdfBase64 = 'JVBERi0xLjcKCjEgMCBvYmogICUgZW50cnkgcG9pbnQKPDwKICAvVHlwZSAvQ2F0YWxvZwogIC9QYWdlcyAyIDAgUgo+PgplbmRvYmoKCjIgMCBvYmoKPDwKICAvVHlwZSAvUGFnZXMKICAvTWVkaWFCb3ggWyAwIDAgMjAwIDIwMCBdCiAgL0NvdW50IDEKICAvS2lkcyBbIDMgMCBSIF0KPj4KZW5kb2JqCgozIDAgb2JqCjw8CiAgL1R5cGUgL1BhZ2UKICAvUGFyZW50IDIgMCBSCiAgL1Jlc291cmNlcyA8PAogICAgL0ZvbnQgPDwKICAgICAgL0YxIDQgMCBSIAogICAgPj4KICA+PgogIC9Db250ZW50cyA1IDAgUgo+PgplbmRvYmoKCjQgMCBvYmoKPDwKICAvVHlwZSAvRm9udAogIC9TdWJ0eXBlIC9UeXBlMQogIC9CYXNlRm9udCAvVGltZXMtUm9tYW4KPj4KZW5kb2JqCgo1IDAgb2JqICAlIHBhZ2UgY29udGVudAo8PAogIC9MZW5ndGggNDQKPj4Kc3RyZWFtCkJUCjcwIDUwIFRECi9GMSAxMiBUZgooSGVsbG8sIFdvcmxkKSBUagpFVAplbmRzdHJlYW0KZW5kb2JqCgp4cmVmCjAgNgowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMTAgMDAwMDAgbiAKMDAwMDAwMDA3OSAwMDAwMCBuIAowMDAwMDAwMTczIDAwMDAwIG4gCjAwMDAwMDAzMDEgMDAwMDAgbiAKMDAwMDAwMDM4MCAwMDAwMCBuIAp0cmFpbGVyCjw8CiAgL1NpemUgNgogIC9Sb290IDEgMCBSCj4+CnN0YXJ0eHJlZgo0OTIKJSVFT0YK';
      await pyodide.runPythonAsync(`
        print("[WASM] Testing PDF processor initialization...")
        processor = await get_processor("test_key")
        print("[WASM] Testing PDF text extraction...")
        import base64
        from io import BytesIO
        from pypdf import PdfReader
        
        # Test PDF reading
        pdf_bytes = base64.b64decode("${testPdfBase64}")
        pdf_io = BytesIO(pdf_bytes)
        reader = PdfReader(pdf_io)
        text = reader.pages[0].extract_text()
        print("[WASM] Test PDF content:", text)
        print("[WASM] PDF processor test completed")
      `);
      console.log('[WASM] PDF processor module loaded and tested');
    } catch (error) {
      console.error('[WASM] Failed to load or test PDF processor:', error);
      throw error;
    }
    
    pyodideReady = true;
    console.log('[WASM] Pyodide initialization completed successfully');
    return pyodide;
    
  } catch (error) {
    console.error('[WASM] Pyodide initialization failed:', error);
    pyodideReady = false;
    return null;
  }
}

// Single implementation of getPythonPDFProcessor
async function getPythonPDFProcessor(): Promise<string> {
  return `
import base64
import json
from io import BytesIO
from pypdf import PdfReader
import tempfile
import os

class PDFEmbedder:
    def __init__(self, api_key=None):
        self.api_key = api_key
        self.ocr_initialized = False

    async def process_pdf(self, pdf_url):
        """Complete processing pipeline for large PDFs"""
        temp_file = None
        try:
            # Create temporary file
            temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.pdf')
            temp_path = temp_file.name
            temp_file.close()

            # Download PDF with streaming and chunk size limit
            import js
            response = await js.fetch(pdf_url)
            if not response.ok:
                raise Exception(f"HTTP {response.status}")

            # Process in chunks to avoid memory issues
            chunk_size = 1024 * 1024  # 1MB chunks
            buffer = await response.arrayBuffer()
            uint8_array = js.Uint8Array.new(buffer)
            pdf_bytes = bytes(uint8_array.to_py())

            # Write in chunks
            with open(temp_path, 'wb') as f:
                for i in range(0, len(pdf_bytes), chunk_size):
                    chunk = pdf_bytes[i:i + chunk_size]
                    f.write(chunk)
                    del chunk  # Explicitly free memory

            # Extract text with memory-efficient reader
            text = ""
            with open(temp_path, 'rb') as f:
                reader = PdfReader(f)
                for i, page in enumerate(reader.pages):
                    try:
                        page_text = page.extract_text()
                        if page_text:
                            text += f"--- Page {i+1} ---\\n{page_text}\\n\\n"
                        # Free page from memory
                        page.clear_caches()
                        del page_text
                    except Exception as e:
                        print(f"Error on page {i+1}: {str(e)}")
                        continue

            if not text.strip():
                raise Exception("No text could be extracted")

            # Generate embedding with memory efficiency
            max_chunk = 8000  # Maximum size for embedding generation
            if len(text) > max_chunk:
                chunks = [text[i:i + max_chunk] for i in range(0, len(text), max_chunk)]
                embeddings = []
                for chunk in chunks:
                    try:
                        chunk_embedding = await self._generate_embedding(chunk)
                        if chunk_embedding:
                            embeddings.append(chunk_embedding)
                    except Exception as e:
                        print(f"Embedding error: {str(e)}")
                    finally:
                        del chunk  # Free memory

                # Average the embeddings
                if embeddings:
                    import numpy as np
                    embedding = np.mean(embeddings, axis=0).tolist()
                    del embeddings  # Free memory
                else:
                    raise Exception("Embedding generation failed")
            else:
                embedding = await self._generate_embedding(text)
                if not embedding:
                    raise Exception("Embedding generation failed")

            return {
                'status': 'success',
                'text': text,
                'embedding': embedding,
                'metadata': {
                    'source': pdf_url,
                    'pages': text.count('--- Page'),
                    'characters': len(text),
                    'extraction_method': 'pypdf',
                    'chunks_processed': len(chunks) if 'chunks' in locals() else 1
                }
            }

        except Exception as e:
            print(f"PDF processing error: {str(e)}")
            return {
                'status': 'error',
                'message': str(e)
            }
        finally:
            # Clean up
            if temp_file and os.path.exists(temp_path):
                try:
                    os.unlink(temp_path)
                except:
                    pass

    async def _generate_embedding(self, text):
        """Generate embedding for text"""
        try:
            import js
            response = await js.fetch(
                'https://api.openai.com/v1/embeddings',
                method='POST',
                headers={
                    'Authorization': f'Bearer {self.api_key}',
                    'Content-Type': 'application/json',
                },
                body=json.dumps({
                    'model': 'text-embedding-3-large',
                    'input': text
                })
            )
            data = await response.json()
            return data['data'][0]['embedding']
        except Exception as e:
            print(f'[Embedding] Error: {str(e)}')
            return None

# Singleton processor instance
_processor = None

async def get_processor(api_key=None):
    """Get or create the processor instance"""
    global _processor
    if _processor is None:
        _processor = PDFEmbedder(api_key)
    return _processor

async def embed_pdf(pdf_url, api_key=None):
    """Public interface for PDF embedding"""
    processor = await get_processor(api_key)
    return await processor.process_pdf(pdf_url)
`;
}

// Declare Deno namespace for TypeScript
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

async function generateSummaryFromEmbeddings(
  pdfName: string,
  pdfContent: string,
  embeddings: number[]
): Promise<string> {
  const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openAIApiKey) {
    throw new Error('OpenAI API key is not configured');
  }

  try {
    // Split content into smaller chunks for summarization
    const chunks = splitTextIntoChunks(pdfContent, 6000);
    const summaries: string[] = [];
    
    // Generate summaries for each chunk
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`[Summary] Processing chunk ${i + 1}/${chunks.length}`);
      
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAIApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4-turbo-preview',
          messages: [
            {
              role: 'system',
              content: `You are a helpful assistant that provides concise but informative summaries of document sections. 
              Create a clear summary that captures the key points, maintaining the document's original context and meaning.
              Focus on the most important information and maintain a professional tone.`
            },
            {
              role: 'user',
              content: `Please summarize this section of the document titled "${pdfName}" (Part ${i + 1} of ${chunks.length}):\n\n${chunk}`
            }
          ],
          max_tokens: 500,
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('[Summary] OpenAI API error:', error);
        throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
      }

      const data = await response.json();
      summaries.push(data.choices[0].message.content);
      
      // Add delay between chunks to respect rate limits
      if (chunks.length > 1 && i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // If we have multiple summaries, combine them
    if (summaries.length > 1) {
      console.log('[Summary] Generating final combined summary');
      const combinedSummary = summaries.join('\n\n');
      
      const finalResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAIApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4-turbo-preview',
          messages: [
            {
              role: 'system',
              content: 'You are a helpful assistant that combines multiple document summaries into a single coherent summary. Maintain the key points while eliminating redundancy.'
            },
            {
              role: 'user',
              content: `Please combine these summaries of the document "${pdfName}" into a single coherent summary:\n\n${combinedSummary}`
            }
          ],
          max_tokens: 500,
          temperature: 0.3,
        }),
      });

      if (!finalResponse.ok) {
        const error = await finalResponse.json();
        console.error('[Summary] OpenAI API error:', error);
        throw new Error(`OpenAI API error: ${error.error?.message || finalResponse.statusText}`);
      }

      const finalData = await finalResponse.json();
      return finalData.choices[0].message.content;
    }

    return summaries[0];
  } catch (error) {
    console.error('[Summary] OpenAI API error:', error);
    throw error;
  }
}

// Update the analyzePDFEnhanced function to handle errors better
async function analyzePDFEnhanced(pdfId: string, pdfUrl: string, pdfName: string, useWasm: boolean = true) {
  try {
    console.log(`[Analysis] Starting enhanced analysis for PDF: ${pdfName}`);
    console.log(`[Analysis] PDF URL: ${pdfUrl}`);
    console.log(`[Analysis] Using WASM: ${useWasm}`);

    // Check for existing analysis
    const { data: existingAnalysis } = await supabase
      .from('pdf_analysis')
      .select('summary, embedding_data')
      .eq('pdf_id', pdfId)
      .single();

    if (existingAnalysis?.summary && existingAnalysis?.embedding_data) {
      console.log('[Analysis] Found existing analysis, returning cached version');
      return new Response(
        JSON.stringify({ 
          summary: existingAnalysis.summary,
          cached: true,
          enhanced: existingAnalysis.embedding_data?.metadata?.enhanced || false
        }),
        { headers: { ...corsHeaders(), 'Content-Type': 'application/json' } }
      );
    }

    let embeddingData: EmbeddingData | null = null;
    let processingMethod = 'standard';
    let processingError: string | undefined;

    // Try standard processing first
    try {
      console.log('[Analysis] Using standard processing method');
      const { success, error } = await processAndStoreEmbeddings(pdfId, pdfUrl);
      if (!success) {
        throw new Error(error || 'Failed to process embeddings');
      }

      const storedEmbeddings = await getStoredEmbeddings(pdfId);
      if (!storedEmbeddings) {
        throw new Error('Failed to retrieve embeddings');
      }
      embeddingData = storedEmbeddings as EmbeddingData;
      processingMethod = 'standard';
    } catch (standardError) {
      console.error('[Analysis] Standard processing failed:', standardError);
      
      // Try fallback to Vision API if text extraction failed
      try {
        console.log('[Analysis] Attempting Vision API fallback...');
        const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
        if (!openAIApiKey) {
          throw new Error('OpenAI API key not configured');
        }

        const response = await fetch(pdfUrl);
        const pdfBuffer = await response.arrayBuffer();
        const base64Pdf = btoa(String.fromCharCode(...new Uint8Array(pdfBuffer)));

        const visionResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openAIApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4-vision-preview',
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: 'Extract all text from this PDF document.' },
                  {
                    type: 'image',
                    image_url: {
                      url: `data:application/pdf;base64,${base64Pdf}`
                    }
                  }
                ]
              }
            ],
            max_tokens: 4096
          })
        });

        if (!visionResponse.ok) {
          throw new Error('Vision API failed');
        }

        const visionData = await visionResponse.json();
        const extractedText = visionData.choices[0].message.content;

        // Generate embeddings for the extracted text
        const embedding = await generateEmbeddings(extractedText);
        if (!embedding) {
          throw new Error('Failed to generate embeddings');
        }
        
        embeddingData = {
          document_embedding: embedding,
          chunks: [{
            text: extractedText,
            embedding: embedding
          }],
          metadata: {
            model: 'text-embedding-3-large',
            enhanced: true,
            processor: 'vision-api',
            fallback: true
          }
        };
        processingMethod = 'vision-fallback';
      } catch (visionError) {
        console.error('[Analysis] Vision API fallback failed:', visionError);
        throw standardError; // Throw original error if fallback fails
      }
    }

    if (!embeddingData) {
      throw new Error('Failed to generate embeddings');
    }

    // Generate summary
    console.log('[Analysis] Generating summary...');
    const summary = await generateSummaryFromEmbeddings(
      pdfName,
      embeddingData.chunks[0].text,
      embeddingData.document_embedding
    );

    // Store results
    const { error: updateError } = await supabase
      .from('pdf_analysis')
      .update({
        summary,
        embedding_data: {
          ...embeddingData,
          metadata: {
            ...embeddingData.metadata,
            stored_at: new Date().toISOString()
          }
        }
      })
      .eq('pdf_id', pdfId);

    if (updateError) {
      console.error('[Analysis] Failed to store analysis:', updateError);
    } else {
      console.log('[Analysis] Successfully stored analysis with embeddings');
    }

    return new Response(
      JSON.stringify({
        summary,
        cached: false,
        enhanced: true,
        processing_method: processingMethod
      }),
      { headers: { ...corsHeaders(), 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Analysis] Error in enhanced PDF analysis:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
        cached: false,
        enhanced: false,
        status: 'error'
      }),
      { status: 500, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } }
    );
  }
}

async function handleChat(pdfId: string, message: string, context: string) {
  try {
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      throw new Error('OpenAI API key is not configured');
    }

    console.log(`[Chat] Processing message for PDF: ${pdfId}`);

    // Get previous chat messages for context
    const { data: chatHistory } = await supabase
      .from('chat_messages')
      .select('message, sender')
      .eq('pdf_id', pdfId)
      .order('created_at', { ascending: true })
      .limit(10); // Get last 10 messages for context

    // Format chat history for context
    const conversationHistory = chatHistory?.map(msg => 
      `${msg.sender.toUpperCase()}: ${msg.message}`
    ).join('\n') || '';

    // Get message embedding for similarity search
    console.log('[Chat] Generating embedding for user message');
    const messageEmbedding = await generateEmbeddings(message);

    // Get document embeddings from database
    console.log('[Chat] Retrieving document embeddings');
    const embeddingData = await getStoredEmbeddings(pdfId);
    if (!embeddingData) {
      throw new Error('Document embeddings not found');
    }

    // Calculate similarity for each chunk
    const chunkSimilarities = embeddingData.chunks.map(chunk => ({
      text: sanitizeChunkText(chunk.text),
      similarity: calculateCosineSimilarity(messageEmbedding, chunk.embedding)
    }));

    // Sort by similarity and select top 3 chunks
    const topChunks = chunkSimilarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 3);

    // Get summary for additional context
    const { data: analysis } = await supabase
      .from('pdf_analysis')
      .select('summary')
      .eq('pdf_id', pdfId)
      .single();

    // Prepare context from top chunks
    const retrievedContext = topChunks.map((c, i) => `Relevant Section ${i+1} (score: ${c.similarity.toFixed(2)}):\n${c.text}`).join('\n\n');

    // Compose the full context for GPT-4
    let enhancedContext = `The following are the most relevant sections of the document for the user's question, selected via semantic search:\n\n${retrievedContext}`;
    
    if (analysis?.summary) {
      enhancedContext += `\n\nDocument Summary:\n${analysis.summary}`;
    }

    if (conversationHistory) {
      enhancedContext += `\n\nPrevious Conversation:\n${conversationHistory}`;
    }

    if (context) {
      enhancedContext += `\n\nAdditional Context:\n${context}`;
    }

    // Get AI response
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4-turbo-preview',
        messages: [
          {
            role: 'system',
            content: `You are a helpful AI assistant analyzing a PDF document. 
            Use the provided context to answer questions about the document.
            Previous conversation history is provided to maintain context.
            If you're unsure about something, say so rather than making assumptions.`
          },
          {
            role: 'user',
            content: `Context:\n${enhancedContext}\n\nQuestion: ${message}`
          }
        ],
        temperature: 0.7,
        max_tokens: 1500
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('[Chat] OpenAI API error:', error);
      throw new Error('Failed to get AI response');
    }

    const data = await response.json();
    const aiResponse = data.choices[0].message.content;

    // Store the chat messages
    await storeChatMessage(pdfId, message, aiResponse);

    return {
      message: aiResponse,
      relevantChunks: topChunks.length
    };

  } catch (error) {
    console.error('[Chat] Error:', error);
    throw error;
  }
}

// Patch: helper to sanitize chunk text for prompt
function sanitizeChunkText(text: string): string {
  return JSON.stringify(text).slice(1, -1);
}

// Enhanced RAG chat function that uses embeddings for context
async function handleChatWithRAG(pdfId: string, userMessage: string) {
  try {
    console.log(`[RAG] Starting chat for PDF: ${pdfId}`);
    
    // Step 1: Check if embeddings exist, create if missing
    const embeddingData = await ensureEmbeddingsExist(pdfId);
    if (!embeddingData) {
      return new Response(
        JSON.stringify({ 
          error: 'Unable to process PDF embeddings. Please try uploading the PDF again.',
          needsEmbeddings: true 
        }),
        { status: 400, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } }
      );
    }

    // Step 2: Generate embedding for user question
    const questionEmbedding = await generateEmbeddings(userMessage);
    
    // Step 3: Find most relevant chunks using cosine similarity
    const relevantChunks = findRelevantChunks(embeddingData.chunks, questionEmbedding, 3);
    
    // Step 4: Generate context-aware response
    const response = await generateRAGResponse(userMessage, relevantChunks);
    
    // Step 5: Store chat message for session management
    await storeChatMessage(pdfId, userMessage, response);
    
    return new Response(
      JSON.stringify({ 
        message: response,
        relevantChunks: relevantChunks.length,
        embeddingStatus: 'available'
      }),
      { headers: { ...corsHeaders(), 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('[RAG] Error in chat:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } }
    );
  }
}

// Ensure embeddings exist, create if missing
async function ensureEmbeddingsExist(pdfId: string) {
  try {
    // Check if embeddings already exist
    const existing = await getStoredEmbeddings(pdfId);
    if (existing && existing.chunks && existing.chunks.length > 0) {
      console.log(`[RAG] Found existing embeddings for PDF: ${pdfId}`);
      return existing;
    }
    
    console.log(`[RAG] No embeddings found for PDF: ${pdfId}`);
    return null;
  } catch (error) {
    console.error('[RAG] Error checking embeddings:', error);
    return null;
  }
}

// Find most relevant text chunks based on cosine similarity
function findRelevantChunks(chunks: any[], questionEmbedding: number[], topK: number = 3) {
  if (!chunks || chunks.length === 0) return [];
  
  const similarities = chunks.map((chunk, index) => ({
    index,
    text: chunk.text,
    similarity: calculateCosineSimilarity(chunk.embedding, questionEmbedding)
  }));
  
  return similarities
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK)
    .filter(chunk => chunk.similarity > 0.1); // Filter out very low similarity chunks
}

// Generate response using OpenAI with relevant context
async function generateRAGResponse(userMessage: string, relevantChunks: any[]) {
  const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openAIApiKey) {
    throw new Error('OpenAI API key not configured');
  }
  
  const context = relevantChunks.length > 0 
    ? relevantChunks.map((chunk, i) => `[Context ${i + 1}]\n${chunk.text}`).join('\n\n')
    : 'No relevant context found in the document.';
  
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openAIApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `You are a helpful assistant that answers questions about PDF documents using the provided context. 
          Always base your answers on the context provided. If the context doesn't contain relevant information, 
          say so clearly. Be precise and cite specific parts of the context when possible.`
        },
        {
          role: 'user',
          content: `Context from the document:\n${context}\n\nQuestion: ${userMessage}`
        }
      ],
      max_tokens: 500,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// Store chat message for session management
async function storeChatMessage(pdfId: string, userMessage: string, assistantResponse: string) {
  try {
    // Create session if not exists
    const sessionId = `session_${pdfId}_${Date.now()}`;
    
    // Store user message
    await supabase.from('chat_messages').insert({
      session_id: sessionId,
      message: userMessage,
      sender: 'user'
    });
    
    // Store assistant response
    await supabase.from('chat_messages').insert({
      session_id: sessionId,
      message: assistantResponse,
      sender: 'assistant'
    });
    
  } catch (error) {
    console.error('[RAG] Error storing chat messages:', error);
    // Non-critical error, don't throw
  }
}

// Store embeddings in Supabase Storage and save URL to database
async function storeEmbeddingsInStorage(
  pdfId: string, 
  chunks: string[], 
  embeddings: number[][], 
  method: string = 'standard'
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    console.log(`[Embeddings] Storing ${embeddings.length} embeddings for PDF ${pdfId} using ${method}`);
    
    // Create embeddings data structure
    const embeddingData = {
      pdfId,
      method,
      timestamp: new Date().toISOString(),
      chunks,
      embeddings,
      chunksCount: chunks.length
    };
    
    // Convert to JSON
    const jsonData = JSON.stringify(embeddingData);
    const fileName = `${pdfId}_embeddings_${Date.now()}.json`;
    
    // Upload to Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('embeddings')
      .upload(fileName, new Blob([jsonData], { type: 'application/json' }), {
        cacheControl: '3600',
        upsert: false
      });
      
    if (uploadError) {
      console.error('[Embeddings] Storage upload error:', uploadError);
      return { success: false, error: uploadError.message };
    }
    
    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('embeddings')
      .getPublicUrl(fileName);
    
    // Update database with URL reference
    const { error: dbError } = await supabase
      .from('pdf_analysis')
      .upsert({
        pdf_id: pdfId,
        embedding_url: publicUrl,
        embedding_chunks_count: chunks.length,
        embedding_method: method,
        updated_at: new Date().toISOString()
      });
      
    if (dbError) {
      console.error('[Embeddings] Database update error:', dbError);
      // Clean up uploaded file
      await supabase.storage.from('embeddings').remove([fileName]);
      return { success: false, error: dbError.message };
    }
    
    console.log(`[Embeddings] Successfully stored embeddings at: ${publicUrl}`);
    return { success: true, url: publicUrl };
    
  } catch (error) {
    console.error('[Embeddings] Storage operation failed:', error);
    return { success: false, error: error.message };
  }
}

// Retrieve embeddings from Storage using URL
async function getEmbeddingsFromStorage(embeddingUrl: string): Promise<{
  success: boolean;
  data?: { chunks: string[]; embeddings: number[][]; method: string };
  error?: string;
}> {
  try {
    console.log(`[Embeddings] Fetching embeddings from: ${embeddingUrl}`);
    
    const response = await fetch(embeddingUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch embeddings: ${response.status}`);
    }
    
    const embeddingData = await response.json();
    
    return {
      success: true,
      data: {
        chunks: embeddingData.chunks,
        embeddings: embeddingData.embeddings,
        method: embeddingData.method || 'standard'
      }
    };
    
  } catch (error) {
    console.error('[Embeddings] Failed to retrieve from storage:', error);
    return { success: false, error: error.message };
  }
}

// Check embeddings status endpoint - Updated for Storage
async function checkEmbeddingsStatus(pdfId: string) {
  try {
    const { data, error } = await supabase
      .from('pdf_analysis')
      .select('embedding_url, embedding_chunks_count, embedding_method, updated_at')
      .eq('pdf_id', pdfId)
      .maybeSingle();
      
    if (error) {
      console.error('[Check] Database error:', error);
      return { exists: false };
    }
    
    if (!data || !data.embedding_url) {
      console.log('[Check] No embeddings found');
      return { exists: false };
    }
    
    // Verify the file exists in storage
    try {
      const response = await fetch(data.embedding_url, { method: 'HEAD' });
      if (response.ok) {
        console.log(`[Check] Embeddings found: ${data.embedding_chunks_count} chunks`);
        return { 
          exists: true, 
          url: data.embedding_url,
          chunksCount: data.embedding_chunks_count,
          method: data.embedding_method,
          lastUpdated: data.updated_at
        };
      } else {
        console.log('[Check] Embedding file not accessible, needs regeneration');
        return { exists: false };
      }
    } catch (fetchError) {
      console.log('[Check] Embedding file verification failed:', fetchError);
      return { exists: false };
    }
    
  } catch (error) {
    console.error('[Check] Error checking embeddings:', error);
    return { exists: false };
  }
}
// Test WebAssembly functionality
async function createEmbeddingsIfMissing(pdfId: string, pdfUrl: string, pdfName: string, useWasm: boolean = true) {
  try {
    // Check if embeddings already exist
    const existing = await getStoredEmbeddings(pdfId);
    if (existing && existing.chunks && existing.chunks.length > 0) {
      return new Response(
        JSON.stringify({ 
          status: 'exists',
          message: 'Embeddings already exist',
          chunksCount: existing.chunks.length 
        }),
        { headers: { ...corsHeaders(), 'Content-Type': 'application/json' } }
      );
    }
    
    // Always use enhanced method with WASM
    return await analyzePDFEnhanced(pdfId, pdfUrl, pdfName, true);
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } }
    );
  }
}

// Test WebAssembly functionality
async function testWasmFunctionality() {
  try {
    console.log('[WASM Test] Starting WebAssembly functionality test...');
    
    const testResults = {
      pyodideInit: false,
      pythonExecution: false,
      numpyAvailable: false,
      requestsAvailable: false,
      processorInit: false,
      overallStatus: 'failed'
    };
    
    // Test 1: Initialize Pyodide
    try {
      const pyodideInstance = await initializePyodide();
      testResults.pyodideInit = !!pyodideInstance;
      
      if (pyodideInstance) {
        // Test 2: Basic Python execution
        try {
          const result = await pyodideInstance.runPython('2 + 2');
          testResults.pythonExecution = (result === 4);
        } catch (e) {
          console.error('[WASM Test] Python execution failed:', e);
        }
        
        // Test 3: NumPy availability
        try {
          await pyodideInstance.runPython('import numpy as np; np.array([1, 2, 3])');
          testResults.numpyAvailable = true;
        } catch (e) {
          console.error('[WASM Test] NumPy not available:', e);
        }
        
        // Test 4: Requests availability
        try {
          await pyodideInstance.runPython('import requests');
          testResults.requestsAvailable = true;
        } catch (e) {
          console.error('[WASM Test] Requests not available:', e);
        }
        
        // Test 5: Processor initialization
        try {
          const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
          if (openAIApiKey) {
            await pyodideInstance.runPython(`initialize_processor("test_key")`);
            testResults.processorInit = true;
          }
        } catch (e) {
          console.error('[WASM Test] Processor initialization failed:', e);
        }
      }
    } catch (e) {
      console.error('[WASM Test] Pyodide initialization failed:', e);
    }
    
    // Overall status
    const successCount = Object.values(testResults).filter(v => v === true).length;
    if (successCount >= 4) {
      testResults.overallStatus = 'passed';
    } else if (successCount >= 2) {
      testResults.overallStatus = 'partial';
    }
    
    return new Response(
      JSON.stringify({
        wasmTest: testResults,
        timestamp: new Date().toISOString(),
        environment: 'supabase-edge-function'
      }),
      { headers: { ...corsHeaders(), 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    return new Response(
      JSON.stringify({ 
        error: error.message,
        wasmTest: { overallStatus: 'failed' }
      }),
      { status: 500, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } }
    );
  }
}

serve(async (req) => {
  console.log('PDF Chat function called:', req.method, req.url);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('Handling CORS preflight request');
    return new Response(null, { 
      status: 200,
      headers: corsHeaders()
    });
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    console.error('Method not allowed:', req.method);
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' }
    });
  }

  try {
    const requestData = await req.json();
    const { action, pdfId, message, pdfUrl, pdfName, context, forceRegenerate } = requestData;
    // Always set useWasm to true regardless of what's in the request
    const useWasm = true;
    
    console.log(`[Request] Received request - Action: ${action}, PDF ID: ${pdfId}, WASM: true`);

    let response;
    switch (action) {
      case 'chat':
        response = await handleChatWithRAG(pdfId, message);
        break;
      
      case 'check_embeddings':
        const status = await checkEmbeddingsStatus(pdfId);
        response = new Response(
          JSON.stringify(status),
          { headers: { ...corsHeaders(), 'Content-Type': 'application/json' } }
        );
        break;
      
      case 'create_embeddings':
        response = await createEmbeddingsIfMissing(pdfId, pdfUrl, pdfName, true);
        break;
      
      case 'test_wasm':
        response = await testWasmFunctionality();
        break;
        
      case 'analyze_pdf':
        // Redirect to enhanced version with WASM enabled
        if (!pdfId || !pdfUrl || !pdfName) {
          return new Response(
            JSON.stringify({
              error: 'Missing required parameters: pdfId, pdfUrl, and pdfName are required'
            }),
            { 
              status: 400, 
              headers: {
                ...corsHeaders(),
                'Content-Type': 'application/json'
              }
            }
          );
        }
        console.log('[Request] Redirecting analyze_pdf to analyze_pdf_enhanced with WASM');
        response = await analyzePDFEnhanced(pdfId, pdfUrl, pdfName, true);
        break;

      case 'analyze_pdf_enhanced':
        if (!pdfId || !pdfUrl || !pdfName) {
          return new Response(
            JSON.stringify({
              error: 'Missing required parameters: pdfId, pdfUrl, and pdfName are required'
            }),
            { 
              status: 400, 
              headers: {
                ...corsHeaders(),
                'Content-Type': 'application/json'
              }
            }
          );
        }
        response = await analyzePDFEnhanced(pdfId, pdfUrl, pdfName, true);
        break;

      case 'chat_legacy':
        if (!pdfId || !message) {
          return new Response(
            JSON.stringify({
              error: 'Missing required parameters: pdfId and message are required'
            }),
            { 
              status: 400, 
              headers: {
                ...corsHeaders(),
                'Content-Type': 'application/json'
              }
            }
          );
        }
        response = await handleChat(pdfId, message, context || '');
        break;

      case 'generate_podcast':
        if (!pdfId || !pdfName) {
          return new Response(
            JSON.stringify({
              error: 'Missing required parameters: pdfId and pdfName are required'
            }),
            { 
              status: 400, 
              headers: {
                ...corsHeaders(),
                'Content-Type': 'application/json'
              }
            }
          );
        }
        response = await generatePodcast(pdfId, pdfName, forceRegenerate);
        break;

      case 'check_podcast_status':
        if (!pdfId) {
          return new Response(
            JSON.stringify({
              error: 'Missing required parameter: pdfId'
            }),
            { 
              status: 400, 
              headers: {
                ...corsHeaders(),
                'Content-Type': 'application/json'
              }
            }
          );
        }
        response = await checkPodcastStatus(pdfId);
        break;

      default:
        return new Response(
          JSON.stringify({
            error: `Invalid action: ${action}`
          }),
          { 
            status: 400, 
            headers: {
              ...corsHeaders(),
              'Content-Type': 'application/json'
            }
          }
        );
    }

    // Add CORS headers to the response
    const responseHeaders = new Headers(response.headers);
    Object.entries(corsHeaders()).forEach(([key, value]) => {
      responseHeaders.set(key, value);
    });
    responseHeaders.set('Content-Type', 'application/json');

    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders
    });

  } catch (error) {
    console.error('[Error] Request failed:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: {
          ...corsHeaders(),
          'Content-Type': 'application/json'
        }
      }
    );
  }
});