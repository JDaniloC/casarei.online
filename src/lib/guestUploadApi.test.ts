import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  getUploadPageInfo,
  createUploadSession,
  messageForUploadError,
  GuestUploadApiError,
  type UploadErrorCode,
  type UploadPageInfo,
} from './guestUploadApi';

const BASE = 'https://projeto.supabase.co';
const ANON = 'anon-key-secreta-123';
const TOKEN = 'tok_ABCDEFGHIJKLMNOPQRSTUVWX';
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?upload_id=SESSAO-SECRETA-XYZ';

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const textResponse = (status: number, body: string, contentType = 'text/html') =>
  new Response(body, { status, headers: { 'Content-Type': contentType } });

/** fetch falso que devolve uma resposta nova a cada chamada (o corpo só pode ser lido uma vez). */
function fetchReturning(make: () => Response) {
  return vi.fn<typeof fetch>(async () => make());
}

const opts = (fetchFn: typeof fetch) => ({ fetchFn, baseUrl: BASE, anonKey: ANON });

const pageInfo: UploadPageInfo = {
  coupleName: 'Ana & Bruno',
  partnerNames: ['Ana', 'Bruno'],
  available: true,
  maxBytes: 2 * 1024 ** 3,
};

const meta = { fileName: 'IMG_0001.jpg', mimeType: 'image/jpeg', size: 12345, guestName: 'Maria' };

async function rejectionOf(promise: Promise<unknown>): Promise<GuestUploadApiError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(GuestUploadApiError);
    return error as GuestUploadApiError;
  }
  throw new Error('esperava uma rejeição, mas a promessa resolveu');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// getUploadPageInfo
// ---------------------------------------------------------------------------

describe('getUploadPageInfo', () => {
  it('faz GET em /functions/v1/guest-upload?token=... com o header apikey', async () => {
    const fetchFn = fetchReturning(() => jsonResponse(200, pageInfo));

    const info = await getUploadPageInfo(TOKEN, opts(fetchFn));

    expect(info).toEqual(pageInfo);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(`${BASE}/functions/v1/guest-upload?token=${TOKEN}`);
    expect(init?.method ?? 'GET').toBe('GET');
    expect(init?.headers).toEqual({ apikey: ANON });
    expect(init?.body).toBeUndefined();
  });

  it('codifica o token na query string', async () => {
    const fetchFn = fetchReturning(() => jsonResponse(200, pageInfo));

    await getUploadPageInfo('a b&c=d/é', opts(fetchFn));

    expect(fetchFn.mock.calls[0][0]).toBe(`${BASE}/functions/v1/guest-upload?token=${encodeURIComponent('a b&c=d/é')}`);
  });

  it('ignora barras no fim da baseUrl', async () => {
    const fetchFn = fetchReturning(() => jsonResponse(200, pageInfo));

    await getUploadPageInfo(TOKEN, { fetchFn, baseUrl: `${BASE}/`, anonKey: ANON });

    expect(fetchFn.mock.calls[0][0]).toBe(`${BASE}/functions/v1/guest-upload?token=${TOKEN}`);
  });

  it('devolve o motivo quando o envio está desativado', async () => {
    const fetchFn = fetchReturning(() => jsonResponse(200, { ...pageInfo, available: false, reason: 'disabled' }));

    const info = await getUploadPageInfo(TOKEN, opts(fetchFn));

    expect(info.available).toBe(false);
    expect(info.reason).toBe('disabled');
  });

  it('aceita casal com um só nome ou sem nomes', async () => {
    const fetchFn = fetchReturning(() => jsonResponse(200, { ...pageInfo, partnerNames: [] }));
    await expect(getUploadPageInfo(TOKEN, opts(fetchFn))).resolves.toMatchObject({ partnerNames: [] });
  });

  it('sem opções, usa fetch global e as variáveis VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://do-ambiente.supabase.co');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'chave-do-ambiente');
    const fetchFn = fetchReturning(() => jsonResponse(200, pageInfo));
    vi.stubGlobal('fetch', fetchFn);

    await getUploadPageInfo(TOKEN);

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(`https://do-ambiente.supabase.co/functions/v1/guest-upload?token=${TOKEN}`);
    expect(init?.headers).toEqual({ apikey: 'chave-do-ambiente' });
  });

  it('não chama o fetch como método de outro objeto (evita "Illegal invocation" no navegador)', async () => {
    const receivers: unknown[] = [];
    const fetchFn = function (this: unknown) {
      receivers.push(this);
      return Promise.resolve(jsonResponse(200, pageInfo));
    } as unknown as typeof fetch;

    await getUploadPageInfo(TOKEN, opts(fetchFn));

    expect(receivers).toHaveLength(1);
    expect(receivers[0] === undefined || receivers[0] === globalThis).toBe(true);
  });

  it('link inexistente: not_found com status 404', async () => {
    const fetchFn = fetchReturning(() => jsonResponse(404, { error: 'Link de envio não encontrado', code: 'not_found' }));

    const error = await rejectionOf(getUploadPageInfo(TOKEN, opts(fetchFn)));

    expect(error.code).toBe('not_found');
    expect(error.status).toBe(404);
  });

  it('resposta 200 com formato inesperado vira unknown', async () => {
    for (const body of [null, [], 'texto', { coupleName: 'x' }, { ...pageInfo, maxBytes: 'muito' }, { ...pageInfo, partnerNames: 'Ana' }, { ...pageInfo, available: 'sim' }]) {
      const fetchFn = fetchReturning(() => jsonResponse(200, body));
      const error = await rejectionOf(getUploadPageInfo(TOKEN, opts(fetchFn)));
      expect(error.code).toBe('unknown');
      expect(error.status).toBe(200);
    }
  });

  it('falha de rede: code network, status 0', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'));

    const error = await rejectionOf(getUploadPageInfo(TOKEN, opts(fetchFn)));

    expect(error.code).toBe('network');
    expect(error.status).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// createUploadSession
// ---------------------------------------------------------------------------

describe('createUploadSession', () => {
  it('faz POST JSON com token, dados do arquivo e apikey, e devolve a uploadUrl', async () => {
    const fetchFn = fetchReturning(() => jsonResponse(200, { uploadUrl: UPLOAD_URL }));

    const result = await createUploadSession(TOKEN, meta, opts(fetchFn));

    expect(result).toEqual({ uploadUrl: UPLOAD_URL });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(`${BASE}/functions/v1/guest-upload`);
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ apikey: ANON, 'Content-Type': 'application/json' });
    expect(JSON.parse(init?.body as string)).toEqual({ token: TOKEN, ...meta });
  });

  it('o token vai no corpo, nunca na URL', async () => {
    const fetchFn = fetchReturning(() => jsonResponse(200, { uploadUrl: UPLOAD_URL }));

    await createUploadSession(TOKEN, meta, opts(fetchFn));

    expect(fetchFn.mock.calls[0][0]).not.toContain(TOKEN);
  });

  it('guestName é opcional e não vai no corpo quando ausente', async () => {
    const fetchFn = fetchReturning(() => jsonResponse(200, { uploadUrl: UPLOAD_URL }));
    const { guestName: _omitido, ...semNome } = meta;

    await createUploadSession(TOKEN, semNome, opts(fetchFn));

    const body = JSON.parse(fetchFn.mock.calls[0][1]?.body as string);
    expect(body).toEqual({ token: TOKEN, ...semNome });
    expect('guestName' in body).toBe(false);
  });

  it('sem opções, usa fetch global e as variáveis do ambiente', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://do-ambiente.supabase.co');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'chave-do-ambiente');
    const fetchFn = fetchReturning(() => jsonResponse(200, { uploadUrl: UPLOAD_URL }));
    vi.stubGlobal('fetch', fetchFn);

    await createUploadSession(TOKEN, meta);

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://do-ambiente.supabase.co/functions/v1/guest-upload');
    expect(init?.headers).toMatchObject({ apikey: 'chave-do-ambiente' });
  });

  it.each<[number, UploadErrorCode]>([
    [400, 'invalid_input'],
    [400, 'file_type'],
    [400, 'file_too_large'],
    [403, 'forbidden_origin'],
    [404, 'not_found'],
    [409, 'disabled'],
    [429, 'rate_limited'],
    [503, 'unavailable'],
    [507, 'storage_full'],
  ])('resposta %d com code %s é repassada com o mesmo code e status', async (status, code) => {
    const fetchFn = fetchReturning(() => jsonResponse(status, { error: 'mensagem do servidor', code }));

    const error = await rejectionOf(createUploadSession(TOKEN, meta, opts(fetchFn)));

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('GuestUploadApiError');
    expect(error.code).toBe(code);
    expect(error.status).toBe(status);
  });

  it('405 method_not_allowed é tratado como unknown, mantendo o status', async () => {
    const fetchFn = fetchReturning(() => jsonResponse(405, { error: 'Método não permitido', code: 'method_not_allowed' }));

    const error = await rejectionOf(createUploadSession(TOKEN, meta, opts(fetchFn)));

    expect(error.code).toBe('unknown');
    expect(error.status).toBe(405);
  });

  it('code desconhecido no corpo vira unknown', async () => {
    const fetchFn = fetchReturning(() => jsonResponse(400, { error: 'x', code: 'algo_novo' }));

    const error = await rejectionOf(createUploadSession(TOKEN, meta, opts(fetchFn)));

    expect(error.code).toBe('unknown');
    expect(error.status).toBe(400);
  });

  it('erro sem code (ou com code que não é texto) vira unknown', async () => {
    for (const body of [{ error: 'só mensagem' }, { code: 42 }, {}, [], null, 'texto']) {
      const fetchFn = fetchReturning(() => jsonResponse(400, body));
      const error = await rejectionOf(createUploadSession(TOKEN, meta, opts(fetchFn)));
      expect(error.code).toBe('unknown');
    }
  });

  it('corpo de erro ilegível (HTML de gateway, vazio) vira unknown com o status', async () => {
    for (const [status, response] of [
      [502, () => textResponse(502, '<html>Bad Gateway</html>')],
      [500, () => textResponse(500, '')],
      [503, () => textResponse(503, '{quebrado', 'application/json')],
    ] as const) {
      const fetchFn = fetchReturning(response);
      const error = await rejectionOf(createUploadSession(TOKEN, meta, opts(fetchFn)));
      expect(error.code).toBe('unknown');
      expect(error.status).toBe(status);
    }
  });

  it('200 com corpo ilegível ou sem uploadUrl vira unknown', async () => {
    const bodies: Array<() => Response> = [
      () => textResponse(200, 'não é json'),
      () => jsonResponse(200, {}),
      () => jsonResponse(200, { uploadUrl: 42 }),
      () => jsonResponse(200, { uploadUrl: '' }),
      () => jsonResponse(200, null),
    ];
    for (const make of bodies) {
      const error = await rejectionOf(createUploadSession(TOKEN, meta, opts(fetchReturning(make))));
      expect(error.code).toBe('unknown');
      expect(error.status).toBe(200);
    }
  });

  it('falha de rede (fetch rejeita): code network, status 0', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'));

    const error = await rejectionOf(createUploadSession(TOKEN, meta, opts(fetchFn)));

    expect(error.code).toBe('network');
    expect(error.status).toBe(0);
  });

  it('qualquer rejeição do fetch (não só TypeError) é falha de rede', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(new DOMException('cancelado', 'AbortError'));

    const error = await rejectionOf(createUploadSession(TOKEN, meta, opts(fetchFn)));

    expect(error.code).toBe('network');
  });
});

// ---------------------------------------------------------------------------
// Nada sensível nas mensagens de erro
// ---------------------------------------------------------------------------

describe('segredos nunca aparecem em GuestUploadApiError', () => {
  const secrets = [TOKEN, UPLOAD_URL, 'SESSAO-SECRETA-XYZ', ANON, BASE, 'googleapis'];

  const scenarios: Array<[string, () => Promise<unknown>]> = [
    [
      'servidor que devolve o token na mensagem de erro',
      () => createUploadSession(TOKEN, meta, opts(fetchReturning(() => jsonResponse(400, { error: `Token ${TOKEN} inválido`, code: 'invalid_input' })))),
    ],
    [
      'servidor que devolve a URL de sessão na mensagem de erro',
      () => createUploadSession(TOKEN, meta, opts(fetchReturning(() => jsonResponse(503, { error: UPLOAD_URL, code: 'unavailable' })))),
    ],
    [
      'servidor que ecoa a chave anônima em erro desconhecido',
      () => createUploadSession(TOKEN, meta, opts(fetchReturning(() => jsonResponse(500, { error: ANON, code: 'algo_novo' })))),
    ],
    [
      'fetch que rejeita com mensagem contendo a URL, o token e a chave',
      () =>
        createUploadSession(
          TOKEN,
          meta,
          opts(vi.fn<typeof fetch>().mockRejectedValue(new TypeError(`Failed to fetch ${BASE}/functions/v1/guest-upload?token=${TOKEN} apikey=${ANON}`))),
        ),
    ],
    [
      'GET com fetch que rejeita citando a URL',
      () =>
        getUploadPageInfo(
          TOKEN,
          opts(vi.fn<typeof fetch>().mockRejectedValue(new TypeError(`NetworkError ${BASE}/functions/v1/guest-upload?token=${TOKEN}`))),
        ),
    ],
    [
      'corpo 200 com uploadUrl inválida',
      () => createUploadSession(TOKEN, meta, opts(fetchReturning(() => jsonResponse(200, { uploadUrl: 42, note: UPLOAD_URL })))),
    ],
    [
      'corpo ilegível que contém o token',
      () => createUploadSession(TOKEN, meta, opts(fetchReturning(() => textResponse(502, `<html>${TOKEN} ${UPLOAD_URL}</html>`)))),
    ],
  ];

  it.each(scenarios)('%s', async (_label, run) => {
    const error = await rejectionOf(run());

    for (const secret of secrets) {
      expect(error.message).not.toContain(secret);
      expect(String(error)).not.toContain(secret);
      expect(error.stack ?? '').not.toContain(secret);
    }
    expect((error as { cause?: unknown }).cause).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// messageForUploadError
// ---------------------------------------------------------------------------

describe('messageForUploadError', () => {
  const GENERIC = 'Não foi possível enviar. Tente novamente.';

  it.each<[UploadErrorCode | 'network', string]>([
    ['file_too_large', 'Arquivos acima de 2 GB: fale com os noivos para combinar o envio.'],
    ['rate_limited', 'Muitos envios em pouco tempo. Aguarde alguns minutos e tente de novo.'],
    ['network', 'Não foi possível enviar. Verifique sua conexão e tente de novo. Se continuar, abra esta página no Chrome.'],
    ['disabled', 'O envio de fotos está desativado no momento.'],
    ['unavailable', 'O envio está temporariamente indisponível. Tente de novo mais tarde.'],
    ['storage_full', 'O envio está temporariamente indisponível. Tente de novo mais tarde.'],
    ['invalid_input', 'Não foi possível enviar este arquivo. Verifique-o e tente de novo.'],
    ['file_type', 'Este tipo de arquivo não é aceito. Envie apenas fotos ou vídeos.'],
    ['forbidden_origin', 'O envio não está disponível a partir deste endereço. Abra o link do QR code novamente.'],
    ['not_found', 'Link de envio não encontrado. Confira o QR code com os noivos.'],
  ])('%s', (code, expected) => {
    expect(messageForUploadError(new GuestUploadApiError(code, 400))).toBe(expected);
  });

  it('code unknown devolve a mensagem genérica em pt-BR', () => {
    expect(messageForUploadError(new GuestUploadApiError('unknown', 500))).toBe(GENERIC);
  });

  it('code fora da lista (incluindo method_not_allowed vindo de fora do tipo) devolve a genérica', () => {
    const outsider = new GuestUploadApiError('method_not_allowed' as unknown as UploadErrorCode, 405);
    expect(messageForUploadError(outsider)).toBe(GENERIC);
  });

  it('erros que não são GuestUploadApiError também devolvem a genérica', () => {
    expect(messageForUploadError(new Error('qualquer coisa interna'))).toBe(GENERIC);
    expect(messageForUploadError(new TypeError('Failed to fetch'))).toBe(GENERIC);
    expect(messageForUploadError('texto')).toBe(GENERIC);
    expect(messageForUploadError(null)).toBe(GENERIC);
    expect(messageForUploadError(undefined)).toBe(GENERIC);
  });

  it('a mensagem do próprio erro é a mesma do messageForUploadError', () => {
    const error = new GuestUploadApiError('rate_limited', 429);
    expect(error.message).toBe(messageForUploadError(error));
  });

  it('todas as mensagens são frases em pt-BR sem caracteres de escape quebrados', () => {
    const codes: Array<UploadErrorCode | 'network' | 'unknown'> = [
      'invalid_input', 'file_type', 'file_too_large', 'forbidden_origin', 'not_found',
      'disabled', 'rate_limited', 'unavailable', 'storage_full', 'network', 'unknown',
    ];
    for (const code of codes) {
      const message = messageForUploadError(new GuestUploadApiError(code, 0));
      expect(message.length).toBeGreaterThan(10);
      expect(message).not.toContain('\\u');
      expect(message.endsWith('.')).toBe(true);
    }
  });
});
