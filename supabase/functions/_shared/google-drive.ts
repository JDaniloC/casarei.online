// Cliente do Google Drive para os uploads dos convidados: troca de token, pastas
// (raiz do casal e uma por convidado) e criação da sessão de upload resumível.
// Módulo puro: sem Deno.*, sem imports por URL e sem APIs só do Node. O `fetch`
// entra como parâmetro, para rodar tanto na edge function quanto no vitest.
//
// O app usa o escopo `drive.file` num Drive compartilhado por TODOS os casais.
// Por isso toda pasta e todo upload levam `appProperties.w = <weddingId>`; é essa
// marca que separa os arquivos de um casal dos de outro.

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

const authHeaders = (accessToken: string) => ({ Authorization: `Bearer ${accessToken}` });

const jsonHeaders = (accessToken: string) => ({
  ...authHeaders(accessToken),
  "Content-Type": "application/json",
});

async function createFolder(
  fetchFn: FetchFn,
  accessToken: string,
  opts: { weddingId: string; name: string; parentId?: string | null },
): Promise<string> {
  const res = await fetchFn(`${DRIVE_API}/files?fields=id`, {
    method: "POST",
    headers: jsonHeaders(accessToken),
    body: JSON.stringify({
      name: opts.name,
      mimeType: DRIVE_FOLDER_MIME,
      appProperties: { w: opts.weddingId },
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

/**
 * Garante uma pasta viva: devolve `folderId` se ela ainda existe (e não está na
 * lixeira); caso contrário cria uma nova, marcada com o casamento, e devolve o id.
 */
export async function ensureFolder(
  fetchFn: FetchFn,
  accessToken: string,
  opts: { weddingId: string; name: string; folderId?: string | null; parentId?: string | null },
): Promise<string> {
  if (opts.folderId) {
    const res = await fetchFn(`${DRIVE_API}/files/${encodeURIComponent(opts.folderId)}?fields=id,trashed`, {
      method: "GET",
      headers: authHeaders(accessToken),
    });
    if (res.status !== 404) {
      const body = await readBody(res);
      if (!res.ok) throw mapDriveError(res.status, body);
      if (!isRecord(body) || body.trashed !== true) return opts.folderId;
    } else {
      // A pasta sumiu: o corpo do 404 não interessa, e não pode ficar preso.
      await discard(res);
    }
  }
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

// Manda uma pasta para a lixeira. Best effort: falha (HTTP ou de rede) é ignorada,
// no pior caso sobra uma pasta vazia.
async function trashFolder(fetchFn: FetchFn, accessToken: string, folderId: string): Promise<void> {
  try {
    await fetchFn(`${DRIVE_API}/files/${encodeURIComponent(folderId)}`, {
      method: "PATCH",
      headers: jsonHeaders(accessToken),
      body: JSON.stringify({ trashed: true }),
    });
  } catch {
    // ignorado de propósito
  }
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
