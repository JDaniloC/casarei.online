-- Adicionar coluna para a imagem do QR Code do PIX Manual
ALTER TABLE weddings
ADD COLUMN manual_pix_qr_image_url text;

-- Criar bucket para assets do casamento (imagens, etc)
INSERT INTO storage.buckets (id, name, public)
VALUES ('wedding-assets', 'wedding-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Policies para o bucket wedding-assets
-- O casal autenticado pode inserir, atualizar e deletar
CREATE POLICY "Couples can manage their wedding assets"
ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'wedding-assets');

-- Qualquer um pode visualizar
CREATE POLICY "Anyone can view wedding assets"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'wedding-assets');
