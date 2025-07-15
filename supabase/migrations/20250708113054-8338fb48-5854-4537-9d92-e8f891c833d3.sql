-- Add podcast columns to pdf_analysis table
ALTER TABLE public.pdf_analysis 
ADD COLUMN podcast_script TEXT,
ADD COLUMN podcast_audio_url TEXT,
ADD COLUMN podcast_generated_at TIMESTAMP WITH TIME ZONE;

-- Create index for faster podcast queries
CREATE INDEX idx_pdf_analysis_podcast ON public.pdf_analysis(pdf_id) WHERE podcast_script IS NOT NULL;