// Cliente tipado da edge function pública `guest-upload` (página `/fotos/:token`).
//
// Mesmo padrão de `WeddingPage`: `fetch` cru com o header `apikey` (a função é
// `verify_jwt = false`). URL base e chave anônima vêm do ambiente do Vite, mas cada
// chamada aceita sobrescritas para que os testes não dependam do ambiente.
//
// Segurança: o token do QR code, a URL de sessão do upload e a chave anônima NUNCA entram
// na `message` dos erros. A mensagem é sempre o texto pt-BR fixo do código; nem o texto do
// servidor nem o erro original do `fetch` (que em alguns navegadores cita a URL, e a URL
// carrega o token) são propagados.

export type UploadErrorCode =
  | 'invalid_input'
  | 'file_type'
  | 'file_too_large'
  | 'forbidden_origin'
  | 'not_found'
  | 'disabled'
  | 'rate_limited'
  | 'unavailable'
  | 'storage_full';

/** `network`: o `fetch` rejeitou (status 0). `unknown`: resposta sem `code` reconhecível. */
export type GuestUploadErrorCode = UploadErrorCode | 'network' | 'unknown';

/** Resposta do GET: o que a página pública mostra antes de o convidado escolher os arquivos. */
export interface UploadPageInfo {
  coupleName: string;
  partnerNames: string[];
  available: boolean;
  reason?: 'disabled';
  /** Maior arquivo aceito, em bytes. */
  maxBytes: number;
}

export interface UploadSessionMeta {
  fileName: string;
  mimeType: string;
  size: number;
  guestName?: string;
}

export interface GuestUploadApiOptions {
  fetchFn?: typeof fetch;
  baseUrl?: string;
  anonKey?: string;
}

const GENERIC_MESSAGE = 'Não foi possível enviar. Tente novamente.';

const MESSAGES: Record<GuestUploadErrorCode, string> = {
  invalid_input: 'Não foi possível enviar este arquivo. Verifique-o e tente de novo.',
  file_type: 'Este tipo de arquivo não é aceito. Envie apenas fotos ou vídeos.',
  file_too_large: 'Arquivos acima de 2 GB: fale com os noivos para combinar o envio.',
  forbidden_origin: 'O envio não está disponível a partir deste endereço. Abra o link do QR code novamente.',
  not_found: 'Link de envio não encontrado. Confira o QR code com os noivos.',
  disabled: 'O envio de fotos está desativado no momento.',
  rate_limited: 'Muitos envios em pouco tempo. Aguarde alguns minutos e tente de novo.',
  unavailable: 'O envio está temporariamente indisponível. Tente de novo mais tarde.',
  storage_full: 'O envio está temporariamente indisponível. Tente de novo mais tarde.',
  network: 'Não foi possível enviar. Verifique sua conexão e tente de novo. Se continuar, abra esta página no Chrome.',
  unknown: GENERIC_MESSAGE,
};

function messageForCode(code: string): string {
  return Object.prototype.hasOwnProperty.call(MESSAGES, code)
    ? MESSAGES[code as GuestUploadErrorCode]
    : GENERIC_MESSAGE;
}

/** Erro de uma chamada à `guest-upload`. `status` é o HTTP da resposta (0 = sem resposta). */
export class GuestUploadApiError extends Error {
  readonly code: GuestUploadErrorCode;
  readonly status: number;

  constructor(code: GuestUploadErrorCode, status: number) {
    super(messageForCode(code));
    this.name = 'GuestUploadApiError';
    this.code = code;
    this.status = status;
  }
}

/** Texto pt-BR para mostrar ao convidado. Qualquer erro desconhecido vira a mensagem genérica. */
export function messageForUploadError(err: unknown): string {
  return err instanceof GuestUploadApiError ? messageForCode(err.code) : GENERIC_MESSAGE;
}

// `method_not_allowed` (405) fica de fora de propósito: para o cliente é `unknown`.
const KNOWN_CODES: ReadonlySet<string> = new Set<UploadErrorCode>([
  'invalid_input',
  'file_type',
  'file_too_large',
  'forbidden_origin',
  'not_found',
  'disabled',
  'rate_limited',
  'unavailable',
  'storage_full',
]);

function isUploadErrorCode(value: unknown): value is UploadErrorCode {
  return typeof value === 'string' && KNOWN_CODES.has(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Lê o corpo como JSON; `undefined` se estiver vazio, cortado ou não for JSON. */
async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

async function callGuestUpload(
  query: string,
  init: RequestInit,
  options: GuestUploadApiOptions,
): Promise<{ status: number; body: unknown }> {
  // Chamada por variável local, nunca `options.fetchFn(...)`: com o `fetch` nativo, `this`
  // seria `options` e o navegador lança "Illegal invocation".
  const fetchFn: typeof fetch = options.fetchFn ?? fetch;
  const baseUrl = (options.baseUrl ?? import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '');
  const anonKey: string | undefined = options.anonKey ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const headers: Record<string, string> = {
    ...(anonKey ? { apikey: anonKey } : {}),
    ...(init.headers as Record<string, string> | undefined),
  };

  let response: Response;
  try {
    response = await fetchFn(`${baseUrl}/functions/v1/guest-upload${query}`, { ...init, headers });
  } catch {
    throw new GuestUploadApiError('network', 0);
  }

  const body = await readJson(response);
  if (!response.ok) {
    const code = isRecord(body) ? body.code : undefined;
    throw new GuestUploadApiError(isUploadErrorCode(code) ? code : 'unknown', response.status);
  }
  if (body === undefined) throw new GuestUploadApiError('unknown', response.status);
  return { status: response.status, body };
}

function parsePageInfo(body: unknown): UploadPageInfo | null {
  if (!isRecord(body)) return null;
  const { coupleName, partnerNames, available, reason, maxBytes } = body;
  if (typeof coupleName !== 'string') return null;
  if (!Array.isArray(partnerNames) || !partnerNames.every((name) => typeof name === 'string')) return null;
  if (typeof available !== 'boolean') return null;
  if (typeof maxBytes !== 'number' || !Number.isFinite(maxBytes)) return null;
  return {
    coupleName,
    partnerNames: partnerNames as string[],
    available,
    ...(reason === 'disabled' ? { reason } : {}),
    maxBytes,
  };
}

/** GET `?token=`: nomes do casal e se o envio está ativado. */
export async function getUploadPageInfo(
  token: string,
  options: GuestUploadApiOptions = {},
): Promise<UploadPageInfo> {
  const { status, body } = await callGuestUpload(`?token=${encodeURIComponent(token)}`, { method: 'GET' }, options);
  const info = parsePageInfo(body);
  if (!info) throw new GuestUploadApiError('unknown', status);
  return info;
}

/** POST: cria a sessão de upload resumível no Drive e devolve a URL para enviar os bytes. */
export async function createUploadSession(
  token: string,
  meta: UploadSessionMeta,
  options: GuestUploadApiOptions = {},
): Promise<{ uploadUrl: string }> {
  const { status, body } = await callGuestUpload(
    '',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, ...meta }),
    },
    options,
  );
  const uploadUrl = isRecord(body) ? body.uploadUrl : undefined;
  if (typeof uploadUrl !== 'string' || uploadUrl === '') throw new GuestUploadApiError('unknown', status);
  return { uploadUrl };
}
