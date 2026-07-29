-- Convite família: limite de acompanhantes por convidado, com padrão por casamento.
--
-- max_companions NULL = herda default_max_companions do casamento.
-- Teto 19 = 19 acompanhantes + titular, coerente com o clamp de guests_count (1..20).
--
-- Envolvida em BEGIN/COMMIT porque esta migration é aplicada manualmente no SQL
-- editor do Supabase, que não coloca o script inteiro numa transação sozinho. Sem
-- isso, um aborto no meio (ex.: entre o DROP VIEW e o CREATE VIEW correspondente)
-- deixaria a página pública fora do ar sem rollback automático. ADD COLUMN ... IF
-- NOT EXISTS torna o arquivo seguro para reexecutar após uma falha parcial.

BEGIN;

ALTER TABLE public.weddings
  ADD COLUMN IF NOT EXISTS default_max_companions INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.weddings
  ADD CONSTRAINT weddings_default_max_companions_range
  CHECK (default_max_companions BETWEEN 0 AND 19);

ALTER TABLE public.guests
  ADD COLUMN IF NOT EXISTS max_companions INTEGER NULL;

ALTER TABLE public.guests
  ADD CONSTRAINT guests_max_companions_range
  CHECK (max_companions IS NULL OR max_companions BETWEEN 0 AND 19);

-- Backfill preservando o comportamento atual de cada casamento:
-- quem tinha o toggle ligado permitia até 20 pessoas = 19 acompanhantes.
UPDATE public.weddings
SET default_max_companions = 19
WHERE allow_guest_count = true;

-- allow_guest_count permanece na tabela (cliente ativo em produção); apenas
-- deixa de ser lida pelo código a partir daqui.

-- Recria as views com a coluna nova E restaura security_invoker, que a migration
-- 20260722120000_add_footer_messages.sql havia perdido. Sem essa cláusula a view
-- roda com privilégio do dono e ignora o RLS de weddings, expondo a anon o
-- global_passcode, a manual_pix_key e o user_id de todos os casamentos.
DROP VIEW IF EXISTS public.wedding_config;
CREATE VIEW public.wedding_config
WITH (security_invoker = true)
AS
SELECT
  id,
  user_id,
  couple_name,
  slug,
  wedding_date,
  tagline,
  layout,
  section_about,
  section_wedding_info,
  section_gifts,
  section_rsvp,
  section_message_wall,
  section_gallery,
  section_video,
  section_dress_code,
  section_virtual_house,
  hero_image_url,
  video_url,
  ceremony_date,
  ceremony_time,
  ceremony_location,
  ceremony_address,
  reception_location,
  reception_address,
  reception_time,
  same_location,
  about_text,
  dress_code_text,
  colors_to_avoid,
  additional_info,
  mercado_pago_public_key,
  payment_credit_card,
  payment_pix,
  payment_boleto,
  max_installments,
  manual_pix_type,
  manual_pix_key,
  manual_pix_qr_image_url,
  whatsapp_number,
  story_photo_1,
  story_photo_2,
  story_photo_3,
  theme_color,
  theme_font,
  theme_decorations,
  background_color,
  global_passcode,
  allow_guest_count,
  invite_message,
  public_message,
  default_max_companions
FROM public.weddings;

GRANT SELECT ON public.wedding_config TO anon, authenticated;

DROP VIEW IF EXISTS public.wedding_config_safe;
CREATE VIEW public.wedding_config_safe
WITH (security_invoker = true)
AS
SELECT
  id,
  couple_name,
  slug,
  wedding_date,
  tagline,
  layout,
  section_about,
  section_wedding_info,
  section_gifts,
  section_rsvp,
  section_message_wall,
  section_gallery,
  section_video,
  section_dress_code,
  section_virtual_house,
  hero_image_url,
  video_url,
  ceremony_date,
  ceremony_time,
  ceremony_location,
  ceremony_address,
  reception_location,
  reception_address,
  reception_time,
  same_location,
  about_text,
  dress_code_text,
  colors_to_avoid,
  additional_info,
  payment_credit_card,
  payment_pix,
  payment_boleto,
  manual_pix_type,
  manual_pix_key,
  manual_pix_qr_image_url,
  whatsapp_number,
  story_photo_1,
  story_photo_2,
  story_photo_3,
  theme_color,
  theme_font,
  theme_decorations,
  background_color,
  global_passcode IS NOT NULL AND global_passcode != '' as has_passcode,
  allow_guest_count,
  invite_message,
  public_message,
  default_max_companions
FROM public.weddings;

GRANT SELECT ON public.wedding_config_safe TO anon, authenticated;

COMMIT;
