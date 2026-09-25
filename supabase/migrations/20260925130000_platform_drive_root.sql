-- Pasta raiz da plataforma no Google Drive dos uploads dos convidados.
--
-- Hierarquia no Drive:
--   Casarei.online/            <- UMA pasta para toda a plataforma (esta tabela)
--     <nome do casal>/         <- wedding_drive_connections.folder_id
--       <convidado>/           <- wedding_drive_guest_folders.folder_id
--
-- platform_drive_settings guarda o id da pasta "Casarei.online" na linha de chave
-- 'platform_root'. A edge function guest-upload cria a pasta no primeiro envio de
-- todos e grava o id aqui com INSERT ... ON CONFLICT DO NOTHING: se duas
-- requisições correm juntas, só uma linha entra e a outra joga a própria pasta
-- na lixeira e adota a vencedora.
--
-- Acesso exclusivo pelo service role (edge functions): RLS ligado, nenhuma
-- policy e nenhum privilégio para anon/authenticated, como nas tabelas de
-- wedding_drive_connections e wedding_drive_guest_folders.

CREATE TABLE IF NOT EXISTS public.platform_drive_settings (
  key TEXT PRIMARY KEY,
  folder_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_drive_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.platform_drive_settings FROM anon, authenticated;
