ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS gift_name_snapshot TEXT;
