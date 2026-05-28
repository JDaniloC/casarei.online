-- Create the wedding-gallery bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'wedding-gallery',
    'wedding-gallery',
    true,
    5242880, -- 5MB em bytes
    ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET 
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Allow public read access to the wedding-gallery bucket
CREATE POLICY "Give public access to wedding-gallery" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'wedding-gallery');

-- Allow authenticated users to upload to the wedding-gallery bucket
CREATE POLICY "Allow authenticated users to insert to wedding-gallery" 
ON storage.objects FOR INSERT 
TO authenticated 
WITH CHECK (bucket_id = 'wedding-gallery');

-- Allow users to delete objects
CREATE POLICY "Allow authenticated users to delete from wedding-gallery" 
ON storage.objects FOR DELETE 
TO authenticated 
USING (bucket_id = 'wedding-gallery');

-- Allow users to update objects
CREATE POLICY "Allow authenticated users to update wedding-gallery" 
ON storage.objects FOR UPDATE 
TO authenticated 
USING (bucket_id = 'wedding-gallery');
