-- Migration to add receipt_url to orders and create a storage bucket for it

ALTER TABLE orders
ADD COLUMN receipt_url text;

-- Create storage bucket for receipts if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', true)
ON CONFLICT (id) DO NOTHING;

-- RLS for receipts bucket
-- Anyone can upload a receipt (since guests are not authenticated)
CREATE POLICY "Anyone can upload a receipt"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'receipts');

-- Anyone can view a receipt
CREATE POLICY "Anyone can view a receipt"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'receipts');

-- Couples can delete receipts if needed
CREATE POLICY "Couples can delete receipts"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'receipts');
