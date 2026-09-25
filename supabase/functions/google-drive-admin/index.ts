import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseAllowedOrigins } from "../_shared/cors.ts";
import { refreshAccessToken, type FetchFn } from "../_shared/google-drive.ts";
import { getThumbnails, listGuestFiles, summarizeGuestFiles } from "../_shared/google-drive-read.ts";
import {
  classifyAuthError,
  createHandler,
  generateUploadToken,
  type DriveConnectionRow,
  type GoogleDriveAdminDeps,
} from "./handler.ts";

// Ligação fina do handler ao mundo real: variáveis de ambiente, autenticação do
// casal (JWT), banco (service role) e Drive. Toda a lógica de decisão está em
// handler.ts. A função exige JWT (verify_jwt = true em config.toml) E o handler
// valida o usuário de novo: o weddingId sai de `weddings.user_id = user.id`.
//
// Nunca use `getQuota` aqui: ela mostra o Drive inteiro da plataforma, e um casal
// jamais pode ver isso.

const LOG_PREFIX = "[google-drive-admin]";
const TOKEN_SAFETY_MARGIN_MS = 60_000;
const BEARER_PREFIX = "Bearer ";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const fetchFn: FetchFn = (input, init) => fetch(input, init);

// --- Autenticação do casal ---------------------------------------------------

// Cliente com a anon key e o cabeçalho do casal repassado, como em
// save-mp-credentials. O JWT também vai explícito a getUser (sem depender de
// sessão em memória). Só o id do usuário sai daqui.
async function authenticate(authHeader: string): Promise<{ userId: string } | null> {
  const jwt = authHeader.startsWith(BEARER_PREFIX) ? authHeader.slice(BEARER_PREFIX.length) : "";
  if (jwt === "") return null;

  const anonClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await anonClient.auth.getUser(jwt);
  // Só erro de cliente (4xx) é "não autenticado" (401). Queda do Auth (rede, 5xx,
  // status 0 ou sem status) lança: o handler responde 503 e o casal não é deslogado.
  if (error) {
    if (classifyAuthError(error) === "unavailable") throw new Error("auth_unavailable");
    return null;
  }
  if (!data?.user) return null;
  return { userId: data.user.id };
}

// --- Access token do Google (conta da plataforma), com cache no módulo -------

let cachedToken: { value: string; expiresAt: number } | null = null;
let tokenInFlight: Promise<string> | null = null;

// Lê as credenciais só na hora de usar: se faltar alguma, só as ações que precisam
// do Drive (list, summary, thumbnails) respondem 503; status, enable, set-enabled e
// rotate-token só usam o banco e seguem funcionando. Loga o NOME da variável
// ausente, nunca valor.
function readGoogleConfig() {
  const names = ["GOOGLE_DRIVE_CLIENT_ID", "GOOGLE_DRIVE_CLIENT_SECRET", "GOOGLE_DRIVE_REFRESH_TOKEN"] as const;
  const missing = names.filter((name) => !Deno.env.get(name));
  if (missing.length > 0) {
    console.error(`${LOG_PREFIX} variáveis do Google ausentes: ${missing.join(", ")}`);
    throw new Error("google_config_missing");
  }
  return {
    clientId: Deno.env.get("GOOGLE_DRIVE_CLIENT_ID")!,
    clientSecret: Deno.env.get("GOOGLE_DRIVE_CLIENT_SECRET")!,
    refreshToken: Deno.env.get("GOOGLE_DRIVE_REFRESH_TOKEN")!,
  };
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value;
  // Requisições simultâneas com o cache vazio compartilham a mesma troca de token.
  if (!tokenInFlight) {
    tokenInFlight = (async () => {
      const { accessToken, expiresIn } = await refreshAccessToken(fetchFn, readGoogleConfig());
      cachedToken = { value: accessToken, expiresAt: Date.now() + expiresIn * 1000 - TOKEN_SAFETY_MARGIN_MS };
      return accessToken;
    })().finally(() => {
      tokenInFlight = null;
    });
  }
  return tokenInFlight;
}

// --- Banco (service role) ----------------------------------------------------

const CONNECTIONS = "wedding_drive_connections";
const GUEST_FOLDERS = "wedding_drive_guest_folders";
const CONNECTION_COLUMNS = "uploads_enabled, upload_token";

// Os erros do banco não entram nas mensagens: podem carregar ids e detalhes internos.
function toRow(data: { uploads_enabled: boolean; upload_token: string }): DriveConnectionRow {
  return { uploadsEnabled: data.uploads_enabled, uploadToken: data.upload_token };
}

const connections: GoogleDriveAdminDeps["connections"] = {
  async get(weddingId) {
    const { data, error } = await supabase
      .from(CONNECTIONS)
      .select(CONNECTION_COLUMNS)
      .eq("wedding_id", weddingId)
      .maybeSingle();
    if (error) throw new Error("Falha ao ler a conexão de envio");
    return data ? toRow(data) : null;
  },

  // ON CONFLICT DO NOTHING seguido de select: quem perde a corrida devolve a linha
  // que já estava lá (a do vencedor). Nunca troca o token de uma linha existente.
  async create(weddingId, uploadToken) {
    const { error } = await supabase
      .from(CONNECTIONS)
      .upsert(
        { wedding_id: weddingId, upload_token: uploadToken },
        { onConflict: "wedding_id", ignoreDuplicates: true },
      );
    if (error) throw new Error("Falha ao criar a conexão de envio");
    const { data, error: selectError } = await supabase
      .from(CONNECTIONS)
      .select(CONNECTION_COLUMNS)
      .eq("wedding_id", weddingId)
      .maybeSingle();
    if (selectError || !data) throw new Error("Falha ao ler a conexão de envio criada");
    return toRow(data);
  },

  // UPDATE ... RETURNING como lista (wedding_id é a chave primária: 0 ou 1 linha);
  // lista vazia = a linha não existe.
  async setEnabled(weddingId, enabled) {
    const { data, error } = await supabase
      .from(CONNECTIONS)
      .update({ uploads_enabled: enabled })
      .eq("wedding_id", weddingId)
      .select(CONNECTION_COLUMNS);
    if (error) throw new Error("Falha ao atualizar o recebimento de envios");
    return data && data.length > 0 ? toRow(data[0]) : null;
  },

  async rotateToken(weddingId, uploadToken) {
    const { data, error } = await supabase
      .from(CONNECTIONS)
      .update({ upload_token: uploadToken })
      .eq("wedding_id", weddingId)
      .select(CONNECTION_COLUMNS);
    if (error) throw new Error("Falha ao girar o token de envio");
    return data && data.length > 0 ? toRow(data[0]) : null;
  },
};

// --- Dependências do handler -------------------------------------------------

const deps: GoogleDriveAdminDeps = {
  allowedOrigins: parseAllowedOrigins(Deno.env.get("ALLOWED_ORIGINS")),

  authenticate,

  // O weddingId vem só daqui: weddings.user_id é UNIQUE, então há no máximo uma linha.
  async getWeddingIdForUser(userId) {
    const { data, error } = await supabase.from("weddings").select("id").eq("user_id", userId).maybeSingle();
    if (error) throw new Error("Falha ao buscar o casamento do usuário");
    return data?.id ?? null;
  },

  connections,

  // Só convidados nomeados: a pasta "Anônimo" (guest_key = '') não conta.
  async countNamedGuestFolders(weddingId) {
    const { count, error } = await supabase
      .from(GUEST_FOLDERS)
      .select("guest_key", { count: "exact", head: true })
      .eq("wedding_id", weddingId)
      .neq("guest_key", "");
    if (error) throw new Error("Falha ao contar as pastas de convidados");
    return count ?? 0;
  },

  // 24 bytes de crypto.getRandomValues (nunca Math.random), base64url, 32 caracteres.
  generateToken: () => generateUploadToken((bytes) => crypto.getRandomValues(bytes)),

  getAccessToken,

  drive: {
    listGuestFiles: (accessToken, weddingId, opts) => listGuestFiles(fetchFn, accessToken, weddingId, opts),
    summarizeGuestFiles: (accessToken, weddingId) => summarizeGuestFiles(fetchFn, accessToken, weddingId),
    getThumbnails: (accessToken, weddingId, fileIds) => getThumbnails(fetchFn, accessToken, weddingId, fileIds),
  },
};

serve(createHandler(deps));
