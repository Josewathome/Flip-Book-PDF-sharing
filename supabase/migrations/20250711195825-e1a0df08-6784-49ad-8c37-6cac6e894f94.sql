-- Create storage bucket for embeddings
INSERT INTO storage.buckets (id, name, public) 
VALUES ('embeddings', 'embeddings', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies for embeddings bucket
CREATE POLICY "Embeddings are publicly accessible" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'embeddings');

CREATE POLICY "System can upload embeddings" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'embeddings');

CREATE POLICY "System can update embeddings" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'embeddings');

CREATE POLICY "System can delete embeddings" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'embeddings');

-- Update pdf_analysis table to use embedding URL instead of direct storage
ALTER TABLE pdf_analysis 
ADD COLUMN embedding_url TEXT,
ADD COLUMN embedding_chunks_count INTEGER DEFAULT 0,
ADD COLUMN embedding_method TEXT DEFAULT 'standard';

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_pdf_analysis_embedding_url ON pdf_analysis(embedding_url);

-- Add comment for clarity
COMMENT ON COLUMN pdf_analysis.embedding_url IS 'URL to the vector embeddings file stored in Supabase Storage';
COMMENT ON COLUMN pdf_analysis.embedding_chunks_count IS 'Number of text chunks that were embedded';
COMMENT ON COLUMN pdf_analysis.embedding_method IS 'Method used for embedding generation (standard, wasm, etc.)';