import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  uploadFile,
  xhrTransport,
  SessionExpiredError,
  FatalUploadError,
  DEFAULT_CHUNK_SIZE,
  DEFAULT_STALL_TIMEOUT_MS,
  type Transport,
  type TransportRequest,
  type TransportResponse,
} from './driveResumableUpload';

const ALIGN = 256 * 1024; // 262144: múltiplo exigido pelo Google para todo chunk que não seja o último
const SESSION_URL = 'https://upload.test/session-secret-abc';

// ---------------------------------------------------------------------------
// Ajudantes
// ---------------------------------------------------------------------------

function makeFile(size: number): File {
  return new File([new Uint8Array(size)], 'video.mp4', { type: 'video/mp4' });
}

const complete = (id = 'drive-file-id', status = 200): TransportResponse => ({
  status,
  headers: {},
  body: JSON.stringify({ id, name: 'video.mp4' }),
});

/** 308 do Google: `lastByte` é o último byte guardado; sem ele, nada foi guardado. */
const incomplete = (lastByte?: number): TransportResponse => ({
  status: 308,
  headers: lastByte === undefined ? {} : { range: `bytes=0-${lastByte}` },
  body: '',
});

const httpStatus = (status: number, body = ''): TransportResponse => ({ status, headers: {}, body });

const networkDown = (): never => {
  throw new TypeError('Failed to fetch');
};

type Step = (req: TransportRequest) => TransportResponse | Promise<TransportResponse>;

/** Transporte falso roteirizado: a N-ésima requisição executa o N-ésimo passo. */
function scripted(steps: Step[]) {
  const requests: TransportRequest[] = [];
  const transport: Transport = async (req) => {
    const step = steps[requests.length];
    requests.push(req);
    if (!step) throw new Error(`requisição inesperada #${requests.length}`);
    return step(req);
  };
  return { transport, requests };
}

/** `sleep` instantâneo que registra os atrasos pedidos. */
function instantSleep() {
  const delays: number[] = [];
  const sleep = async (ms: number) => {
    delays.push(ms);
  };
  return { sleep, delays };
}

const contentRange = (req: TransportRequest) => req.headers['Content-Range'];

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('esperava uma rejeição, mas a promessa resolveu');
}

async function expectAbort(promise: Promise<unknown>) {
  const error = (await rejectionOf(promise)) as { name?: string };
  expect(error.name).toBe('AbortError');
}

function parseContentRange(value: string | undefined) {
  const query = /^bytes \*\/(\d+)$/.exec(value ?? '');
  if (query) return { kind: 'query' as const, total: Number(query[1]) };
  const chunk = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(value ?? '');
  if (!chunk) throw new Error(`Content-Range inválido: ${value}`);
  return { kind: 'chunk' as const, start: Number(chunk[1]), end: Number(chunk[2]) + 1, total: Number(chunk[3]) };
}

type Fault = 'network' | 'network-after-partial' | 503;

/**
 * Google falso com o comportamento verificado no spike: só guarda em múltiplos de 256 KiB,
 * pode guardar MAIS do que o chunk enviado quando a requisição cai no meio, responde 308 +
 * `range` enquanto incompleto e 200 + JSON quando completo. Registra tudo o que o cliente
 * fizer de errado em `violations`.
 */
class FakeGoogle {
  stored = 0;
  completed = false;
  readonly requests: TransportRequest[] = [];
  readonly violations: string[] = [];

  constructor(
    readonly total: number,
    private readonly faults: Record<number, Fault> = {},
    readonly fileId = 'drive-file-id',
  ) {}

  private statusResponse(): TransportResponse {
    if (this.completed) return complete(this.fileId);
    return incomplete(this.stored === 0 ? undefined : this.stored - 1);
  }

  readonly transport: Transport = async (req) => {
    const index = this.requests.length;
    this.requests.push(req);
    const fault = this.faults[index];
    const parsed = parseContentRange(contentRange(req));

    if (req.headers && Object.keys(req.headers).some((name) => name !== 'Content-Range')) {
      this.violations.push(`#${index}: cabeçalho extra ${Object.keys(req.headers).join(',')}`);
    }
    if (parsed.total !== this.total) this.violations.push(`#${index}: total ${parsed.total}`);

    if (parsed.kind === 'query') {
      if (req.body) this.violations.push(`#${index}: consulta de status com corpo`);
      if (fault === 'network') return networkDown();
      if (fault === 503) return httpStatus(503);
      return this.statusResponse();
    }

    const length = parsed.end - parsed.start;
    if (parsed.start !== this.stored) {
      this.violations.push(`#${index}: chunk começou em ${parsed.start}, Google guardou ${this.stored}`);
    }
    if (req.body?.size !== length) this.violations.push(`#${index}: corpo de ${req.body?.size} bytes para ${length}`);
    if (parsed.end !== this.total && length % ALIGN !== 0) {
      this.violations.push(`#${index}: chunk intermediário de ${length} bytes não é múltiplo de 256 KiB`);
    }

    if (fault === 'network-after-partial') {
      // A requisição cai no meio, mas o Google já gravou parte dos bytes (alinhado a 256 KiB).
      const partial = Math.floor((parsed.start + length * 0.75) / ALIGN) * ALIGN;
      this.stored = Math.max(this.stored, partial);
      return networkDown();
    }
    if (fault === 'network') return networkDown();
    if (fault === 503) return httpStatus(503);

    this.stored = parsed.end;
    if (this.stored === this.total) this.completed = true;
    return this.statusResponse();
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// uploadFile: envio e chunks
// ---------------------------------------------------------------------------

describe('uploadFile: envio', () => {
  it('envia um arquivo pequeno num único PUT e devolve o id', async () => {
    const file = makeFile(1000);
    const { transport, requests } = scripted([() => complete('abc')]);

    const result = await uploadFile({ uploadUrl: SESSION_URL, file, transport });

    expect(result).toEqual({ fileId: 'abc' });
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe('PUT');
    expect(requests[0].url).toBe(SESSION_URL);
    // Só Content-Range: nada de Authorization nem Content-Type (a fatia não tem tipo).
    expect(requests[0].headers).toEqual({ 'Content-Range': 'bytes 0-999/1000' });
    expect(requests[0].body?.size).toBe(1000);
  });

  it('aceita 201 como conclusão', async () => {
    const { transport } = scripted([() => complete('novo', 201)]);
    await expect(uploadFile({ uploadUrl: SESSION_URL, file: makeFile(10), transport })).resolves.toEqual({
      fileId: 'novo',
    });
  });

  it('envia vários chunks com Content-Range correto, todos múltiplos de 256 KiB menos o último', async () => {
    const total = 3 * ALIGN + 1000;
    const google = new FakeGoogle(total);

    const result = await uploadFile({
      uploadUrl: SESSION_URL,
      file: makeFile(total),
      transport: google.transport,
      chunkSize: ALIGN,
    });

    expect(result).toEqual({ fileId: 'drive-file-id' });
    expect(google.requests.map(contentRange)).toEqual([
      `bytes 0-${ALIGN - 1}/${total}`,
      `bytes ${ALIGN}-${2 * ALIGN - 1}/${total}`,
      `bytes ${2 * ALIGN}-${3 * ALIGN - 1}/${total}`,
      `bytes ${3 * ALIGN}-${total - 1}/${total}`,
    ]);
    expect(google.requests.map((r) => r.body?.size)).toEqual([ALIGN, ALIGN, ALIGN, 1000]);
    expect(google.violations).toEqual([]);
  });

  it('usa 8 MiB por padrão', async () => {
    expect(DEFAULT_CHUNK_SIZE).toBe(8 * 1024 * 1024);
    const total = 9 * 1024 * 1024;
    const { transport, requests } = scripted([() => incomplete(DEFAULT_CHUNK_SIZE - 1), () => complete()]);

    await uploadFile({ uploadUrl: SESSION_URL, file: makeFile(total), transport });

    expect(requests.map(contentRange)).toEqual([
      `bytes 0-${DEFAULT_CHUNK_SIZE - 1}/${total}`,
      `bytes ${DEFAULT_CHUNK_SIZE}-${total - 1}/${total}`,
    ]);
  });

  it.each([
    ['abaixo do mínimo', 100, ALIGN],
    ['zero', 0, ALIGN],
    ['negativo', -5, ALIGN],
    ['exatamente 256 KiB', ALIGN, ALIGN],
    ['não múltiplo, arredonda para baixo', 300000, ALIGN],
    ['múltiplo maior', 3 * ALIGN, 3 * ALIGN],
    ['quase o próximo múltiplo', 3 * ALIGN - 1, 2 * ALIGN],
  ])('chunkSize %s (%d) vira %d', async (_label, provided, expected) => {
    const total = 4 * ALIGN;
    const { transport, requests } = scripted([() => complete()]);

    await uploadFile({ uploadUrl: SESSION_URL, file: makeFile(total), transport, chunkSize: provided });

    expect(contentRange(requests[0])).toBe(`bytes 0-${expected - 1}/${total}`);
    expect(requests[0].body?.size).toBe(expected);
  });

  it('lê o arquivo fatia a fatia: nunca há um slice do arquivo inteiro', async () => {
    const total = 3 * ALIGN + 1000;
    const file = makeFile(total);
    const slice = vi.spyOn(file, 'slice');
    const google = new FakeGoogle(total);

    await uploadFile({ uploadUrl: SESSION_URL, file, transport: google.transport, chunkSize: ALIGN });

    expect(slice.mock.calls).toEqual([
      [0, ALIGN],
      [ALIGN, 2 * ALIGN],
      [2 * ALIGN, 3 * ALIGN],
      [3 * ALIGN, total],
    ]);
    for (const [start, end] of slice.mock.calls) {
      expect((end as number) - (start as number)).toBeLessThan(total);
    }
    // O corpo de cada requisição é exatamente o que `slice` devolveu.
    slice.mock.results.forEach((result, index) => {
      expect(google.requests[index].body).toBe(result.value);
    });
  });

  it('entrega ao transporte um signal próprio da requisição, ligado ao signal do chamador', async () => {
    const controller = new AbortController();
    let seen: AbortSignal | undefined;
    const transport: Transport = (req) => {
      seen = req.signal;
      return new Promise((_resolve, reject) => {
        req.signal?.addEventListener('abort', () => reject(new DOMException('cancelado', 'AbortError')));
      });
    };

    const promise = uploadFile({ uploadUrl: SESSION_URL, file: makeFile(10), transport, signal: controller.signal });
    await Promise.resolve();

    expect(seen).toBeDefined();
    expect(seen).not.toBe(controller.signal); // o watchdog precisa poder abortar só esta requisição
    expect(seen?.aborted).toBe(false);
    controller.abort();
    expect(seen?.aborted).toBe(true);
    await expectAbort(promise);
  });

  it('depois de terminar, abortar o signal do chamador não mexe mais no signal da requisição', async () => {
    const controller = new AbortController();
    let seen: AbortSignal | undefined;
    const { transport } = scripted([
      (req) => {
        seen = req.signal;
        return complete();
      },
    ]);

    await uploadFile({ uploadUrl: SESSION_URL, file: makeFile(10), transport, signal: controller.signal });
    controller.abort();

    expect(seen).toBeDefined();
    expect(seen?.aborted).toBe(false); // o listener de ligação foi removido
  });
});

// ---------------------------------------------------------------------------
// uploadFile: offsets vêm sempre do Google
// ---------------------------------------------------------------------------

describe('uploadFile: retomada a partir do que o Google confirma', () => {
  it('quando o 308 indica menos do que foi enviado, retoma dali', async () => {
    const total = 4 * ALIGN;
    const { transport, requests } = scripted([
      () => incomplete(ALIGN - 1), // enviamos 2 * ALIGN, Google guardou só ALIGN
      () => complete(),
    ]);

    await uploadFile({ uploadUrl: SESSION_URL, file: makeFile(total), transport, chunkSize: 2 * ALIGN });

    expect(requests.map(contentRange)).toEqual([
      `bytes 0-${2 * ALIGN - 1}/${total}`,
      `bytes ${ALIGN}-${3 * ALIGN - 1}/${total}`,
    ]);
  });

  it('308 sem header range significa que nada foi guardado: recomeça do zero', async () => {
    const total = 2 * ALIGN;
    const { transport, requests } = scripted([() => incomplete(), () => incomplete(), () => complete()]);
    const { sleep } = instantSleep();

    await uploadFile({ uploadUrl: SESSION_URL, file: makeFile(total), transport, chunkSize: ALIGN, sleep });

    // O primeiro chunk é reenviado porque o Google não guardou nada. Como não houve progresso,
    // a tentativa conta como falha e é seguida da consulta de status.
    expect(requests.map(contentRange)).toEqual([
      `bytes 0-${ALIGN - 1}/${total}`,
      `bytes */${total}`,
      `bytes 0-${ALIGN - 1}/${total}`,
    ]);
  });

  it('retoma de um offset ímpar guardado pelo Google e mantém os chunks múltiplos de 256 KiB', async () => {
    const total = 3 * ALIGN;
    const stored = 300000; // não é múltiplo de 256 KiB
    const { transport, requests } = scripted([
      () => incomplete(stored - 1),
      () => incomplete(stored + ALIGN - 1),
      () => complete(),
    ]);

    await uploadFile({ uploadUrl: SESSION_URL, file: makeFile(total), transport, chunkSize: ALIGN });

    expect(requests.map(contentRange)).toEqual([
      `bytes 0-${ALIGN - 1}/${total}`,
      `bytes ${stored}-${stored + ALIGN - 1}/${total}`,
      `bytes ${stored + ALIGN}-${total - 1}/${total}`,
    ]);
    // Os dois primeiros têm exatamente 256 KiB; só o último é mais curto.
    expect(requests.map((r) => r.body?.size)).toEqual([ALIGN, ALIGN, total - stored - ALIGN]);
  });

  it('erro de rede: espera o backoff, faz a consulta de status e retoma do offset devolvido', async () => {
    const total = 3 * ALIGN;
    const { transport, requests } = scripted([
      networkDown, // o chunk 0..ALIGN cai
      () => incomplete(ALIGN - 1), // consulta de status: o Google tinha guardado ALIGN
      () => complete(), // chunk seguinte a partir de ALIGN
    ]);
    const { sleep, delays } = instantSleep();

    await uploadFile({ uploadUrl: SESSION_URL, file: makeFile(total), transport, chunkSize: 2 * ALIGN, sleep });

    expect(delays).toEqual([1000]);
    expect(requests.map(contentRange)).toEqual([
      `bytes 0-${2 * ALIGN - 1}/${total}`,
      `bytes */${total}`,
      `bytes ${ALIGN}-${total - 1}/${total}`,
    ]);
    // A consulta de status é um PUT vazio, sem corpo e sem outros cabeçalhos.
    expect(requests[1].method).toBe('PUT');
    expect(requests[1].body ?? null).toBeNull();
    expect(requests[1].headers).toEqual({ 'Content-Range': `bytes */${total}` });
  });

  it('o Google pode ter guardado MAIS do que o chunk enviado: usa o offset dele, não o contador local', async () => {
    const total = 6 * ALIGN;
    const { transport, requests } = scripted([
      networkDown, // enviamos 0..2*ALIGN e a requisição caiu
      () => incomplete(4 * ALIGN - 1), // mas o Google guardou 4 * ALIGN
      () => complete(),
    ]);
    const { sleep } = instantSleep();

    await uploadFile({ uploadUrl: SESSION_URL, file: makeFile(total), transport, chunkSize: 2 * ALIGN, sleep });

    expect(contentRange(requests[2])).toBe(`bytes ${4 * ALIGN}-${total - 1}/${total}`);
  });

  it('consulta de status que devolve 200 com o corpo: já estava concluído, não reenvia nada', async () => {
    const total = 2 * ALIGN;
    const { transport, requests } = scripted([networkDown, () => complete('ja-concluido', 201)]);
    const { sleep } = instantSleep();

    const result = await uploadFile({ uploadUrl: SESSION_URL, file: makeFile(total), transport, chunkSize: 2 * ALIGN, sleep });

    expect(result).toEqual({ fileId: 'ja-concluido' });
    expect(requests).toHaveLength(2);
    expect(contentRange(requests[1])).toBe(`bytes */${total}`);
  });

  it.each([
    ['503', () => httpStatus(503)],
    ['500', () => httpStatus(500)],
    ['429', () => httpStatus(429)],
  ])('%s também aciona backoff e consulta de status', async (_label, failure) => {
    const total = 2 * ALIGN;
    const { transport, requests } = scripted([failure, () => incomplete(), () => complete()]);
    const { sleep, delays } = instantSleep();

    await uploadFile({ uploadUrl: SESSION_URL, file: makeFile(total), transport, chunkSize: 2 * ALIGN, sleep });

    expect(delays).toEqual([1000]);
    expect(requests.map(contentRange)).toEqual([
      `bytes 0-${total - 1}/${total}`,
      `bytes */${total}`,
      `bytes 0-${total - 1}/${total}`,
    ]);
  });

  it('nunca inicia um chunk fora do offset guardado pelo Google, com falhas e escritas parciais', async () => {
    const total = 10 * ALIGN + 4321;
    const google = new FakeGoogle(total, {
      1: 'network-after-partial',
      2: 'network', // a própria consulta de status falha
      3: 503,
      6: 'network-after-partial',
      9: 503,
    });
    const { sleep } = instantSleep();

    const result = await uploadFile({
      uploadUrl: SESSION_URL,
      file: makeFile(total),
      transport: google.transport,
      chunkSize: 2 * ALIGN,
      sleep,
    });

    expect(result).toEqual({ fileId: 'drive-file-id' });
    expect(google.completed).toBe(true);
    expect(google.violations).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// uploadFile: política de tentativas
// ---------------------------------------------------------------------------

describe('uploadFile: tentativas e backoff', () => {
  it('503 persistente esgota 8 tentativas consecutivas e falha com FatalUploadError', async () => {
    const total = 2 * ALIGN;
    let chunkAttempts = 0;
    let statusQueries = 0;
    const transport: Transport = async (req) => {
      if (contentRange(req).startsWith('bytes */')) {
        statusQueries += 1;
        return incomplete(); // o status funciona: só o envio do chunk falha
      }
      chunkAttempts += 1;
      return httpStatus(503);
    };
    const { sleep, delays } = instantSleep();

    const error = await rejectionOf(
      uploadFile({ uploadUrl: SESSION_URL, file: makeFile(total), transport, chunkSize: ALIGN, sleep }),
    );

    expect(error).toBeInstanceOf(FatalUploadError);
    expect((error as FatalUploadError).status).toBe(503);
    expect(chunkAttempts).toBe(8);
    expect(statusQueries).toBe(7);
    // 1 s, 2 s, 4 s, 8 s, 16 s e depois o teto de 30 s.
    expect(delays).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000]);
  });

  it('as tentativas contam falhas de qualquer requisição, inclusive da consulta de status', async () => {
    let calls = 0;
    const transport: Transport = async () => {
      calls += 1;
      return httpStatus(503);
    };
    const { sleep } = instantSleep();

    const error = await rejectionOf(
      uploadFile({ uploadUrl: SESSION_URL, file: makeFile(ALIGN), transport, sleep }),
    );

    expect(error).toBeInstanceOf(FatalUploadError);
    expect(calls).toBe(8);
  });

  it('esgotar as tentativas por falha de rede devolve FatalUploadError com status 0', async () => {
    const transport: Transport = async () => networkDown();
    const { sleep } = instantSleep();

    const error = await rejectionOf(uploadFile({ uploadUrl: SESSION_URL, file: makeFile(10), transport, sleep }));

    expect(error).toBeInstanceOf(FatalUploadError);
    expect((error as FatalUploadError).status).toBe(0);
  });

  it('o contador de falhas zera depois de qualquer progresso', async () => {
    // 3 chunks. Antes de cada chunk avançar há 7 falhas seguidas: 7 + 7 + 7 > 8 no total,
    // mas nunca 8 consecutivas.
    const total = 3 * ALIGN;
    const steps: Step[] = [];
    for (let chunk = 0; chunk < 3; chunk += 1) {
      for (let failure = 0; failure < 7; failure += 1) {
        steps.push(() => httpStatus(503)); // chunk falha
        if (failure < 6) steps.push(() => incomplete(chunk === 0 ? undefined : chunk * ALIGN - 1)); // status sem progresso
      }
      // Última falha: o status seguinte mostra que o chunk foi guardado apesar do erro (progresso).
      steps.push(() => (chunk === 2 ? complete() : incomplete((chunk + 1) * ALIGN - 1)));
    }
    const { transport, requests } = scripted(steps);
    const { sleep, delays } = instantSleep();

    const result = await uploadFile({ uploadUrl: SESSION_URL, file: makeFile(total), transport, chunkSize: ALIGN, sleep });

    expect(result).toEqual({ fileId: 'drive-file-id' });
    expect(requests).toHaveLength(steps.length);
    // O backoff recomeça em 1 s a cada vez que o contador zera.
    const backoff = [1000, 2000, 4000, 8000, 16000, 30000, 30000];
    expect(delays).toEqual([...backoff, ...backoff, ...backoff]);
  });

  it('um 308 com progresso zera o contador', async () => {
    const total = 2 * ALIGN;
    const steps: Step[] = [];
    for (let i = 0; i < 7; i += 1) {
      steps.push(networkDown);
      steps.push(() => incomplete()); // status: nada guardado
    }
    steps.push(() => incomplete(ALIGN - 1)); // 8º envio: progresso real (308 com range maior)
    for (let i = 0; i < 7; i += 1) {
      steps.push(networkDown);
      steps.push(() => incomplete(ALIGN - 1));
    }
    steps.push(() => complete());
    const { transport } = scripted(steps);
    const { sleep } = instantSleep();

    const result = await uploadFile({ uploadUrl: SESSION_URL, file: makeFile(total), transport, chunkSize: ALIGN, sleep });

    expect(result).toEqual({ fileId: 'drive-file-id' });
  });

  it('um 308 que não avança o offset conta como falha e não trava num laço infinito', async () => {
    let chunkAttempts = 0;
    const transport: Transport = async (req) => {
      if (contentRange(req).startsWith('bytes */')) return incomplete();
      chunkAttempts += 1;
      if (chunkAttempts > 100) throw new Error('laço infinito: o motor não desiste de um Google que não guarda nada');
      return incomplete(); // Google nunca guarda nada
    };
    const { sleep } = instantSleep();

    const error = await rejectionOf(uploadFile({ uploadUrl: SESSION_URL, file: makeFile(2 * ALIGN), transport, chunkSize: ALIGN, sleep }));

    expect(error).toBeInstanceOf(FatalUploadError);
    expect(chunkAttempts).toBe(8);
  });

  it('um erro que não é de rede lançado pelo transporte não é repetido', async () => {
    const { transport, requests } = scripted([
      () => {
        throw new RangeError('bug no transporte');
      },
    ]);
    const { sleep, delays } = instantSleep();

    const error = await rejectionOf(uploadFile({ uploadUrl: SESSION_URL, file: makeFile(10), transport, sleep }));

    expect(error).toBeInstanceOf(RangeError);
    expect(requests).toHaveLength(1);
    expect(delays).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// uploadFile: conexão (online/offline)
// ---------------------------------------------------------------------------

describe('uploadFile: conexão', () => {
  it('offline: espera a conexão voltar antes da consulta de status', async () => {
    const order: string[] = [];
    const total = 2 * ALIGN;
    const { transport } = scripted([
      () => {
        order.push('chunk');
        return networkDown();
      },
      () => {
        order.push('status');
        return incomplete();
      },
      () => {
        order.push('chunk');
        return complete();
      },
    ]);
    let online = true;
    const isOnline = vi.fn(() => online);
    const waitForOnline = vi.fn(async () => {
      order.push('online');
      online = true;
    });
    const sleep = async () => {
      order.push('sleep');
      online = false; // a conexão caiu durante a espera
    };

    await uploadFile({ uploadUrl: SESSION_URL, file: makeFile(total), transport, chunkSize: 2 * ALIGN, sleep, isOnline, waitForOnline });

    expect(order).toEqual(['chunk', 'sleep', 'online', 'status', 'chunk']);
    expect(waitForOnline).toHaveBeenCalledTimes(1);
  });

  it('offline desde o início: só envia depois de a conexão voltar', async () => {
    const order: string[] = [];
    const { transport } = scripted([
      () => {
        order.push('chunk');
        return complete();
      },
    ]);
    const waitForOnline = vi.fn(async () => {
      order.push('online');
    });

    await uploadFile({ uploadUrl: SESSION_URL, file: makeFile(10), transport, isOnline: () => false, waitForOnline });

    expect(order).toEqual(['online', 'chunk']);
  });

  it('online: não chama waitForOnline', async () => {
    const waitForOnline = vi.fn(async () => {});
    const { transport } = scripted([() => complete()]);

    await uploadFile({ uploadUrl: SESSION_URL, file: makeFile(10), transport, isOnline: () => true, waitForOnline });

    expect(waitForOnline).not.toHaveBeenCalled();
  });

  it('por padrão usa navigator.onLine e o evento "online" da janela', async () => {
    const onLine = vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    const { transport, requests } = scripted([() => complete('voltou')]);

    const promise = uploadFile({ uploadUrl: SESSION_URL, file: makeFile(10), transport });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(requests).toHaveLength(0); // ainda offline: nada foi enviado

    onLine.mockReturnValue(true);
    window.dispatchEvent(new Event('online'));

    await expect(promise).resolves.toEqual({ fileId: 'voltou' });
    expect(requests).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// uploadFile: erros definitivos
// ---------------------------------------------------------------------------

describe('uploadFile: erros', () => {
  it.each([404, 410])('%d vira SessionExpiredError, sem tentar de novo', async (status) => {
    const { transport, requests } = scripted([() => httpStatus(status)]);
    const { sleep, delays } = instantSleep();

    const error = await rejectionOf(uploadFile({ uploadUrl: SESSION_URL, file: makeFile(10), transport, sleep }));

    expect(error).toBeInstanceOf(SessionExpiredError);
    expect(requests).toHaveLength(1);
    expect(delays).toEqual([]);
  });

  it('404 na consulta de status também expira a sessão', async () => {
    const { transport } = scripted([networkDown, () => httpStatus(404)]);
    const { sleep } = instantSleep();

    const error = await rejectionOf(uploadFile({ uploadUrl: SESSION_URL, file: makeFile(10), transport, sleep }));

    expect(error).toBeInstanceOf(SessionExpiredError);
  });

  it.each([400, 401, 403, 405, 413, 416])('%d vira FatalUploadError com o status, sem tentar de novo', async (status) => {
    const { transport, requests } = scripted([() => httpStatus(status)]);
    const { sleep } = instantSleep();

    const error = await rejectionOf(uploadFile({ uploadUrl: SESSION_URL, file: makeFile(10), transport, sleep }));

    expect(error).toBeInstanceOf(FatalUploadError);
    expect((error as FatalUploadError).status).toBe(status);
    expect(requests).toHaveLength(1);
  });

  it('SessionExpiredError e FatalUploadError são classes distintas de Error', () => {
    expect(new SessionExpiredError()).toBeInstanceOf(Error);
    expect(new SessionExpiredError()).not.toBeInstanceOf(FatalUploadError);
    expect(new FatalUploadError('x', 400)).toBeInstanceOf(Error);
    expect(new FatalUploadError('x', 400).status).toBe(400);
  });

  it('status inesperado (por exemplo 202) é definitivo', async () => {
    const { transport } = scripted([() => httpStatus(202)]);
    const error = await rejectionOf(uploadFile({ uploadUrl: SESSION_URL, file: makeFile(10), transport }));
    expect(error).toBeInstanceOf(FatalUploadError);
    expect((error as FatalUploadError).status).toBe(202);
  });

  it.each([
    ['corpo vazio', ''],
    ['JSON inválido', '<html>ops</html>'],
    ['JSON sem id', JSON.stringify({ name: 'video.mp4' })],
    ['id que não é texto', JSON.stringify({ id: 42 })],
    ['id vazio', JSON.stringify({ id: '' })],
    ['JSON que não é objeto', JSON.stringify(null)],
  ])('resposta final sem id legível (%s) vira FatalUploadError', async (_label, body) => {
    const { transport } = scripted([() => ({ status: 200, headers: {}, body })]);

    const error = await rejectionOf(uploadFile({ uploadUrl: SESSION_URL, file: makeFile(10), transport }));

    expect(error).toBeInstanceOf(FatalUploadError);
  });

  it('resposta final sem id na consulta de status também é definitiva', async () => {
    const { transport } = scripted([networkDown, () => ({ status: 200, headers: {}, body: '{}' })]);
    const { sleep } = instantSleep();

    const error = await rejectionOf(uploadFile({ uploadUrl: SESSION_URL, file: makeFile(10), transport, sleep }));

    expect(error).toBeInstanceOf(FatalUploadError);
  });

  it('arquivo vazio vira FatalUploadError e nada é enviado', async () => {
    const { transport, requests } = scripted([() => complete()]);

    const error = await rejectionOf(uploadFile({ uploadUrl: SESSION_URL, file: makeFile(0), transport }));

    expect(error).toBeInstanceOf(FatalUploadError);
    expect(requests).toHaveLength(0);
  });

  it.each([
    ['header range malformado', { range: 'bytes=abc' }],
    ['range vazio', { range: '' }],
  ])('308 com %s é definitivo', async (_label, headers) => {
    const { transport } = scripted([() => ({ status: 308, headers, body: '' })]);
    const error = await rejectionOf(uploadFile({ uploadUrl: SESSION_URL, file: makeFile(2 * ALIGN), transport, chunkSize: ALIGN }));
    expect(error).toBeInstanceOf(FatalUploadError);
  });

  it('308 que diz que o arquivo inteiro foi guardado, sem finalizar, é definitivo', async () => {
    const total = 2 * ALIGN;
    const { transport } = scripted([() => incomplete(total - 1)]);
    const error = await rejectionOf(uploadFile({ uploadUrl: SESSION_URL, file: makeFile(total), transport, chunkSize: ALIGN }));
    expect(error).toBeInstanceOf(FatalUploadError);
  });

  it('as mensagens de erro não contêm a URL da sessão', async () => {
    const cases: Step[][] = [
      [() => httpStatus(404)],
      [() => httpStatus(403)],
      [() => ({ status: 200, headers: {}, body: '{}' })],
    ];
    for (const steps of cases) {
      const { transport } = scripted(steps);
      const error = (await rejectionOf(uploadFile({ uploadUrl: SESSION_URL, file: makeFile(10), transport }))) as Error;
      expect(error.message).not.toContain('session-secret-abc');
      expect(error.message).not.toContain('upload.test');
    }
  });
});

// ---------------------------------------------------------------------------
// uploadFile: cancelamento
// ---------------------------------------------------------------------------

describe('uploadFile: cancelamento', () => {
  it('signal já abortado: rejeita com AbortError sem enviar nada', async () => {
    const controller = new AbortController();
    controller.abort();
    const { transport, requests } = scripted([() => complete()]);

    await expectAbort(uploadFile({ uploadUrl: SESSION_URL, file: makeFile(10), transport, signal: controller.signal }));

    expect(requests).toHaveLength(0);
  });

  it('abort durante a requisição (transporte respeita o signal)', async () => {
    const controller = new AbortController();
    const transport: Transport = (req) =>
      new Promise((_resolve, reject) => {
        req.signal?.addEventListener('abort', () => reject(new DOMException('cancelado', 'AbortError')));
      });

    const promise = uploadFile({ uploadUrl: SESSION_URL, file: makeFile(10), transport, signal: controller.signal });
    await Promise.resolve();
    controller.abort();

    await expectAbort(promise);
  });

  it('abort durante a requisição mesmo que o transporte ignore o signal', async () => {
    const controller = new AbortController();
    const transport: Transport = () => new Promise(() => {});

    const promise = uploadFile({ uploadUrl: SESSION_URL, file: makeFile(10), transport, signal: controller.signal });
    await Promise.resolve();
    controller.abort();

    await expectAbort(promise);
  });

  it('abort durante o backoff rejeita na hora, sem esperar o sleep e sem nova requisição', async () => {
    const controller = new AbortController();
    const { transport, requests } = scripted([networkDown, () => incomplete()]);
    let sleepStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      sleepStarted = resolve;
    });
    const sleep = () => {
      sleepStarted();
      return new Promise<void>(() => {}); // nunca resolve
    };

    const promise = uploadFile({ uploadUrl: SESSION_URL, file: makeFile(10), transport, sleep, signal: controller.signal });
    await started;
    controller.abort();

    await expectAbort(promise);
    expect(requests).toHaveLength(1);
  });

  it('o sleep padrão também é abortável e limpa o temporizador', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const { transport, requests } = scripted([networkDown, () => incomplete()]);

    const outcome = expectAbort(uploadFile({ uploadUrl: SESSION_URL, file: makeFile(10), transport, signal: controller.signal }));
    await vi.advanceTimersByTimeAsync(10); // bem antes do backoff de 1 s
    expect(requests).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(1);

    controller.abort();

    await outcome;
    expect(vi.getTimerCount()).toBe(0);
    expect(requests).toHaveLength(1);
  });

  it('o sleep padrão espera de fato o tempo do backoff', async () => {
    vi.useFakeTimers();
    const { transport, requests } = scripted([networkDown, () => incomplete(), () => complete()]);

    const promise = uploadFile({ uploadUrl: SESSION_URL, file: makeFile(10), transport });
    await vi.advanceTimersByTimeAsync(999);
    expect(requests).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect(promise).resolves.toEqual({ fileId: 'drive-file-id' });
    expect(requests).toHaveLength(3);
  });

  it('abort enquanto espera a conexão voltar', async () => {
    const controller = new AbortController();
    const { transport, requests } = scripted([() => complete()]);

    const promise = uploadFile({
      uploadUrl: SESSION_URL,
      file: makeFile(10),
      transport,
      signal: controller.signal,
      isOnline: () => false,
      waitForOnline: () => new Promise<void>(() => {}),
    });
    await Promise.resolve();
    controller.abort();

    await expectAbort(promise);
    expect(requests).toHaveLength(0);
  });

  it('abort depois de um chunk bem-sucedido impede o próximo', async () => {
    const controller = new AbortController();
    const total = 2 * ALIGN;
    const { transport, requests } = scripted([
      () => {
        controller.abort();
        return incomplete(ALIGN - 1);
      },
      () => complete(),
    ]);

    await expectAbort(
      uploadFile({ uploadUrl: SESSION_URL, file: makeFile(total), transport, chunkSize: ALIGN, signal: controller.signal }),
    );
    expect(requests).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// uploadFile: progresso
// ---------------------------------------------------------------------------

describe('uploadFile: onProgress', () => {
  it('soma bytes confirmados e progresso do chunk atual, de forma monotônica e sem passar do total', async () => {
    const total = 2 * ALIGN + 500;
    const { transport } = scripted([
      (req) => {
        req.onProgress?.(1000);
        req.onProgress?.(ALIGN);
        return incomplete(ALIGN - 1);
      },
      (req) => {
        req.onProgress?.(100_000);
        return incomplete(2 * ALIGN - 1);
      },
      (req) => {
        req.onProgress?.(500);
        return complete();
      },
    ]);
    const onProgress = vi.fn();

    await uploadFile({ uploadUrl: SESSION_URL, file: makeFile(total), transport, chunkSize: ALIGN, onProgress });

    expect(onProgress.mock.calls).toEqual([
      [1000, total],
      [ALIGN, total],
      [ALIGN + 100_000, total],
      [2 * ALIGN, total],
      [total, total],
    ]);
  });

  it('não regride quando o Google confirma menos do que o progresso já mostrado', async () => {
    const total = 4 * ALIGN;
    const { transport } = scripted([
      (req) => {
        req.onProgress?.(2 * ALIGN); // parecia que tudo tinha ido...
        return networkDown();
      },
      () => incomplete(ALIGN - 1), // ...mas o Google só guardou ALIGN
      (req) => {
        req.onProgress?.(100);
        req.onProgress?.(2 * ALIGN);
        return incomplete(3 * ALIGN - 1);
      },
      (req) => {
        req.onProgress?.(ALIGN);
        return complete();
      },
    ]);
    const { sleep } = instantSleep();
    const values: number[] = [];

    await uploadFile({
      uploadUrl: SESSION_URL,
      file: makeFile(total),
      transport,
      chunkSize: 2 * ALIGN,
      sleep,
      onProgress: (loaded, size) => {
        expect(size).toBe(total);
        values.push(loaded);
      },
    });

    expect(values.length).toBeGreaterThan(1);
    for (let i = 1; i < values.length; i += 1) expect(values[i]).toBeGreaterThan(values[i - 1]);
    expect(values.every((v) => v <= total)).toBe(true);
    expect(values[values.length - 1]).toBe(total);
  });

  it('limita o progresso do chunk ao tamanho dele e ao total', async () => {
    const total = ALIGN + 10;
    const { transport } = scripted([
      (req) => {
        req.onProgress?.(50 * ALIGN); // valor absurdo
        return incomplete(ALIGN - 1);
      },
      () => complete(),
    ]);
    const onProgress = vi.fn();

    await uploadFile({ uploadUrl: SESSION_URL, file: makeFile(total), transport, chunkSize: ALIGN, onProgress });

    expect(onProgress.mock.calls.every(([loaded]) => loaded <= total)).toBe(true);
    expect(onProgress.mock.calls[0]).toEqual([ALIGN, total]);
    expect(onProgress.mock.calls[onProgress.mock.calls.length - 1]).toEqual([total, total]);
  });

  it('funciona sem onProgress', async () => {
    const { transport } = scripted([() => complete()]);
    await expect(uploadFile({ uploadUrl: SESSION_URL, file: makeFile(10), transport })).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// xhrTransport
// ---------------------------------------------------------------------------

class FakeXHR {
  static instances: FakeXHR[] = [];

  upload: { onprogress: ((event: { loaded: number }) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;

  method = '';
  url = '';
  headers: Array<[string, string]> = [];
  sentBody: unknown = 'não enviado';
  aborted = false;
  status = 0;
  responseText = '';
  responseHeaders: Record<string, string> = {};

  constructor() {
    FakeXHR.instances.push(this);
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers.push([name, value]);
  }
  send(body?: unknown) {
    this.sentBody = body;
  }
  getResponseHeader(name: string) {
    return this.responseHeaders[name.toLowerCase()] ?? null;
  }
  abort() {
    this.aborted = true;
    this.onabort?.();
  }
  respond(status: number, body = '', headers: Record<string, string> = {}) {
    this.status = status;
    this.responseText = body;
    this.responseHeaders = headers;
    this.onload?.();
  }
}

describe('xhrTransport', () => {
  const install = () => {
    FakeXHR.instances = [];
    vi.stubGlobal('XMLHttpRequest', FakeXHR);
  };

  it('abre um PUT na URL da sessão, com só os cabeçalhos pedidos, e envia a fatia como corpo', async () => {
    install();
    const body = new Blob([new Uint8Array(10)]);

    const promise = xhrTransport({
      method: 'PUT',
      url: SESSION_URL,
      headers: { 'Content-Range': 'bytes 0-9/10' },
      body,
    });
    const xhr = FakeXHR.instances[0];
    xhr.respond(200, '{"id":"x"}');
    await promise;

    expect(xhr.method).toBe('PUT');
    expect(xhr.url).toBe(SESSION_URL);
    expect(xhr.headers).toEqual([['Content-Range', 'bytes 0-9/10']]); // sem Authorization nem Content-Type
    expect(xhr.sentBody).toBe(body);
  });

  it('sem corpo (consulta de status) envia null', async () => {
    install();

    const promise = xhrTransport({ method: 'PUT', url: SESSION_URL, headers: { 'Content-Range': 'bytes */10' } });
    FakeXHR.instances[0].respond(308);
    await promise;

    expect(FakeXHR.instances[0].sentBody).toBeNull();
  });

  it('devolve status, corpo e o header range em minúsculas', async () => {
    install();

    const promise = xhrTransport({ method: 'PUT', url: SESSION_URL, headers: {}, body: null });
    FakeXHR.instances[0].respond(308, '', { range: 'bytes=0-524287' });

    await expect(promise).resolves.toEqual({ status: 308, headers: { range: 'bytes=0-524287' }, body: '' });
  });

  it('sem header range, o mapa de headers não o contém', async () => {
    install();

    const promise = xhrTransport({ method: 'PUT', url: SESSION_URL, headers: {} });
    FakeXHR.instances[0].respond(200, '{"id":"abc"}');
    const response = await promise;

    expect(response.status).toBe(200);
    expect(response.body).toBe('{"id":"abc"}');
    expect(response.headers).toEqual({});
    expect('range' in response.headers).toBe(false);
  });

  it('repassa o progresso do envio (upload.onprogress) ao onProgress', async () => {
    install();
    const onProgress = vi.fn();

    const promise = xhrTransport({ method: 'PUT', url: SESSION_URL, headers: {}, body: new Blob(['x']), onProgress });
    const xhr = FakeXHR.instances[0];
    xhr.upload.onprogress?.({ loaded: 123 });
    xhr.upload.onprogress?.({ loaded: 456 });
    xhr.respond(308);
    await promise;

    expect(onProgress.mock.calls).toEqual([[123], [456]]);
  });

  it('funciona sem onProgress', async () => {
    install();
    const promise = xhrTransport({ method: 'PUT', url: SESSION_URL, headers: {} });
    const xhr = FakeXHR.instances[0];
    expect(() => xhr.upload.onprogress?.({ loaded: 1 })).not.toThrow();
    xhr.respond(200, '{}');
    await promise;
  });

  it('erro de rede (onerror) rejeita com TypeError', async () => {
    install();

    const promise = xhrTransport({ method: 'PUT', url: SESSION_URL, headers: {} });
    FakeXHR.instances[0].onerror?.();

    const error = await rejectionOf(promise);
    expect(error).toBeInstanceOf(TypeError);
    expect((error as Error).message).not.toContain('session-secret-abc');
  });

  it('abortar o signal aborta o XHR e rejeita com AbortError', async () => {
    install();
    const controller = new AbortController();

    const promise = xhrTransport({ method: 'PUT', url: SESSION_URL, headers: {}, signal: controller.signal });
    const xhr = FakeXHR.instances[0];
    controller.abort();

    await expectAbort(promise);
    expect(xhr.aborted).toBe(true);
  });

  it('signal já abortado: rejeita sem criar requisição', async () => {
    install();
    const controller = new AbortController();
    controller.abort();

    await expectAbort(xhrTransport({ method: 'PUT', url: SESSION_URL, headers: {}, signal: controller.signal }));

    expect(FakeXHR.instances).toHaveLength(0);
  });

  it('abortar o signal depois de a resposta chegar não faz nada', async () => {
    install();
    const controller = new AbortController();

    const promise = xhrTransport({ method: 'PUT', url: SESSION_URL, headers: {}, signal: controller.signal });
    const xhr = FakeXHR.instances[0];
    xhr.respond(200, '{}');
    await promise;
    controller.abort();

    expect(xhr.aborted).toBe(false);
  });
});

describe('uploadFile com o transporte XHR (padrão)', () => {
  it('usa xhrTransport quando nenhum transporte é passado e trata onerror como falha de rede repetível', async () => {
    FakeXHR.instances = [];
    vi.stubGlobal('XMLHttpRequest', FakeXHR);
    const { sleep } = instantSleep();

    const promise = uploadFile({ uploadUrl: SESSION_URL, file: makeFile(10), sleep });
    await vi.waitFor(() => expect(FakeXHR.instances).toHaveLength(1));
    FakeXHR.instances[0].onerror?.(); // cai a rede
    await vi.waitFor(() => expect(FakeXHR.instances).toHaveLength(2));
    expect(FakeXHR.instances[1].headers).toEqual([['Content-Range', 'bytes */10']]);
    FakeXHR.instances[1].respond(308);
    await vi.waitFor(() => expect(FakeXHR.instances).toHaveLength(3));
    FakeXHR.instances[2].respond(200, '{"id":"via-xhr"}');

    await expect(promise).resolves.toEqual({ fileId: 'via-xhr' });
  });
});

// ---------------------------------------------------------------------------
// uploadFile: watchdog de travamento
// ---------------------------------------------------------------------------

/** Requisição que nunca termina; com `honorAbort`, rejeita com AbortError quando o signal aborta (como o XHR). */
function hang(req: TransportRequest, honorAbort: boolean): Promise<TransportResponse> {
  return new Promise((_resolve, reject) => {
    if (honorAbort) req.signal?.addEventListener('abort', () => reject(new DOMException('cancelado', 'AbortError')));
  });
}

describe('uploadFile: watchdog de travamento', () => {
  const FILE = () => makeFile(1000);
  const CHUNK_RANGE = 'bytes 0-999/1000';
  const STATUS_RANGE = 'bytes */1000';

  it('o padrão é 60 s', () => {
    expect(DEFAULT_STALL_TIMEOUT_MS).toBe(60_000);
  });

  it('(a) sem progresso por 60 s: aborta o signal da requisição, espera o backoff de 1 s e consulta o status', async () => {
    vi.useFakeTimers();
    const signals: Array<AbortSignal | undefined> = [];
    const { transport, requests } = scripted([
      (req) => {
        signals.push(req.signal);
        req.onProgress?.(100); // enviou um pouco e a conexão morreu em silêncio
        return hang(req, true);
      },
      () => incomplete(), // consulta de status
      () => complete('recuperou'),
    ]);

    const promise = uploadFile({ uploadUrl: SESSION_URL, file: FILE(), transport });
    await vi.advanceTimersByTimeAsync(59_999);
    expect(signals[0]?.aborted).toBe(false);
    expect(requests).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(signals[0]?.aborted).toBe(true);
    expect(requests).toHaveLength(1); // em backoff

    await vi.advanceTimersByTimeAsync(999);
    expect(requests).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    // O backoff acabou: a próxima requisição é a consulta de status (e o motor segue em frente sozinho).
    expect(requests.length).toBeGreaterThanOrEqual(2);
    expect(contentRange(requests[1])).toBe(STATUS_RANGE);

    await expect(promise).resolves.toEqual({ fileId: 'recuperou' });
    expect(requests.map(contentRange)).toEqual([CHUNK_RANGE, STATUS_RANGE, CHUNK_RANGE]);
  });

  it('o travamento nunca aparece como AbortError para quem chamou: vira falha de rede', async () => {
    vi.useFakeTimers();
    const { transport } = scripted([(req) => hang(req, true), () => incomplete(), () => complete('ok')]);
    const { sleep, delays } = instantSleep();

    const promise = uploadFile({ uploadUrl: SESSION_URL, file: FILE(), transport, sleep });
    await vi.advanceTimersByTimeAsync(60_000);

    await expect(promise).resolves.toEqual({ fileId: 'ok' });
    expect(delays).toEqual([1000]);
  });

  it('(b) progresso a cada 59 s mantém o envio vivo por vários minutos, sem abortar nada', async () => {
    vi.useFakeTimers();
    const signals: Array<AbortSignal | undefined> = [];
    const transport: Transport = (req) =>
      new Promise((resolve) => {
        signals.push(req.signal);
        let ticks = 0;
        const tick = () => {
          ticks += 1;
          req.onProgress?.(ticks);
          if (ticks < 6) setTimeout(tick, 59_000);
          else resolve(complete('lento'));
        };
        setTimeout(tick, 59_000);
      });

    const promise = uploadFile({ uploadUrl: SESSION_URL, file: FILE(), transport });
    await vi.advanceTimersByTimeAsync(6 * 59_000);

    await expect(promise).resolves.toEqual({ fileId: 'lento' });
    expect(signals).toHaveLength(1); // uma única requisição, nunca repetida
    expect(signals[0]).toBeDefined(); // o motor sempre entrega um signal ao transporte
    expect(signals[0]?.aborted).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('o temporizador continua correndo depois que o corpo foi enviado: resposta que não chega também é travamento', async () => {
    vi.useFakeTimers();
    const { transport, requests } = scripted([
      (req) => {
        req.onProgress?.(1000); // corpo inteiro enviado, mas o Google nunca responde
        return hang(req, true);
      },
      () => complete('depois'),
    ]);
    const { sleep } = instantSleep();

    const promise = uploadFile({ uploadUrl: SESSION_URL, file: FILE(), transport, sleep });
    await vi.advanceTimersByTimeAsync(59_999);
    expect(requests).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect(promise).resolves.toEqual({ fileId: 'depois' });
    expect(requests.map(contentRange)).toEqual([CHUNK_RANGE, STATUS_RANGE]);
  });

  it('(c) consulta de status que trava conta como falha; com 8 falhas seguidas o envio desiste', async () => {
    vi.useFakeTimers();
    const hanging: Step = (req) => hang(req, true);
    const { transport, requests } = scripted([networkDown, ...Array<Step>(7).fill(hanging)]);
    const { sleep, delays } = instantSleep();

    const outcome = rejectionOf(uploadFile({ uploadUrl: SESSION_URL, file: FILE(), transport, sleep }));
    await vi.advanceTimersByTimeAsync(8 * 60_000);
    const error = (await outcome) as FatalUploadError;

    expect(error).toBeInstanceOf(FatalUploadError);
    expect(error.status).toBe(0);
    expect(requests).toHaveLength(8);
    expect(requests.slice(1).map(contentRange)).toEqual(Array(7).fill(STATUS_RANGE));
    expect(delays).toHaveLength(7);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('(d) abort do usuário com a requisição travada rejeita com AbortError, sem retentativa', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const { transport, requests } = scripted([
      (req) => {
        req.onProgress?.(10);
        return hang(req, true);
      },
      () => complete(),
    ]);
    const { sleep, delays } = instantSleep();

    const outcome = expectAbort(
      uploadFile({ uploadUrl: SESSION_URL, file: FILE(), transport, sleep, signal: controller.signal }),
    );
    await vi.advanceTimersByTimeAsync(30_000);
    controller.abort();
    await outcome;
    await vi.advanceTimersByTimeAsync(5 * 60_000);

    expect(requests).toHaveLength(1);
    expect(delays).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('(d) cancelamento e travamento no mesmo instante: o cancelamento do usuário vence e não conta como falha', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    // Ao abortar a requisição (watchdog), o transporte cancela o envio inteiro na mesma chamada.
    const transport: Transport = (req) =>
      new Promise((_resolve, reject) => {
        req.signal?.addEventListener('abort', () => {
          controller.abort();
          reject(new DOMException('cancelado', 'AbortError'));
        });
      });
    const { sleep, delays } = instantSleep();

    const outcome = expectAbort(
      uploadFile({ uploadUrl: SESSION_URL, file: FILE(), transport, sleep, signal: controller.signal }),
    );
    await vi.advanceTimersByTimeAsync(60_000);
    await outcome;

    expect(delays).toEqual([]); // nenhum backoff: foi cancelamento, não falha
    expect(vi.getTimerCount()).toBe(0);
  });

  it('(d) abort do usuário durante o backoff que segue um travamento rejeita com AbortError', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const { transport, requests } = scripted([(req) => hang(req, true), () => complete()]);

    const outcome = expectAbort(uploadFile({ uploadUrl: SESSION_URL, file: FILE(), transport, signal: controller.signal }));
    await vi.advanceTimersByTimeAsync(60_500); // travou e está no meio do backoff de 1 s
    expect(requests).toHaveLength(1);
    controller.abort();
    await outcome;
    await vi.advanceTimersByTimeAsync(10_000);

    expect(requests).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('(e) não deixa temporizadores pendentes depois de sucesso, de travamento recuperado, de desistência e de abort', async () => {
    vi.useFakeTimers();

    // sucesso
    await uploadFile({ uploadUrl: SESSION_URL, file: FILE(), transport: scripted([() => complete()]).transport });
    expect(vi.getTimerCount()).toBe(0);

    // travamento seguido de recuperação (backoff padrão, com temporizador de verdade)
    const recovered = scripted([(req) => hang(req, true), () => incomplete(), () => complete()]);
    const recovery = uploadFile({ uploadUrl: SESSION_URL, file: FILE(), transport: recovered.transport });
    await vi.advanceTimersByTimeAsync(61_000);
    await recovery;
    expect(vi.getTimerCount()).toBe(0);

    // abort durante a requisição
    const controller = new AbortController();
    const aborted = expectAbort(
      uploadFile({ uploadUrl: SESSION_URL, file: FILE(), transport: scripted([(req) => hang(req, true)]).transport, signal: controller.signal }),
    );
    await vi.advanceTimersByTimeAsync(1000);
    controller.abort();
    await aborted;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('(f) um transporte que ignora o signal também é destravado', async () => {
    vi.useFakeTimers();
    const { transport, requests } = scripted([
      (req) => hang(req, false), // nunca resolve nem rejeita, mesmo depois do abort
      () => complete('destravou'),
    ]);
    const { sleep } = instantSleep();

    const promise = uploadFile({ uploadUrl: SESSION_URL, file: FILE(), transport, sleep });
    await vi.advanceTimersByTimeAsync(60_000);

    await expect(promise).resolves.toEqual({ fileId: 'destravou' });
    expect(requests.map(contentRange)).toEqual([CHUNK_RANGE, STATUS_RANGE]);
  });

  it('progresso tardio de uma requisição já abandonada não rearma temporizador nem é repassado', async () => {
    vi.useFakeTimers();
    let staleProgress: ((loaded: number) => void) | undefined;
    const { transport } = scripted([
      (req) => {
        staleProgress = req.onProgress;
        return hang(req, false);
      },
      () => complete('ok'),
    ]);
    const { sleep } = instantSleep();
    const onProgress = vi.fn();

    const promise = uploadFile({ uploadUrl: SESSION_URL, file: makeFile(5000), transport, sleep, onProgress });
    await vi.advanceTimersByTimeAsync(60_000);
    await promise;
    const callsAfterDone = onProgress.mock.calls.length;

    staleProgress?.(4000);

    expect(staleProgress).toBeDefined();
    expect(vi.getTimerCount()).toBe(0);
    expect(onProgress.mock.calls).toHaveLength(callsAfterDone);
  });

  it('(g) stallTimeoutMs personalizado é respeitado', async () => {
    vi.useFakeTimers();
    const signals: Array<AbortSignal | undefined> = [];
    const { transport } = scripted([
      (req) => {
        signals.push(req.signal);
        return hang(req, true);
      },
      () => complete(),
    ]);
    const { sleep } = instantSleep();

    const promise = uploadFile({ uploadUrl: SESSION_URL, file: FILE(), transport, sleep, stallTimeoutMs: 5_000 });
    await vi.advanceTimersByTimeAsync(4_999);
    expect(signals[0]?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(signals[0]?.aborted).toBe(true);

    await expect(promise).resolves.toBeDefined();
  });

  it.each([
    ['zero', 0],
    ['negativo', -1],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
  ])('stallTimeoutMs inválido (%s) volta ao padrão de 60 s', async (_label, value) => {
    vi.useFakeTimers();
    const signals: Array<AbortSignal | undefined> = [];
    const { transport } = scripted([
      (req) => {
        signals.push(req.signal);
        return hang(req, true);
      },
      () => complete(),
    ]);
    const { sleep } = instantSleep();

    const promise = uploadFile({ uploadUrl: SESSION_URL, file: FILE(), transport, sleep, stallTimeoutMs: value });
    await vi.advanceTimersByTimeAsync(59_999);
    expect(signals[0]?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(signals[0]?.aborted).toBe(true);

    await expect(promise).resolves.toBeDefined();
  });

  it('valor gigante não estoura o temporizador (teto do setTimeout)', async () => {
    vi.useFakeTimers();
    const signals: Array<AbortSignal | undefined> = [];
    const { transport } = scripted([
      (req) => {
        signals.push(req.signal);
        return hang(req, true);
      },
    ]);

    void uploadFile({ uploadUrl: SESSION_URL, file: FILE(), transport, stallTimeoutMs: 10 ** 12 }).catch(() => {});
    await vi.advanceTimersByTimeAsync(60_000);

    expect(signals[0]?.aborted).toBe(false); // sem o teto o setTimeout dispararia quase na hora
  });
});

// ---------------------------------------------------------------------------
// uploadFile: resumeFromServer (retomar uma sessão existente)
// ---------------------------------------------------------------------------

describe('uploadFile: resumeFromServer', () => {
  it('a primeira requisição é a consulta de status (PUT vazio, bytes */total)', async () => {
    const total = 3 * ALIGN;
    const file = makeFile(total);
    const slice = vi.spyOn(file, 'slice');
    const { transport, requests } = scripted([() => incomplete(ALIGN - 1), () => complete()]);

    await uploadFile({ uploadUrl: SESSION_URL, file, transport, chunkSize: 4 * ALIGN, resumeFromServer: true });

    expect(requests[0].method).toBe('PUT');
    expect(requests[0].url).toBe(SESSION_URL);
    expect(requests[0].headers).toEqual({ 'Content-Range': `bytes */${total}` });
    expect(requests[0].body ?? null).toBeNull();
    expect(slice).toHaveBeenCalledTimes(1); // só o chunk depois da consulta
  });

  it('308 com range: retoma em range + 1, com chunks alinhados', async () => {
    const total = 4 * ALIGN;
    const { transport, requests } = scripted([
      () => incomplete(2 * ALIGN - 1),
      () => incomplete(3 * ALIGN - 1),
      () => complete('retomado'),
    ]);

    const result = await uploadFile({ uploadUrl: SESSION_URL, file: makeFile(total), transport, chunkSize: ALIGN, resumeFromServer: true });

    expect(result).toEqual({ fileId: 'retomado' });
    expect(requests.map(contentRange)).toEqual([
      `bytes */${total}`,
      `bytes ${2 * ALIGN}-${3 * ALIGN - 1}/${total}`,
      `bytes ${3 * ALIGN}-${total - 1}/${total}`,
    ]);
  });

  it('308 com range de offset ímpar: o primeiro chunk parte exatamente dali', async () => {
    const total = 3 * ALIGN;
    const { transport, requests } = scripted([() => incomplete(299_999), () => complete()]);

    await uploadFile({ uploadUrl: SESSION_URL, file: makeFile(total), transport, chunkSize: 4 * ALIGN, resumeFromServer: true });

    expect(contentRange(requests[1])).toBe(`bytes 300000-${total - 1}/${total}`);
    expect(requests[1].body?.size).toBe(total - 300_000);
  });

  it('308 sem range: nada foi guardado, começa do zero', async () => {
    const total = 2 * ALIGN;
    const { transport, requests } = scripted([() => incomplete(), () => complete()]);

    await uploadFile({ uploadUrl: SESSION_URL, file: makeFile(total), transport, chunkSize: 4 * ALIGN, resumeFromServer: true });

    expect(requests.map(contentRange)).toEqual([`bytes */${total}`, `bytes 0-${total - 1}/${total}`]);
  });

  it.each([200, 201])('%d na consulta: já estava concluído, devolve o id sem enviar nenhum byte', async (status) => {
    const file = makeFile(2 * ALIGN);
    const slice = vi.spyOn(file, 'slice');
    const onProgress = vi.fn();
    const { transport, requests } = scripted([() => complete('ja-estava', status)]);

    const result = await uploadFile({ uploadUrl: SESSION_URL, file, transport, resumeFromServer: true, onProgress });

    expect(result).toEqual({ fileId: 'ja-estava' });
    expect(requests).toHaveLength(1);
    expect(slice).not.toHaveBeenCalled();
    expect(onProgress.mock.calls).toEqual([[2 * ALIGN, 2 * ALIGN]]);
  });

  it('200 na consulta sem id legível é fatal', async () => {
    const { transport, requests } = scripted([() => ({ status: 200, headers: {}, body: '{}' })]);

    const error = await rejectionOf(uploadFile({ uploadUrl: SESSION_URL, file: makeFile(10), transport, resumeFromServer: true }));

    expect(error).toBeInstanceOf(FatalUploadError);
    expect(contentRange(requests[0])).toBe('bytes */10');
  });

  it.each([404, 410])('%d na consulta: SessionExpiredError, sem enviar nada', async (status) => {
    const { transport, requests } = scripted([() => httpStatus(status)]);
    const { sleep, delays } = instantSleep();

    const error = await rejectionOf(uploadFile({ uploadUrl: SESSION_URL, file: makeFile(10), transport, sleep, resumeFromServer: true }));

    expect(error).toBeInstanceOf(SessionExpiredError);
    expect(requests).toHaveLength(1);
    expect(contentRange(requests[0])).toBe('bytes */10');
    expect(delays).toEqual([]);
  });

  it.each([400, 403])('%d na consulta é fatal', async (status) => {
    const { transport, requests } = scripted([() => httpStatus(status)]);

    const error = await rejectionOf(uploadFile({ uploadUrl: SESSION_URL, file: makeFile(10), transport, resumeFromServer: true }));

    expect(error).toBeInstanceOf(FatalUploadError);
    expect((error as FatalUploadError).status).toBe(status);
    expect(requests).toHaveLength(1);
    expect(contentRange(requests[0])).toBe('bytes */10');
  });

  it.each([
    ['erro de rede', networkDown],
    ['503', () => httpStatus(503)],
    ['429', () => httpStatus(429)],
  ])('primeira consulta com %s: backoff e nova consulta, como qualquer outra falha', async (_label, failure) => {
    const total = 2 * ALIGN;
    const { transport, requests } = scripted([failure, () => incomplete(ALIGN - 1), () => complete('depois')]);
    const { sleep, delays } = instantSleep();

    const result = await uploadFile({ uploadUrl: SESSION_URL, file: makeFile(total), transport, chunkSize: 4 * ALIGN, sleep, resumeFromServer: true });

    expect(result).toEqual({ fileId: 'depois' });
    expect(delays).toEqual([1000]);
    expect(requests.map(contentRange)).toEqual([
      `bytes */${total}`,
      `bytes */${total}`, // a primeira consulta falhou: pergunta de novo
      `bytes ${ALIGN}-${total - 1}/${total}`,
    ]);
  });

  it('consultas que falham 8 vezes seguidas esgotam as tentativas', async () => {
    const { transport, requests } = scripted(Array<Step>(8).fill(() => httpStatus(503)));
    const { sleep } = instantSleep();

    const error = await rejectionOf(uploadFile({ uploadUrl: SESSION_URL, file: makeFile(10), transport, sleep, resumeFromServer: true }));

    expect(error).toBeInstanceOf(FatalUploadError);
    expect(requests).toHaveLength(8);
    expect(requests.map(contentRange)).toEqual(Array(8).fill('bytes */10'));
  });

  it('o progresso já começa no offset devolvido pelo Google', async () => {
    const total = 3 * ALIGN;
    const { transport } = scripted([() => incomplete(2 * ALIGN - 1), () => complete()]);
    const onProgress = vi.fn();

    await uploadFile({ uploadUrl: SESSION_URL, file: makeFile(total), transport, chunkSize: 4 * ALIGN, resumeFromServer: true, onProgress });

    expect(onProgress.mock.calls[0]).toEqual([2 * ALIGN, total]);
    expect(onProgress.mock.calls[onProgress.mock.calls.length - 1]).toEqual([total, total]);
  });

  it('espera a conexão voltar antes da primeira consulta', async () => {
    const order: string[] = [];
    const { transport } = scripted([
      (req) => {
        order.push(contentRange(req));
        return complete();
      },
    ]);

    await uploadFile({
      uploadUrl: SESSION_URL,
      file: makeFile(10),
      transport,
      resumeFromServer: true,
      isOnline: () => false,
      waitForOnline: async () => {
        order.push('online');
      },
    });

    expect(order).toEqual(['online', 'bytes */10']);
  });

  it.each([undefined, false])('resumeFromServer %s: a primeira requisição continua sendo um chunk', async (value) => {
    const { transport, requests } = scripted([() => complete()]);

    await uploadFile({ uploadUrl: SESSION_URL, file: makeFile(1000), transport, resumeFromServer: value });

    expect(contentRange(requests[0])).toBe('bytes 0-999/1000');
  });
});

// ---------------------------------------------------------------------------
// uploadFile: onProgress nunca derruba um envio
// ---------------------------------------------------------------------------

describe('uploadFile: exceção no onProgress', () => {
  it('onProgress que lança na última chamada não faz falhar um envio que já chegou ao 200', async () => {
    const { transport } = scripted([() => complete('concluido')]);
    const onProgress = vi.fn(() => {
      throw new Error('bug da interface');
    });

    await expect(uploadFile({ uploadUrl: SESSION_URL, file: makeFile(10), transport, onProgress })).resolves.toEqual({
      fileId: 'concluido',
    });
    expect(onProgress).toHaveBeenCalledWith(10, 10);
  });

  it('onProgress que lança em todas as chamadas não interfere no envio nem provoca retentativas', async () => {
    const total = 3 * ALIGN;
    const google = new FakeGoogle(total);
    const onProgress = vi.fn(() => {
      throw new Error('bug da interface');
    });
    // O transporte falso também dispara o progresso do chunk, como o XHR faria.
    const transport: Transport = async (req) => {
      req.onProgress?.(req.body?.size ?? 0);
      return google.transport(req);
    };

    const result = await uploadFile({ uploadUrl: SESSION_URL, file: makeFile(total), transport, chunkSize: ALIGN, onProgress });

    expect(result).toEqual({ fileId: 'drive-file-id' });
    expect(google.requests).toHaveLength(3); // nenhum chunk repetido, nenhuma consulta de status
    expect(google.violations).toEqual([]);
    expect(onProgress).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// FatalUploadError.retryable
// ---------------------------------------------------------------------------

describe('FatalUploadError.retryable', () => {
  it.each([0, 429, 500, 502, 503, 504, 599, 600])('status %d é repetível na mesma sessão', (status) => {
    expect(new FatalUploadError('x', status).retryable).toBe(true);
  });

  it.each([200, 202, 308, 400, 401, 403, 404, 405, 410, 413, 416, 428, 430, 499])('status %d não é repetível', (status) => {
    expect(new FatalUploadError('x', status).retryable).toBe(false);
  });

  it('sem status informado vale 0: repetível', () => {
    expect(new FatalUploadError('x').retryable).toBe(true);
  });

  it('o resto da classe continua igual', () => {
    const error = new FatalUploadError('mensagem', 403);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('FatalUploadError');
    expect(error.message).toBe('mensagem');
    expect(error.status).toBe(403);
  });

  it('esgotar tentativas por 503 é repetível; por falha de rede também (status 0)', async () => {
    const { sleep } = instantSleep();
    const by503 = await rejectionOf(
      uploadFile({ uploadUrl: SESSION_URL, file: makeFile(10), transport: async () => httpStatus(503), sleep }),
    );
    const byNetwork = await rejectionOf(
      uploadFile({ uploadUrl: SESSION_URL, file: makeFile(10), transport: async () => networkDown(), sleep }),
    );

    expect((by503 as FatalUploadError).retryable).toBe(true);
    expect((byNetwork as FatalUploadError).retryable).toBe(true);
    expect((byNetwork as FatalUploadError).status).toBe(0);
  });

  it('esgotar por 429 é repetível', async () => {
    const { sleep } = instantSleep();
    const error = await rejectionOf(
      uploadFile({ uploadUrl: SESSION_URL, file: makeFile(10), transport: async () => httpStatus(429), sleep }),
    );
    expect((error as FatalUploadError).retryable).toBe(true);
    expect((error as FatalUploadError).status).toBe(429);
  });

  it.each([
    ['4xx que não é 404/410', () => httpStatus(403)],
    ['200 sem id', () => ({ status: 200, headers: {}, body: '{}' })],
    ['range malformado', () => ({ status: 308, headers: { range: 'bytes=abc' }, body: '' })],
  ])('erros do protocolo (%s) não são repetíveis', async (_label, response) => {
    const { transport } = scripted([response]);

    const error = await rejectionOf(uploadFile({ uploadUrl: SESSION_URL, file: makeFile(10), transport }));

    expect(error).toBeInstanceOf(FatalUploadError);
    expect((error as FatalUploadError).retryable).toBe(false);
  });
});
