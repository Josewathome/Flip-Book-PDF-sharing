-- Add missing columns to pdf_analysis table for podcast generation
ALTER TABLE public.pdf_analysis 
ADD COLUMN IF NOT EXISTS podcast_status TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS podcast_error TEXT DEFAULT NULL;