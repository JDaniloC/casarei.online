-- Drop the old constraint
ALTER TABLE public.weddings DROP CONSTRAINT IF EXISTS weddings_layout_check;

-- Add the new constraint allowing classic, modern, minimalist, editorial, magazine, and romantic
ALTER TABLE public.weddings ADD CONSTRAINT weddings_layout_check CHECK (layout IN ('classic', 'modern', 'minimalist', 'editorial', 'magazine', 'romantic'));
