// Cliente do Google Drive para os uploads dos convidados: troca de token, pastas
// (raiz da plataforma, raiz do casal e uma por convidado) e criação da sessão de
// upload resumível.
// Módulo puro: sem Deno.*, sem imports por URL e sem APIs só do Node. O `fetch`
// entra como parâmetro, para rodar tanto na edge function quanto no vitest.
//
// Hierarquia no Drive:
//   Casarei.online/   (UMA pasta para toda a plataforma)
//     <casal>/        (uma por casamento)
//       <convidado>/  (uma por convidado)
//
// O app usa o escopo `drive.file` num Drive compartilhado por TODOS os casais.
// Por isso toda pasta de casal, de convidado e todo upload levam
// `appProperties.w = <weddingId>`; é essa marca que separa os arquivos de um casal
// dos de outro. A pasta da plataforma não pertence a nenhum casamento e leva
// `appProperties.k = "platform-root"`.

import {
  ANONYMOUS_LABEL,
  normalizeGuestKey,
  sanitizeGuestName,
  truncateUtf8,
} from "./guest-upload-validation.ts";

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";

/** Teto de pastas de convidado por casamento; acima dele, novos convidados vão para "Anônimo". */
export const MAX_GUEST_FOLDERS = 300;

/** Nome da pasta única da plataforma, que guarda a pasta de cada casal. */
export const PLATFORM_ROOT_NAME = "Casarei.online";

// Marca da pasta da plataforma (no lugar de `w`, que identifica um casamento).
const PLATFORM_ROOT_PROPERTIES: Record<string, string> = Object.freeze({ k: "platform-root" });

/** O refresh token foi revogado ou expirou: alguém precisa reconectar a conta Google. */
export class NeedsReconnectError extends Error {}

/** O Drive está sem espaço de armazenamento. */
export class QuotaExceededError extends Error {}

export class DriveApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryable: boolean,
  ) {
    super(message);
  }
}

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

// Limite do Drive: 124 bytes por par chave+valor de appProperties. A chave "g"
// ocupa 1, então o nome do convidado pode ter até 120 bytes com folga.
const MAX_GUEST_PROPERTY_BYTES = 120;
const DEFAULT_TOKEN_LIFETIME_SECONDS = 3600;

const RATE_LIMIT_REASONS = new Set(["userRateLimitExceeded", "rateLimitExceeded"]);

const UNEXPECTED_RESPONSE = "Resposta inesperada do Google";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// Lê o corpo de uma resposta sem nunca lançar: JSON quando der, senão o texto
// cru (ou null se vazio/ilegível). É só material para mapDriveError.
async function readBody(res: Response): Promise<unknown> {
  try {
    const text = await res.text();
    if (text === "") return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  } catch {
    return null;
  }
}

// Descarta o corpo de uma resposta que não será lida, cancelando o stream em vez
// de baixá-lo, para não segurar a conexão no runtime. Best effort: nunca lança.
async function discard(res: Response): Promise<void> {
  try {
    await res.body?.cancel();
  } catch {
    // corpo já travado ou consumido: nada a fazer
  }
}

// Reúne os "reasons" que o Google pode colocar em error.errors[], error.details[]
// e error.status. Aceita qualquer formato de corpo (inclusive não-objeto).
function extractReasons(body: unknown): string[] {
  if (!isRecord(body) || !isRecord(body.error)) return [];
  const { error } = body;
  const reasons: string[] = [];
  if (typeof error.status === "string") reasons.push(error.status);
  for (const list of [error.errors, error.details]) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (isRecord(item) && typeof item.reason === "string") reasons.push(item.reason);
    }
  }
  return reasons;
}

/** Converte uma resposta de erro do Google no erro tipado correspondente. */
export function mapDriveError(status: number, body: unknown): Error {
  const reasons = extractReasons(body);
  if (reasons.includes("storageQuotaExceeded")) {
    return new QuotaExceededError("O Google Drive está sem espaço de armazenamento");
  }
  const retryable = status === 429 || status >= 500 || reasons.some((reason) => RATE_LIMIT_REASONS.has(reason));
  return new DriveApiError(`Erro do Google Drive (HTTP ${status})`, status, retryable);
}

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

/** Troca o refresh token por um access token novo. */
export async function refreshAccessToken(
  fetchFn: FetchFn,
  cfg: GoogleOAuthConfig,
): Promise<{ accessToken: string; expiresIn: number }> {
  const res = await fetchFn(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: cfg.refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });

  if (!res.ok) {
    const body = await readBody(res);
    if (isRecord(body) && body.error === "invalid_grant") {
      throw new NeedsReconnectError("A conexão com o Google Drive expirou ou foi revogada");
    }
    throw mapDriveError(res.status, body);
  }

  const data = await readBody(res);
  if (!isRecord(data) || typeof data.access_token !== "string" || data.access_token === "") {
    throw new DriveApiError(UNEXPECTED_RESPONSE, 502, true);
  }
  const expiresIn = Number(data.expires_in);
  return {
    accessToken: data.access_token,
    expiresIn: Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : DEFAULT_TOKEN_LIFETIME_SECONDS,
  };
}

// --- OAuth do casal (Fase 2): URL de autorização, troca do código, revogação ---

/** O código de autorização já foi usado, expirou ou não trouxe o que precisamos. */
export class InvalidCodeError extends Error {}

/** Escopo que o app precisa: só os arquivos que ele mesmo cria. */
export const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const MAX_EMAIL_CHARS = 254;

/**
 * URL para onde o casal é mandado para autorizar o acesso. `prompt=consent` garante que o
 * Google devolva um refresh token; `select_account` deixa o casal escolher a conta;
 * `include_granted_scopes=false` mantém o token só com o que pedimos aqui.
 */
export function buildAuthUrl(opts: { clientId: string; redirectUri: string; state: string }): string {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: ["openid", "email", DRIVE_FILE_SCOPE].join(" "),
    access_type: "offline",
    prompt: "consent select_account",
    include_granted_scopes: "false",
    state: opts.state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export interface OwnerCodeConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface CodeExchange {
  refreshToken: string;
  accessToken: string;
  expiresIn: number;
  /** Escopos realmente concedidos (o casal pode desmarcar o do Drive). */
  scopes: string[];
  /** E-mail da conta, só para exibição; `null` se o Google não o trouxe verificado. */
  email: string | null;
}

// O id_token chega direto do Google pelo canal TLS da troca do código, então basta ler o
// payload (não é usado para autorizar nada, só para mostrar a conta no painel).
function emailFromIdToken(idToken: unknown): string | null {
  if (typeof idToken !== "string") return null;
  const parts = idToken.split(".");
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const payload: unknown = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))));
    if (!isRecord(payload)) return null;
    const email = payload.email;
    if (typeof email !== "string" || email === "" || email.length > MAX_EMAIL_CHARS) return null;
    return payload.email_verified === false ? null : email;
  } catch {
    return null;
  }
}

/** Troca o código de autorização por tokens. Nunca inclui o código nem os tokens em mensagens de erro. */
export async function exchangeCode(fetchFn: FetchFn, cfg: OwnerCodeConfig, code: string): Promise<CodeExchange> {
  const res = await fetchFn(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri,
      grant_type: "authorization_code",
    }).toString(),
  });

  const data = await readBody(res);
  if (!res.ok) {
    if (isRecord(data) && data.error === "invalid_grant") {
      throw new InvalidCodeError("O código de autorização é inválido, já foi usado ou expirou");
    }
    throw mapDriveError(res.status, data);
  }
  if (!isRecord(data) || typeof data.access_token !== "string" || data.access_token === "") {
    throw new DriveApiError(UNEXPECTED_RESPONSE, 502, true);
  }
  if (typeof data.refresh_token !== "string" || data.refresh_token === "") {
    throw new InvalidCodeError("O Google não devolveu a autorização de acesso permanente");
  }

  const expiresIn = Number(data.expires_in);
  return {
    refreshToken: data.refresh_token,
    accessToken: data.access_token,
    expiresIn: Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : DEFAULT_TOKEN_LIFETIME_SECONDS,
    scopes: typeof data.scope === "string" ? data.scope.split(/\s+/).filter((scope) => scope !== "") : [],
    email: emailFromIdToken(data.id_token),
  };
}

/** Revoga um token no Google. Best effort: nunca lança (falha de rede ou HTTP é ignorada). */
export async function revokeToken(fetchFn: FetchFn, token: string): Promise<void> {
  try {
    const res = await fetchFn(REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }).toString(),
    });
    await discard(res);
  } catch {
    // ignorado de propósito
  }
}

const authHeaders = (accessToken: string) => ({ Authorization: `Bearer ${accessToken}` });

const jsonHeaders = (accessToken: string) => ({
  ...authHeaders(accessToken),
  "Content-Type": "application/json",
});

/**
 * Como a pasta é marcada: `appProperties` (quando informado) vale NO LUGAR do
 * `{ w: weddingId }` padrão. Pelo menos um dos dois é obrigatório.
 */
interface FolderMarking {
  weddingId?: string;
  appProperties?: Record<string, string>;
}

// Decide as appProperties da pasta a criar. Pasta sem marca nenhuma seria
// impossível de atribuir a um casamento (ou à plataforma), então é erro de programação.
function folderProperties(opts: FolderMarking): Record<string, string> {
  if (opts.appProperties !== undefined) return opts.appProperties;
  if (opts.weddingId) return { w: opts.weddingId };
  throw new Error("Informe weddingId ou appProperties para marcar a pasta");
}

async function createFolder(
  fetchFn: FetchFn,
  accessToken: string,
  opts: FolderMarking & { name: string; parentId?: string | null },
): Promise<string> {
  const appProperties = folderProperties(opts);
  const res = await fetchFn(`${DRIVE_API}/files?fields=id`, {
    method: "POST",
    headers: jsonHeaders(accessToken),
    body: JSON.stringify({
      name: opts.name,
      mimeType: DRIVE_FOLDER_MIME,
      appProperties,
      ...(opts.parentId ? { parents: [opts.parentId] } : {}),
    }),
  });
  const body = await readBody(res);
  if (!res.ok) throw mapDriveError(res.status, body);
  if (!isRecord(body) || typeof body.id !== "string" || body.id === "") {
    throw new DriveApiError(UNEXPECTED_RESPONSE, 502, true);
  }
  return body.id;
}

// A pasta ainda existe e não está na lixeira? 404 = não (o corpo é descartado,
// para a conexão não ficar presa); `trashed: true` = não; outro erro HTTP sobe
// mapeado por mapDriveError.
async function isFolderAlive(fetchFn: FetchFn, accessToken: string, folderId: string): Promise<boolean> {
  const res = await fetchFn(`${DRIVE_API}/files/${encodeURIComponent(folderId)}?fields=id,trashed`, {
    method: "GET",
    headers: authHeaders(accessToken),
  });
  if (res.status === 404) {
    await discard(res);
    return false;
  }
  const body = await readBody(res);
  if (!res.ok) throw mapDriveError(res.status, body);
  return !isRecord(body) || body.trashed !== true;
}

/**
 * Garante uma pasta viva: devolve `folderId` se ela ainda existe (e não está na
 * lixeira); caso contrário cria uma nova e devolve o id. A pasta nova é marcada
 * com `{ w: weddingId }`, ou com `appProperties` quando este for informado (que
 * então vale no lugar de `w`). Sem nenhum dos dois lança um `Error`.
 */
export async function ensureFolder(
  fetchFn: FetchFn,
  accessToken: string,
  opts: FolderMarking & { name: string; folderId?: string | null; parentId?: string | null },
): Promise<string> {
  folderProperties(opts); // falha cedo, antes de qualquer chamada ao Drive
  if (opts.folderId && (await isFolderAlive(fetchFn, accessToken, opts.folderId))) return opts.folderId;
  return createFolder(fetchFn, accessToken, opts);
}

/** Pasta de convidado guardada no banco (tabela `wedding_drive_guest_folders`). */
export interface GuestFolderStore {
  get(weddingId: string, guestKey: string): Promise<string | null>;
  count(weddingId: string): Promise<number>;
  /** Insere se ainda não existir a linha; devolve o id da pasta vencedora (a nova ou a que já estava lá). */
  insertIfAbsent(weddingId: string, guestKey: string, displayName: string, folderId: string): Promise<string>;
  update(weddingId: string, guestKey: string, folderId: string): Promise<void>;
}

/**
 * Manda uma pasta para a lixeira. Best effort: nunca lança. Falha (HTTP ou de
 * rede) é ignorada; no pior caso sobra uma pasta vazia.
 */
export async function trashFolder(fetchFn: FetchFn, accessToken: string, folderId: string): Promise<void> {
  try {
    const res = await fetchFn(`${DRIVE_API}/files/${encodeURIComponent(folderId)}`, {
      method: "PATCH",
      headers: jsonHeaders(accessToken),
      body: JSON.stringify({ trashed: true }),
    });
    // O resultado não interessa: só solta a conexão.
    await discard(res);
  } catch {
    // ignorado de propósito
  }
}

/** Id da pasta "Casarei.online" guardado no banco (tabela `platform_drive_settings`, chave `platform_root`). */
export interface PlatformRootStore {
  /** Id guardado, ou `null` se a pasta ainda não foi criada (nunca `undefined`). */
  get(): Promise<string | null>;
  /** Insere se ainda não existir a linha; devolve o id da pasta vencedora (o novo ou o que já estava lá). */
  insertIfAbsent(folderId: string): Promise<string>;
  update(folderId: string): Promise<void>;
}

/**
 * Garante a pasta "Casarei.online" (uma para toda a plataforma, na raiz do Drive)
 * e devolve o id. Se o id guardado ainda aponta para uma pasta viva, é ele; se a
 * pasta sumiu ou foi para a lixeira, cria outra e atualiza o store. No primeiro
 * uso de todos, o `insertIfAbsent` do store é o "lock" contra requisições
 * simultâneas: quem perde a corrida joga a pasta que criou na lixeira e usa a do
 * vencedor.
 */
export async function ensurePlatformRoot(
  fetchFn: FetchFn,
  accessToken: string,
  store: PlatformRootStore,
): Promise<string> {
  const stored = await store.get();
  if (stored) {
    const alive = await ensureFolder(fetchFn, accessToken, {
      folderId: stored,
      name: PLATFORM_ROOT_NAME,
      appProperties: PLATFORM_ROOT_PROPERTIES,
    });
    if (alive !== stored) await store.update(alive);
    return alive;
  }

  // Sem parentId a pasta nasce na raiz do Drive.
  const created = await ensureFolder(fetchFn, accessToken, {
    name: PLATFORM_ROOT_NAME,
    appProperties: PLATFORM_ROOT_PROPERTIES,
  });
  const winner = await store.insertIfAbsent(created);
  if (winner !== created) await trashFolder(fetchFn, accessToken, created);
  return winner;
}

/**
 * Garante a pasta raiz do casal, dentro de "Casarei.online". Se `folderId` (o id
 * gravado em `wedding_drive_connections`) ainda aponta para uma pasta viva, é ela,
 * onde quer que esteja (pastas antigas, criadas direto na raiz do Drive, continuam
 * valendo) e nem a pasta da plataforma nem o store são consultados. Se está ausente,
 * apagada ou na lixeira, resolve "Casarei.online" e cria a pasta do casal dentro
 * dela, marcada com o casamento. O `name` vale como recebido: quem chama o sanitiza.
 * Não grava o id no banco: quem chama decide (é uma gravação condicional).
 */
export async function ensureCoupleRootFolder(
  fetchFn: FetchFn,
  accessToken: string,
  platformStore: PlatformRootStore,
  opts: { weddingId: string; name: string; folderId: string | null },
): Promise<string> {
  if (opts.folderId && (await isFolderAlive(fetchFn, accessToken, opts.folderId))) return opts.folderId;
  const parentId = await ensurePlatformRoot(fetchFn, accessToken, platformStore);
  return createFolder(fetchFn, accessToken, { weddingId: opts.weddingId, name: opts.name, parentId });
}

/**
 * Descobre (ou cria) a pasta do convidado dentro da pasta raiz do casal.
 * Nomes iguais sem diferenciar maiúsculas, acentos e espaços compartilham a pasta.
 * O `insertIfAbsent` do store é o "lock" contra dois envios simultâneos de um
 * convidado novo: quem perde a corrida joga a pasta que criou na lixeira e usa a
 * do vencedor.
 */
export async function resolveGuestFolder(
  fetchFn: FetchFn,
  accessToken: string,
  store: GuestFolderStore,
  opts: { weddingId: string; rootFolderId: string; guestName: string | null | undefined },
): Promise<string> {
  const { weddingId, rootFolderId, guestName } = opts;
  let key = normalizeGuestKey(guestName);
  let display = key === "" ? ANONYMOUS_LABEL : sanitizeGuestName(guestName);
  let stored = await store.get(weddingId, key);

  // Teto de pastas: convidado novo além do limite cai para a pasta "Anônimo".
  if (key !== "" && stored === null && (await store.count(weddingId)) >= MAX_GUEST_FOLDERS) {
    key = "";
    display = ANONYMOUS_LABEL;
    stored = await store.get(weddingId, key);
  }

  if (stored !== null) {
    const alive = await ensureFolder(fetchFn, accessToken, {
      weddingId,
      name: display,
      folderId: stored,
      parentId: rootFolderId,
    });
    if (alive !== stored) await store.update(weddingId, key, alive);
    return alive;
  }

  const created = await ensureFolder(fetchFn, accessToken, { weddingId, name: display, parentId: rootFolderId });
  const winner = await store.insertIfAbsent(weddingId, key, display, created);
  if (winner !== created) await trashFolder(fetchFn, accessToken, created);
  return winner;
}

/**
 * Cria a sessão de upload resumível e devolve a URL (header `Location`) para o
 * navegador enviar os bytes direto ao Google.
 */
export async function initResumableSession(
  fetchFn: FetchFn,
  accessToken: string,
  opts: {
    parentId: string;
    name: string;
    mimeType: string;
    size: number;
    weddingId: string;
    guestName: string;
    origin?: string | null;
  },
): Promise<string> {
  const headers: Record<string, string> = {
    ...authHeaders(accessToken),
    "Content-Type": "application/json; charset=UTF-8",
    "X-Upload-Content-Type": opts.mimeType,
    "X-Upload-Content-Length": String(opts.size),
  };
  if (opts.origin) headers.Origin = opts.origin;

  const appProperties: Record<string, string> = { v: "1", w: opts.weddingId };
  if (opts.guestName !== "") appProperties.g = truncateUtf8(opts.guestName, MAX_GUEST_PROPERTY_BYTES);

  const res = await fetchFn(`${DRIVE_UPLOAD_API}/files?uploadType=resumable&fields=id`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: opts.name, parents: [opts.parentId], appProperties }),
  });

  if (!res.ok) throw mapDriveError(res.status, await readBody(res));
  const location = res.headers.get("Location");
  // O corpo da resposta de sucesso não é usado: só o Location importa. Descartá-lo
  // solta a conexão (vale também quando o Location falta e o erro sobe logo abaixo).
  await discard(res);
  if (!location) throw new DriveApiError(UNEXPECTED_RESPONSE, 502, true);
  return location;
}
