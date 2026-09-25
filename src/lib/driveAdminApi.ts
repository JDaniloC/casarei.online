// Cliente tipado da edge function `google-drive-admin` (painel do casal, aba "Fotos dos
// Convidados"). Todas as chamadas são `POST { action, ...params }` autenticadas pelo JWT
// do casal, que o supabase-js anexa sozinho.
//
// O `weddingId` NUNCA sai daqui: o servidor o deriva do usuário do JWT. Por isso nenhuma
// função deste módulo recebe ou envia id de casamento.
//
// Erros: um não-2xx chega como `FunctionsHttpError` cujo `context` é a `Response` crua; o
// texto pt-BR do servidor (`{ error, code }`) é lido dela e vira a mensagem do
// `DriveAdminError`. Rede, relay, corpo ilegível ou sem `error` caem numa mensagem genérica
// fixa em pt-BR (nunca o texto em inglês do gateway). Nada aqui loga: quem chama decide.

import { supabase } from '@/integrations/supabase/client';

/** Um arquivo enviado por convidado, como a API o devolve (sem nenhum link do armazenamento). */
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

/** Resposta de `status`, `enable`, `set-enabled`, `rotate-token`, `connect` e `disconnect`. */
export interface DriveConnection {
  enabled: boolean;
  uploadsEnabled: boolean;
  /** `null` só quando o recurso ainda não foi ativado. */
  uploadToken: string | null;
  /**
   * Onde as fotos ficam: `owner` = no Google Drive do casal; `platform` = guardadas pela
   * plataforma. Ausente (servidor antigo) vale como `platform`.
   */
  driveMode?: 'platform' | 'owner';
  /** E-mail da conta Google conectada (só no modo casal). */
  googleEmail?: string | null;
  /** O Google recusou o acesso do casal: é preciso reconectar. Ausente = `false`. */
  needsReconnect?: boolean;
  /** Link da pasta no Drive DO CASAL (só no modo casal); `null`/ausente = sem link. */
  folderUrl?: string | null;
}

export interface DriveFilesPage {
  files: DriveFileSummary[];
  nextPageToken: string | null;
}

export interface DriveSummary {
  count: number;
  totalBytes: number;
  guests: number;
}

/** Mapa id -> data URL da miniatura; `null` = ainda sem miniatura. Objeto sem protótipo. */
export type ThumbnailMap = Record<string, string | null>;

/** Máximo de ids por chamada de `thumbnails` (limite do servidor). */
export const MAX_THUMBNAIL_BATCH = 24;

export const GENERIC_ERROR_MESSAGE =
  'Não foi possível concluir a operação. Verifique sua conexão e tente novamente.';

/** Erro de uma chamada ao painel. `code`/`status` são `null` quando não vieram do servidor. */
export class DriveAdminError extends Error {
  readonly code: string | null;
  readonly status: number | null;

  constructor(message: string, code: string | null = null, status: number | null = null) {
    super(message);
    this.name = 'DriveAdminError';
    this.code = code;
    this.status = status;
  }
}

const FUNCTION_NAME = 'google-drive-admin';
const MAX_SERVER_MESSAGE_CHARS = 300;

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json => typeof value === 'object' && value !== null;

const malformed = () => new DriveAdminError(GENERIC_ERROR_MESSAGE);

/** Lê `{ error, code }` da `Response` do não-2xx. Qualquer falha de leitura vira o erro genérico. */
async function errorFromInvoke(error: unknown): Promise<DriveAdminError> {
  const context = isRecord(error) ? error.context : undefined;
  const status =
    isRecord(context) && typeof context.status === 'number' && Number.isFinite(context.status)
      ? context.status
      : null;

  if (isRecord(context) && typeof context.json === 'function') {
    try {
      const body: unknown = await (context as unknown as Response).json();
      if (isRecord(body) && typeof body.error === 'string') {
        const message = body.error.trim();
        if (message !== '' && message.length <= MAX_SERVER_MESSAGE_CHARS) {
          return new DriveAdminError(message, typeof body.code === 'string' ? body.code : null, status);
        }
      }
    } catch {
      // corpo que não é JSON (página de erro do gateway, por exemplo): cai no genérico
    }
  }
  return new DriveAdminError(GENERIC_ERROR_MESSAGE, null, status);
}

async function call(body: Json): Promise<unknown> {
  let result: { data: unknown; error: unknown };
  try {
    result = await supabase.functions.invoke(FUNCTION_NAME, { body });
  } catch {
    throw new DriveAdminError(GENERIC_ERROR_MESSAGE);
  }
  if (result.error) throw await errorFromInvoke(result.error);
  return result.data;
}

// ---------------------------------------------------------------------------
// Validação das respostas (o servidor é confiável, mas um 2xx malformado não pode quebrar a tela)
// ---------------------------------------------------------------------------

const GOOGLE_DRIVE_FOLDER_PREFIX = 'https://drive.google.com/';

function parseConnection(data: unknown): DriveConnection {
  if (!isRecord(data)) throw malformed();
  const { enabled, uploadsEnabled, uploadToken } = data;
  if (typeof enabled !== 'boolean' || typeof uploadsEnabled !== 'boolean') throw malformed();
  const token = typeof uploadToken === 'string' ? uploadToken : null;
  if (uploadToken !== null && token === null) throw malformed();
  // Ativado sem token não tem o que mostrar no QR code.
  if (enabled && (token === null || token === '')) throw malformed();

  // Campos do Drive do casal: só entram os que vieram válidos (o resto é ignorado, e a
  // ausência vale como modo plataforma).
  const extras: Partial<DriveConnection> = {};
  if (data.driveMode === 'platform' || data.driveMode === 'owner') extras.driveMode = data.driveMode;
  if (data.googleEmail === null) extras.googleEmail = null;
  else if (typeof data.googleEmail === 'string') extras.googleEmail = data.googleEmail;
  if (typeof data.needsReconnect === 'boolean') extras.needsReconnect = data.needsReconnect;
  if (data.folderUrl === null) extras.folderUrl = null;
  else if (typeof data.folderUrl === 'string' && data.folderUrl.startsWith(GOOGLE_DRIVE_FOLDER_PREFIX)) {
    extras.folderUrl = data.folderUrl;
  }
  return { enabled, uploadsEnabled, uploadToken: token, ...extras };
}

function parseFile(raw: unknown): DriveFileSummary | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || raw.id === '') return null;
  return {
    id: raw.id,
    name: typeof raw.name === 'string' ? raw.name : '',
    guestName: typeof raw.guestName === 'string' ? raw.guestName : '',
    mimeType: typeof raw.mimeType === 'string' ? raw.mimeType : '',
    size: typeof raw.size === 'number' && Number.isFinite(raw.size) ? raw.size : 0,
    createdTime: typeof raw.createdTime === 'string' ? raw.createdTime : '',
    hasThumbnail: raw.hasThumbnail === true,
    durationMs:
      typeof raw.durationMs === 'number' && Number.isFinite(raw.durationMs) ? raw.durationMs : null,
  };
}

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

// ---------------------------------------------------------------------------
// Ações
// ---------------------------------------------------------------------------

/** Situação do recurso. Sem ativação devolve `{ enabled: false, uploadsEnabled: false, uploadToken: null }`. */
export async function getStatus(): Promise<DriveConnection> {
  return parseConnection(await call({ action: 'status' }));
}

/** Ativa o recurso (idempotente: com o recurso já ativo devolve o token existente). */
export async function enable(): Promise<DriveConnection> {
  return parseConnection(await call({ action: 'enable' }));
}

/** Liga ou desliga o recebimento de envios. */
export async function setEnabled(enabled: boolean): Promise<DriveConnection> {
  return parseConnection(await call({ action: 'set-enabled', enabled }));
}

/** Gera um token novo: o link e os QR codes anteriores deixam de funcionar. */
export async function rotateToken(): Promise<DriveConnection> {
  return parseConnection(await call({ action: 'rotate-token' }));
}

/** URL do Google onde o casal autoriza o acesso ao próprio Drive (o retorno é a página de callback). */
export async function getAuthUrl(): Promise<string> {
  const data = await call({ action: 'auth-url' });
  if (!isRecord(data) || typeof data.url !== 'string' || !data.url.startsWith('https://accounts.google.com/')) {
    throw malformed();
  }
  return data.url;
}

/** Conclui a conexão com o `code` e o `state` que o Google devolveu na página de retorno. */
export async function connectDrive(params: { code: string; state: string }): Promise<DriveConnection> {
  return parseConnection(await call({ action: 'connect', code: params.code, state: params.state }));
}

/** Volta a guardar as fotos na plataforma; o Google do casal é desconectado. */
export async function disconnectDrive(): Promise<DriveConnection> {
  return parseConnection(await call({ action: 'disconnect' }));
}

/** Uma página (50 arquivos) do mais novo para o mais antigo. */
export async function listFiles(pageToken?: string): Promise<DriveFilesPage> {
  const data = await call(pageToken ? { action: 'list', pageToken } : { action: 'list' });
  if (!isRecord(data) || !Array.isArray(data.files)) throw malformed();

  const files: DriveFileSummary[] = [];
  for (const entry of data.files) {
    const file = parseFile(entry);
    if (file !== null) files.push(file);
  }
  const next = data.nextPageToken;
  return { files, nextPageToken: typeof next === 'string' && next !== '' ? next : null };
}

export async function getSummary(): Promise<DriveSummary> {
  const data = await call({ action: 'summary' });
  if (!isRecord(data) || !isCount(data.count) || !isCount(data.totalBytes) || !isCount(data.guests)) {
    throw malformed();
  }
  return { count: data.count, totalBytes: data.totalBytes, guests: data.guests };
}

/**
 * Miniaturas de até `MAX_THUMBNAIL_BATCH` arquivos. O resultado tem uma chave para CADA id
 * pedido: só uma data URL de imagem passa (é o que se pode usar em `<img src>`); tudo o mais
 * (null, link, id ausente) vira `null`. Objeto sem protótipo, para ids como "__proto__".
 */
export async function getThumbnails(fileIds: string[]): Promise<ThumbnailMap> {
  const result: ThumbnailMap = Object.create(null);
  if (fileIds.length === 0) return result;
  if (fileIds.length > MAX_THUMBNAIL_BATCH) {
    throw new Error(`getThumbnails aceita no máximo ${MAX_THUMBNAIL_BATCH} ids por chamada`);
  }

  const data = await call({ action: 'thumbnails', fileIds });
  if (!isRecord(data) || !isRecord(data.thumbnails)) throw malformed();

  const received = data.thumbnails;
  for (const id of fileIds) {
    const value = Object.prototype.hasOwnProperty.call(received, id) ? received[id] : null;
    result[id] = typeof value === 'string' && value.startsWith('data:image/') ? value : null;
  }
  return result;
}
