-- Respeita is_public_gallery na leitura pública da galeria.
-- A policy pública retornava TODAS as fotos, ignorando is_public_gallery — fotos
-- marcadas como ocultas no dashboard continuavam visíveis (e legíveis via REST anônimo).
-- O dono continua vendo todas as fotos pela policy "Users can manage their wedding gallery".

DROP POLICY IF EXISTS "Anyone can view gallery for public weddings" ON public.gallery_images;

CREATE POLICY "Anyone can view public gallery for public weddings"
  ON public.gallery_images FOR SELECT
  USING (public.is_public_wedding(wedding_id) AND is_public_gallery = true);
