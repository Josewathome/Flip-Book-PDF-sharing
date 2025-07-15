// @deno-types="npm:@types/pdfjs-dist"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

// Database configuration for external MySQL database
const DB_CONFIG = {
  host: '165.140.159.174',
  username: 'gre8_josemain',
  password: 'LZot1208FaKru',
  database: 'gre8_aria',
  apiUrl: 'http://165.140.159.174:3001/api'
};

// Import types for PDF.js
interface PDFPageItem {
  str: string;
  [key: string]: any;
}

interface PDFTextContent {
  items: PDFPageItem[];
}

interface PDFPageProxy {
  getTextContent(): Promise<PDFTextContent>;
}

interface PDFDocumentProxy {
  numPages: number;
  getPage(pageNumber: number): Promise<PDFPageProxy>;
}

// Dynamic import for PDF.js
async function getPDFJS() {
  // @ts-ignore: PDF.js serverless import
  const { getDocument } = await import('https://esm.sh/pdfjs-serverless@1.0.1');
  return { getDocument };
}

// Constants
const MAX_CHUNKS_TO_STORE = 50;
const DIRECT_DB_SIZE_LIMIT = 1 * 1024 * 1024; // 1MB limit for direct DB storage
const MAX_EMBEDDING_JSON_SIZE = 6 * 1024 * 1024; // 6MB safety limit
const MAX_PDF_SIZE = 20 * 1024 * 1024; // 20MB
const FAILURE_EMBEDDING = new Array(1536).fill(0); // Placeholder for failure embedding
const MAX_CHUNK_SIZE = 6000; // Maximum tokens per chunk for embeddings
const MAX_SUMMARY_LENGTH = 8000; // Maximum length for summary text

// Initialize Supabase client
const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

async function generateEmbeddings(text: string): Promise<number[]> {
  const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openAIApiKey) {
    throw new Error('OpenAI API key is not configured');
  }

  // Handle empty text case
  if (!text.trim()) {
    return FAILURE_EMBEDDING;
  }

  // Split text into smaller chunks
  const chunks = splitTextIntoChunks(text, MAX_CHUNK_SIZE);
  const embeddings: number[][] = [];

  // Process chunks in parallel with rate limiting
  const chunkGroups = chunks.reduce((acc, curr, i) => {
    const groupIndex = Math.floor(i / 5); // Process 5 chunks at a time
    if (!acc[groupIndex]) acc[groupIndex] = [];
    acc[groupIndex].push(curr);
    return acc;
  }, [] as string[][]);

  for (const group of chunkGroups) {
    const groupEmbeddings = await Promise.all(
      group.map(async chunk => {
        try {
          const response = await fetch('https://api.openai.com/v1/embeddings', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${openAIApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'text-embedding-3-small',
              input: chunk,
            }),
          });

          if (!response.ok) {
            const error = await response.json();
            console.error('[Embeddings] OpenAI API error:', error);
            return null;
          }

          const data = await response.json();
          return data.data[0].embedding;
        } catch (error) {
          console.error('[Embeddings] Chunk processing error:', error);
          return null;
        }
      })
    );

    embeddings.push(...groupEmbeddings.filter(e => e !== null));
    
    // Add delay between groups to respect rate limits
    if (chunkGroups.length > 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Return average of successful embeddings or fallback
  return embeddings.length > 0 
    ? averageEmbeddings(embeddings)
    : FAILURE_EMBEDDING;
}

function splitTextIntoChunks(text: string, maxChunkSize: number = MAX_CHUNK_SIZE): string[] {
  if (!text) return [];
  
  // Split into sentences first
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let currentChunk = '';
  let currentLength = 0;
  
  for (const sentence of sentences) {
    // Estimate tokens (rough approximation: 4 chars = 1 token)
    const estimatedTokens = Math.ceil(sentence.length / 4);
    
    if (currentLength + estimatedTokens > maxChunkSize) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = sentence;
      currentLength = estimatedTokens;
    } else {
      currentChunk += (currentChunk ? ' ' : '') + sentence;
      currentLength += estimatedTokens;
    }
  }
  
  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }
  
  // If chunks are still too large, split further
  return chunks.flatMap(chunk => 
    chunk.length > maxChunkSize * 4 
      ? chunk.match(new RegExp(`.{1,${maxChunkSize * 4}}`, 'g')) || []
      : [chunk]
  );
}

function averageEmbeddings(embeddings: number[][]): number[] {
  if (embeddings.length === 0) return FAILURE_EMBEDDING;
  
  const numDimensions = embeddings[0].length;
  const result = new Array(numDimensions).fill(0);

  for (const embedding of embeddings) {
    for (let i = 0; i < numDimensions; i++) {
      result[i] += embedding[i];
    }
  }

  for (let i = 0; i < numDimensions; i++) {
    result[i] /= embeddings.length;
  }

  return result;
}

async function generateChunkEmbeddings(chunks: string[]): Promise<{text: string, embedding: number[]}[]> {
  const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openAIApiKey) throw new Error('OpenAI API key is not configured');
  
  const results: {text: string, embedding: number[]}[] = [];
  for (const chunk of chunks) {
    const embedding = await generateEmbeddings(chunk);
    results.push({ 
      text: chunk, 
      embedding: embedding || FAILURE_EMBEDDING 
    });
  }
  return results;
}

// Helper function to check if text is mostly readable
function isReadableText(text: string): boolean {
  if (!text.trim()) return false;
  
  // Count readable characters (letters, numbers, punctuation)
  const readableChars = text.match(/[a-zA-Z0-9\s.,!?;:'"()\-]/g)?.length || 0;
  const totalChars = text.trim().length;
  
  // Text is readable if at least 60% of characters are readable
  return totalChars > 0 && (readableChars / totalChars) >= 0.6;
}

// Helper function to clean extracted text
function cleanExtractedText(text: string): string {
  return text
    // Remove control characters
    .replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '')
    // Replace multiple spaces/newlines with single ones
    .replace(/\s+/g, ' ')
    // Remove empty brackets and parentheses
    .replace(/[(\[{][\s})\]]*[}\])]|[(\[{][\s})\]]/g, '')
    // Remove standalone special characters
    .replace(/(?<=\s|^)[-_=+*&^%$#@!~`|\\/<>]+(?=\s|$)/g, '')
    // Normalize quotes and apostrophes
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
    // Normalize dashes
    .replace(/[\u2012\u2013\u2014\u2015]/g, '-')
    .trim();
}

// Updated extractPDFContent function using pdfjs-serverless
export async function extractPDFContent(pdfUrl: string): Promise<string> {
  try {
    console.log('[PDF Extraction] Starting improved extraction with PDF.js');

    // Initialize PDF.js
    const { getDocument } = await getPDFJS();

    // Fetch PDF data
    const response = await fetch(pdfUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch PDF: ${response.status}`);
    }

    const pdfData = await response.arrayBuffer();
    if (pdfData.byteLength > MAX_PDF_SIZE) {
      throw new Error(`PDF file too large: ${(pdfData.byteLength / 1024 / 1024).toFixed(2)}MB (max ${MAX_PDF_SIZE / 1024 / 1024}MB)`);
    }

    // Load PDF document with system fonts enabled
    const document = await getDocument({
      data: new Uint8Array(pdfData),
      useSystemFonts: true,
    }).promise;

    console.log(`[PDF Extraction] PDF loaded successfully. Pages: ${document.numPages}`);
    
    let extractedText = '';
    let validPagesCount = 0;

    // Process each page
    for (let i = 1; i <= document.numPages; i++) {
      try {
        console.log(`[PDF Extraction] Processing page ${i}/${document.numPages}`);
        const page = await document.getPage(i);
        const textContent = await page.getTextContent();
        
        // Extract and clean text from page
        const pageText = textContent.items
          .map(item => (typeof item.str === 'string' ? item.str : ''))
          .filter(Boolean)
          .join(' ')
          .trim();
        
        const cleaned = cleanExtractedText(pageText);

        // Only include readable text
        if (isReadableText(cleaned)) {
          extractedText += `--- Page ${i} ---\n${cleaned}\n\n`;
          validPagesCount++;
        } else {
          console.log(`[PDF Extraction] Page ${i} text not readable, attempting OCR`);
          try {
            // Convert entire page to base64 for OCR
            const base64 = btoa(String.fromCharCode(...new Uint8Array(pdfData)));
            const ocrText = await extractTextWithOCR(base64);
            
            if (ocrText && isReadableText(ocrText)) {
              extractedText += `--- Page ${i} (OCR) ---\n${cleanExtractedText(ocrText)}\n\n`;
              validPagesCount++;
            }
          } catch (ocrError) {
            console.error(`[PDF Extraction] OCR fallback failed for page ${i}:`, ocrError);
          }
        }
      } catch (pageError) {
        console.error(`[PDF Extraction] Error processing page ${i}:`, pageError);
        continue;
      }
    }

    if (validPagesCount === 0) {
      console.log('[PDF Extraction] No readable text found, attempting full document OCR');
      try {
        // Convert entire PDF to base64
        const base64 = btoa(String.fromCharCode(...new Uint8Array(pdfData)));
        const ocrText = await extractTextWithOCR(base64);
        
        if (ocrText && isReadableText(ocrText)) {
          extractedText = cleanExtractedText(ocrText);
          validPagesCount = 1;
        }
      } catch (ocrError) {
        console.error('[PDF Extraction] Full document OCR failed:', ocrError);
      }
    }

    if (validPagesCount === 0) {
      throw new Error('No readable text content could be extracted');
    }

    console.log(`[PDF Extraction] Successfully extracted text from ${validPagesCount} pages`);
    return extractedText;

  } catch (error) {
    console.error('[PDF Extraction] Error:', error);
    throw error;
  }
}

// Helper function to extract text from PDF syntax block
function extractTextFromPDFBlock(block: string): string | null {
  try {
    // Extract text between parentheses, handling escaped characters
    const textMatches = block.match(/\(([^)\\]*(?:\\.[^)\\]*)*)\)/g) || [];
    
    const extractedTexts = textMatches
      .map(match => {
        try {
          // Remove outer parentheses
          const inner = match.slice(1, -1);
          
          // Handle PDF escape sequences
          return inner
            .replace(/\\\(/g, '(')
            .replace(/\\\)/g, ')')
            .replace(/\\\\/g, '\\')
            .replace(/\\(\d{3})/g, (_, oct) => {
              try {
                return String.fromCharCode(parseInt(oct, 8));
              } catch {
                return '';
              }
            })
            .replace(/\\[nrtbf]/g, ' '); // Replace PDF whitespace characters
        } catch {
          return '';
        }
      })
      .filter(text => text.trim())
      .join(' ')
      .trim();

    return extractedTexts || null;
  } catch (error) {
    console.error('[PDF Extract] Block extraction error:', error);
    return null;
  }
}

// Helper function to convert page data to base64
async function convertPageToBase64(pageData: any, viewport: any): Promise<string | null> {
  try {
    // Convert to a simpler format for OCR
    const imageData = await pageData.toImage();
    if (!imageData) return null;
    
    return btoa(imageData);
  } catch (error) {
    console.error('[PDF Extraction] Error converting page to base64:', error);
    return null;
  }
}

// Helper function to sanitize Unicode text
function sanitizeUnicodeText(text: string): string {
  return text
    // Replace invalid or control characters with spaces
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, ' ')
    // Normalize Unicode characters
    .normalize('NFKC')
    // Replace multiple spaces with single space
    .replace(/\s+/g, ' ')
    // Trim whitespace
    .trim();
}

async function extractTextWithOCR(base64: string): Promise<string> {
  const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openAIApiKey) {
    throw new Error('OpenAI API key is not configured');
  }
  
  const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
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
            {
              type: 'text',
              text: 'Extract ALL text from this document exactly as it appears. Preserve formatting, tables, and special characters. Return ONLY raw extracted text without any commentary.'
            },
            {
              type: 'image',
              image_url: {
                url: `data:application/pdf;base64,${base64}`
              }
            }
          ]
        }
      ],
      max_tokens: 4096,
      temperature: 0
    })
  });
  
  if (!openAIResponse.ok) {
    const error = await openAIResponse.json();
    console.error('[PDF Extraction] OpenAI API error:', error);
    throw new Error(`OCR failed: ${error.error?.message || openAIResponse.statusText}`);
  }
  
  const data = await openAIResponse.json();
  return sanitizeText(data.choices[0].message.content);
}

function sanitizeText(text: string): string {
  // Basic cleaning while preserving special characters
  return text
    .replace(/[^\x20-\x7E\n\r\t\u00A0-\uFFFF]/g, ' ') // Keep printable chars + extended Unicode
    .replace(/\s+/g, ' ')
    .trim();
}

async function processAndStoreEmbeddings(pdfId: string, pdfUrl: string): Promise<{ success: boolean, error?: string }> {
  try {
    // Check existing embeddings
    const { data: existingAnalysis, error: fetchError } = await supabase
      .from('pdf_analysis')
      .select('embedding_data, embedding_url')
      .eq('pdf_id', pdfId)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') throw fetchError;
    if (existingAnalysis?.embedding_data || existingAnalysis?.embedding_url) return { success: true };

    let pdfContent = '';
    try {
      pdfContent = await extractPDFContent(pdfUrl);
    } catch (error) {
      console.error('PDF processing failed, storing fallback embedding');
      pdfContent = 'DOCUMENT_PROCESSING_FAILURE';
    }

    // Handle extraction failure
    if (pdfContent === 'DOCUMENT_PROCESSING_FAILURE' || !pdfContent.trim()) {
      const embeddingData = {
        document_embedding: FAILURE_EMBEDDING,
        chunks: [{
          text: "Document data could not be extracted",
          embedding: FAILURE_EMBEDDING
        }],
        metadata: {
          model: 'fallback',
          error: true,
          generated_at: new Date().toISOString()
        }
      };
      
      await storeEmbeddings(pdfId, embeddingData);
      return { success: true };
    }

    // Process successful extraction
    let chunks = splitTextIntoChunks(pdfContent, 2000);
    if (chunks.length > MAX_CHUNKS_TO_STORE) {
      chunks = chunks.slice(0, MAX_CHUNKS_TO_STORE);
    }

    const chunkEmbeddings = await generateChunkEmbeddings(chunks);
    const documentEmbedding = averageEmbeddings(
      chunkEmbeddings.map(c => c.embedding)
    );

    const embeddingData = {
      document_embedding: documentEmbedding,
      chunks: chunkEmbeddings,
      metadata: {
        model: 'text-embedding-3-small',
        version: '1.0',
        generated_at: new Date().toISOString()
      }
    };

    // Check size and determine storage method
    const dataSize = JSON.stringify(embeddingData).length;
    
    if (dataSize > DIRECT_DB_SIZE_LIMIT) {
      // Use storage bucket for large embeddings
      console.log(`[Embeddings] Large embedding detected (${(dataSize/1024/1024).toFixed(2)}MB), using storage bucket`);
      const { success, url, error } = await storeEmbeddingsInStorage(
        pdfId,
        chunkEmbeddings.map(c => c.text),
        chunkEmbeddings.map(c => c.embedding),
        'storage'
      );

      if (!success || !url) throw new Error(error || 'Failed to store embeddings');

      // Store minimal data in database
      const { error: dbError } = await supabase
        .from('pdf_analysis')
        .upsert({
          pdf_id: pdfId,
          embedding_data: {
            document_embedding: documentEmbedding,
            metadata: {
              ...embeddingData.metadata,
              storage_url: url,
              chunks_count: chunkEmbeddings.length
            }
          },
          embedding_url: url,
          embedding_chunks_count: chunkEmbeddings.length,
          embedding_method: 'storage',
          updated_at: new Date().toISOString()
        });

      if (dbError) throw dbError;
      return { success: true };
    } else {
      // Store directly in database for small embeddings
      console.log(`[Embeddings] Small embedding detected (${(dataSize/1024/1024).toFixed(2)}MB), using direct storage`);
      return await storeEmbeddings(pdfId, embeddingData);
    }
  } catch (error) {
    console.error('[Embeddings] Processing error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

async function storeEmbeddings(pdfId: string, embeddingData: any): Promise<{ success: boolean, error?: string }> {
  try {
    const embeddingDataJson = JSON.stringify(embeddingData);
    if (embeddingDataJson.length > MAX_EMBEDDING_JSON_SIZE) {
      // Handle oversized data by storing only document embedding
      const compressedData = {
        document_embedding: embeddingData.document_embedding,
        chunks: [],
        metadata: {
          ...embeddingData.metadata,
          compressed: true,
          original_size: embeddingDataJson.length
        }
      };
      
      const { error } = await supabase
        .from('pdf_analysis')
        .upsert({
          pdf_id: pdfId,
          embedding_data: compressedData,
          updated_at: new Date().toISOString()
        });

      return error 
        ? { success: false, error: error.message }
        : { success: true };
    }

    // Store normally if within size limit
    const { error } = await supabase
      .from('pdf_analysis')
      .upsert({
        pdf_id: pdfId,
        embedding_data: embeddingData,
        updated_at: new Date().toISOString()
      });

    return error 
      ? { success: false, error: error.message }
      : { success: true };
  } catch (error) {
    console.error('Storage error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Storage failed' 
    };
  }
}

interface StorageEmbeddingResult {
  success: boolean;
  url?: string;
  error?: string;
}

async function storeEmbeddingsInStorage(
  pdfId: string,
  chunks: string[],
  embeddings: number[][],
  method: string
): Promise<StorageEmbeddingResult> {
  try {
    console.log('[Embeddings] Storing embeddings in external database');
    
    // Store embeddings in external database
    const response = await fetch(`${DB_CONFIG.apiUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pdfId,
        embeddingData: JSON.stringify({
          chunks,
          embeddings,
          method,
          timestamp: new Date().toISOString()
        })
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to store embeddings');
    }

    const result = await response.json();
    const embeddingUrl = `${DB_CONFIG.apiUrl}/embeddings/${pdfId}`;

    return { success: true, url: embeddingUrl };
  } catch (error) {
    console.error('[Embeddings] Storage error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Storage failed'
    };
  }
}

async function getEmbeddingsFromStorage(url: string): Promise<StorageEmbeddingResponse> {
  try {
    console.log('[Embeddings] Fetching embeddings from external database');
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch embeddings: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    const embeddingData = JSON.parse(data.embeddingData);
    
    return { 
      success: true, 
      data: {
        document_embedding: embeddingData.embeddings[0], // First embedding is document embedding
        chunks,
        embeddings,
        method: embeddingData.method,
        chunks_count: embeddingData.chunks.length
      }
    };
  } catch (error) {
    console.error('[Embeddings] Error fetching embeddings from external database:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'External database fetch failed'
    };
  }
}

interface StorageEmbeddingData {
  document_embedding: number[];
  chunks: { text: string; embedding: number[] }[];
  method: string;
  chunks_count: number;
}

interface StorageEmbeddingResponse {
  success: boolean;
  data?: StorageEmbeddingData;
  error?: string;
}

async function getEmbeddingsFromStorage(url: string): Promise<StorageEmbeddingResponse> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch embeddings from storage: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    return { 
      success: true, 
      data: {
        document_embedding: data.embeddings[0], // First embedding is document embedding
        chunks: data.chunks.map((text: string, i: number) => ({
          text,
          embedding: data.embeddings[i + 1] // Skip first (document) embedding
        })),
        method: data.method,
        chunks_count: data.chunks.length
      }
    };
  } catch (error) {
    console.error('[Embeddings] Error fetching embeddings from storage:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Storage fetch failed'
    };
  }
}

async function getStoredEmbeddings(pdfId: string): Promise<{
  documentEmbedding: number[],
  chunks: Array<{ text: string, embedding: number[] }>,
  metadata: any
} | null> {
  try {
    const { data, error } = await supabase
      .from('pdf_analysis')
      .select('embedding_data, embedding_url')
      .eq('pdf_id', pdfId)
      .single();

    if (error) throw error;

    // If data is in storage
    if (data?.embedding_url) {
      console.log('[Embeddings] Fetching from storage:', data.embedding_url);
      const { success, data: storageData, error: storageError } = await getEmbeddingsFromStorage(data.embedding_url);
      
      if (!success || !storageData) {
        console.error('[Embeddings] Storage fetch failed:', storageError);
        // Fallback to database if available
        if (data?.embedding_data?.document_embedding) {
          return {
            documentEmbedding: data.embedding_data.document_embedding,
            chunks: [],
            metadata: {
              ...data.embedding_data.metadata,
              fallback: true,
              error: storageError
            }
          };
        }
        throw new Error(storageError);
      }

      return {
        documentEmbedding: storageData.document_embedding,
        chunks: storageData.chunks,
        metadata: {
          method: storageData.method,
          chunks_count: storageData.chunks_count,
          storage: true
        }
      };
    }

    // If data is in database
    if (data?.embedding_data) {
      console.log('[Embeddings] Using database storage');
      return data.embedding_data;
    }

    return null;
  } catch (error) {
    console.error('[Embeddings] Error fetching embeddings:', error);
    return null;
  }
}

// Helper function to calculate cosine similarity between two vectors
function calculateCosineSimilarity(vec1: number[], vec2: number[]): number {
  if (vec1.length !== vec2.length) {
    throw new Error('Vectors must have the same length');
  }

  const dotProduct = vec1.reduce((acc, val, i) => acc + val * vec2[i], 0);
  const mag1 = Math.sqrt(vec1.reduce((acc, val) => acc + val * val, 0));
  const mag2 = Math.sqrt(vec2.reduce((acc, val) => acc + val * val, 0));

  return dotProduct / (mag1 * mag2);
} 

export {
  processAndStoreEmbeddings,
  getStoredEmbeddings,
  generateEmbeddings,
  splitTextIntoChunks,
  averageEmbeddings,
  calculateCosineSimilarity
};

