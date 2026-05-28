ALTER TABLE public.gallery_images 
ADD COLUMN is_public_gallery BOOLEAN NOT NULL DEFAULT true;
