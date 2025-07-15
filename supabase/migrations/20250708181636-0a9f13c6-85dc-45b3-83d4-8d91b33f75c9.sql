-- Create podcasts storage bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public) 
VALUES ('podcasts', 'podcasts', true)
ON CONFLICT (id) DO NOTHING;

-- Create policy for public access to podcast files
CREATE POLICY IF NOT EXISTS "Public podcast access" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'podcasts');