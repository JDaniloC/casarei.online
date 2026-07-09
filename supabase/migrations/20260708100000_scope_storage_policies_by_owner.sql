-- Escopa as policies de ESCRITA dos buckets por dono.
-- Antes, INSERT/UPDATE/DELETE checavam apenas bucket_id, permitindo que qualquer
-- usuário autenticado apagasse ou sobrescrevesse arquivos de outros casais (o
-- weddingId é público e aparece no path das imagens).

-- ===== wedding-gallery: path = {weddingId}/{arquivo} =====
DROP POLICY IF EXISTS "Allow authenticated users to insert to wedding-gallery" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to delete from wedding-gallery" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to update wedding-gallery" ON storage.objects;

CREATE POLICY "Owners can insert into wedding-gallery"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'wedding-gallery'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.weddings WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Owners can update wedding-gallery"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'wedding-gallery'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.weddings WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Owners can delete from wedding-gallery"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'wedding-gallery'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.weddings WHERE user_id = auth.uid()
  )
);

-- ===== wedding-assets: path = {userId}-... (arquivo plano) =====
DROP POLICY IF EXISTS "Couples can manage their wedding assets" ON storage.objects;

CREATE POLICY "Owners can manage their wedding assets"
ON storage.objects FOR ALL TO authenticated
USING (
  bucket_id = 'wedding-assets'
  AND name LIKE auth.uid()::text || '-%'
)
WITH CHECK (
  bucket_id = 'wedding-assets'
  AND name LIKE auth.uid()::text || '-%'
);
