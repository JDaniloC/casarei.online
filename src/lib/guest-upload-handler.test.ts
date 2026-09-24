import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createHandler,
  type CoupleNames,
  type GuestUploadConnection,
  type GuestUploadDeps,
} from '../../supabase/functions/guest-upload/handler';
import handlerSource from '../../supabase/functions/guest-upload/handler.ts?raw';
import {
  DriveApiError,
  NeedsReconnectError,
  QuotaExceededError,
  type GuestFolderStore,
} from '../../supabase/functions/_shared/google-drive';
import { MAX_BYTES, sanitizeFileName } from '../../supabase/functions/_shared/guest-upload-validation';
import type { RateLimitDb } from '../../supabase/functions/_shared/rate-limit';

// ---------------------------------------------------------------------------
// Constantes e fakes
// ---------------------------------------------------------------------------

const ENDPOINT = 'https://projeto.supabase.co/functions/v1/guest-upload';
const ORIGIN = 'https://casarei.online';
const TOKEN = 'abcDEF123_-abcDEF123_-xyz';
const WEDDING_ID = '11111111-1111-4111-8111-111111111111';
const CLIENT_IP = '203.0.113.7';
const ACCESS_TOKEN = 'ya29.token-de-acesso-secreto';
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?upload_id=sessao-secreta';
const NOW = Date.parse('2026-09-24T12:00:00.000Z');

const validBody = (overrides: Record<string, unknown> = {}) => ({
  token: TOKEN,
  fileName: 'IMG_0001.JPG',
  mimeType: 'image/jpeg',
  size: 1_500_000,
  guestName: 'Maria da Silva',
  ...overrides,
});

interface HarnessOptions {
  connection?: GuestUploadConnection | null;
  names?: CoupleNames | null;
  allowedOrigins?: string[];
}

// Monta as dependências falsas. `calls` guarda a ordem em que cada dependência
// foi chamada, para provar que uma checagem posterior não roda quando uma
// anterior falha. Os limites usam um banco em memória de verdade.
function makeHarness(options: HarnessOptions = {}) {
  const calls: string[] = [];
  const rateRows: Array<{ identifier: string; action: string }> = [];
  const countCalls: Array<{ identifier: string; action: string; sinceIso: string }> = [];

  const connection: GuestUploadConnection | null =
    options.connection === undefined
      ? { weddingId: WEDDING_ID, uploadsEnabled: true, folderId: 'root-1' }
      : options.connection;
  const names: CoupleNames | null =
    options.names === undefined
      ? { coupleName: 'Ana & Bruno', partner1Name: 'Ana', partner2Name: 'Bruno' }
      : options.names;

  const rateLimitDb: RateLimitDb = {
    async countSince(identifier, action, sinceIso) {
      calls.push(`rate:count:${action}`);
      countCalls.push({ identifier, action, sinceIso });
      return rateRows.filter((r) => r.identifier === identifier && r.action === action).length;
    },
    async insert(identifier, action) {
      calls.push(`rate:insert:${action}`);
      rateRows.push({ identifier, action });
    },
  };

  // O handler só repassa o store ao resolveGuestFolder; qualquer uso direto é bug.
  const guestFolders: GuestFolderStore = {
    get: async () => {
      throw new Error('guestFolders.get não deveria ser chamado pelo handler');
    },
    count: async () => {
      throw new Error('guestFolders.count não deveria ser chamado pelo handler');
    },
    insertIfAbsent: async () => {
      throw new Error('guestFolders.insertIfAbsent não deveria ser chamado pelo handler');
    },
    update: async () => {
      throw new Error('guestFolders.update não deveria ser chamado pelo handler');
    },
  };

  const mocks = {
    findConnection: vi.fn<GuestUploadDeps['findConnection']>(async () => {
      calls.push('findConnection');
      return connection;
    }),
    getCoupleNames: vi.fn<GuestUploadDeps['getCoupleNames']>(async () => {
      calls.push('getCoupleNames');
      return names;
    }),
    // Por padrão esta requisição vence a gravação condicional e recebe o próprio id.
    saveRootFolder: vi.fn<GuestUploadDeps['saveRootFolder']>(async (_weddingId, _expected, newId) => {
      calls.push('saveRootFolder');
      return newId;
    }),
    clearGuestFolders: vi.fn<GuestUploadDeps['clearGuestFolders']>(async () => {
      calls.push('clearGuestFolders');
    }),
    getAccessToken: vi.fn<GuestUploadDeps['drive']['getAccessToken']>(async () => {
      calls.push('drive:getAccessToken');
      return ACCESS_TOKEN;
    }),
    ensureRootFolder: vi.fn<GuestUploadDeps['drive']['ensureRootFolder']>(async (_token, opts) => {
      calls.push('drive:ensureRootFolder');
      return opts.folderId ?? 'root-novo';
    }),
    resolveGuestFolder: vi.fn<GuestUploadDeps['drive']['resolveGuestFolder']>(async () => {
      calls.push('drive:resolveGuestFolder');
      return 'pasta-convidado-1';
    }),
    getQuota: vi.fn<GuestUploadDeps['drive']['getQuota']>(async () => {
      calls.push('drive:getQuota');
      return { limit: null, usage: 0, free: null };
    }),
    initSession: vi.fn<GuestUploadDeps['drive']['initSession']>(async () => {
      calls.push('drive:initSession');
      return UPLOAD_URL;
    }),
  };

  const deps: GuestUploadDeps = {
    allowedOrigins: options.allowedOrigins ?? [ORIGIN, 'http://localhost:8080'],
    now: () => NOW,
    findConnection: mocks.findConnection,
    getCoupleNames: mocks.getCoupleNames,
    saveRootFolder: mocks.saveRootFolder,
    clearGuestFolders: mocks.clearGuestFolders,
    rateLimitDb,
    guestFolders,
    drive: {
      getAccessToken: mocks.getAccessToken,
      ensureRootFolder: mocks.ensureRootFolder,
      resolveGuestFolder: mocks.resolveGuestFolder,
      getQuota: mocks.getQuota,
      initSession: mocks.initSession,
    },
  };

  return { handler: createHandler(deps), deps, mocks, calls, rateRows, countCalls, guestFolders };
}

type Harness = ReturnType<typeof makeHarness>;

function seedRateRows(h: Harness, identifier: string, action: string, count: number) {
  for (let i = 0; i < count; i += 1) h.rateRows.push({ identifier, action });
}

interface PostOptions {
  origin?: string | null;
  ip?: string;
}

function postReq(body: unknown, options: PostOptions = {}): Request {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-forwarded-for': options.ip ?? CLIENT_IP,
  };
  const origin = options.origin === undefined ? ORIGIN : options.origin;
  if (origin !== null) headers.origin = origin;
  return new Request(ENDPOINT, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function getReq(token: string | null = TOKEN, options: PostOptions = {}): Request {
  const headers: Record<string, string> = { 'x-forwarded-for': options.ip ?? CLIENT_IP };
  const origin = options.origin === undefined ? ORIGIN : options.origin;
  if (origin !== null) headers.origin = origin;
  const url = token === null ? ENDPOINT : `${ENDPOINT}?token=${encodeURIComponent(token)}`;
  return new Request(url, { method: 'GET', headers });
}

async function bodyOf(res: Response): Promise<Record<string, unknown>> {
  return JSON.parse(await res.text());
}

async function expectError(res: Response, status: number, code: string) {
  expect(res.status).toBe(status);
  expect(res.headers.get('Content-Type')).toContain('application/json');
  const body = await bodyOf(res);
  expect(body.code).toBe(code);
  expect(typeof body.error).toBe('string');
  expect(Object.keys(body).sort()).toEqual(['code', 'error']);
  return body;
}

const drive = (calls: string[]) => calls.filter((c) => c.startsWith('drive:'));

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

// ---------------------------------------------------------------------------
// OPTIONS, configuração e métodos
// ---------------------------------------------------------------------------

describe('guest-upload: OPTIONS, configuração e métodos', () => {
  it('OPTIONS responde 204 com os cabeçalhos CORS da origem permitida e não toca em nada', async () => {
    const h = makeHarness();
    const res = await h.handler(new Request(ENDPOINT, { method: 'OPTIONS', headers: { origin: ORIGIN } }));
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(h.calls).toEqual([]);
  });

  it('OPTIONS não devolve Access-Control-Allow-Origin para origem fora da lista', async () => {
    const h = makeHarness();
    const res = await h.handler(
      new Request(ENDPOINT, { method: 'OPTIONS', headers: { origin: 'https://evil.example' } }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('OPTIONS continua 204 mesmo com a lista de origens vazia', async () => {
    const h = makeHarness({ allowedOrigins: [] });
    const res = await h.handler(new Request(ENDPOINT, { method: 'OPTIONS', headers: { origin: ORIGIN } }));
    expect(res.status).toBe(204);
  });

  it('lista de origens vazia: GET e POST respondem 500 de configuração sem tocar em nada', async () => {
    const h = makeHarness({ allowedOrigins: [] });
    for (const req of [getReq(), postReq(validBody())]) {
      const res = await h.handler(req);
      const body = await expectError(res, 500, 'unavailable');
      expect(body.error).toBe('Erro interno de configuração');
    }
    expect(h.calls).toEqual([]);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('método não suportado responde 405 method_not_allowed', async () => {
    const h = makeHarness();
    const res = await h.handler(new Request(ENDPOINT, { method: 'PUT', headers: { origin: ORIGIN } }));
    await expectError(res, 405, 'method_not_allowed');
    expect(h.calls).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

describe('guest-upload: GET', () => {
  it.each([
    ['ausente', null],
    ['curto demais (19)', 'a'.repeat(19)],
    ['comprido demais (65)', 'a'.repeat(65)],
    ['com caractere inválido', 'abcDEF123_-abcDEF123_-xy!'],
    ['com espaço', 'abcDEF123_-abcDEF 23_-xyz'],
    ['com quebra de linha no fim', 'abcDEF123_-abcDEF123_-xyz\n'],
  ])('token %s: 404 not_found antes de rate limit e de qualquer consulta', async (_label, token) => {
    const h = makeHarness();
    const res = await h.handler(getReq(token));
    await expectError(res, 404, 'not_found');
    expect(h.calls).toEqual([]);
  });

  it('aceita tokens de 20 e de 64 caracteres', async () => {
    for (const token of ['a'.repeat(20), 'B_-'.repeat(21) + 'c']) {
      expect(token.length === 20 || token.length === 64).toBe(true);
      const h = makeHarness();
      const res = await h.handler(getReq(token));
      expect(res.status).toBe(200);
      expect(h.mocks.findConnection).toHaveBeenCalledWith(token);
    }
  });

  it('rate limit guest_upload_page: 300 por minuto por IP; 429 rate_limited antes da consulta ao banco', async () => {
    const h = makeHarness();
    seedRateRows(h, CLIENT_IP, 'guest_upload_page', 300);
    const res = await h.handler(getReq());
    await expectError(res, 429, 'rate_limited');
    expect(h.calls).toEqual(['rate:count:guest_upload_page']);
  });

  it('a 300ª requisição ainda passa (limite é >= 300 já registradas) e é registrada', async () => {
    const h = makeHarness();
    seedRateRows(h, CLIENT_IP, 'guest_upload_page', 299);
    const res = await h.handler(getReq());
    expect(res.status).toBe(200);
    expect(h.rateRows.filter((r) => r.action === 'guest_upload_page')).toHaveLength(300);
  });

  it('a janela do rate limit do GET é de 1 minuto, contada pelo relógio injetado', async () => {
    const h = makeHarness();
    await h.handler(getReq());
    expect(h.countCalls).toEqual([
      { identifier: CLIENT_IP, action: 'guest_upload_page', sinceIso: new Date(NOW - 60_000).toISOString() },
    ]);
  });

  it('conexão inexistente: 404 not_found', async () => {
    const h = makeHarness({ connection: null });
    const res = await h.handler(getReq());
    await expectError(res, 404, 'not_found');
    expect(h.mocks.getCoupleNames).not.toHaveBeenCalled();
  });

  it('casamento sem linha em weddings: 404 not_found', async () => {
    const h = makeHarness({ names: null });
    const res = await h.handler(getReq());
    await expectError(res, 404, 'not_found');
  });

  it('200 com nomes do casal e maxBytes, sem chamar o Drive', async () => {
    const h = makeHarness();
    const res = await h.handler(getReq());
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/json');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(await bodyOf(res)).toEqual({
      coupleName: 'Ana & Bruno',
      partnerNames: ['Ana', 'Bruno'],
      available: true,
      maxBytes: MAX_BYTES,
    });
    expect(h.mocks.findConnection).toHaveBeenCalledWith(TOKEN);
    expect(h.mocks.getCoupleNames).toHaveBeenCalledWith(WEDDING_ID);
    expect(drive(h.calls)).toEqual([]);
  });

  it('partnerNames descarta nomes vazios ou em branco e nunca passa de dois', async () => {
    const h = makeHarness({ names: { coupleName: 'Ana', partner1Name: 'Ana', partner2Name: '   ' } });
    expect((await bodyOf(await h.handler(getReq()))).partnerNames).toEqual(['Ana']);

    const h2 = makeHarness({ names: { coupleName: 'Casal', partner1Name: '', partner2Name: '' } });
    expect((await bodyOf(await h2.handler(getReq()))).partnerNames).toEqual([]);
  });

  it('envio desativado: available false com reason "disabled" (e ainda devolve os nomes)', async () => {
    const h = makeHarness({ connection: { weddingId: WEDDING_ID, uploadsEnabled: false, folderId: null } });
    const res = await h.handler(getReq());
    expect(res.status).toBe(200);
    expect(await bodyOf(res)).toEqual({
      coupleName: 'Ana & Bruno',
      partnerNames: ['Ana', 'Bruno'],
      available: false,
      reason: 'disabled',
      maxBytes: MAX_BYTES,
    });
  });

  it('falha do banco de limites: falha fechada com 503 unavailable, sem vazar a mensagem', async () => {
    const h = makeHarness();
    h.deps.rateLimitDb.countSince = async () => {
      throw new Error('conexão recusada em 10.0.0.5 com a senha SEGREDO');
    };
    const res = await h.handler(getReq());
    const body = await expectError(res, 503, 'unavailable');
    expect(body.error).toBe('Envio temporariamente indisponível');
    expect(JSON.stringify(body)).not.toContain('SEGREDO');
    expect(h.mocks.findConnection).not.toHaveBeenCalled();
  });

  it('falha na busca da conexão: 503 unavailable', async () => {
    const h = makeHarness();
    h.mocks.findConnection.mockRejectedValueOnce(new Error('boom'));
    await expectError(await h.handler(getReq()), 503, 'unavailable');
  });

  it('GET não exige Origin permitido, mas só devolve CORS para origem da lista', async () => {
    const h = makeHarness();
    const res = await h.handler(getReq(TOKEN, { origin: 'https://evil.example' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// POST, na ordem do contrato
// ---------------------------------------------------------------------------

describe('guest-upload: POST (1) Origin', () => {
  it.each([
    ['ausente', null],
    ['fora da lista', 'https://evil.example'],
    ['parecida com uma permitida', 'https://casarei.online.evil.example'],
    ['com barra final', 'https://casarei.online/'],
    ['em outro esquema', 'http://casarei.online'],
  ])('Origin %s: 403 forbidden_origin sem tocar em nada', async (_label, origin) => {
    const h = makeHarness();
    const res = await h.handler(postReq(validBody(), { origin }));
    await expectError(res, 403, 'forbidden_origin');
    expect(h.calls).toEqual([]);
  });

  it('a checagem de Origin vem antes da validação do corpo (corpo inválido + origem ruim = 403)', async () => {
    const h = makeHarness();
    const res = await h.handler(postReq('isto não é JSON', { origin: 'https://evil.example' }));
    await expectError(res, 403, 'forbidden_origin');
    expect(h.calls).toEqual([]);
  });

  it('não devolve Access-Control-Allow-Origin para a origem recusada', async () => {
    const h = makeHarness();
    const res = await h.handler(postReq(validBody(), { origin: 'https://evil.example' }));
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('aceita a segunda origem da lista', async () => {
    const h = makeHarness();
    const res = await h.handler(postReq(validBody(), { origin: 'http://localhost:8080' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:8080');
  });
});

describe('guest-upload: POST (2) corpo', () => {
  const cases: Array<[string, unknown]> = [
    ['JSON malformado', '{ nao e json'],
    ['corpo vazio', ''],
    ['null', 'null'],
    ['array', '[]'],
    ['número', '42'],
    ['sem token', (() => { const b = validBody(); delete (b as Record<string, unknown>).token; return b; })()],
    ['token com formato inválido', validBody({ token: 'curto' })],
    ['token que não é string', validBody({ token: 1234567890123456 })],
    ['sem fileName', (() => { const b = validBody(); delete (b as Record<string, unknown>).fileName; return b; })()],
    ['fileName vazio', validBody({ fileName: '' })],
    ['fileName com 256 caracteres', validBody({ fileName: 'a'.repeat(252) + '.jpg' })],
    ['fileName que não é string', validBody({ fileName: 123 })],
    ['sem mimeType', (() => { const b = validBody(); delete (b as Record<string, unknown>).mimeType; return b; })()],
    ['mimeType com 101 caracteres', validBody({ mimeType: 'image/' + 'x'.repeat(95) })],
    ['mimeType que não é string', validBody({ mimeType: ['image/jpeg'] })],
    ['sem size', (() => { const b = validBody(); delete (b as Record<string, unknown>).size; return b; })()],
    ['size em texto', validBody({ size: '1500000' })],
    ['size fracionário', validBody({ size: 1.5 })],
    ['size nulo', validBody({ size: null })],
    ['guestName com 201 caracteres', validBody({ guestName: 'a'.repeat(201) })],
    ['guestName que não é string', validBody({ guestName: 42 })],
    ['corpo grande demais (campos válidos, mas 50 mil caracteres extras)', validBody({ padding: 'a'.repeat(50_000) })],
  ];

  it.each(cases)('%s: 400 invalid_input antes de qualquer consulta', async (_label, body) => {
    const h = makeHarness();
    const res = await h.handler(postReq(body));
    await expectError(res, 400, 'invalid_input');
    expect(h.calls).toEqual([]);
  });

  it('aceita exatamente os limites (fileName 255, mimeType 100, guestName 200) e guestName ausente ou nulo', async () => {
    const edge = validBody({
      fileName: 'a'.repeat(251) + '.jpg',
      mimeType: 'image/' + 'x'.repeat(94),
      guestName: 'g'.repeat(200),
    });
    expect((edge.fileName as string).length).toBe(255);
    expect((edge.mimeType as string).length).toBe(100);
    expect((await makeHarness().handler(postReq(edge))).status).toBe(200);

    const semNome = validBody();
    delete (semNome as Record<string, unknown>).guestName;
    expect((await makeHarness().handler(postReq(semNome))).status).toBe(200);
    expect((await makeHarness().handler(postReq(validBody({ guestName: null })))).status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Teto do corpo: 16 KiB medidos em BYTES e aplicados ANTES de ler o corpo inteiro
// ---------------------------------------------------------------------------

const MAX_BODY_BYTES = 16 * 1024;
const encoder = new TextEncoder();

// JSON válido do envio, preenchido (só ASCII) até ter exatamente `bytes` bytes.
function bodyWithExactBytes(bytes: number): string {
  const base = JSON.stringify(validBody({ padding: '' }));
  const text = JSON.stringify(validBody({ padding: 'a'.repeat(bytes - base.length) }));
  expect(encoder.encode(text).length).toBe(bytes);
  return text;
}

// POST cujo corpo é um stream (como um envio chunked, sem Content-Length). `pull` e
// `cancel` são espiões: mostram quanto do corpo foi lido e se o handler desistiu dele.
// highWaterMark 0: nada é lido antes de alguém pedir.
function streamedPost(chunks: Uint8Array[], options: { contentLength?: string; origin?: string } = {}) {
  let next = 0;
  const pull = vi.fn((controller: ReadableStreamDefaultController<Uint8Array>) => {
    if (next < chunks.length) controller.enqueue(chunks[next++]);
    else controller.close();
  });
  const cancel = vi.fn();
  const body = new ReadableStream<Uint8Array>({ pull, cancel }, new CountQueuingStrategy({ highWaterMark: 0 }));
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-forwarded-for': CLIENT_IP,
    origin: options.origin ?? ORIGIN,
  };
  if (options.contentLength !== undefined) headers['content-length'] = options.contentLength;
  const req = new Request(ENDPOINT, { method: 'POST', headers, body, duplex: 'half' } as RequestInit);
  return { req, pull, cancel };
}

const KIB_CHUNK = new Uint8Array(1024).fill(0x61); // 1 KiB de "a"

describe('guest-upload: POST (2) teto do corpo em bytes, antes de ler o corpo', () => {
  it('Content-Length acima do teto: 400 invalid_input SEM ler o corpo', async () => {
    const h = makeHarness();
    const valid = encoder.encode(JSON.stringify(validBody()));
    const { req, pull, cancel } = streamedPost([valid], { contentLength: String(MAX_BODY_BYTES + 1) });

    const res = await h.handler(req);

    await expectError(res, 400, 'invalid_input');
    expect(pull).not.toHaveBeenCalled();
    expect(req.bodyUsed).toBe(false);
    expect(cancel).not.toHaveBeenCalled();
    expect(h.calls).toEqual([]);
  });

  it('Content-Length gigante (bem acima do teto) também é recusado sem ler o corpo', async () => {
    const h = makeHarness();
    const { req, pull } = streamedPost([KIB_CHUNK], { contentLength: '900000000000' });
    await expectError(await h.handler(req), 400, 'invalid_input');
    expect(pull).not.toHaveBeenCalled();
    expect(h.calls).toEqual([]);
  });

  it('a Origin continua sendo checada antes de tudo: origem ruim + Content-Length enorme = 403 e nada é lido', async () => {
    const h = makeHarness();
    const { req, pull } = streamedPost([KIB_CHUNK], { contentLength: '900000000', origin: 'https://evil.example' });
    await expectError(await h.handler(req), 403, 'forbidden_origin');
    expect(pull).not.toHaveBeenCalled();
    expect(req.bodyUsed).toBe(false);
    expect(h.calls).toEqual([]);
  });

  it('corpo em stream acima do teto e SEM Content-Length: 400 invalid_input e o leitor é cancelado cedo', async () => {
    const h = makeHarness();
    // 100 KiB em pedaços de 1 KiB: o teto (16 KiB) estoura no 17º pedaço.
    const { req, pull, cancel } = streamedPost(Array.from({ length: 100 }, () => KIB_CHUNK));

    const res = await h.handler(req);

    await expectError(res, 400, 'invalid_input');
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(pull.mock.calls.length).toBeLessThanOrEqual(18);
    expect(h.calls).toEqual([]);
  });

  it('Content-Length mentindo (pequeno) não ajuda: o corpo em stream ainda é cortado no teto', async () => {
    const h = makeHarness();
    const { req, pull, cancel } = streamedPost(
      Array.from({ length: 100 }, () => KIB_CHUNK),
      { contentLength: '10' },
    );

    await expectError(await h.handler(req), 400, 'invalid_input');
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(pull.mock.calls.length).toBeLessThanOrEqual(18);
  });

  it('Content-Length inválido (texto, negativo, decimal) é ignorado: vale o corte por bytes durante a leitura', async () => {
    for (const contentLength of ['abc', '-5', '1.5', '']) {
      const ok = streamedPost([encoder.encode(JSON.stringify(validBody()))], { contentLength });
      expect((await makeHarness().handler(ok.req)).status).toBe(200);

      const big = streamedPost(Array.from({ length: 40 }, () => KIB_CHUNK), { contentLength });
      await expectError(await makeHarness().handler(big.req), 400, 'invalid_input');
      expect(big.cancel).toHaveBeenCalledTimes(1);
    }
  });

  it('corpo de exatamente 16384 bytes é aceito (string, stream e com Content-Length igual ao teto)', async () => {
    const text = bodyWithExactBytes(MAX_BODY_BYTES);

    expect((await makeHarness().handler(postReq(text))).status).toBe(200);

    const bytes = encoder.encode(text);
    const halves = [bytes.slice(0, 5000), bytes.slice(5000)];
    const streamed = streamedPost(halves, { contentLength: String(MAX_BODY_BYTES) });
    expect((await makeHarness().handler(streamed.req)).status).toBe(200);
    expect(streamed.cancel).not.toHaveBeenCalled();
  });

  it('16385 bytes: 400 invalid_input', async () => {
    const text = bodyWithExactBytes(MAX_BODY_BYTES + 1);
    const h = makeHarness();
    await expectError(await h.handler(postReq(text)), 400, 'invalid_input');
    expect(h.calls).toEqual([]);
  });

  it('conta BYTES, não caracteres: menos de 16384 caracteres mas mais de 16384 bytes em UTF-8 é recusado', async () => {
    const text = JSON.stringify(validBody({ padding: 'é'.repeat(8200) }));
    expect(text.length).toBeLessThan(MAX_BODY_BYTES);
    expect(encoder.encode(text).length).toBeGreaterThan(MAX_BODY_BYTES);

    const h = makeHarness();
    await expectError(await h.handler(postReq(text)), 400, 'invalid_input');
    expect(h.calls).toEqual([]);
  });

  it('corpo pequeno com acentos e emoji (UTF-8 em vários bytes, cortado entre pedaços) é decodificado corretamente', async () => {
    const bytes = encoder.encode(JSON.stringify(validBody({ guestName: 'José 🎉 Ângela' })));
    // Corta no meio de um caractere de vários bytes: a decodificação só acontece no fim.
    const cut = bytes.indexOf(0xf0) + 2;
    const { req } = streamedPost([bytes.slice(0, cut), bytes.slice(cut)]);
    const h = makeHarness();

    const res = await h.handler(req);

    expect(res.status).toBe(200);
    expect(h.mocks.resolveGuestFolder.mock.calls[0][2].guestName).toBe('José 🎉 Ângela');
  });

  it('POST sem corpo (body nulo) conta como vazio: 400 invalid_input', async () => {
    const h = makeHarness();
    const req = new Request(ENDPOINT, {
      method: 'POST',
      headers: { origin: ORIGIN, 'x-forwarded-for': CLIENT_IP },
    });
    expect(req.body).toBeNull();
    await expectError(await h.handler(req), 400, 'invalid_input');
    expect(h.calls).toEqual([]);
  });

  it('corpo pequeno e válido continua funcionando (200 com uploadUrl)', async () => {
    const h = makeHarness();
    const res = await h.handler(postReq(validBody()));
    expect(res.status).toBe(200);
    expect(await bodyOf(res)).toEqual({ uploadUrl: UPLOAD_URL });
  });
});

describe('guest-upload: POST (3) conexão e (4) desativado', () => {
  it('token sem conexão: 404 not_found e nenhum limite é consumido', async () => {
    const h = makeHarness({ connection: null });
    const res = await h.handler(postReq(validBody()));
    await expectError(res, 404, 'not_found');
    expect(h.calls).toEqual(['findConnection']);
    expect(h.mocks.findConnection).toHaveBeenCalledWith(TOKEN);
  });

  it('envio desativado: 409 disabled', async () => {
    const h = makeHarness({ connection: { weddingId: WEDDING_ID, uploadsEnabled: false, folderId: 'root-1' } });
    const res = await h.handler(postReq(validBody()));
    await expectError(res, 409, 'disabled');
    expect(h.calls).toEqual(['findConnection']);
  });

  it('desativado vem antes da checagem de tamanho e de tipo', async () => {
    const h = makeHarness({ connection: { weddingId: WEDDING_ID, uploadsEnabled: false, folderId: null } });
    const res = await h.handler(postReq(validBody({ fileName: 'virus.exe', size: MAX_BYTES + 1 })));
    await expectError(res, 409, 'disabled');
  });

  it('falha ao buscar a conexão: falha fechada com 503 unavailable', async () => {
    const h = makeHarness();
    h.mocks.findConnection.mockRejectedValueOnce(new Error('timeout no banco'));
    const res = await h.handler(postReq(validBody()));
    await expectError(res, 503, 'unavailable');
    expect(h.calls).toEqual([]);
  });
});

describe('guest-upload: POST (5) tamanho e (6) tipo', () => {
  it.each([
    ['zero', 0],
    ['negativo', -1],
    ['1 byte acima do máximo', MAX_BYTES + 1],
    ['enorme', 10 ** 15],
  ])('size %s: 400 file_too_large sem consumir limites', async (_label, size) => {
    const h = makeHarness();
    const res = await h.handler(postReq(validBody({ size })));
    await expectError(res, 400, 'file_too_large');
    expect(h.calls).toEqual(['findConnection']);
  });

  it('tamanho vem antes do tipo (arquivo .exe gigante = file_too_large)', async () => {
    const h = makeHarness();
    const res = await h.handler(postReq(validBody({ fileName: 'virus.exe', size: MAX_BYTES + 1 })));
    await expectError(res, 400, 'file_too_large');
  });

  it('aceita 1 byte e exatamente MAX_BYTES', async () => {
    expect((await makeHarness().handler(postReq(validBody({ size: 1 })))).status).toBe(200);
    expect((await makeHarness().handler(postReq(validBody({ size: MAX_BYTES })))).status).toBe(200);
  });

  it.each([
    ['extensão fora da lista', { fileName: 'virus.exe', mimeType: 'application/octet-stream' }],
    ['sem extensão', { fileName: 'foto', mimeType: 'image/jpeg' }],
    ['tipo declarado de outra categoria', { fileName: 'foto.jpg', mimeType: 'video/mp4' }],
    ['tipo declarado que não é imagem nem vídeo', { fileName: 'foto.jpg', mimeType: 'text/html' }],
    ['propriedade herdada como extensão', { fileName: 'foto.constructor', mimeType: '' }],
  ])('%s: 400 file_type sem consumir limites', async (_label, overrides) => {
    const h = makeHarness();
    const res = await h.handler(postReq(validBody(overrides)));
    await expectError(res, 400, 'file_type');
    expect(h.calls).toEqual(['findConnection']);
  });
});

describe('guest-upload: POST (7) rate limits', () => {
  it('limite por IP: 1000 em 10 minutos, 429 rate_limited; o limite por casamento nem é consultado', async () => {
    const h = makeHarness();
    seedRateRows(h, CLIENT_IP, 'guest_upload_ip', 1000);
    const res = await h.handler(postReq(validBody()));
    await expectError(res, 429, 'rate_limited');
    expect(h.calls).toEqual(['findConnection', 'rate:count:guest_upload_ip']);
  });

  it('limite por casamento: 3000 por hora com o identificador wedding:<id>; o IP consumiu a sua vaga', async () => {
    const h = makeHarness();
    seedRateRows(h, `wedding:${WEDDING_ID}`, 'guest_upload_wedding', 3000);
    const res = await h.handler(postReq(validBody()));
    await expectError(res, 429, 'rate_limited');
    expect(h.calls).toEqual([
      'findConnection',
      'rate:count:guest_upload_ip',
      'rate:insert:guest_upload_ip',
      'rate:count:guest_upload_wedding',
    ]);
    expect(drive(h.calls)).toEqual([]);
  });

  it('um IP abaixo do limite passa e os dois limites são registrados', async () => {
    const h = makeHarness();
    seedRateRows(h, CLIENT_IP, 'guest_upload_ip', 999);
    seedRateRows(h, `wedding:${WEDDING_ID}`, 'guest_upload_wedding', 2999);
    const res = await h.handler(postReq(validBody()));
    expect(res.status).toBe(200);
    expect(h.rateRows.filter((r) => r.action === 'guest_upload_ip')).toHaveLength(1000);
    expect(h.rateRows.filter((r) => r.action === 'guest_upload_wedding')).toHaveLength(3000);
  });

  it('as janelas são de 10 minutos (IP) e 1 hora (casamento), pelo relógio injetado', async () => {
    const h = makeHarness();
    await h.handler(postReq(validBody()));
    expect(h.countCalls).toEqual([
      { identifier: CLIENT_IP, action: 'guest_upload_ip', sinceIso: new Date(NOW - 600_000).toISOString() },
      {
        identifier: `wedding:${WEDDING_ID}`,
        action: 'guest_upload_wedding',
        sinceIso: new Date(NOW - 3_600_000).toISOString(),
      },
    ]);
  });

  it('o identificador de IP é truncado em 64 caracteres', async () => {
    const h = makeHarness();
    const longIp = 'x'.repeat(100);
    await h.handler(postReq(validBody(), { ip: longIp }));
    expect(h.countCalls[0].identifier).toBe('x'.repeat(64));
    expect(h.rateRows[0].identifier).toBe('x'.repeat(64));
  });

  it('o mesmo vale para o rate limit do GET', async () => {
    const h = makeHarness();
    await h.handler(getReq(TOKEN, { ip: 'y'.repeat(100) }));
    expect(h.countCalls[0].identifier).toBe('y'.repeat(64));
  });

  it('falha do banco de limites: falha fechada com 503 unavailable, sem chegar ao Google', async () => {
    const h = makeHarness();
    h.deps.rateLimitDb.insert = async () => {
      throw new Error('Falha ao registrar a requisição no limite.');
    };
    const res = await h.handler(postReq(validBody()));
    await expectError(res, 503, 'unavailable');
    expect(drive(h.calls)).toEqual([]);
  });
});

describe('guest-upload: POST (8) sanitização e (9) token de acesso', () => {
  it('o Drive recebe o nome do arquivo e o do convidado já sanitizados, e o mime da extensão', async () => {
    const h = makeHarness();
    const rawFile = '  IMG   0001 .MOV';
    const res = await h.handler(
      postReq(validBody({ fileName: rawFile, mimeType: 'application/octet-stream', guestName: '  Maria   da Silva  ' })),
    );
    expect(res.status).toBe(200);
    const sent = h.mocks.initSession.mock.calls[0][1];
    expect(sent.name).toBe(sanitizeFileName(rawFile));
    expect(sent.name).not.toBe(rawFile);
    expect(sent.mimeType).toBe('video/quicktime');
    expect(sent.guestName).toBe('Maria da Silva');
    expect(h.mocks.resolveGuestFolder.mock.calls[0][2].guestName).toBe('Maria da Silva');
  });

  it('getAccessToken lançando NeedsReconnectError: 503 unavailable, sem tocar na pasta raiz', async () => {
    const h = makeHarness();
    h.mocks.getAccessToken.mockRejectedValueOnce(new NeedsReconnectError('refresh token revogado'));
    const res = await h.handler(postReq(validBody()));
    const body = await expectError(res, 503, 'unavailable');
    expect(body.error).toBe('Envio temporariamente indisponível');
    expect(h.mocks.ensureRootFolder).not.toHaveBeenCalled();
  });

  it('getAccessToken com erro qualquer (ex.: variável do Google ausente): 503 unavailable', async () => {
    const h = makeHarness();
    h.mocks.getAccessToken.mockRejectedValueOnce(new Error('GOOGLE_DRIVE_REFRESH_TOKEN ausente'));
    const res = await h.handler(postReq(validBody()));
    const body = await expectError(res, 503, 'unavailable');
    expect(JSON.stringify(body)).not.toContain('GOOGLE_DRIVE');
    expect(h.mocks.ensureRootFolder).not.toHaveBeenCalled();
  });

  it('falha ao ler os nomes do casal: 503 unavailable, sem chegar ao Google', async () => {
    const h = makeHarness();
    h.mocks.getCoupleNames.mockRejectedValueOnce(new Error('boom'));
    await expectError(await h.handler(postReq(validBody())), 503, 'unavailable');
    expect(drive(h.calls)).toEqual([]);
  });
});

describe('guest-upload: POST (10) pasta raiz', () => {
  it('cria/garante a raiz com o nome "<casal> – casarei.online" passado por sanitizeFileName', async () => {
    const h = makeHarness({
      names: { coupleName: 'Ana/Bruno  &  Cia', partner1Name: 'Ana', partner2Name: 'Bruno' },
    });
    await h.handler(postReq(validBody()));
    const [token, opts] = h.mocks.ensureRootFolder.mock.calls[0];
    expect(token).toBe(ACCESS_TOKEN);
    expect(opts).toEqual({
      weddingId: WEDDING_ID,
      name: sanitizeFileName('Ana/Bruno  &  Cia – casarei.online'),
      folderId: 'root-1',
    });
    expect(opts.name).toBe('AnaBruno & Cia – casarei.online');
  });

  it('raiz inalterada: não grava nem limpa nada', async () => {
    const h = makeHarness();
    await h.handler(postReq(validBody()));
    expect(h.mocks.saveRootFolder).not.toHaveBeenCalled();
    expect(h.mocks.clearGuestFolders).not.toHaveBeenCalled();
  });

  // A raiz que o Drive devolve para esta requisição (id novo = a antiga não existe mais).
  const ensureReturns = (h: Harness, id: string) =>
    h.mocks.ensureRootFolder.mockImplementationOnce(async () => {
      h.calls.push('drive:ensureRootFolder');
      return id;
    });
  const firstRoot: GuestUploadConnection = { weddingId: WEDDING_ID, uploadsEnabled: true, folderId: null };
  const rootSteps = (h: Harness) =>
    h.calls.filter((c) =>
      ['drive:ensureRootFolder', 'saveRootFolder', 'clearGuestFolders', 'drive:resolveGuestFolder'].includes(c),
    );

  it('raiz substituída (a antiga foi apagada) e esta requisição vence: grava com o id esperado e depois limpa as pastas de convidado', async () => {
    const h = makeHarness();
    ensureReturns(h, 'root-2');
    const res = await h.handler(postReq(validBody()));
    expect(res.status).toBe(200);
    expect(h.mocks.saveRootFolder).toHaveBeenCalledTimes(1);
    expect(h.mocks.saveRootFolder).toHaveBeenCalledWith(WEDDING_ID, 'root-1', 'root-2');
    expect(h.mocks.clearGuestFolders).toHaveBeenCalledWith(WEDDING_ID);
    // gravar primeiro, limpar depois, só então resolver a pasta do convidado
    expect(rootSteps(h)).toEqual([
      'drive:ensureRootFolder',
      'saveRootFolder',
      'clearGuestFolders',
      'drive:resolveGuestFolder',
    ]);
    expect(h.mocks.resolveGuestFolder.mock.calls[0][2].rootFolderId).toBe('root-2');
  });

  it('raiz substituída mas outra requisição gravou antes: usa a raiz vencedora e não limpa nada', async () => {
    const h = makeHarness();
    ensureReturns(h, 'root-2');
    h.mocks.saveRootFolder.mockImplementationOnce(async () => {
      h.calls.push('saveRootFolder');
      return 'root-vencedora';
    });
    const res = await h.handler(postReq(validBody()));
    expect(res.status).toBe(200);
    expect(h.mocks.saveRootFolder).toHaveBeenCalledWith(WEDDING_ID, 'root-1', 'root-2');
    expect(h.mocks.clearGuestFolders).not.toHaveBeenCalled();
    expect(h.mocks.resolveGuestFolder.mock.calls[0][2].rootFolderId).toBe('root-vencedora');
  });

  it('primeira raiz (folderId nulo) e esta requisição vence: grava com expected nulo e NUNCA limpa', async () => {
    const h = makeHarness({ connection: firstRoot });
    const res = await h.handler(postReq(validBody()));
    expect(res.status).toBe(200);
    expect(h.mocks.saveRootFolder).toHaveBeenCalledTimes(1);
    expect(h.mocks.saveRootFolder).toHaveBeenCalledWith(WEDDING_ID, null, 'root-novo');
    expect(h.mocks.clearGuestFolders).not.toHaveBeenCalled();
    expect(h.mocks.resolveGuestFolder.mock.calls[0][2].rootFolderId).toBe('root-novo');
  });

  it('primeira raiz e outra requisição gravou antes: usa a raiz vencedora e NUNCA limpa', async () => {
    const h = makeHarness({ connection: firstRoot });
    h.mocks.saveRootFolder.mockImplementationOnce(async () => {
      h.calls.push('saveRootFolder');
      return 'root-vencedora';
    });
    const res = await h.handler(postReq(validBody()));
    expect(res.status).toBe(200);
    expect(h.mocks.saveRootFolder).toHaveBeenCalledWith(WEDDING_ID, null, 'root-novo');
    expect(h.mocks.clearGuestFolders).not.toHaveBeenCalled();
    expect(h.mocks.resolveGuestFolder.mock.calls[0][2].rootFolderId).toBe('root-vencedora');
    expect(rootSteps(h)).toEqual(['drive:ensureRootFolder', 'saveRootFolder', 'drive:resolveGuestFolder']);
  });

  it('DriveApiError ao garantir a raiz: 503 unavailable', async () => {
    const h = makeHarness();
    h.mocks.ensureRootFolder.mockRejectedValueOnce(new DriveApiError('Erro do Google Drive (HTTP 500)', 500, true));
    await expectError(await h.handler(postReq(validBody())), 503, 'unavailable');
    expect(h.mocks.resolveGuestFolder).not.toHaveBeenCalled();
  });

  it.each([
    ['primeira raiz', firstRoot],
    ['raiz substituída', { weddingId: WEDDING_ID, uploadsEnabled: true, folderId: 'root-1' }],
  ])('%s: saveRootFolder rejeitado vira 503 e nenhuma etapa seguinte roda', async (_label, connection) => {
    const h = makeHarness({ connection });
    ensureReturns(h, 'root-2');
    h.mocks.saveRootFolder.mockRejectedValueOnce(new Error('banco fora do ar'));
    await expectError(await h.handler(postReq(validBody())), 503, 'unavailable');
    expect(h.mocks.clearGuestFolders).not.toHaveBeenCalled();
    expect(h.mocks.resolveGuestFolder).not.toHaveBeenCalled();
    expect(h.mocks.getQuota).not.toHaveBeenCalled();
    expect(h.mocks.initSession).not.toHaveBeenCalled();
  });

  it('falha ao limpar as pastas de convidado (raiz substituída, esta requisição venceu): 503 e nenhuma sessão é criada', async () => {
    const h = makeHarness();
    ensureReturns(h, 'root-2');
    h.mocks.clearGuestFolders.mockRejectedValueOnce(new Error('banco fora do ar'));
    await expectError(await h.handler(postReq(validBody())), 503, 'unavailable');
    expect(h.mocks.resolveGuestFolder).not.toHaveBeenCalled();
    expect(h.mocks.initSession).not.toHaveBeenCalled();
  });

  it('casamento sem linha em weddings nessa altura: 404 not_found, sem chegar ao Google', async () => {
    const h = makeHarness({ names: null });
    await expectError(await h.handler(postReq(validBody())), 404, 'not_found');
    expect(drive(h.calls)).toEqual([]);
  });
});

describe('guest-upload: POST (11) pasta do convidado', () => {
  it('resolveGuestFolder recebe o token, o store, o casamento, a raiz e o nome sanitizado', async () => {
    const h = makeHarness();
    await h.handler(postReq(validBody()));
    expect(h.mocks.resolveGuestFolder).toHaveBeenCalledTimes(1);
    const [token, store, opts] = h.mocks.resolveGuestFolder.mock.calls[0];
    expect(token).toBe(ACCESS_TOKEN);
    expect(store).toBe(h.guestFolders);
    expect(opts).toEqual({ weddingId: WEDDING_ID, rootFolderId: 'root-1', guestName: 'Maria da Silva' });
  });

  it('sem nome do convidado, resolveGuestFolder recebe string vazia (pasta Anônimo)', async () => {
    const h = makeHarness();
    const body = validBody();
    delete (body as Record<string, unknown>).guestName;
    await h.handler(postReq(body));
    expect(h.mocks.resolveGuestFolder.mock.calls[0][2].guestName).toBe('');
    expect(h.mocks.initSession.mock.calls[0][1].guestName).toBe('');
  });

  it('QuotaExceededError ao criar a pasta: 507 storage_full', async () => {
    const h = makeHarness();
    h.mocks.resolveGuestFolder.mockRejectedValueOnce(new QuotaExceededError('sem espaço'));
    await expectError(await h.handler(postReq(validBody())), 507, 'storage_full');
    expect(h.mocks.initSession).not.toHaveBeenCalled();
  });

  it('erro qualquer ao resolver a pasta: 503 unavailable', async () => {
    const h = makeHarness();
    h.mocks.resolveGuestFolder.mockRejectedValueOnce(new Error('boom'));
    await expectError(await h.handler(postReq(validBody())), 503, 'unavailable');
  });
});

describe('guest-upload: POST (12) cota', () => {
  it('free menor que o arquivo: 507 storage_full e nenhuma sessão criada', async () => {
    const h = makeHarness();
    h.mocks.getQuota.mockResolvedValueOnce({ limit: 1000, usage: 600, free: 400 });
    const res = await h.handler(postReq(validBody({ size: 401 })));
    await expectError(res, 507, 'storage_full');
    expect(h.mocks.getQuota).toHaveBeenCalledWith(ACCESS_TOKEN);
    expect(h.mocks.initSession).not.toHaveBeenCalled();
  });

  it('free igual ao tamanho do arquivo ainda cabe', async () => {
    const h = makeHarness();
    h.mocks.getQuota.mockResolvedValueOnce({ limit: 1000, usage: 600, free: 400 });
    expect((await h.handler(postReq(validBody({ size: 400 })))).status).toBe(200);
  });

  it('conta sem limite (free nulo): passa', async () => {
    const h = makeHarness();
    h.mocks.getQuota.mockResolvedValueOnce({ limit: null, usage: 123, free: null });
    expect((await h.handler(postReq(validBody({ size: MAX_BYTES })))).status).toBe(200);
  });

  it('falha ao consultar a cota: 503 unavailable (falha fechada)', async () => {
    const h = makeHarness();
    h.mocks.getQuota.mockRejectedValueOnce(new DriveApiError('Erro do Google Drive (HTTP 503)', 503, true));
    await expectError(await h.handler(postReq(validBody())), 503, 'unavailable');
    expect(h.mocks.initSession).not.toHaveBeenCalled();
  });
});

describe('guest-upload: POST (13) sessão de upload', () => {
  it('QuotaExceededError: 507 storage_full', async () => {
    const h = makeHarness();
    h.mocks.initSession.mockRejectedValueOnce(new QuotaExceededError('O Google Drive está sem espaço'));
    const body = await expectError(await h.handler(postReq(validBody())), 507, 'storage_full');
    expect(JSON.stringify(body)).not.toContain('Google');
  });

  it('DriveApiError: 503 unavailable com mensagem genérica', async () => {
    const h = makeHarness();
    h.mocks.initSession.mockRejectedValueOnce(new DriveApiError('Erro do Google Drive (HTTP 500)', 500, true));
    const body = await expectError(await h.handler(postReq(validBody())), 503, 'unavailable');
    expect(body.error).toBe('Envio temporariamente indisponível');
  });

  it('NeedsReconnectError na sessão: 503 unavailable', async () => {
    const h = makeHarness();
    h.mocks.initSession.mockRejectedValueOnce(new NeedsReconnectError('revogado'));
    await expectError(await h.handler(postReq(validBody())), 503, 'unavailable');
  });

  it('rejeição de rede (fetch failed) e erros desconhecidos: 503 unavailable, sem vazar o texto', async () => {
    const h = makeHarness();
    h.mocks.initSession.mockRejectedValueOnce(new TypeError(`fetch failed: ${UPLOAD_URL} ${ACCESS_TOKEN}`));
    const res = await h.handler(postReq(validBody()));
    const text = await res.text();
    expect(res.status).toBe(503);
    expect(text).not.toContain('fetch failed');
    expect(text).not.toContain(ACCESS_TOKEN);
    expect(text).not.toContain('upload_id');

    const h2 = makeHarness();
    h2.mocks.initSession.mockRejectedValueOnce('uma string solta lançada');
    await expectError(await h2.handler(postReq(validBody())), 503, 'unavailable');
  });

  it('o log de erro usa só o prefixo fixo e a classe/status do erro (nada de segredo, URL, token ou IP)', async () => {
    const h = makeHarness();
    h.mocks.initSession.mockRejectedValueOnce(
      new TypeError(`fetch failed: ${UPLOAD_URL} ${ACCESS_TOKEN} ${CLIENT_IP} ${TOKEN}`),
    );
    await h.handler(postReq(validBody()));
    expect(errorSpy).toHaveBeenCalled();
    const logged = errorSpy.mock.calls.map((args) => args.map(String).join(' ')).join('\n');
    expect(logged).toContain('[guest-upload]');
    expect(logged).toContain('TypeError');
    for (const secret of [ACCESS_TOKEN, 'upload_id', CLIENT_IP, TOKEN, WEDDING_ID, 'fetch failed']) {
      expect(logged).not.toContain(secret);
    }

    errorSpy.mockClear();
    const h2 = makeHarness();
    h2.mocks.initSession.mockRejectedValueOnce(new DriveApiError('mensagem interna', 503, true));
    await h2.handler(postReq(validBody()));
    const logged2 = errorSpy.mock.calls.map((args) => args.map(String).join(' ')).join('\n');
    expect(logged2).toContain('DriveApiError');
    expect(logged2).toContain('503');
    expect(logged2).not.toContain('mensagem interna');
  });
});

// ---------------------------------------------------------------------------
// (14) caminho feliz
// ---------------------------------------------------------------------------

describe('guest-upload: POST caminho feliz', () => {
  it('200 com { uploadUrl } e initSession recebe tudo o que o Drive precisa', async () => {
    const h = makeHarness();
    const res = await h.handler(postReq(validBody()));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/json');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await bodyOf(res)).toEqual({ uploadUrl: UPLOAD_URL });

    expect(h.mocks.initSession).toHaveBeenCalledTimes(1);
    expect(h.mocks.initSession).toHaveBeenCalledWith(ACCESS_TOKEN, {
      parentId: 'pasta-convidado-1',
      name: 'IMG_0001.JPG',
      mimeType: 'image/jpeg',
      size: 1_500_000,
      weddingId: WEDDING_ID,
      guestName: 'Maria da Silva',
      origin: ORIGIN,
    });
  });

  it('a ordem das dependências segue o contrato e nada é logado como erro', async () => {
    const h = makeHarness();
    await h.handler(postReq(validBody()));
    expect(h.calls).toEqual([
      'findConnection',
      'rate:count:guest_upload_ip',
      'rate:insert:guest_upload_ip',
      'rate:count:guest_upload_wedding',
      'rate:insert:guest_upload_wedding',
      'getCoupleNames',
      'drive:getAccessToken',
      'drive:ensureRootFolder',
      'drive:resolveGuestFolder',
      'drive:getQuota',
      'drive:initSession',
    ]);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('repassa a Origin da requisição (a da segunda origem da lista, por exemplo) ao initSession', async () => {
    const h = makeHarness();
    await h.handler(postReq(validBody(), { origin: 'http://localhost:8080' }));
    expect(h.mocks.initSession.mock.calls[0][1].origin).toBe('http://localhost:8080');
  });
});

// ---------------------------------------------------------------------------
// Pureza do handler
// ---------------------------------------------------------------------------

describe('guest-upload: handler.ts é puro', () => {
  it('não usa Deno.*, o fetch global, imports por URL nem process.env', () => {
    // Comentários não contam: só o código.
    const code = handlerSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/\bDeno\b/);
    expect(code).not.toMatch(/(^|[^.\w])fetch\s*\(/);
    expect(code).not.toMatch(/from\s+["']https?:/);
    expect(code).not.toMatch(/\bprocess\.env\b/);
    expect(code).not.toMatch(/createClient/);
  });
});
