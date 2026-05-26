-- Drop the old constraint that only allowed 'classic', 'modern', 'minimalist'
ALTER TABLE public.weddings DROP CONSTRAINT IF EXISTS weddings_layout_check;

-- Add the new constraint allowing 'editorial'
ALTER TABLE public.weddings ADD CONSTRAINT weddings_layout_check CHECK (layout IN ('classic', 'modern', 'minimalist', 'editorial'));
