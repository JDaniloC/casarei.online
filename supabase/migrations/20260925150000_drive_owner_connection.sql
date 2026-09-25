-- Drive do casal (Fase 2): o casal conecta o próprio Google e as fotos dos convidados
-- passam a cair numa pasta criada pelo app NO DRIVE DELE.
--
-- O modo é derivado destas colunas, sem coluna de "modo":
--   connected_at IS NULL      -> modo plataforma (Drive da plataforma, como na Fase 1)
--   connected_at IS NOT NULL  -> modo casal (refresh token cifrado com AES-GCM abaixo)
--
-- connected_at também é a "época" da conexão: muda a cada conexão e entra na chave do cache
-- do access token, para nunca servir o token de uma conta antiga depois de uma reconexão.
-- needs_reconnect vira true quando o Google recusa o token do casal (revogado); só voltar a
-- conectar limpa a marca.
--
-- Migration aditiva e compatível com as funções já publicadas (colunas novas nulas ou com
-- padrão). Aplicar isolada com `supabase db query --linked --project-ref ... -f`, nunca
-- com `db push`. O token do QR code NÃO é tocado: o QR já impresso continua valendo.
--
-- Acesso continua exclusivo do service role (edge functions): RLS ligado, nenhuma policy e
-- nenhum privilégio para anon/authenticated (o REVOKE de tabela cobre as colunas novas).

ALTER TABLE public.wedding_drive_connections
  ADD COLUMN IF NOT EXISTS refresh_token_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS refresh_token_iv TEXT,
  ADD COLUMN IF NOT EXISTS google_email TEXT,
  ADD COLUMN IF NOT EXISTS connected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS needs_reconnect BOOLEAN NOT NULL DEFAULT false;

-- ADD CONSTRAINT não tem IF NOT EXISTS: por isso o bloco confere o catálogo antes (e só nesta tabela).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wedding_drive_connections_owner_token_shape'
      AND conrelid = 'public.wedding_drive_connections'::regclass
  ) THEN
    ALTER TABLE public.wedding_drive_connections
      ADD CONSTRAINT wedding_drive_connections_owner_token_shape CHECK (
        (refresh_token_encrypted IS NULL) = (refresh_token_iv IS NULL)
        AND (refresh_token_encrypted IS NULL) = (connected_at IS NULL)
      );
  END IF;
END
$$;

ALTER TABLE public.wedding_drive_connections ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.wedding_drive_connections FROM anon, authenticated;
