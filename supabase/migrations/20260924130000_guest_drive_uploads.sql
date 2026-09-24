-- Uploads de fotos e vídeos dos convidados para o Google Drive (Fase 1).
--
-- Duas tabelas de apoio às edge functions guest-upload e google-drive-admin:
--   * wedding_drive_connections: uma linha por casamento que ativou o recurso.
--     Guarda o token público do QR code (upload_token), o interruptor de
--     recebimento (uploads_enabled) e a pasta raiz do casal no Drive (folder_id).
--     Sem linha = recurso não ativado.
--   * wedding_drive_guest_folders: uma pasta por convidado dentro da pasta raiz.
--     guest_key é o nome normalizado (sem maiúsculas, acentos e espaços);
--     guest_key = '' é a pasta "Anônimo".
--
-- Nenhum arquivo é armazenado no nosso storage: os dados de mídia vão direto
-- do navegador para o Drive. Estas tabelas guardam só metadados e ids.
--
-- Acesso exclusivo pelo service role (edge functions): RLS ligado, nenhuma
-- policy e nenhum privilégio para anon/authenticated. O token de upload nunca
-- deve ser legível pela anon key, que está no bundle do site.

CREATE TABLE IF NOT EXISTS public.wedding_drive_connections (
  wedding_id UUID PRIMARY KEY REFERENCES public.weddings(id) ON DELETE CASCADE,
  upload_token TEXT NOT NULL UNIQUE,
  uploads_enabled BOOLEAN NOT NULL DEFAULT true,
  folder_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wedding_drive_guest_folders (
  wedding_id UUID NOT NULL REFERENCES public.weddings(id) ON DELETE CASCADE,
  guest_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  folder_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (wedding_id, guest_key)
);

ALTER TABLE public.wedding_drive_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wedding_drive_guest_folders ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.wedding_drive_connections FROM anon, authenticated;
REVOKE ALL ON TABLE public.wedding_drive_guest_folders FROM anon, authenticated;

-- Reaproveita a função de updated_at criada na migration inicial.
DROP TRIGGER IF EXISTS update_wedding_drive_connections_updated_at ON public.wedding_drive_connections;
CREATE TRIGGER update_wedding_drive_connections_updated_at
  BEFORE UPDATE ON public.wedding_drive_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
