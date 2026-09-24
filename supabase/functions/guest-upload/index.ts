import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseAllowedOrigins } from "../_shared/cors.ts";
import {
  ensureFolder,
  initResumableSession,
  refreshAccessToken,
  resolveGuestFolder,
  type FetchFn,
  type GuestFolderStore,
} from "../_shared/google-drive.ts";
import { getQuota } from "../_shared/google-drive-read.ts";
import { rateLimitDbFromSupabase } from "../_shared/rate-limit.ts";
import { createHandler, type GuestUploadDeps } from "./handler.ts";

// Ligação fina do handler ao mundo real: variáveis de ambiente, banco (service
// role), Drive e caches em memória. Toda a lógica de decisão está em handler.ts.
// Público intencional: a função não tem JWT (verify_jwt = false em config.toml).

const LOG_PREFIX = "[guest-upload]";
const TOKEN_SAFETY_MARGIN_MS = 60_000;
const QUOTA_TTL_MS = 60_000;

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const fetchFn: FetchFn = (input, init) => fetch(input, init);

// --- Access token do Google (conta da plataforma), com cache no módulo -------

let cachedToken: { value: string; expiresAt: number } | null = null;
let tokenInFlight: Promise<string> | null = null;

// Lê as credenciais só na hora de usar: se faltar alguma, GET e OPTIONS seguem
// funcionando e o POST responde 503. Loga o NOME da variável ausente, nunca valor.
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

// --- Cota do Drive, com cache curto ------------------------------------------

let cachedQuota: {
  value: { limit: number | null; usage: number; free: number | null };
  expiresAt: number;
} | null = null;

async function getCachedQuota(accessToken: string) {
  if (cachedQuota && Date.now() < cachedQuota.expiresAt) return cachedQuota.value;
  const value = await getQuota(fetchFn, accessToken);
  cachedQuota = { value, expiresAt: Date.now() + QUOTA_TTL_MS };
  return value;
}

// --- Pastas de convidado (tabela wedding_drive_guest_folders) ----------------

const GUEST_FOLDERS = "wedding_drive_guest_folders";

// Os erros do banco não entram nas mensagens: podem carregar ids e detalhes internos.
const guestFolders: GuestFolderStore = {
  async get(weddingId, guestKey) {
    const { data, error } = await supabase
      .from(GUEST_FOLDERS)
      .select("folder_id")
      .eq("wedding_id", weddingId)
      .eq("guest_key", guestKey)
      .maybeSingle();
    if (error) throw new Error("Falha ao ler a pasta do convidado");
    return data?.folder_id ?? null;
  },

  // A pasta "Anônimo" (guest_key = '') não conta para o teto de 300 pastas.
  async count(weddingId) {
    const { count, error } = await supabase
      .from(GUEST_FOLDERS)
      .select("guest_key", { count: "exact", head: true })
      .eq("wedding_id", weddingId)
      .neq("guest_key", "");
    if (error) throw new Error("Falha ao contar as pastas de convidados");
    return count ?? 0;
  },

  // ON CONFLICT DO NOTHING seguido de select: quem perde a corrida recebe o id
  // da pasta que já estava lá (o vencedor).
  async insertIfAbsent(weddingId, guestKey, displayName, folderId) {
    const { error } = await supabase
      .from(GUEST_FOLDERS)
      .upsert(
        { wedding_id: weddingId, guest_key: guestKey, display_name: displayName, folder_id: folderId },
        { onConflict: "wedding_id,guest_key", ignoreDuplicates: true },
      );
    if (error) throw new Error("Falha ao registrar a pasta do convidado");
    const { data, error: selectError } = await supabase
      .from(GUEST_FOLDERS)
      .select("folder_id")
      .eq("wedding_id", weddingId)
      .eq("guest_key", guestKey)
      .single();
    if (selectError || !data) throw new Error("Falha ao ler a pasta do convidado registrada");
    return data.folder_id;
  },

  async update(weddingId, guestKey, folderId) {
    const { error } = await supabase
      .from(GUEST_FOLDERS)
      .update({ folder_id: folderId })
      .eq("wedding_id", weddingId)
      .eq("guest_key", guestKey);
    if (error) throw new Error("Falha ao atualizar a pasta do convidado");
  },
};

// --- Dependências do handler -------------------------------------------------

const allowedOrigins = parseAllowedOrigins(Deno.env.get("ALLOWED_ORIGINS"));

const deps: GuestUploadDeps = {
  allowedOrigins,
  now: () => Date.now(),

  async findConnection(token) {
    const { data, error } = await supabase
      .from("wedding_drive_connections")
      .select("wedding_id, uploads_enabled, folder_id")
      .eq("upload_token", token)
      .maybeSingle();
    if (error) throw new Error("Falha ao buscar a conexão de envio");
    if (!data) return null;
    return { weddingId: data.wedding_id, uploadsEnabled: data.uploads_enabled, folderId: data.folder_id ?? null };
  },

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

  // Gravação condicional (compare-and-set) num único UPDATE: só vale se folder_id
  // ainda for o `expected` lido pela requisição (IS NULL na primeira raiz). O
  // Postgres reavalia o WHERE depois de esperar o lock da linha, então de várias
  // requisições simultâneas só uma atualiza; as outras recebem 0 linhas e adotam a
  // raiz que já está gravada. Devolve a raiz vencedora.
  async saveRootFolder(weddingId, expected, newId) {
    const update = supabase
      .from("wedding_drive_connections")
      .update({ folder_id: newId })
      .eq("wedding_id", weddingId);
    const { data: updated, error } = await (expected === null
      ? update.is("folder_id", null)
      : update.eq("folder_id", expected)
    ).select("folder_id");
    if (error) throw new Error("Falha ao gravar a pasta raiz");
    if (updated && updated.length > 0) return updated[0].folder_id;

    // 0 linhas: outra requisição gravou antes (ou a linha sumiu). Lê a vencedora.
    const { data: current, error: selectError } = await supabase
      .from("wedding_drive_connections")
      .select("folder_id")
      .eq("wedding_id", weddingId)
      .maybeSingle();
    if (selectError) throw new Error("Falha ao ler a pasta raiz gravada");
    if (!current?.folder_id) throw new Error("Pasta raiz não encontrada após a gravação condicional");
    return current.folder_id;
  },

  async clearGuestFolders(weddingId) {
    const { error } = await supabase.from(GUEST_FOLDERS).delete().eq("wedding_id", weddingId);
    if (error) throw new Error("Falha ao limpar as pastas de convidados");
  },

  rateLimitDb: rateLimitDbFromSupabase(supabase),
  guestFolders,

  drive: {
    getAccessToken,
    ensureRootFolder: (accessToken, opts) => ensureFolder(fetchFn, accessToken, opts),
    resolveGuestFolder: (accessToken, store, opts) => resolveGuestFolder(fetchFn, accessToken, store, opts),
    initSession: (accessToken, opts) => initResumableSession(fetchFn, accessToken, opts),
    getQuota: getCachedQuota,
  },
};

serve(createHandler(deps));
