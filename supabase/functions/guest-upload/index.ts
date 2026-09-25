import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseAllowedOrigins } from "../_shared/cors.ts";
import { createDenoDriveAccess } from "../_shared/drive-access-deno.ts";
import {
  ensureCoupleRootFolder,
  ensureFolder,
  initResumableSession,
  resolveGuestFolder,
  trashFolder,
  type FetchFn,
  type GuestFolderStore,
  type PlatformRootStore,
} from "../_shared/google-drive.ts";
import { getQuota } from "../_shared/google-drive-read.ts";
import { rateLimitDbFromSupabase } from "../_shared/rate-limit.ts";
import { createHandler, type GuestUploadDeps } from "./handler.ts";

// Ligação fina do handler ao mundo real: variáveis de ambiente, banco (service
// role), Drive e caches em memória. Toda a lógica de decisão está em handler.ts.
// Público intencional: a função não tem JWT (verify_jwt = false em config.toml).

const LOG_PREFIX = "[guest-upload]";
const QUOTA_TTL_MS = 60_000;

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const fetchFn: FetchFn = (input, init) => fetch(input, init);

// --- Access token do Google, por casamento -----------------------------------

// Plataforma ou casal conforme a conexão; lê as credenciais só na hora de usar: se
// faltar alguma, GET e OPTIONS seguem funcionando e o POST responde 503.
const driveAccess = createDenoDriveAccess(supabase, fetchFn, LOG_PREFIX);

// --- Cota do Drive, com cache curto POR access token --------------------------

// Contas diferentes (plataforma e cada casal) têm access tokens diferentes, então a chave
// do cache é o próprio token (só em memória do isolate): a cota de um casal nunca serve a outro.
type Quota = { limit: number | null; usage: number; free: number | null };
const MAX_QUOTA_ENTRIES = 200;
const quotaCache = new Map<string, { value: Quota; expiresAt: number }>();

async function getCachedQuota(accessToken: string): Promise<Quota> {
  const now = Date.now();
  const cached = quotaCache.get(accessToken);
  if (cached && now < cached.expiresAt) return cached.value;

  const value = await getQuota(fetchFn, accessToken);
  for (const [key, entry] of quotaCache) {
    if (entry.expiresAt <= now) quotaCache.delete(key);
  }
  while (quotaCache.size >= MAX_QUOTA_ENTRIES) {
    const oldest = quotaCache.keys().next().value;
    if (oldest === undefined) break;
    quotaCache.delete(oldest);
  }
  quotaCache.set(accessToken, { value, expiresAt: now + QUOTA_TTL_MS });
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

// --- Pasta "Casarei.online" (tabela platform_drive_settings) -----------------

const PLATFORM_SETTINGS = "platform_drive_settings";
const PLATFORM_ROOT_KEY = "platform_root";

// Uma única linha (key = 'platform_root') com o id da pasta que contém a pasta de
// cada casal. Mesmo cuidado do guestFolders: mensagens fixas, sem ids.
const platformRootStore: PlatformRootStore = {
  async get() {
    const { data, error } = await supabase
      .from(PLATFORM_SETTINGS)
      .select("folder_id")
      .eq("key", PLATFORM_ROOT_KEY)
      .maybeSingle();
    if (error) throw new Error("Falha ao ler a pasta da plataforma");
    return data?.folder_id ?? null;
  },

  // ON CONFLICT DO NOTHING seguido de select: quem perde a corrida do primeiro uso
  // recebe o id da pasta que já estava lá (o vencedor).
  async insertIfAbsent(folderId) {
    const { error } = await supabase
      .from(PLATFORM_SETTINGS)
      .upsert({ key: PLATFORM_ROOT_KEY, folder_id: folderId }, { onConflict: "key", ignoreDuplicates: true });
    if (error) throw new Error("Falha ao registrar a pasta da plataforma");
    const { data, error: selectError } = await supabase
      .from(PLATFORM_SETTINGS)
      .select("folder_id")
      .eq("key", PLATFORM_ROOT_KEY)
      .single();
    if (selectError || !data) throw new Error("Falha ao ler a pasta da plataforma registrada");
    return data.folder_id;
  },

  async update(folderId) {
    const { error } = await supabase
      .from(PLATFORM_SETTINGS)
      .update({ folder_id: folderId })
      .eq("key", PLATFORM_ROOT_KEY);
    if (error) throw new Error("Falha ao atualizar a pasta da plataforma");
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
      .select("wedding_id, uploads_enabled, folder_id, connected_at, needs_reconnect")
      .eq("upload_token", token)
      .maybeSingle();
    if (error) throw new Error("Falha ao buscar a conexão de envio");
    if (!data) return null;
    return {
      weddingId: data.wedding_id,
      uploadsEnabled: data.uploads_enabled,
      folderId: data.folder_id ?? null,
      connectedAt: data.connected_at ?? null,
      needsReconnect: data.needs_reconnect === true,
    };
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
    getAccessToken: driveAccess.getAccessToken,
    invalidateAccessToken: driveAccess.invalidateAccessToken,
    ensureRootFolder: (accessToken, opts) => ensureCoupleRootFolder(fetchFn, accessToken, platformRootStore, opts),
    // Modo casal: a raiz fica no topo do Drive do casal (sem "Casarei.online" no meio).
    ensureOwnerRootFolder: (accessToken, opts) => ensureFolder(fetchFn, accessToken, opts),
    trashFolder: (accessToken, folderId) => trashFolder(fetchFn, accessToken, folderId),
    resolveGuestFolder: (accessToken, store, opts) => resolveGuestFolder(fetchFn, accessToken, store, opts),
    initSession: (accessToken, opts) => initResumableSession(fetchFn, accessToken, opts),
    getQuota: getCachedQuota,
  },
};

serve(createHandler(deps));
