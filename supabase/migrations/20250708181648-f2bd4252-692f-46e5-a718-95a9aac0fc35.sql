-- Create podcasts storage bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public) 
VALUES ('podcasts', 'podcasts', true)
ON CONFLICT (id) DO NOTHING;

-- Create policy for public access to podcast files (drop if exists first)
DROP POLICY IF EXISTS "Public podcast access" ON storage.objects;

CREATE POLICY "Public podcast access" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'podcasts');