-- Restaura SECURITY DEFINER em is_public_wedding().
--
-- 20260312213509 converteu a função para SECURITY INVOKER ("only reads public
-- data"), mas as políticas públicas de SELECT em weddings foram removidas de
-- propósito em 20260305014050/20260305023100: a tabela guarda tokens do Mercado
-- Pago e a senha global, e o Postgres não tem RLS por coluna.
--
-- Com INVOKER a função consulta weddings como o próprio chamador. Para `anon` o
-- RLS esconde todas as linhas, então ela retorna sempre false e, para visitantes
-- deslogados, quebra:
--   * INSERT/SELECT em messages  (42501: new row violates row-level security
--     policy for table "messages" — mural de recados)
--   * SELECT em gifts e gallery_images
--   * INSERT em orders, order_items, rsvp_responses e checkout_abandonments
-- O dono logado não percebe, porque "Users can view their own wedding" o deixa
-- enxergar o próprio casamento.
--
-- DEFINER é o desenho original (20260305023100). A função só devolve boolean e não
-- expõe nenhuma coluna de weddings; search_path fixo evita sequestro de schema.
-- CREATE OR REPLACE preserva os GRANTs atuais (EXECUTE para anon/authenticated).
CREATE OR REPLACE FUNCTION public.is_public_wedding(w_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.weddings WHERE id = w_id AND slug IS NOT NULL);
$$;
