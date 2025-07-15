import base64
import json
from io import BytesIO
from pypdf import PdfReader

class PDFProcessor:
    def __init__(self, api_key):
        self.api_key = api_key
        
    async def extract_text(self, pdf_base64):
        try:
            print('[PDF] Starting text extraction...')
            
            # First try to extract text using pypdf
            try:
                print('[PDF] Attempting pypdf extraction...')
                # Decode base64 to bytes
                pdf_bytes = base64.b64decode(pdf_base64)
                pdf_io = BytesIO(pdf_bytes)
                
                # Read PDF with pypdf
                reader = PdfReader(pdf_io)
                if not reader.pages:
                    print('[PDF] No pages found in PDF')
                    raise Exception('No pages found in PDF')
                    
                print(f'[PDF] Found {len(reader.pages)} pages')
                text = ""
                for i, page in enumerate(reader.pages):
                    try:
                        page_text = page.extract_text()
                        if page_text:
                            text += page_text + "\n\n"
                        print(f'[PDF] Extracted page {i+1}/{len(reader.pages)}')
                    except Exception as e:
                        print(f'[PDF] Error extracting page {i+1}: {str(e)}')
                
                if text.strip():
                    print('[PDF] Successfully extracted text using pypdf')
                    return text.strip()
                else:
                    print('[PDF] No text extracted using pypdf')
                    raise Exception('No text extracted')
            except Exception as e:
                print(f'[PDF] pypdf extraction failed, falling back to Vision API: {str(e)}')
            
            # Fallback to Vision API if pypdf fails
            print('[PDF] Attempting Vision API extraction...')
            try:
                # Try to import js module for Pyodide environment
                import js
                fetch = js.fetch
                print('[PDF] Using Pyodide fetch')
            except ImportError:
                # Fallback to requests in non-Pyodide environment
                import requests
                print('[PDF] Using requests library')
                async def fetch(url, **kwargs):
                    response = requests.request(
                        method=kwargs.get('method', 'GET'),
                        url=url,
                        headers=kwargs.get('headers', {}),
                        data=kwargs.get('body', None)
                    )
                    response.ok = response.status_code == 200
                    response.json = lambda: json.loads(response.text)
                    return response
            
            # Call OpenAI Vision API for text extraction
            print('[PDF] Calling OpenAI Vision API...')
            response = await fetch(
                'https://api.openai.com/v1/chat/completions',
                method='POST',
                headers={
                    'Authorization': f'Bearer {self.api_key}',
                    'Content-Type': 'application/json',
                },
                body=json.dumps({
                    'model': 'gpt-4-vision-preview',
                    'messages': [
                        {
                            'role': 'user',
                            'content': [
                                {
                                    'type': 'text',
                                    'text': 'Extract ALL text from this document exactly as it appears. Preserve formatting, tables, and special characters. Return ONLY raw extracted text without any commentary.'
                                },
                                {
                                    'type': 'image',
                                    'image_url': {
                                        'url': f'data:application/pdf;base64,{pdf_base64}'
                                    }
                                }
                            ]
                        }
                    ],
                    'max_tokens': 4096,
                    'temperature': 0
                })
            )
            
            if not response.ok:
                error_data = await response.json()
                error_msg = error_data.get('error', {}).get('message', 'Unknown error')
                print(f'[PDF] OpenAI API error: {error_msg}')
                raise Exception(f'OpenAI API error: {error_msg}')
            
            data = await response.json()
            extracted_text = data['choices'][0]['message']['content']
            
            if not extracted_text.strip():
                print('[PDF] No text extracted from Vision API')
                raise Exception('No text extracted from Vision API')
                
            print('[PDF] Successfully extracted text using Vision API')
            return extracted_text.strip()
            
        except Exception as e:
            print(f'[PDF] Error in text extraction: {str(e)}')
            return None

    def chunk_text(self, text, chunk_size=2000):
        """Split text into chunks by paragraphs."""
        if not text:
            print('[PDF] No text to chunk')
            return []
            
        print(f'[PDF] Chunking text of length {len(text)}...')
        paragraphs = text.split('\n\n')
        chunks = []
        current_chunk = ''
        
        for para in paragraphs:
            if len(current_chunk) + len(para) > chunk_size and current_chunk:
                chunks.append(current_chunk.strip())
                current_chunk = ''
            current_chunk += para + '\n\n'
            
        if current_chunk:
            chunks.append(current_chunk.strip())
            
        print(f'[PDF] Created {len(chunks)} chunks')
        return chunks if chunks else [text]

    async def generate_embedding(self, text):
        """Generate embedding for a text chunk using OpenAI API."""
        try:
            print('[PDF] Generating embedding...')
            try:
                import js
                fetch = js.fetch
                print('[PDF] Using Pyodide fetch')
            except ImportError:
                import requests
                print('[PDF] Using requests library')
                async def fetch(url, **kwargs):
                    response = requests.request(
                        method=kwargs.get('method', 'GET'),
                        url=url,
                        headers=kwargs.get('headers', {}),
                        data=kwargs.get('body', None)
                    )
                    response.ok = response.status_code == 200
                    response.json = lambda: json.loads(response.text)
                    return response
            
            response = await fetch(
                'https://api.openai.com/v1/embeddings',
                method='POST',
                headers={
                    'Authorization': f'Bearer {self.api_key}',
                    'Content-Type': 'application/json',
                },
                body=json.dumps({
                    'model': 'text-embedding-3-small',
                    'input': text
                })
            )
            
            if not response.ok:
                error_data = await response.json()
                error_msg = error_data.get('error', {}).get('message', 'Unknown error')
                print(f'[PDF] OpenAI API error: {error_msg}')
                raise Exception(f'OpenAI API error: {error_msg}')
            
            data = await response.json()
            print('[PDF] Successfully generated embedding')
            return data['data'][0]['embedding']
        except Exception as e:
            print(f'[PDF] Error generating embedding: {str(e)}')
            return [0] * 1536  # Return zero vector as fallback

    async def process_pdf(self, pdf_base64):
        """Process PDF and return embeddings with chunks."""
        try:
            print('[PDF] Starting PDF processing...')
            
            # Extract text
            text = await self.extract_text(pdf_base64)
            if not text:
                print('[PDF] Text extraction failed')
                return {
                    'status': 'error',
                    'message': 'Text extraction failed'
                }
                
            # Split into chunks
            chunks = self.chunk_text(text)
            if not chunks:
                print('[PDF] No chunks created')
                return {
                    'status': 'error',
                    'message': 'No text chunks created'
                }
            
            # Generate embeddings for each chunk
            print(f'[PDF] Generating embeddings for {len(chunks)} chunks...')
            chunk_embeddings = []
            for i, chunk in enumerate(chunks):
                print(f'[PDF] Processing chunk {i+1}/{len(chunks)}')
                embedding = await self.generate_embedding(chunk)
                chunk_embeddings.append({
                    'text': chunk,
                    'embedding': embedding
                })
                
            # Calculate document embedding
            print('[PDF] Calculating document embedding...')
            doc_embedding = [
                sum(e)/len(chunk_embeddings) 
                for e in zip(*[c['embedding'] for c in chunk_embeddings])
            ]
            
            # Get current timestamp
            try:
                import js
                timestamp = js.Date.new().toISOString()
            except ImportError:
                from datetime import datetime
                timestamp = datetime.utcnow().isoformat()
            
            print('[PDF] Processing completed successfully')
            return {
                'status': 'success',
                'embedding_data': {
                    'document_embedding': doc_embedding,
                    'chunks': chunk_embeddings,
                    'metadata': {
                        'model': 'text-embedding-3-small',
                        'enhanced': True,
                        'processor': 'python-wasm',
                        'generated_at': timestamp
                    }
                }
            }
        except Exception as e:
            print(f'[PDF] Error in PDF processing: {str(e)}')
            return {
                'status': 'error',
                'message': str(e)
            }

# Initialize processor
processor = None

def initialize_processor(api_key):
    """Initialize the PDF processor with API key."""
    global processor
    print('[PDF] Initializing PDF processor...')
    processor = PDFProcessor(api_key)
    print('[PDF] PDF processor initialized')
    return True

async def process_pdf_with_python(pdf_url, pdf_id):
    """Process PDF from URL."""
    if not processor:
        print('[PDF] Processor not initialized')
        return {'status': 'error', 'message': 'Processor not initialized'}
        
    try:
        print(f'[PDF] Processing PDF from URL: {pdf_url}')
        try:
            import js
            fetch = js.fetch
            print('[PDF] Using Pyodide fetch')
        except ImportError:
            import requests
            print('[PDF] Using requests library')
            async def fetch(url, **kwargs):
                response = requests.request(
                    method=kwargs.get('method', 'GET'),
                    url=url,
                    headers=kwargs.get('headers', {}),
                    data=kwargs.get('body', None)
                )
                response.ok = response.status_code == 200
                response.json = lambda: json.loads(response.text)
                return response
        
        # Fetch PDF
        print('[PDF] Fetching PDF...')
        response = await fetch(pdf_url)
        if not response.ok:
            error_msg = f'Failed to fetch PDF: {response.status}'
            print(f'[PDF] {error_msg}')
            return {'status': 'error', 'message': error_msg}
            
        # Get array buffer and convert to base64
        print('[PDF] Converting PDF to base64...')
        try:
            # Pyodide environment
            buffer = await response.arrayBuffer()
            uint8_array = js.Uint8Array.new(buffer)
            pdf_base64 = js.btoa(''.join(chr(x) for x in uint8_array))
            print('[PDF] Used Pyodide for base64 conversion')
        except (ImportError, AttributeError):
            # Non-Pyodide environment
            import base64
            pdf_base64 = base64.b64encode(response.content).decode('utf-8')
            print('[PDF] Used Python base64 for conversion')
        
        # Process PDF
        print('[PDF] Starting PDF processing...')
        result = await processor.process_pdf(pdf_base64)
        print(f'[PDF] Processing completed with status: {result["status"]}')
        return result
    except Exception as e:
        error_msg = str(e)
        print(f'[PDF] Error processing PDF: {error_msg}')
        return {
            'status': 'error',
            'message': error_msg
        }