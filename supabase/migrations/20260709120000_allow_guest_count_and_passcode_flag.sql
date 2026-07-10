-- 1) Toggle que controla se o convidado pode escolher a quantidade de pessoas
--    ao confirmar presença/comprar presente. Desligado => todo convite vale 1 pessoa.
ALTER TABLE public.weddings
ADD COLUMN allow_guest_count boolean NOT NULL DEFAULT true;

-- 2) Recria as views:
--    - wedding_config (dono): inclui allow_guest_count, mantém global_passcode.
--    - wedding_config_safe (pública, consumida por get-public-wedding): inclui
--      allow_guest_count e troca global_passcode por has_global_passcode. O valor
--      da senha nunca deve chegar ao cliente — a validação passa a ser feita
--      server-side pela edge function verify-passcode.

DROP VIEW IF EXISTS public.wedding_config CASCADE;
CREATE VIEW public.wedding_config
WITH (security_invoker = true)
AS
SELECT
  id, user_id, couple_name, partner1_name, partner2_name, wedding_date, tagline, slug, layout,
  section_about, section_wedding_info, section_gifts, section_rsvp, section_message_wall,
  section_gallery, section_video, section_dress_code, hero_image_url, video_url,
  ceremony_date, ceremony_time, ceremony_location, ceremony_address,
  reception_location, reception_address, reception_time, same_location,
  about_text, dress_code_text, colors_to_avoid, additional_info,
  mercado_pago_public_key, payment_credit_card, payment_pix, payment_boleto, max_installments,
  story_photo_1, story_photo_2, story_photo_3, created_at, updated_at,
  manual_pix_type, manual_pix_key, manual_pix_qr_image_url, whatsapp_number,
  theme_color, theme_font, theme_decorations, section_virtual_house,
  background_color, global_passcode, allow_guest_count
FROM public.weddings;

DROP VIEW IF EXISTS public.wedding_config_safe CASCADE;
CREATE VIEW public.wedding_config_safe
WITH (security_invoker = true)
AS
SELECT
  id, user_id, couple_name, partner1_name, partner2_name, wedding_date, tagline, slug, layout,
  section_about, section_wedding_info, section_gifts, section_rsvp, section_message_wall,
  section_gallery, section_video, section_dress_code, hero_image_url, video_url,
  ceremony_date, ceremony_time, ceremony_location, ceremony_address,
  reception_location, reception_address, reception_time, same_location,
  about_text, dress_code_text, colors_to_avoid, additional_info,
  mercado_pago_public_key, payment_credit_card, payment_pix, payment_boleto, max_installments,
  story_photo_1, story_photo_2, story_photo_3, created_at, updated_at,
  manual_pix_type, manual_pix_key, manual_pix_qr_image_url, whatsapp_number,
  theme_color, theme_font, theme_decorations, section_virtual_house,
  background_color, allow_guest_count,
  (global_passcode IS NOT NULL AND global_passcode <> '') AS has_global_passcode
FROM public.weddings;
