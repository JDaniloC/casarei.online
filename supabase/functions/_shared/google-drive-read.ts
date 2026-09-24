// Leitura do Google Drive para o painel do casal: listagem, resumo, miniaturas e
// cota. Módulo puro: sem Deno.*, sem imports por URL e sem APIs só do Node. O
// `fetch` entra como parâmetro, para rodar tanto na edge function quanto no vitest.
//
// FRONTEIRA DE ISOLAMENTO ENTRE CASAIS. O app usa o escopo `drive.file` num Drive
// compartilhado por TODOS os casais, então uma listagem sem filtro devolveria os
// arquivos de todo mundo. Cada arquivo criado pelo fluxo de upload carrega
// `appProperties {v: "1", w: <weddingId>, g: <nome do convidado>}`; o isolamento
// depende de FILTRAR por essa marca na consulta e de VALIDÁ-LA no que volta.
//
// Nada que aponte para o Drive sai daqui: `parents`, `webViewLink`,
// `webContentLink`, `thumbnailLink` e `iconLink` nunca são pedidos nem repassados.
// A miniatura é buscada no servidor e só volta como data URL.

import { DriveApiError, mapDriveError, type FetchFn } from "./google-drive.ts";

export interface DriveFileSummary {
  id: string;
  name: string;
  guestName: string;
  mimeType: string;
  size: number;
  createdTime: string;
  hasThumbnail: boolean;
  durationMs: number | null;
}

const DRIVE_API = "https://www.googleapis.com/drive/v3";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Ids do Drive são [A-Za-z0-9_-]. Nada além disso pode chegar ao caminho da URL
// (impede ".", "..", barras e query strings vindas do cliente).
const DRIVE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const IMAGE_TYPE_PATTERN = /^image\/[a-z0-9][a-z0-9.+-]*$/;
const THUMBNAIL_SIZE_SUFFIX = /=s\d+$/;

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const SUMMARY_PAGE_SIZE = 1000;
const SUMMARY_MAX_PAGES = 50;

const THUMBNAIL_CONCURRENCY = 6;
const THUMBNAIL_PIXELS = 400;
const THUMBNAIL_MAX_BYTES = 500 * 1024;
const THUMBNAIL_HOST_SUFFIX = ".googleusercontent.com";

const LIST_FIELDS =
  "nextPageToken,files(id,name,mimeType,size,createdTime,hasThumbnail,videoMediaMetadata(durationMillis),appProperties)";
const SUMMARY_FIELDS = "nextPageToken,files(size)";
const THUMBNAIL_META_FIELDS = "id,hasThumbnail,thumbnailLink,appProperties";

const UNEXPECTED_RESPONSE = "Resposta inesperada do Google";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null;
}

// Lê só propriedades PRÓPRIAS: chaves herdadas ("constructor", "__proto__"...) nunca
// contam como dado vindo do Drive.
function ownValue(source: unknown, key: string): unknown {
  return isRecord(source) && Object.prototype.hasOwnProperty.call(source, key) ? source[key] : undefined;
}

const authHeaders = (accessToken: string) => ({ Authorization: `Bearer ${accessToken}` });

function driveUrl(path: string, query: Record<string, string>): string {
  const pairs = Object.entries(query).map(([key, value]) => `${key}=${encodeURIComponent(value)}`);
  return `${DRIVE_API}${path}?${pairs.join("&")}`;
}

// Lê o corpo (o que também o consome) sem nunca lançar: JSON quando der, senão o
// texto cru, ou null se vazio/ilegível.
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

// Descarta um corpo que não será usado, cancelando o stream em vez de baixá-lo,
// para não segurar a conexão no runtime. Best effort.
async function discard(res: Response): Promise<void> {
  try {
    await res.body?.cancel();
  } catch {
    // corpo já travado ou consumido: nada a fazer
  }
}

// GET que devolve o JSON (objeto) ou lança o erro tipado do Drive. O corpo é
// consumido em todos os ramos.
async function getDriveJson(fetchFn: FetchFn, accessToken: string, url: string): Promise<JsonRecord> {
  const res = await fetchFn(url, { method: "GET", headers: authHeaders(accessToken) });
  const body = await readBody(res);
  if (!res.ok) throw mapDriveError(res.status, body);
  if (!isRecord(body)) throw new DriveApiError(UNEXPECTED_RESPONSE, 502, true);
  return body;
}

// O weddingId entra numa consulta `q` do Drive: só UUID passa, para impedir injeção.
function assertWeddingId(weddingId: string): void {
  if (typeof weddingId !== "string" || !UUID_PATTERN.test(weddingId)) {
    throw new Error("weddingId inválido");
  }
}

function guestFilesQuery(weddingId: string): string {
  assertWeddingId(weddingId);
  return `trashed=false and appProperties has { key='v' and value='1' } and appProperties has { key='w' and value='${weddingId}' }`;
}

// Segunda trava do isolamento: mesmo que o filtro do Drive falhe, só o que carrega
// a marca deste casamento é aceito.
function belongsToWedding(file: unknown, weddingId: string): boolean {
  const props = ownValue(file, "appProperties");
  return ownValue(props, "v") === "1" && ownValue(props, "w") === weddingId;
}

function toSize(value: unknown): number {
  return typeof value === "string" || typeof value === "number" ? Number(value) || 0 : 0;
}

function toDuration(value: unknown): number | null {
  const isNumeric = typeof value === "number" || (typeof value === "string" && value.trim() !== "");
  const duration = isNumeric ? Number(value) : Number.NaN;
  return Number.isFinite(duration) ? duration : null;
}

function toSummary(file: unknown, weddingId: string): DriveFileSummary | null {
  if (!belongsToWedding(file, weddingId)) return null;
  const id = ownValue(file, "id");
  if (typeof id !== "string" || id === "") return null;
  const name = ownValue(file, "name");
  const mimeType = ownValue(file, "mimeType");
  const createdTime = ownValue(file, "createdTime");
  const guestName = ownValue(ownValue(file, "appProperties"), "g");
  return {
    id,
    name: typeof name === "string" ? name : "",
    guestName: typeof guestName === "string" ? guestName : "",
    mimeType: typeof mimeType === "string" ? mimeType : "",
    size: toSize(ownValue(file, "size")),
    createdTime: typeof createdTime === "string" ? createdTime : "",
    hasThumbnail: ownValue(file, "hasThumbnail") === true,
    durationMs: toDuration(ownValue(ownValue(file, "videoMediaMetadata"), "durationMillis")),
  };
}

function normalizePageSize(pageSize: number | undefined): number {
  if (typeof pageSize !== "number" || !Number.isFinite(pageSize) || pageSize < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(pageSize), MAX_PAGE_SIZE);
}

const nextPageTokenOf = (body: JsonRecord): string | null => {
  const token = ownValue(body, "nextPageToken");
  return typeof token === "string" && token !== "" ? token : null;
};

/** Lista os arquivos de convidados DESTE casamento, do mais novo para o mais antigo. */
export async function listGuestFiles(
  fetchFn: FetchFn,
  accessToken: string,
  weddingId: string,
  opts: { pageToken?: string; pageSize?: number } = {},
): Promise<{ files: DriveFileSummary[]; nextPageToken: string | null }> {
  const query: Record<string, string> = {
    q: guestFilesQuery(weddingId),
    orderBy: "createdTime desc",
    pageSize: String(normalizePageSize(opts.pageSize)),
    fields: LIST_FIELDS,
  };
  if (opts.pageToken) query.pageToken = opts.pageToken;

  const body = await getDriveJson(fetchFn, accessToken, driveUrl("/files", query));

  const raw = ownValue(body, "files");
  const files: DriveFileSummary[] = [];
  for (const entry of Array.isArray(raw) ? raw : []) {
    const summary = toSummary(entry, weddingId);
    if (summary !== null) files.push(summary);
  }
  return { files, nextPageToken: nextPageTokenOf(body) };
}

/** Quantidade de arquivos e total de bytes enviados para este casamento. */
export async function summarizeGuestFiles(
  fetchFn: FetchFn,
  accessToken: string,
  weddingId: string,
): Promise<{ count: number; totalBytes: number }> {
  const q = guestFilesQuery(weddingId);
  let count = 0;
  let totalBytes = 0;
  let pageToken: string | null = null;

  for (let page = 0; page < SUMMARY_MAX_PAGES; page += 1) {
    const query: Record<string, string> = { q, pageSize: String(SUMMARY_PAGE_SIZE), fields: SUMMARY_FIELDS };
    if (pageToken !== null) query.pageToken = pageToken;

    const body = await getDriveJson(fetchFn, accessToken, driveUrl("/files", query));

    const raw = ownValue(body, "files");
    for (const file of Array.isArray(raw) ? raw : []) {
      if (!isRecord(file)) continue;
      count += 1;
      totalBytes += toSize(ownValue(file, "size"));
    }

    pageToken = nextPageTokenOf(body);
    if (pageToken === null) break;
  }
  return { count, totalBytes };
}

// Valida a thumbnailLink (https, host *.googleusercontent.com, sem credenciais nem
// porta) e a leva para 400 px. Qualquer coisa fora disso vira null: o token só é
// enviado a hosts do Google.
function sizedThumbnailUrl(link: string): string | null {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username !== "" || url.password !== "" || url.port !== "") return null;
  if (!url.hostname.endsWith(THUMBNAIL_HOST_SUFFIX)) return null;

  const size = `=s${THUMBNAIL_PIXELS}`;
  url.pathname = THUMBNAIL_SIZE_SUFFIX.test(url.pathname)
    ? url.pathname.replace(THUMBNAIL_SIZE_SUFFIX, size)
    : `${url.pathname}${size}`;
  return url.href;
}

// Só o tipo de mídia (sem parâmetros) entra na data URL, e só se for image/*.
function imageMediaType(header: string | null): string | null {
  const type = (header ?? "").split(";")[0].trim().toLowerCase();
  return IMAGE_TYPE_PATTERN.test(type) ? type : null;
}

// Lê o corpo até `maxBytes`; ao passar do limite (ou falhar) cancela o stream e
// devolve null, sem nunca bufferizar um corpo sem fim.
async function readLimited(res: Response, maxBytes: number): Promise<Uint8Array | null> {
  if (res.body === null) return new Uint8Array(0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    try {
      await reader.cancel();
    } catch {
      // stream já quebrado
    }
    return null;
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

// btoa sobre uma string binária montada em blocos (Buffer não existe no Deno).
function toBase64(bytes: Uint8Array): string {
  const BLOCK = 0x2000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += BLOCK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + BLOCK));
  }
  return btoa(binary);
}

async function fetchImageAsDataUrl(fetchFn: FetchFn, accessToken: string, url: string): Promise<string | null> {
  const res = await fetchFn(url, { method: "GET", headers: authHeaders(accessToken) });
  if (!res.ok) {
    await discard(res);
    return null;
  }

  const type = imageMediaType(res.headers.get("content-type"));
  const declaredLength = Number(res.headers.get("content-length"));
  if (type === null || declaredLength > THUMBNAIL_MAX_BYTES) {
    await discard(res);
    return null;
  }

  const bytes = await readLimited(res, THUMBNAIL_MAX_BYTES);
  if (bytes === null || bytes.length === 0) return null;
  return `data:${type};base64,${toBase64(bytes)}`;
}

async function fetchThumbnail(
  fetchFn: FetchFn,
  accessToken: string,
  weddingId: string,
  fileId: string,
): Promise<string | null> {
  if (!DRIVE_ID_PATTERN.test(fileId)) return null;

  const metaUrl = driveUrl(`/files/${encodeURIComponent(fileId)}`, { fields: THUMBNAIL_META_FIELDS });
  const metaRes = await fetchFn(metaUrl, { method: "GET", headers: authHeaders(accessToken) });
  const meta = await readBody(metaRes);
  if (!metaRes.ok || !isRecord(meta)) return null;

  // Isolamento: arquivo de outro casamento (ou sem marca) nunca chega à imagem.
  if (!belongsToWedding(meta, weddingId)) return null;
  if (ownValue(meta, "hasThumbnail") !== true) return null;

  const link = ownValue(meta, "thumbnailLink");
  const imageUrl = typeof link === "string" ? sizedThumbnailUrl(link) : null;
  if (imageUrl === null) return null;

  return fetchImageAsDataUrl(fetchFn, accessToken, imageUrl);
}

/**
 * Miniaturas (data URLs) dos arquivos deste casamento. Os ids vêm do cliente:
 * o resultado é um objeto sem protótipo, então "__proto__" e "constructor" são
 * chaves comuns; id inválido, de outro casamento ou com qualquer falha vira null.
 */
export async function getThumbnails(
  fetchFn: FetchFn,
  accessToken: string,
  weddingId: string,
  fileIds: string[],
): Promise<Record<string, string | null>> {
  assertWeddingId(weddingId);

  const ids = [...new Set(fileIds.filter((id): id is string => typeof id === "string"))];
  const result: Record<string, string | null> = Object.create(null);
  for (const id of ids) result[id] = null;

  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < ids.length) {
      const id = ids[next++];
      try {
        result[id] = await fetchThumbnail(fetchFn, accessToken, weddingId, id);
      } catch {
        result[id] = null;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(THUMBNAIL_CONCURRENCY, ids.length) }, () => worker()));

  return result;
}

/** Cota de armazenamento do Drive: `limit` e `free` são null quando ilimitado. */
export async function getQuota(
  fetchFn: FetchFn,
  accessToken: string,
): Promise<{ limit: number | null; usage: number; free: number | null }> {
  const body = await getDriveJson(fetchFn, accessToken, driveUrl("/about", { fields: "storageQuota" }));
  const quota = ownValue(body, "storageQuota");

  const rawLimit = Number(ownValue(quota, "limit"));
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : null;
  const rawUsage = Number(ownValue(quota, "usage"));
  const usage = Number.isFinite(rawUsage) && rawUsage > 0 ? rawUsage : 0;

  return { limit, usage, free: limit === null ? null : Math.max(0, limit - usage) };
}
