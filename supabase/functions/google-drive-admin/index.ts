import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseAllowedOrigins } from "../_shared/cors.ts";
import { bytesToHex, encryptValue } from "../_shared/crypto.ts";
import { createDenoDriveAccess, requireEnv } from "../_shared/drive-access-deno.ts";
import { buildAuthUrl, ensureFolder, exchangeCode, type FetchFn } from "../_shared/google-drive.ts";
import { getThumbnails, listGuestFiles, summarizeGuestFiles } from "../_shared/google-drive-read.ts";
import { signState, verifyState } from "../_shared/hmac-state.ts";
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

// --- Google: access token por casamento e OAuth ------------------------------

// Lê as credenciais só na hora de usar: se faltar alguma, só as ações que precisam do
// Google respondem 503; status, enable, set-enabled e rotate-token só usam o banco.
const driveAccess = createDenoDriveAccess(supabase, fetchFn, LOG_PREFIX);

const oauthConfig = () => {
  const [clientId, clientSecret, redirectUri] = requireEnv(LOG_PREFIX, [
    "GOOGLE_DRIVE_CLIENT_ID",
    "GOOGLE_DRIVE_CLIENT_SECRET",
    "GOOGLE_DRIVE_REDIRECT_URI",
  ]);
  return { clientId, clientSecret, redirectUri };
};

const stateSecret = () => requireEnv(LOG_PREFIX, ["GOOGLE_OAUTH_STATE_SECRET"])[0];
const encryptionKey = () => requireEnv(LOG_PREFIX, ["ENCRYPTION_KEY"])[0];

// --- Banco (service role) ----------------------------------------------------

const CONNECTIONS = "wedding_drive_connections";
const GUEST_FOLDERS = "wedding_drive_guest_folders";
const CONNECTION_COLUMNS = "uploads_enabled, upload_token, connected_at, google_email, needs_reconnect, folder_id";

interface ConnectionData {
  uploads_enabled: boolean;
  upload_token: string;
  connected_at: string | null;
  google_email: string | null;
  needs_reconnect: boolean | null;
  folder_id: string | null;
}

// Os erros do banco não entram nas mensagens: podem carregar ids e detalhes internos.
function toRow(data: ConnectionData): DriveConnectionRow {
  return {
    uploadsEnabled: data.uploads_enabled,
    uploadToken: data.upload_token,
    connectedAt: data.connected_at ?? null,
    googleEmail: data.google_email ?? null,
    needsReconnect: data.needs_reconnect === true,
    folderId: data.folder_id ?? null,
  };
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

  // Grava a conexão do casal de uma vez. Só cria a linha (com o token do QR) se ela não
  // existe: com linha, o upload_token nunca é tocado. Os campos do token e a época vão
  // juntos, então a CHECK do banco (token, IV e época juntos) sempre é satisfeita.
  async connectOwner(weddingId, data, newUploadToken) {
    if (newUploadToken !== null) {
      const { error } = await supabase
        .from(CONNECTIONS)
        .upsert(
          { wedding_id: weddingId, upload_token: newUploadToken },
          { onConflict: "wedding_id", ignoreDuplicates: true },
        );
      if (error) throw new Error("Falha ao criar a conexão de envio");
    }
    const { data: updated, error } = await supabase
      .from(CONNECTIONS)
      .update({
        refresh_token_encrypted: data.refreshTokenEncrypted,
        refresh_token_iv: data.refreshTokenIv,
        google_email: data.googleEmail,
        connected_at: new Date().toISOString(),
        needs_reconnect: false,
        folder_id: data.folderId,
      })
      .eq("wedding_id", weddingId)
      .select(CONNECTION_COLUMNS);
    if (error || !updated || updated.length === 0) throw new Error("Falha ao gravar a conexão do casal");
    return toRow(updated[0]);
  },

  async disconnectOwner(weddingId) {
    const { data, error } = await supabase
      .from(CONNECTIONS)
      .update({
        refresh_token_encrypted: null,
        refresh_token_iv: null,
        google_email: null,
        connected_at: null,
        needs_reconnect: false,
        folder_id: null,
      })
      .eq("wedding_id", weddingId)
      .select(CONNECTION_COLUMNS);
    if (error) throw new Error("Falha ao desconectar o Google do casal");
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

  getAccessToken: driveAccess.getAccessToken,

  now: () => Date.now(),
  randomNonce: () => bytesToHex(crypto.getRandomValues(new Uint8Array(16))),
  signState: (payload) => signState(payload, stateSecret()),
  verifyState: (state) => verifyState(state, stateSecret(), Date.now()),
  encryptToken: (plain) => encryptValue(plain, encryptionKey()),

  async getCoupleNames(weddingId) {
    const { data, error } = await supabase
      .from("weddings")
      .select("couple_name, partner1_name, partner2_name")
      .eq("id", weddingId)
      .maybeSingle();
    if (error) throw new Error("Falha ao buscar os nomes do casal");
    if (!data) return null;
    return {
      coupleName: data.couple_name ?? "",
      partner1Name: data.partner1_name ?? "",
      partner2Name: data.partner2_name ?? "",
    };
  },

  async clearGuestFolders(weddingId) {
    const { error } = await supabase.from(GUEST_FOLDERS).delete().eq("wedding_id", weddingId);
    if (error) throw new Error("Falha ao limpar as pastas de convidados");
  },

  google: {
    buildAuthUrl: (state) => {
      const { clientId, redirectUri } = oauthConfig();
      return buildAuthUrl({ clientId, redirectUri, state });
    },
    exchangeCode: (code) => exchangeCode(fetchFn, oauthConfig(), code),
    // Sem folderId: a pasta é sempre nova, no topo do Drive do casal.
    createOwnerRootFolder: (accessToken, opts) =>
      ensureFolder(fetchFn, accessToken, { weddingId: opts.weddingId, name: opts.name, folderId: null }),
  },

  drive: {
    listGuestFiles: (accessToken, weddingId, opts) => listGuestFiles(fetchFn, accessToken, weddingId, opts),
    summarizeGuestFiles: (accessToken, weddingId) => summarizeGuestFiles(fetchFn, accessToken, weddingId),
    getThumbnails: (accessToken, weddingId, fileIds) => getThumbnails(fetchFn, accessToken, weddingId, fileIds),
  },
};

serve(createHandler(deps));
