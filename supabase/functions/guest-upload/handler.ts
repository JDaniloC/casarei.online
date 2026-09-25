// Handler da edge function pública `guest-upload`: valida o pedido de envio de
// um convidado e cria a sessão de upload resumível no Google Drive. Os bytes vão
// direto do navegador para o Google; esta função nunca os vê.
//
// Módulo puro: nenhum acesso a ambiente, rede ou banco. Tudo o que toca o mundo
// de fora (banco, Drive, limites, relógio) entra por `GuestUploadDeps`; a ligação
// real fica em index.ts. Assim o handler roda inteiro no vitest, com fakes.
//
// Segurança: o endpoint é anônimo e exposto à internet, então a ORDEM das
// checagens importa (ver handlePost). Falha fechada: qualquer erro de infraestrutura
// (banco de limites, token do Google, Drive, rede) vira 503 genérico; nada de
// mensagem interna, token, URL de sessão ou IP chega ao cliente ou ao log.

import {
  DriveApiError,
  NeedsReconnectError,
  QuotaExceededError,
  type GuestFolderStore,
} from "../_shared/google-drive.ts";
import { corsHeadersFor, isOriginAllowed } from "../_shared/cors.ts";
import { coupleFolderName, ownerRootFolderName, type CoupleNames } from "../_shared/couple-folder.ts";
import type { DriveAccessRef } from "../_shared/drive-access.ts";
import { checkAndLog, clientIp, type RateLimitDb } from "../_shared/rate-limit.ts";
import {
  MAX_BYTES,
  resolveMime,
  sanitizeFileName,
  sanitizeGuestName,
} from "../_shared/guest-upload-validation.ts";

/** Linha de `wedding_drive_connections` achada pelo token do QR code. */
export interface GuestUploadConnection {
  weddingId: string;
  uploadsEnabled: boolean;
  /** Pasta raiz do casal no Drive; `null` até o primeiro envio. */
  folderId: string | null;
  /** `connected_at` quando o casal conectou o próprio Google (modo casal); ausente ou `null` = modo plataforma. */
  connectedAt?: string | null;
  /** O Google recusou o token do casal: o envio fica indisponível até ele reconectar. */
  needsReconnect?: boolean;
}

export type { CoupleNames };

/** Operações no Google Drive. O `accessToken` vem de `getAccessToken`. */
export interface GuestUploadDrive {
  /** Access token da conta indicada (plataforma ou casal), com cache. Pode lançar `NeedsReconnectError`. */
  getAccessToken(ref: DriveAccessRef): Promise<string>;
  /**
   * Descarta o token em cache da conta indicada: o Drive respondeu 401 com ele (por exemplo, o
   * casal removeu o app na conta Google). O próximo `getAccessToken` renova e, se o Google
   * recusar o refresh token, já marca a reconexão. Chamada de melhor esforço.
   */
  invalidateAccessToken(ref: DriveAccessRef): void;
  /**
   * Garante a pasta raiz do casal (dentro de "Casarei.online", ou onde já estiver
   * se `folderId` ainda for uma pasta viva); devolve o id (o mesmo de `folderId`
   * se ela ainda existe).
   */
  ensureRootFolder(
    accessToken: string,
    opts: { weddingId: string; name: string; folderId: string | null },
  ): Promise<string>;
  /**
   * Garante a pasta raiz do casal no TOPO do Drive dele (modo casal): devolve `folderId`
   * se ainda for uma pasta viva; senão cria outra (sem "Casarei.online" no meio).
   */
  ensureOwnerRootFolder(
    accessToken: string,
    opts: { weddingId: string; name: string; folderId: string | null },
  ): Promise<string>;
  /** Manda uma pasta do Drive para a lixeira. Best effort: nunca lança (falhas são ignoradas). */
  trashFolder(accessToken: string, folderId: string): Promise<void>;
  /** Descobre ou cria a pasta do convidado dentro da raiz (`guestName` "" = Anônimo). */
  resolveGuestFolder(
    accessToken: string,
    store: GuestFolderStore,
    opts: { weddingId: string; rootFolderId: string; guestName: string },
  ): Promise<string>;
  /** Cria a sessão de upload resumível e devolve a URL para o navegador enviar os bytes. */
  initSession(
    accessToken: string,
    opts: {
      parentId: string;
      name: string;
      mimeType: string;
      size: number;
      weddingId: string;
      guestName: string;
      origin: string;
    },
  ): Promise<string>;
  /** Cota do Drive (com cache curto); `free` é null quando a conta não tem limite. */
  getQuota(accessToken: string): Promise<{ limit: number | null; usage: number; free: number | null }>;
}

/** Tudo o que o handler precisa do mundo de fora. Qualquer método pode lançar (vira 503). */
export interface GuestUploadDeps {
  /** Origens permitidas (ALLOWED_ORIGINS já interpretada). Vazia = configuração quebrada. */
  allowedOrigins: string[];
  /** Relógio em milissegundos, usado nas janelas dos limites. */
  now: () => number;
  /** Conexão do casal pelo token público; `null` se não existir. */
  findConnection(token: string): Promise<GuestUploadConnection | null>;
  /** Nomes do casal; `null` se o casamento não existir. */
  getCoupleNames(weddingId: string): Promise<CoupleNames | null>;
  /**
   * Grava a pasta raiz do casal em `wedding_drive_connections.folder_id` SÓ se a
   * raiz gravada ainda for `expected` (null = ainda sem raiz). Devolve a raiz
   * vencedora: `newId` se esta chamada gravou, senão a que outra requisição gravou.
   * Lança se não houver linha ou em qualquer erro do banco.
   */
  saveRootFolder(weddingId: string, expected: string | null, newId: string): Promise<string>;
  /** Apaga todas as linhas de `wedding_drive_guest_folders` do casamento. */
  clearGuestFolders(weddingId: string): Promise<void>;
  /** Tabela `rate_limit_log`. */
  rateLimitDb: RateLimitDb;
  /** Pastas de convidado (repassado ao `drive.resolveGuestFolder`). */
  guestFolders: GuestFolderStore;
  drive: GuestUploadDrive;
}

const LOG_PREFIX = "[guest-upload]";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,64}$/;
const MAX_BODY_BYTES = 16 * 1024;
const MAX_FILE_NAME_CHARS = 255;
const MAX_MIME_TYPE_CHARS = 100;
const MAX_GUEST_NAME_CHARS = 200;
const MAX_IDENTIFIER_CHARS = 64;

// Cada arquivo custa um POST, e os convidados de um salão dividem o mesmo IP (NAT),
// então os limites por IP são folgados: quem protege de verdade é o do casamento.
const PAGE_LIMIT = { action: "guest_upload_page", windowMs: 60_000, max: 300 };
const IP_LIMIT = { action: "guest_upload_ip", windowMs: 10 * 60_000, max: 1000 };
const WEDDING_LIMIT = { action: "guest_upload_wedding", windowMs: 60 * 60_000, max: 3000 };

// Mensagens fixas em pt-BR: é só o que o cliente vê de erro.
const MESSAGES = {
  invalid_input: "Requisição inválida",
  file_type: "Tipo de arquivo não suportado. Envie fotos ou vídeos.",
  file_too_large: "O arquivo está vazio ou excede o tamanho máximo permitido",
  forbidden_origin: "Origem não permitida",
  not_found: "Link de envio não encontrado",
  disabled: "Este casal não está recebendo fotos e vídeos no momento",
  rate_limited: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
  unavailable: "Envio temporariamente indisponível",
  storage_full: "Não há espaço disponível para receber novos arquivos",
  method_not_allowed: "Método não permitido",
  misconfigured: "Erro interno de configuração",
} as const;

type Cors = Record<string, string>;

function json(status: number, body: unknown, cors: Cors): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function fail(status: number, code: string, message: string, cors: Cors): Response {
  return json(status, { error: message, code }, cors);
}

// Converte um erro de infraestrutura em resposta. O log leva só o prefixo, a etapa
// (rótulo fixo) e a classe/status do erro: nunca a mensagem, que pode carregar
// tokens, URLs de sessão ou o IP do cliente.
function failFromError(error: unknown, stage: string, cors: Cors): Response {
  if (error instanceof QuotaExceededError) {
    console.error(`${LOG_PREFIX} ${stage}: QuotaExceededError`);
    return fail(507, "storage_full", MESSAGES.storage_full, cors);
  }
  let label: string;
  if (error instanceof NeedsReconnectError) label = "NeedsReconnectError";
  else if (error instanceof DriveApiError) label = `DriveApiError status=${error.status}`;
  else label = error instanceof Error ? error.name : typeof error;
  console.error(`${LOG_PREFIX} ${stage}: ${label}`);
  return fail(503, "unavailable", MESSAGES.unavailable, cors);
}

const isValidToken = (value: unknown): value is string =>
  typeof value === "string" && TOKEN_PATTERN.test(value);

// Modo casal = o casal conectou o próprio Google (`connected_at` preenchido).
const isOwnerConnection = (connection: GuestUploadConnection): boolean =>
  typeof connection.connectedAt === "string" && connection.connectedAt !== "";

// O Google recusou o token do casal: indisponível, sem cair no Drive da plataforma.
const needsReconnectNow = (connection: GuestUploadConnection): boolean =>
  isOwnerConnection(connection) && connection.needsReconnect === true;

function accessRefFor(connection: GuestUploadConnection): DriveAccessRef {
  return isOwnerConnection(connection)
    ? { kind: "owner", weddingId: connection.weddingId, epoch: connection.connectedAt as string }
    : { kind: "platform" };
}

interface UploadRequest {
  token: string;
  fileName: string;
  mimeType: string;
  size: number;
  guestName: string | undefined;
}

// Lê o corpo do POST respeitando o teto de MAX_BODY_BYTES, contado em BYTES e
// aplicado ANTES de bufferizar: o endpoint é anônimo, e `req.text()` seguraria o
// corpo inteiro na memória (e contaria caracteres, não bytes). `null` = passou do
// teto ou não deu para ler (400 invalid_input).
//  a. Content-Length presente, válido (só dígitos) e acima do teto: recusa sem tocar
//     no corpo. Ausente ou inválido, segue para (b): o cabeçalho é só um atalho, e
//     quem mente nele é pego na leitura.
//  b. Lê pelo leitor do stream somando bytes; ao passar do teto cancela o leitor e recusa.
//  A decodificação UTF-8 só acontece depois da conferência do teto. Corpo nulo = vazio.
async function readCappedBody(req: Request): Promise<string | null> {
  const declared = req.headers.get("content-length")?.trim();
  if (declared !== undefined && /^\d+$/.test(declared) && Number(declared) > MAX_BODY_BYTES) return null;

  if (req.body === null) return "";
  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try {
    reader = req.body.getReader();
  } catch {
    return null; // corpo já consumido ou travado
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
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
  return new TextDecoder("utf-8").decode(bytes);
}

// Lê e valida o corpo do POST. `null` = inválido (400 invalid_input).
async function readUploadRequest(req: Request): Promise<UploadRequest | null> {
  const text = await readCappedBody(req);
  if (text === null) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;

  const { token, fileName, mimeType, size, guestName } = raw as Record<string, unknown>;
  if (!isValidToken(token)) return null;
  if (typeof fileName !== "string" || fileName.length < 1 || fileName.length > MAX_FILE_NAME_CHARS) return null;
  if (typeof mimeType !== "string" || mimeType.length > MAX_MIME_TYPE_CHARS) return null;
  if (typeof size !== "number" || !Number.isInteger(size)) return null;
  // guestName é opcional; null equivale a ausente.
  if (guestName === undefined || guestName === null) {
    return { token, fileName, mimeType, size, guestName: undefined };
  }
  if (typeof guestName !== "string" || guestName.length > MAX_GUEST_NAME_CHARS) return null;
  return { token, fileName, mimeType, size, guestName };
}

async function handleGet(req: Request, deps: GuestUploadDeps, cors: Cors): Promise<Response> {
  let stage = "get:validate";
  try {
    const token = new URL(req.url).searchParams.get("token");
    if (!isValidToken(token)) return fail(404, "not_found", MESSAGES.not_found, cors);

    stage = "get:rate_limit";
    const ip = clientIp(req.headers).slice(0, MAX_IDENTIFIER_CHARS);
    const page = await checkAndLog(deps.rateLimitDb, { identifier: ip, ...PAGE_LIMIT, now: deps.now });
    if (!page.allowed) return fail(429, "rate_limited", MESSAGES.rate_limited, cors);

    stage = "get:find_connection";
    const connection = await deps.findConnection(token);
    if (!connection) return fail(404, "not_found", MESSAGES.not_found, cors);

    stage = "get:couple_names";
    const names = await deps.getCoupleNames(connection.weddingId);
    if (!names) return fail(404, "not_found", MESSAGES.not_found, cors);

    const partnerNames = [names.partner1Name, names.partner2Name]
      .map((name) => name.trim())
      .filter((name) => name !== "")
      .slice(0, 2);

    // Só banco: a página pública não chama o Google.
    return json(
      200,
      {
        coupleName: names.coupleName,
        partnerNames,
        available: connection.uploadsEnabled && !needsReconnectNow(connection),
        // "Desativado" (escolha do casal) vale mais que "indisponível" (Google recusou o token).
        ...(!connection.uploadsEnabled
          ? { reason: "disabled" }
          : needsReconnectNow(connection)
            ? { reason: "unavailable" }
            : {}),
        maxBytes: MAX_BYTES,
      },
      cors,
    );
  } catch (error) {
    return failFromError(error, stage, cors);
  }
}

// Ordem das checagens (do mais barato e mais perto da borda para o mais caro):
//  1. Origin permitido      2. corpo válido        3. conexão pelo token
//  4. envio ativado
// 4b. o casal precisa reconectar o Google (modo casal): 503 antes de QUALQUER chamada ao Google
//  5. tamanho               6. tipo do arquivo     7. rate limits
//  8. sanitização           9. token do Google    10. pasta raiz
// 11. pasta do convidado   12. cota do Drive      13. sessão de upload
// 14. resposta.
async function handlePost(
  req: Request,
  origin: string | null,
  deps: GuestUploadDeps,
  cors: Cors,
): Promise<Response> {
  let stage = "post:origin";
  // Conta do Google desta requisição; só é preenchida no passo 9. Fica fora do `try` para o
  // `catch` saber qual token descartar se o Drive responder 401.
  let accessRef: DriveAccessRef | null = null;
  try {
    // 1. Origin: nada mais roda (nem a leitura do corpo) para origem não permitida.
    if (origin === null || !isOriginAllowed(origin, deps.allowedOrigins)) {
      return fail(403, "forbidden_origin", MESSAGES.forbidden_origin, cors);
    }

    // 2. Corpo.
    stage = "post:parse_body";
    const body = await readUploadRequest(req);
    if (!body) return fail(400, "invalid_input", MESSAGES.invalid_input, cors);

    // 3. Conexão pelo token (o formato do token já foi validado no passo 2).
    stage = "post:find_connection";
    const connection = await deps.findConnection(body.token);
    if (!connection) return fail(404, "not_found", MESSAGES.not_found, cors);

    // 4. Recebimento desativado pelo casal.
    if (!connection.uploadsEnabled) return fail(409, "disabled", MESSAGES.disabled, cors);

    // 4b. O casal precisa reconectar o Google: indisponível, ANTES de qualquer chamada ao
    // Google e sem cair no Drive da plataforma (as fotos iriam para um lugar que o painel
    // do casal não lista).
    if (needsReconnectNow(connection)) return fail(503, "unavailable", MESSAGES.unavailable, cors);

    // 5. Tamanho.
    if (body.size < 1 || body.size > MAX_BYTES) {
      return fail(400, "file_too_large", MESSAGES.file_too_large, cors);
    }

    // 6. Tipo (a extensão manda; o tipo declarado só confirma a categoria).
    const mimeType = resolveMime(body.fileName, body.mimeType);
    if (mimeType === null) return fail(400, "file_type", MESSAGES.file_type, cors);

    // 7. Rate limits: por IP e por casamento.
    stage = "post:rate_limit";
    const ip = clientIp(req.headers).slice(0, MAX_IDENTIFIER_CHARS);
    const byIp = await checkAndLog(deps.rateLimitDb, { identifier: ip, ...IP_LIMIT, now: deps.now });
    if (!byIp.allowed) return fail(429, "rate_limited", MESSAGES.rate_limited, cors);
    const byWedding = await checkAndLog(deps.rateLimitDb, {
      identifier: `wedding:${connection.weddingId}`,
      ...WEDDING_LIMIT,
      now: deps.now,
    });
    if (!byWedding.allowed) return fail(429, "rate_limited", MESSAGES.rate_limited, cors);

    // 8. Sanitização (o que vai para o Drive) e nomes do casal para a pasta raiz.
    const fileName = sanitizeFileName(body.fileName);
    const guestName = sanitizeGuestName(body.guestName);
    stage = "post:couple_names";
    const names = await deps.getCoupleNames(connection.weddingId);
    if (!names) return fail(404, "not_found", MESSAGES.not_found, cors);

    // 9. Token de acesso do Google (pode lançar NeedsReconnectError: 503).
    stage = "post:access_token";
    accessRef = accessRefFor(connection);
    const accessToken = await deps.drive.getAccessToken(accessRef);

    // 10. Pasta raiz do casal: dentro de "Casarei.online" no modo plataforma e no topo do
    // Drive do próprio casal no modo casal. Se o id mudou (primeiro envio ou a pasta foi
    // apagada), a gravação é CONDICIONAL: só vale se a raiz gravada ainda for a que esta
    // requisição leu. Várias requisições simultâneas criam uma raiz cada, mas só uma
    // grava; as outras adotam a raiz vencedora e mandam para a lixeira a que criaram
    // (best effort: se falhar, sobra uma pasta vazia e o envio segue). Quem só
    // reaproveitou uma raiz viva não criou nada e nunca descarta. As pastas de convidado
    // só são limpas por quem venceu E substituiu uma raiz anterior: sem raiz anterior
    // não há pasta legítima, e limpar apagaria linhas que outra requisição acabou de
    // inserir.
    stage = "post:root_folder";
    const rootOpts = { weddingId: connection.weddingId, folderId: connection.folderId };
    const ensuredRootId =
      accessRef.kind === "owner"
        ? await deps.drive.ensureOwnerRootFolder(accessToken, { ...rootOpts, name: ownerRootFolderName(names) })
        : await deps.drive.ensureRootFolder(accessToken, { ...rootOpts, name: coupleFolderName(names) });
    let rootFolderId = ensuredRootId;
    if (ensuredRootId !== connection.folderId) {
      rootFolderId = await deps.saveRootFolder(connection.weddingId, connection.folderId, ensuredRootId);
      if (rootFolderId !== ensuredRootId) {
        try {
          await deps.drive.trashFolder(accessToken, ensuredRootId);
        } catch {
          // ignorado de propósito: uma lixeira que falha não pode derrubar o envio
        }
      } else if (connection.folderId !== null) {
        await deps.clearGuestFolders(connection.weddingId);
      }
    }

    // 11. Pasta do convidado dentro da raiz.
    stage = "post:guest_folder";
    const parentId = await deps.drive.resolveGuestFolder(accessToken, deps.guestFolders, {
      weddingId: connection.weddingId,
      rootFolderId,
      guestName,
    });

    // 12. Cota: recusa cedo o arquivo que não cabe no Drive.
    stage = "post:quota";
    const quota = await deps.drive.getQuota(accessToken);
    if (quota.free !== null && body.size > quota.free) {
      return fail(507, "storage_full", MESSAGES.storage_full, cors);
    }

    // 13. Sessão de upload resumível (QuotaExceededError vira 507 em failFromError).
    stage = "post:init_session";
    const uploadUrl = await deps.drive.initSession(accessToken, {
      parentId,
      name: fileName,
      mimeType,
      size: body.size,
      weddingId: connection.weddingId,
      guestName,
      origin,
    });

    // 14. A URL da sessão é um segredo do próprio envio: só vai na resposta.
    return json(200, { uploadUrl }, cors);
  } catch (error) {
    // Um 401 do Drive quer dizer que o access token em cache não vale mais: descarta o token
    // dessa conta para o PRÓXIMO envio renovar (e ver o `invalid_grant`, se for o caso). Não
    // repete nada aqui, e o que acontecer com o descarte nunca muda a resposta.
    if (accessRef !== null && error instanceof DriveApiError && error.status === 401) {
      try {
        deps.drive.invalidateAccessToken(accessRef);
      } catch {
        // ignorado de propósito: descartar o cache é só uma otimização de recuperação
      }
    }
    return failFromError(error, stage, cors);
  }
}

export function createHandler(deps: GuestUploadDeps): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get("origin");
    const cors = corsHeadersFor(origin, deps.allowedOrigins);

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (deps.allowedOrigins.length === 0) {
      console.error(`${LOG_PREFIX} ALLOWED_ORIGINS não configurado`);
      return fail(500, "unavailable", MESSAGES.misconfigured, cors);
    }

    if (req.method === "GET") return handleGet(req, deps, cors);
    if (req.method === "POST") return handlePost(req, origin, deps, cors);
    return fail(405, "method_not_allowed", MESSAGES.method_not_allowed, { ...cors, Allow: "GET, POST, OPTIONS" });
  };
}
