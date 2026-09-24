// Motor de upload resumível do navegador direto para o Google Drive.
//
// O navegador envia os bytes para a URL de sessão (`uploadUrl`) que a edge function
// `guest-upload` criou, sem passar por nenhum servidor nosso e sem cabeçalho
// Authorization (a própria URL é a credencial). Protocolo, como verificado no spike:
//   - cada requisição é um PUT com `Content-Range: bytes <início>-<fim>/<total>`; só o
//     `Content-Range` é enviado (nada de Content-Type: a fatia de um File não tem tipo);
//   - o Google responde 308 + header `range: bytes=0-N` enquanto o arquivo está incompleto
//     (N é o último byte guardado; sem `range`, nada foi guardado) e 200/201 + JSON com o
//     `id` quando termina;
//   - todo chunk, menos o último, precisa ter tamanho múltiplo de 256 KiB;
//   - depois de qualquer falha, o único offset confiável é o que o Google devolve numa
//     consulta de status (PUT vazio com `Content-Range: bytes */<total>`): uma requisição
//     abortada no meio pode ter gravado MAIS do que o chunk enviado, então o contador local
//     nunca é usado para retomar.
//
// O arquivo nunca é lido inteiro: cada requisição carrega só `file.slice(início, fim)`.

/** Múltiplo de tamanho que o Google exige de todo chunk, exceto o último. */
const CHUNK_ALIGNMENT = 256 * 1024;

/** Tamanho padrão de cada chunk. */
export const DEFAULT_CHUNK_SIZE = 8 * 1024 * 1024;

/** Falhas consecutivas (sem nenhum progresso no meio) toleradas antes de desistir. */
const MAX_CONSECUTIVE_FAILURES = 8;
const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 30_000;

// ---------------------------------------------------------------------------
// Tipos e erros públicos
// ---------------------------------------------------------------------------

export interface TransportRequest {
  method: 'PUT';
  url: string;
  headers: Record<string, string>;
  body?: Blob | null;
  signal?: AbortSignal;
  /** Bytes do corpo desta requisição já enviados. */
  onProgress?: (loaded: number) => void;
}

export interface TransportResponse {
  status: number;
  /** Nomes em minúsculas (o motor só lê `range`). */
  headers: Record<string, string>;
  body: string;
}

/**
 * Faz uma requisição HTTP. Falha de rede/CORS rejeita com `TypeError`; cancelamento pelo
 * `signal` rejeita com `AbortError`. Qualquer status HTTP resolve normalmente.
 */
export type Transport = (req: TransportRequest) => Promise<TransportResponse>;

/** A sessão de upload expirou ou não existe mais (404/410): o chamador cria outra sessão. */
export class SessionExpiredError extends Error {
  constructor(message = 'A sessão de envio expirou.') {
    super(message);
    this.name = 'SessionExpiredError';
  }
}

/**
 * Falha que repetir não resolve: arquivo vazio, resposta inesperada do Google, 4xx que não
 * seja 404/410 ou tentativas esgotadas. `status` é o HTTP da última resposta (0 = rede ou
 * erro local). A mensagem nunca contém a URL da sessão.
 */
export class FatalUploadError extends Error {
  readonly status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = 'FatalUploadError';
    this.status = status;
  }
}

export interface UploadFileOptions {
  /** URL da sessão de upload resumível (segredo do envio). */
  uploadUrl: string;
  file: File;
  transport?: Transport;
  /** Tamanho de cada chunk; arredondado para baixo a múltiplo de 256 KiB (mínimo 256 KiB). */
  chunkSize?: number;
  signal?: AbortSignal;
  /** `loaded` = bytes já confirmados + progresso do chunk atual; monotônico e nunca acima de `total`. */
  onProgress?: (loaded: number, total: number) => void;
  /** Espera `ms` milissegundos. Injetável nos testes; o motor também interrompe a espera no abort. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  isOnline?: () => boolean;
  /** Resolve quando a conexão volta. Só é chamada quando `isOnline()` devolve false. */
  waitForOnline?: (signal?: AbortSignal) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Utilidades internas
// ---------------------------------------------------------------------------

function abortError(): DOMException {
  return new DOMException('O envio foi cancelado.', 'AbortError');
}

function hasName(error: unknown, name: string): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === name;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

/** Rejeita com AbortError assim que o `signal` abortar, mesmo que `promise` nunca termine. */
function raceAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

// `navigator`/`window` podem não existir (SSR, testes em outro ambiente): nesse caso
// considera-se online e nada é esperado.
function defaultIsOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

function defaultWaitForOnline(signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (typeof window === 'undefined' || defaultIsOnline()) {
      resolve();
      return;
    }
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const cleanup = () => {
      window.removeEventListener('online', onOnline);
      signal?.removeEventListener('abort', onAbort);
    };
    const onOnline = () => {
      cleanup();
      resolve();
    };
    const onAbort = () => {
      cleanup();
      reject(abortError());
    };
    window.addEventListener('online', onOnline);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function alignChunkSize(requested: number): number {
  if (!Number.isFinite(requested)) return DEFAULT_CHUNK_SIZE;
  return Math.max(CHUNK_ALIGNMENT, Math.floor(requested / CHUNK_ALIGNMENT) * CHUNK_ALIGNMENT);
}

/** 1 s, 2 s, 4 s... com teto de 30 s; `failures` começa em 1. */
function backoffDelay(failures: number): number {
  return Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** (failures - 1));
}

/** `id` do arquivo no corpo final; qualquer coisa diferente de um texto não vazio é fatal. */
function parseFileId(body: string, status: number): string {
  try {
    const parsed: unknown = JSON.parse(body);
    const id = typeof parsed === 'object' && parsed !== null ? (parsed as { id?: unknown }).id : undefined;
    if (typeof id === 'string' && id !== '') return id;
  } catch {
    // cai no erro abaixo
  }
  throw new FatalUploadError('O Google Drive concluiu o envio, mas a resposta não trouxe o identificador do arquivo.', status);
}

/** Próximo offset a partir do header `range` de um 308 (`bytes=0-N` => N + 1; ausente => 0). */
function parseStoredOffset(range: string | undefined, total: number): number {
  if (range === undefined) return 0;
  const match = /^bytes=0-(\d+)$/.exec(range.trim());
  if (!match) throw new FatalUploadError('Resposta inesperada do Google Drive ao consultar o envio.', 308);
  const offset = Number(match[1]) + 1;
  // Com todos os bytes guardados o Google responde 200, nunca 308.
  if (offset >= total) throw new FatalUploadError('Resposta inesperada do Google Drive ao consultar o envio.', 308);
  return offset;
}

type Outcome =
  | { kind: 'done'; fileId: string }
  | { kind: 'stored'; offset: number }
  | { kind: 'retry'; status: number };

function interpret(response: TransportResponse, total: number): Outcome {
  const { status } = response;
  if (status === 200 || status === 201) return { kind: 'done', fileId: parseFileId(response.body, status) };
  if (status === 308) return { kind: 'stored', offset: parseStoredOffset(response.headers.range, total) };
  if (status === 404 || status === 410) throw new SessionExpiredError();
  if (status === 429 || (status >= 500 && status < 600)) return { kind: 'retry', status };
  throw new FatalUploadError(`O Google Drive recusou o envio (HTTP ${status}).`, status);
}

// ---------------------------------------------------------------------------
// Transporte real (XMLHttpRequest)
// ---------------------------------------------------------------------------

// XMLHttpRequest e não fetch porque só ele dá progresso de upload (`upload.onprogress`).
// Falha de rede/CORS (onerror, status 0) rejeita com TypeError, que o motor trata como
// falha repetível. A URL da sessão nunca vai para a mensagem do erro.
export const xhrTransport: Transport = (req) =>
  new Promise<TransportResponse>((resolve, reject) => {
    const { signal } = req;
    if (signal?.aborted) {
      reject(abortError());
      return;
    }

    const xhr = new XMLHttpRequest();
    const onSignalAbort = () => xhr.abort();
    const cleanup = () => signal?.removeEventListener('abort', onSignalAbort);

    xhr.open(req.method, req.url);
    for (const [name, value] of Object.entries(req.headers)) xhr.setRequestHeader(name, value);

    xhr.upload.onprogress = (event) => req.onProgress?.(event.loaded);
    xhr.onload = () => {
      cleanup();
      const range = xhr.getResponseHeader('range');
      resolve({ status: xhr.status, headers: range === null ? {} : { range }, body: xhr.responseText });
    };
    xhr.onerror = () => {
      cleanup();
      reject(new TypeError('Falha de rede ao enviar o arquivo.'));
    };
    xhr.onabort = () => {
      cleanup();
      reject(abortError());
    };

    signal?.addEventListener('abort', onSignalAbort, { once: true });
    xhr.send(req.body ?? null);
  });

// ---------------------------------------------------------------------------
// Motor
// ---------------------------------------------------------------------------

/**
 * Envia `file` para a sessão `uploadUrl`, chunk a chunk, e devolve o id do arquivo no Drive.
 * Rejeita com `SessionExpiredError` (404/410: o chamador cria outra sessão),
 * `FatalUploadError` (repetir não adianta) ou `AbortError` (cancelado pelo `signal`).
 */
export async function uploadFile(options: UploadFileOptions): Promise<{ fileId: string }> {
  const { uploadUrl, file, signal, onProgress } = options;
  const transport = options.transport ?? xhrTransport;
  const sleep = options.sleep ?? defaultSleep;
  const isOnline = options.isOnline ?? defaultIsOnline;
  const waitForOnline = options.waitForOnline ?? defaultWaitForOnline;
  const chunkSize = alignChunkSize(options.chunkSize ?? DEFAULT_CHUNK_SIZE);
  const total = file.size;

  if (total <= 0) throw new FatalUploadError('O arquivo está vazio.');

  // Único estado de posição: o que o Google confirmou (0 no início). Nunca é atualizado
  // por contagem própria, só pelo `range` de um 308.
  let offset = 0;
  let failures = 0;
  let needStatusQuery = false;
  let reported = 0;

  const report = (loaded: number) => {
    const value = Math.min(total, loaded);
    if (value > reported) {
      reported = value;
      onProgress?.(value, total);
    }
  };

  // Executa uma requisição. Devolve null em falha de rede; cancelamento vira AbortError;
  // qualquer outro erro do transporte é bug e propaga sem repetir.
  const send = async (request: TransportRequest): Promise<TransportResponse | null> => {
    try {
      return await raceAbort(transport(request), signal);
    } catch (error) {
      if (signal?.aborted || hasName(error, 'AbortError')) throw abortError();
      if (hasName(error, 'TypeError')) return null;
      throw error;
    }
  };

  // Registra uma falha: esgotadas as tentativas desiste; senão espera o backoff (abortável)
  // e marca que a próxima requisição é a consulta de status.
  const registerFailure = async (status: number) => {
    failures += 1;
    if (failures >= MAX_CONSECUTIVE_FAILURES) {
      throw new FatalUploadError(
        `Não foi possível concluir o envio depois de ${MAX_CONSECUTIVE_FAILURES} tentativas.`,
        status,
      );
    }
    await raceAbort(sleep(backoffDelay(failures), signal), signal);
    needStatusQuery = true;
  };

  for (;;) {
    throwIfAborted(signal);
    if (isOnline() === false) await raceAbort(waitForOnline(signal), signal);

    const isStatusQuery = needStatusQuery;
    const previousOffset = offset;
    let request: TransportRequest;
    if (isStatusQuery) {
      request = { method: 'PUT', url: uploadUrl, headers: { 'Content-Range': `bytes */${total}` }, signal };
    } else {
      const end = Math.min(offset + chunkSize, total);
      const chunkLength = end - offset;
      request = {
        method: 'PUT',
        url: uploadUrl,
        headers: { 'Content-Range': `bytes ${offset}-${end - 1}/${total}` },
        body: file.slice(offset, end),
        signal,
        onProgress: (loaded) => report(previousOffset + Math.min(loaded, chunkLength)),
      };
    }

    const response = await send(request);
    const outcome: Outcome = response === null ? { kind: 'retry', status: 0 } : interpret(response, total);

    if (outcome.kind === 'done') {
      report(total);
      return { fileId: outcome.fileId };
    }

    if (outcome.kind === 'retry') {
      await registerFailure(outcome.status);
      continue;
    }

    // 308: o Google diz até onde guardou. É a única fonte de offset.
    offset = outcome.offset;
    report(offset);
    if (offset > previousOffset) {
      failures = 0;
      needStatusQuery = false;
    } else if (isStatusQuery) {
      // Consulta de status sem novidade: a falha que a motivou já foi contada; reenvia.
      needStatusQuery = false;
    } else {
      // O chunk foi enviado e nada foi guardado: conta como falha (evita laço infinito).
      await registerFailure(308);
    }
  }
}
