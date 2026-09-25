// Handler da edge function `google-drive-admin`: a API do PAINEL DO CASAL para o
// recurso de envio de fotos e vídeos dos convidados (ativar, ligar/desligar, girar
// o token do QR code, listar, resumir e ver miniaturas).
//
// FRONTEIRA DE ISOLAMENTO ENTRE CASAIS. Todos os casais compartilham um único
// Drive; o que separa um do outro é o `weddingId` que chega aos helpers de leitura
// do Drive e às tabelas. Por isso ele sai EXCLUSIVAMENTE de
// `deps.getWeddingIdForUser(userId)`, com o `userId` vindo do JWT já verificado
// (`weddings.user_id = user.id`). Nada do corpo da requisição (weddingId,
// wedding_id, userId...) é lido: o corpo só escolhe a ação e seus parâmetros.
//
// Módulo puro: nenhum acesso a ambiente, rede, banco ou aleatoriedade. Tudo o que
// toca o mundo de fora entra por `GoogleDriveAdminDeps`; a ligação real fica em
// index.ts. Assim o handler roda inteiro no vitest, com fakes.
//
// Falha fechada: qualquer erro de infraestrutura (autenticação, banco, token do
// Google, Drive, rede) vira 503 genérico. Nada de mensagem interna, token, id de
// usuário ou de casamento chega ao cliente ou ao log.
//
// Cada resposta é montada campo a campo (nunca se repassa o objeto que a dependência
// devolveu), então `parents` e ids internos não têm caminho até o cliente. A única
// exceção é o `folderUrl` de quem conectou o PRÓPRIO Google Drive (o Drive é dele): sai
// só no modo casal e só a partir de um id com formato de id do Drive.

import { corsHeadersFor } from "../_shared/cors.ts";
import { ownerRootFolderName, type CoupleNames } from "../_shared/couple-folder.ts";
import type { DriveAccessRef } from "../_shared/drive-access.ts";
import {
  DRIVE_FILE_SCOPE,
  DriveApiError,
  InvalidCodeError,
  NeedsReconnectError,
  QuotaExceededError,
  type CodeExchange,
} from "../_shared/google-drive.ts";
import type { DriveFileSummary } from "../_shared/google-drive-read.ts";
import { STATE_TTL_MS, type OAuthState } from "../_shared/hmac-state.ts";

/** Linha de `wedding_drive_connections` como o painel a enxerga (sem ids internos). */
export interface DriveConnectionRow {
  /** Interruptor de recebimento do casal (`uploads_enabled`). */
  uploadsEnabled: boolean;
  /** Token público do QR code (`upload_token`). */
  uploadToken: string;
  /**
   * Quando o casal conectou o próprio Google (`connected_at`). Preenchido = modo casal;
   * ausente ou `null` = modo plataforma. É também a "época" da conexão no cache do token.
   */
  connectedAt?: string | null;
  /** E-mail da conta Google conectada (só para exibição). */
  googleEmail?: string | null;
  /** O Google recusou o token do casal: só reconectando volta a funcionar. */
  needsReconnect?: boolean;
  /** Pasta raiz do casal (`folder_id`); só vira link no modo casal. */
  folderId?: string | null;
}

/** O que o `connect` grava de uma vez na linha do casal. */
export interface OwnerConnectionData {
  refreshTokenEncrypted: string;
  refreshTokenIv: string;
  googleEmail: string | null;
  /** Pasta raiz criada no Drive do casal. */
  folderId: string;
}

/** Acesso à tabela `wedding_drive_connections`. Sempre por `weddingId` já derivado do usuário. */
export interface DriveConnectionsStore {
  /** Linha do casamento; `null` se o recurso ainda não foi ativado. */
  get(weddingId: string): Promise<DriveConnectionRow | null>;
  /**
   * Cria a linha com `uploadToken` SE ela ainda não existir e devolve a linha que
   * ficou (a existente, se outra requisição chegou antes). Nunca troca um token existente.
   */
  create(weddingId: string, uploadToken: string): Promise<DriveConnectionRow>;
  /** Liga/desliga o recebimento. Devolve a linha atualizada; `null` se não há linha. */
  setEnabled(weddingId: string, enabled: boolean): Promise<DriveConnectionRow | null>;
  /** Grava um token novo. Devolve a linha atualizada; `null` se não há linha. */
  rotateToken(weddingId: string, uploadToken: string): Promise<DriveConnectionRow | null>;
  /**
   * Grava a conexão do casal de uma vez (token cifrado, e-mail, época = agora, pasta
   * raiz, sem pendência de reconexão). `newUploadToken` só é usado para criar a linha
   * quando ela não existe; com linha, o `upload_token` nunca é trocado (passe `null`).
   * Devolve a linha final; lança se não conseguir gravar.
   */
  connectOwner(
    weddingId: string,
    data: OwnerConnectionData,
    newUploadToken: string | null,
  ): Promise<DriveConnectionRow>;
  /** Volta ao modo plataforma: zera token, e-mail, época, pendência e pasta raiz. `null` se não há linha. */
  disconnectOwner(weddingId: string): Promise<DriveConnectionRow | null>;
}

/** Leitura do Google Drive, sempre escopada ao `weddingId` (o helper filtra e valida por ele). */
export interface DriveReader {
  listGuestFiles(
    accessToken: string,
    weddingId: string,
    opts: { pageToken?: string },
  ): Promise<{ files: DriveFileSummary[]; nextPageToken: string | null }>;
  summarizeGuestFiles(accessToken: string, weddingId: string): Promise<{ count: number; totalBytes: number }>;
  /** Devolve data URLs; o objeto pode não ter protótipo (não chame métodos dele). */
  getThumbnails(
    accessToken: string,
    weddingId: string,
    fileIds: string[],
  ): Promise<Record<string, string | null>>;
}

/** Tudo o que o handler precisa do mundo de fora. Qualquer método pode lançar (vira 503). */
export interface GoogleDriveAdminDeps {
  /** Origens permitidas (ALLOWED_ORIGINS já interpretada). Vazia = configuração quebrada. */
  allowedOrigins: string[];
  /**
   * Verifica o JWT do casal a partir do cabeçalho `Authorization: Bearer ...` inteiro.
   * Devolve o id do usuário, ou `null` se o JWT for inválido/expirado. Lançar = falha
   * de infraestrutura (503), nunca "não autorizado".
   */
  authenticate(authHeader: string): Promise<{ userId: string } | null>;
  /** Casamento do usuário (`weddings.user_id = userId`); `null` se ele não tiver um. */
  getWeddingIdForUser(userId: string): Promise<string | null>;
  connections: DriveConnectionsStore;
  /**
   * Quantidade de linhas de `wedding_drive_guest_folders` do casamento com
   * `guest_key <> ''` (só convidados nomeados; a pasta "Anônimo" não conta).
   */
  countNamedGuestFolders(weddingId: string): Promise<number>;
  /** Token de upload novo: 24 bytes aleatórios em base64url, 32 caracteres (ver `generateUploadToken`). */
  generateToken(): string;
  /** Access token do Google da conta indicada (plataforma ou casal), com cache. Pode lançar (vira 503). */
  getAccessToken(ref: DriveAccessRef): Promise<string>;
  /** Relógio em milissegundos (validade do `state`). */
  now(): number;
  /** 16 bytes aleatórios em hex (nonce do `state`). */
  randomNonce(): string;
  /** Assina o `state` do OAuth. */
  signState(payload: OAuthState): Promise<string>;
  /** Devolve o conteúdo do `state` se assinatura e validade conferem; senão `null`. */
  verifyState(state: string): Promise<OAuthState | null>;
  /** Cifra o refresh token do casal (AES-GCM) para gravar. */
  encryptToken(plain: string): Promise<{ encrypted: string; iv: string }>;
  /** Nomes do casal (para o nome da pasta); `null` se o casamento não existe. */
  getCoupleNames(weddingId: string): Promise<CoupleNames | null>;
  /** Apaga as linhas de `wedding_drive_guest_folders` do casamento. */
  clearGuestFolders(weddingId: string): Promise<void>;
  /** OAuth do Google e pasta raiz do casal, já ligados ao fetch e às credenciais do app. */
  google: {
    buildAuthUrl(state: string): string;
    exchangeCode(code: string): Promise<CodeExchange>;
    /** Cria a pasta raiz no topo do Drive da conta dona do `accessToken`; devolve o id. */
    createOwnerRootFolder(accessToken: string, opts: { weddingId: string; name: string }): Promise<string>;
  };
  drive: DriveReader;
}

// ---------------------------------------------------------------------------
// Token de upload
// ---------------------------------------------------------------------------

/** Bytes aleatórios de um token de upload: 24 bytes = 192 bits = 32 caracteres em base64url. */
export const UPLOAD_TOKEN_BYTES = 24;

// A função pública aceita [A-Za-z0-9_-]{20,64}; o admin sempre gera exatamente 32.
const UPLOAD_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/;

const BASE64URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** Base64url (RFC 4648 §5) SEM padding: `-` no lugar de `+`, `_` no lugar de `/`, nada de `=`. */
export function base64UrlEncode(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const remaining = bytes.length - i;
    const chunk = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += BASE64URL_ALPHABET[(chunk >> 18) & 63] + BASE64URL_ALPHABET[(chunk >> 12) & 63];
    if (remaining > 1) out += BASE64URL_ALPHABET[(chunk >> 6) & 63];
    if (remaining > 2) out += BASE64URL_ALPHABET[chunk & 63];
  }
  return out;
}

/**
 * Gera um token de upload: `UPLOAD_TOKEN_BYTES` bytes preenchidos por `fillRandom`
 * (em produção, `crypto.getRandomValues`; nunca `Math.random`), em base64url sem padding.
 */
export function generateUploadToken(fillRandom: (bytes: Uint8Array) => void): string {
  const bytes = new Uint8Array(UPLOAD_TOKEN_BYTES);
  fillRandom(bytes);
  return base64UrlEncode(bytes);
}

// ---------------------------------------------------------------------------
// Erro do Auth
// ---------------------------------------------------------------------------

/**
 * Decide o que um erro de `auth.getUser()` significa. Só erro de CLIENTE (status
 * 4xx: JWT inválido, expirado, usuário que não existe mais) quer dizer "não
 * autenticado" (`unauthorized`, 401), com duas exceções: 408 (timeout) e 429 (limite
 * de taxa do Auth) são 4xx, mas dizem que o Auth está lento ou sobrecarregado, não
 * que a sessão expirou. Todo o resto também é o Auth fora do ar, e não pode parecer
 * sessão expirada (deslogaria o casal por uma queda que não é dele): `unavailable`,
 * sem `status` numérico (falha de rede, erro não tipado), status 0 (fetch que nem
 * chegou ao servidor), 408, 429, 5xx ou qualquer valor fora de 400-499. Quem chama
 * (index.ts) lança um Error de mensagem fixa nesse caso, e o handler responde 503.
 */
export function classifyAuthError(error: unknown): "unauthorized" | "unavailable" {
  const status = typeof error === "object" && error !== null ? (error as { status?: unknown }).status : undefined;
  const isSessionError =
    typeof status === "number" && Number.isInteger(status) && status >= 400 && status < 500 && status !== 408 && status !== 429;
  return isSessionError ? "unauthorized" : "unavailable";
}

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const LOG_PREFIX = "[google-drive-admin]";

const MAX_BODY_CHARS = 16 * 1024;
const MAX_THUMBNAIL_IDS = 24;
const MAX_FILE_ID_CHARS = 200;
const MAX_PAGE_TOKEN_CHARS = 2048;
const MAX_CODE_CHARS = 512;
const MAX_STATE_CHARS = 2048;
const MAX_EMAIL_CHARS = 254;

// Formato de um id de arquivo/pasta do Drive; o link da pasta só sai com um id assim.
const FOLDER_ID_PATTERN = /^[A-Za-z0-9_-]{10,100}$/;

const BEARER_PREFIX = "Bearer ";

const ACTIONS = [
  "status",
  "enable",
  "set-enabled",
  "rotate-token",
  "list",
  "summary",
  "thumbnails",
  "auth-url",
  "connect",
  "disconnect",
] as const;
type Action = (typeof ACTIONS)[number];

// Mensagens fixas em pt-BR: é só o que o cliente vê de erro.
const MESSAGES = {
  unauthorized: "Não autorizado",
  wedding_not_found: "Casamento não encontrado",
  not_enabled: "O envio de fotos e vídeos ainda não foi ativado",
  invalid_input: "Requisição inválida",
  unavailable: "Serviço temporariamente indisponível",
  method_not_allowed: "Método não permitido",
  misconfigured: "Erro interno de configuração",
  invalid_state: "O link de autorização expirou ou é inválido. Tente conectar de novo.",
  invalid_code: "Não foi possível concluir a conexão com o Google. Tente conectar de novo.",
  missing_scope: "Marque a permissão de acesso ao Google Drive para conectar.",
  needs_reconnect: "É preciso reconectar o Google Drive para continuar.",
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
// tokens, URLs do Google ou ids. Tudo vira 503: falha fechada, sem distinguir causa.
function failFromError(error: unknown, stage: string, cors: Cors): Response {
  let label: string;
  if (error instanceof NeedsReconnectError) label = "NeedsReconnectError";
  else if (error instanceof QuotaExceededError) label = "QuotaExceededError";
  else if (error instanceof DriveApiError) label = `DriveApiError status=${error.status}`;
  else label = error instanceof Error ? error.name : typeof error;
  console.error(`${LOG_PREFIX} ${stage}: ${label}`);
  return fail(503, "unavailable", MESSAGES.unavailable, cors);
}

// ---------------------------------------------------------------------------
// Pedido
// ---------------------------------------------------------------------------

type AdminRequest =
  | { action: "status" | "enable" | "rotate-token" | "summary" | "auth-url" | "disconnect" }
  | { action: "set-enabled"; enabled: boolean }
  | { action: "connect"; code: string; state: string }
  | { action: "list"; pageToken: string | undefined }
  | { action: "thumbnails"; fileIds: string[] };

const isAction = (value: unknown): value is Action =>
  typeof value === "string" && (ACTIONS as readonly string[]).includes(value);

// Lê e valida o corpo do POST. `null` = inválido (400 invalid_input). O corpo é
// lido como texto para poder recusar o que passa do teto antes de interpretar.
// Só os campos de cada ação são lidos: o resto do corpo é ignorado.
async function readRequest(req: Request): Promise<AdminRequest | null> {
  let text: string;
  try {
    text = await req.text();
  } catch {
    return null;
  }
  if (text.length > MAX_BODY_CHARS) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;

  const body = raw as Record<string, unknown>;
  const action = body.action;
  if (!isAction(action)) return null;

  switch (action) {
    case "set-enabled":
      return typeof body.enabled === "boolean" ? { action, enabled: body.enabled } : null;

    case "list": {
      // pageToken é opcional; null equivale a ausente.
      const pageToken = body.pageToken;
      if (pageToken === undefined || pageToken === null) return { action, pageToken: undefined };
      if (typeof pageToken !== "string" || pageToken.length > MAX_PAGE_TOKEN_CHARS) return null;
      return { action, pageToken };
    }

    case "connect": {
      const { code, state } = body;
      if (typeof code !== "string" || code.length < 1 || code.length > MAX_CODE_CHARS) return null;
      if (typeof state !== "string" || state.length < 1 || state.length > MAX_STATE_CHARS) return null;
      return { action, code, state };
    }

    case "thumbnails": {
      const fileIds = body.fileIds;
      if (!Array.isArray(fileIds) || fileIds.length < 1 || fileIds.length > MAX_THUMBNAIL_IDS) return null;
      for (const id of fileIds) {
        if (typeof id !== "string" || id.length < 1 || id.length > MAX_FILE_ID_CHARS) return null;
      }
      return { action, fileIds: fileIds as string[] };
    }

    default:
      return { action };
  }
}

// ---------------------------------------------------------------------------
// Ações
// ---------------------------------------------------------------------------

// Rótulo da etapa em andamento, atualizado durante a requisição para o log de erro.
interface Trace {
  stage: string;
}

// Modo casal = o casal conectou o próprio Google (`connected_at` preenchido).
const isOwnerRow = (row: DriveConnectionRow): boolean =>
  typeof row.connectedAt === "string" && row.connectedAt !== "";

// Só o modo casal tem link para a pasta (o Drive é dele), e só a partir de um id com
// formato de id do Drive. No modo plataforma nada que aponte para o Drive sai daqui.
function folderUrlOf(row: DriveConnectionRow): string | null {
  if (!isOwnerRow(row) || typeof row.folderId !== "string" || !FOLDER_ID_PATTERN.test(row.folderId)) return null;
  return `https://drive.google.com/drive/folders/${row.folderId}`;
}

// Corpo de todas as respostas de conexão (`status`, `enable`, `set-enabled`,
// `rotate-token`, `connect` e `disconnect`): os campos do contrato, escolhidos um a um
// (a linha da dependência pode ter mais coisa).
function connectionBody(row: DriveConnectionRow) {
  if (typeof row.uploadToken !== "string") throw new Error("Linha de conexão inválida");
  const owner = isOwnerRow(row);
  return {
    enabled: true,
    uploadsEnabled: row.uploadsEnabled === true,
    uploadToken: row.uploadToken,
    driveMode: owner ? "owner" : "platform",
    googleEmail:
      owner &&
      typeof row.googleEmail === "string" &&
      row.googleEmail !== "" &&
      row.googleEmail.length <= MAX_EMAIL_CHARS
        ? row.googleEmail
        : null,
    needsReconnect: owner && row.needsReconnect === true,
    folderUrl: folderUrlOf(row),
  };
}

const NOT_ENABLED_BODY = {
  enabled: false,
  uploadsEnabled: false,
  uploadToken: null,
  driveMode: "platform",
  googleEmail: null,
  needsReconnect: false,
  folderUrl: null,
};

function accessRefFor(weddingId: string, row: DriveConnectionRow): DriveAccessRef {
  return isOwnerRow(row) ? { kind: "owner", weddingId, epoch: row.connectedAt as string } : { kind: "platform" };
}

// Só os campos de DriveFileSummary: links, parents e propriedades do Drive nunca passam.
function fileBody(file: DriveFileSummary): DriveFileSummary {
  return {
    id: file.id,
    name: file.name,
    guestName: file.guestName,
    mimeType: file.mimeType,
    size: file.size,
    createdTime: file.createdTime,
    hasThumbnail: file.hasThumbnail,
    durationMs: file.durationMs,
  };
}

const THUMBNAIL_DATA_URL_PREFIX = "data:image/";

// Monta a resposta de miniaturas a partir dos ids PEDIDOS, não do que a dependência
// devolveu: uma chave por id, na ordem do pedido, e só data URL de imagem sobrevive.
// Qualquer outro valor (URL, inclusive de drive.google.com, texto, não-string) ou id
// ausente vira null; chaves que ninguém pediu não saem. Objeto sem protótipo porque os
// ids vêm do cliente ("__proto__" e "constructor" são chaves comuns), e a leitura da
// dependência olha só propriedades próprias.
function thumbnailsBody(returned: unknown, requestedIds: string[]): Record<string, string | null> {
  const body: Record<string, string | null> = Object.create(null);
  for (const id of requestedIds) {
    const value =
      typeof returned === "object" && returned !== null && Object.prototype.hasOwnProperty.call(returned, id)
        ? (returned as Record<string, unknown>)[id]
        : null;
    body[id] = typeof value === "string" && value.startsWith(THUMBNAIL_DATA_URL_PREFIX) ? value : null;
  }
  return body;
}

// Token novo da dependência; recusa o que a função pública não aceitaria (falha fechada).
function newUploadToken(deps: GoogleDriveAdminDeps): string {
  const token = deps.generateToken();
  if (typeof token !== "string" || !UPLOAD_TOKEN_PATTERN.test(token)) {
    throw new Error("Token de upload gerado é inválido");
  }
  return token;
}

type ConnectRequest = Extract<AdminRequest, { action: "connect" }>;

// Conclui a conexão do Google do casal. Ordem: state -> troca do código -> escopo ->
// nomes -> pasta -> cifra -> gravação (uma só) -> limpeza das pastas de convidado.
// NADA é revogado no Google, em caminho nenhum: revogar um refresh token derruba a
// autorização inteira do par (conta Google, app), e a mesma conta pode ser a da
// plataforma ou a de outro casamento; revogar quebraria os dois. Se algo falhar depois
// da troca, o refresh token recém-emitido é apenas DESCARTADO (nunca foi gravado); ao
// reconectar com outra conta, o token gravado é só substituído.
async function connectOwnerDrive(
  request: ConnectRequest,
  userId: string,
  weddingId: string,
  row: DriveConnectionRow | null,
  deps: GoogleDriveAdminDeps,
  cors: Cors,
  trace: Trace,
): Promise<Response> {
  trace.stage = "connect:verify_state";
  const state = await deps.verifyState(request.state);
  if (!state || state.u !== userId || state.w !== weddingId) {
    return fail(400, "invalid_state", MESSAGES.invalid_state, cors);
  }

  trace.stage = "connect:exchange_code";
  let exchange: CodeExchange;
  try {
    exchange = await deps.google.exchangeCode(request.code);
  } catch (error) {
    if (error instanceof InvalidCodeError) return fail(400, "invalid_code", MESSAGES.invalid_code, cors);
    throw error;
  }
  if (!exchange.scopes.includes(DRIVE_FILE_SCOPE)) {
    return fail(400, "missing_scope", MESSAGES.missing_scope, cors);
  }

  trace.stage = "connect:couple_names";
  const names = await deps.getCoupleNames(weddingId);
  if (!names) throw new Error("Casamento sem nomes");

  trace.stage = "connect:create_folder";
  const folderId = await deps.google.createOwnerRootFolder(exchange.accessToken, {
    weddingId,
    name: ownerRootFolderName(names),
  });

  trace.stage = "connect:seal_token";
  const sealed = await deps.encryptToken(exchange.refreshToken);

  trace.stage = "connect:save";
  // Só cria o token do QR se ainda não houver linha; com linha, o existente nunca é trocado.
  const saved = await deps.connections.connectOwner(
    weddingId,
    {
      refreshTokenEncrypted: sealed.encrypted,
      refreshTokenIv: sealed.iv,
      googleEmail: exchange.email,
      folderId,
    },
    row ? null : newUploadToken(deps),
  );

  // As pastas de convidado apontavam para o outro Drive. Best effort: as linhas velhas
  // se corrigem sozinhas (pasta que não existe mais é recriada no próximo envio).
  trace.stage = "connect:clear_guest_folders";
  try {
    await deps.clearGuestFolders(weddingId);
  } catch {
    console.error(`${LOG_PREFIX} connect:clear_guest_folders: falha ignorada`);
  }

  return json(200, connectionBody(saved), cors);
}

// Volta ao modo plataforma: apaga token, IV, e-mail, época e pasta gravados (o app não
// consegue mais usar a autorização; o casal também pode removê-la nas configurações da
// conta Google). Não revoga no Google (ver connectOwnerDrive). Idempotente pela própria
// linha: sem linha ou sem conexão do casal, não há nada a desfazer.
async function disconnectOwnerDrive(
  weddingId: string,
  row: DriveConnectionRow | null,
  deps: GoogleDriveAdminDeps,
  cors: Cors,
  trace: Trace,
): Promise<Response> {
  if (!row) return json(200, NOT_ENABLED_BODY, cors);
  if (!isOwnerRow(row)) return json(200, connectionBody(row), cors);

  trace.stage = "disconnect:save";
  const updated = await deps.connections.disconnectOwner(weddingId);
  if (!updated) return json(200, NOT_ENABLED_BODY, cors);

  trace.stage = "disconnect:clear_guest_folders";
  try {
    await deps.clearGuestFolders(weddingId);
  } catch {
    console.error(`${LOG_PREFIX} disconnect:clear_guest_folders: falha ignorada`);
  }
  return json(200, connectionBody(updated), cors);
}

async function runAction(
  request: AdminRequest,
  userId: string,
  weddingId: string,
  deps: GoogleDriveAdminDeps,
  cors: Cors,
  trace: Trace,
): Promise<Response> {
  const notEnabled = () => fail(404, "not_enabled", MESSAGES.not_enabled, cors);
  const needsReconnect = () => fail(409, "needs_reconnect", MESSAGES.needs_reconnect, cors);

  trace.stage = "connection:get";
  const row = await deps.connections.get(weddingId);

  switch (request.action) {
    case "status":
      // Sem linha = recurso não ativado (não é erro para o painel).
      return json(200, row ? connectionBody(row) : NOT_ENABLED_BODY, cors);

    case "enable": {
      // Idempotente: com linha, devolve a existente sem gerar nem gravar nada.
      // A pasta raiz NÃO é criada aqui; a função pública a cria no primeiro envio.
      if (row) return json(200, connectionBody(row), cors);
      trace.stage = "connection:create";
      const created = await deps.connections.create(weddingId, newUploadToken(deps));
      return json(200, connectionBody(created), cors);
    }

    case "set-enabled": {
      if (!row) return notEnabled();
      trace.stage = "connection:set_enabled";
      const updated = await deps.connections.setEnabled(weddingId, request.enabled);
      return updated ? json(200, connectionBody(updated), cors) : notEnabled();
    }

    case "rotate-token": {
      if (!row) return notEnabled();
      const token = newUploadToken(deps);
      trace.stage = "connection:rotate_token";
      const updated = await deps.connections.rotateToken(weddingId, token);
      return updated ? json(200, connectionBody(updated), cors) : notEnabled();
    }

    case "auth-url": {
      // Não exige o recurso ativado: o `state` só amarra o retorno ao usuário e ao casamento.
      trace.stage = "oauth:auth_url";
      const state = await deps.signState({
        w: weddingId,
        u: userId,
        exp: deps.now() + STATE_TTL_MS,
        n: deps.randomNonce(),
      });
      return json(200, { url: deps.google.buildAuthUrl(state) }, cors);
    }

    case "connect":
      return connectOwnerDrive(request, userId, weddingId, row, deps, cors, trace);

    case "disconnect":
      return disconnectOwnerDrive(weddingId, row, deps, cors, trace);
  }

  // Daqui em diante: ações que leem o Drive. Exigem a linha e o token do Google.
  if (!row) return notEnabled();
  const owner = isOwnerRow(row);
  // Sem o Google do casal não há o que ler: o painel mostra "Reconectar".
  if (owner && row.needsReconnect === true) return needsReconnect();

  trace.stage = "google:access_token";
  let accessToken: string;
  try {
    accessToken = await deps.getAccessToken(accessRefFor(weddingId, row));
  } catch (error) {
    // O Google recusou o token do casal agora (já ficou marcado para reconectar).
    if (owner && error instanceof NeedsReconnectError) return needsReconnect();
    throw error;
  }

  switch (request.action) {
    case "list": {
      trace.stage = "drive:list";
      const listed = await deps.drive.listGuestFiles(accessToken, weddingId, { pageToken: request.pageToken });
      const nextPageToken = typeof listed.nextPageToken === "string" ? listed.nextPageToken : null;
      return json(200, { files: listed.files.map(fileBody), nextPageToken }, cors);
    }

    case "summary": {
      trace.stage = "drive:summary";
      const { count, totalBytes } = await deps.drive.summarizeGuestFiles(accessToken, weddingId);
      trace.stage = "guest_folders:count";
      const guests = await deps.countNamedGuestFolders(weddingId);
      return json(200, { count, totalBytes, guests }, cors);
    }

    case "thumbnails": {
      trace.stage = "drive:thumbnails";
      const returned = await deps.drive.getThumbnails(accessToken, weddingId, request.fileIds);
      return json(200, { thumbnails: thumbnailsBody(returned, request.fileIds) }, cors);
    }
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

// Ordem das checagens (a autenticação vem antes de QUALQUER acesso a dados):
//  1. Bearer presente   2. JWT válido        3. corpo e ação válidos
//  4. casamento do usuário (weddingId derivado)     5. linha de conexão
//  6. token do Google (só ações do Drive; `auth-url`, `connect` e `disconnect` cuidam do próprio fluxo)  7. resposta.
async function handlePost(req: Request, deps: GoogleDriveAdminDeps, cors: Cors): Promise<Response> {
  const trace: Trace = { stage: "auth" };
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith(BEARER_PREFIX) || authHeader.length === BEARER_PREFIX.length) {
      return fail(401, "unauthorized", MESSAGES.unauthorized, cors);
    }
    const user = await deps.authenticate(authHeader);
    if (!user || typeof user.userId !== "string" || user.userId === "") {
      return fail(401, "unauthorized", MESSAGES.unauthorized, cors);
    }

    trace.stage = "parse_body";
    const request = await readRequest(req);
    if (!request) return fail(400, "invalid_input", MESSAGES.invalid_input, cors);

    // O ÚNICO lugar de onde vem o weddingId: o usuário autenticado.
    trace.stage = "wedding:lookup";
    const weddingId = await deps.getWeddingIdForUser(user.userId);
    if (typeof weddingId !== "string" || weddingId === "") {
      return fail(404, "wedding_not_found", MESSAGES.wedding_not_found, cors);
    }

    return await runAction(request, user.userId, weddingId, deps, cors, trace);
  } catch (error) {
    return failFromError(error, trace.stage, cors);
  }
}

export function createHandler(deps: GoogleDriveAdminDeps): (req: Request) => Promise<Response> {
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

    if (req.method !== "POST") {
      return fail(405, "method_not_allowed", MESSAGES.method_not_allowed, { ...cors, Allow: "POST, OPTIONS" });
    }
    return handlePost(req, deps, cors);
  };
}
