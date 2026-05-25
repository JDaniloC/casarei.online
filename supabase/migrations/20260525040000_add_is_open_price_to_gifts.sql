-- Migration to add is_open_price to gifts table
ALTER TABLE public.gifts
ADD COLUMN is_open_price BOOLEAN NOT NULL DEFAULT false;
