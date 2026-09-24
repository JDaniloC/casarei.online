import { describe, it, expect } from 'vitest';
import {
  listGuestFiles,
  summarizeGuestFiles,
  getThumbnails,
  getQuota,
  type DriveFileSummary,
} from '../../supabase/functions/_shared/google-drive-read';
import { DriveApiError, type FetchFn } from '../../supabase/functions/_shared/google-drive';

// ---------------------------------------------------------------------------
// Fetch falso: grava cada chamada (URL, método, headers) e as Responses que
// devolveu, para conferir se todo corpo foi consumido ou cancelado.
// ---------------------------------------------------------------------------

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
}

function createFakeFetch(handler: (call: Call, index: number) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const responses: Response[] = [];
  const fetchFn: FetchFn = async (input, init) => {
    const call: Call = {
      url: input,
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
    };
    calls.push(call);
    const res = await handler(call, calls.length - 1);
    responses.push(res);
    return res;
  };
  return { fetchFn, calls, responses };
}

// Devolve as respostas na ordem; uma chamada além do roteiro derruba o teste.
function scripted(...responses: Response[]) {
  return createFakeFetch((call, index) => {
    const response = responses[index];
    if (!response) throw new Error(`fetch inesperado #${index}: ${call.method} ${call.url}`);
    return response;
  });
}

// Todo corpo que chegou do fetch precisa ter sido lido ou cancelado (senão a
// conexão fica presa no runtime do Deno). Corpo nulo não tem o que consumir.
function expectBodiesConsumed(responses: Response[]) {
  for (const res of responses) {
    if (res.body !== null) expect(res.bodyUsed).toBe(true);
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const TOKEN = 'ya29.super-secret-token';
const AUTH = { Authorization: `Bearer ${TOKEN}` };
const WEDDING = '771e4eca-0000-4000-8000-000000000001';
const OTHER_WEDDING = '9b2f6c1d-1111-4222-8333-000000000002';
const FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const ABOUT_URL = 'https://www.googleapis.com/drive/v3/about';

const EXPECTED_Q = `trashed=false and appProperties has { key='v' and value='1' } and appProperties has { key='w' and value='${WEDDING}' }`;
const LIST_FIELDS =
  'nextPageToken,files(id,name,mimeType,size,createdTime,hasThumbnail,videoMediaMetadata(durationMillis),appProperties)';

const params = (url: string) => new URL(url).searchParams;

// Todas as chaves de um valor JSON, recursivamente.
function collectKeys(value: unknown, keys: string[] = []): string[] {
  if (Array.isArray(value)) {
    value.forEach((item) => collectKeys(item, keys));
  } else if (typeof value === 'object' && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      keys.push(key);
      collectKeys(item, keys);
    }
  }
  return keys;
}

const INVALID_WEDDING_IDS = [
  '',
  'not-a-uuid',
  '771e4eca-0000-4000-8000-00000000000g',
  `${WEDDING} `,
  `${WEDDING}' } or trashed=true or appProperties has { key='w' and value='x`,
  "x' or 1=1 or 'a'='a",
];

const driveFile = (over: Record<string, unknown> = {}) => ({
  id: 'file-1',
  name: 'IMG_0001.jpg',
  mimeType: 'image/jpeg',
  size: '2048',
  createdTime: '2026-09-20T18:30:00.000Z',
  hasThumbnail: true,
  appProperties: { v: '1', w: WEDDING, g: 'Ana Souza' },
  ...over,
});

// ---------------------------------------------------------------------------
// listGuestFiles
// ---------------------------------------------------------------------------

describe('listGuestFiles', () => {
  it('consulta /files com o filtro q exato, URL-encodado, ordenação e fields', async () => {
    const { fetchFn, calls, responses } = scripted(json({ files: [] }));

    await listGuestFiles(fetchFn, TOKEN, WEDDING);

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call.method).toBe('GET');
    expect(call.headers).toEqual(AUTH);
    expect(call.url.startsWith(`${FILES_URL}?`)).toBe(true);

    const query = params(call.url);
    expect(query.get('q')).toBe(EXPECTED_Q);
    expect(query.get('orderBy')).toBe('createdTime desc');
    expect(query.get('pageSize')).toBe('50');
    expect(query.get('fields')).toBe(LIST_FIELDS);
    expect(query.has('pageToken')).toBe(false);
    expect(query.get('fields')).not.toMatch(/link|parents/i);

    // Na URL crua nada de espaço, chave ou aspas soltas: o q precisa estar encodado.
    const raw = call.url.split('?')[1];
    expect(raw).not.toMatch(/[ {}]/);
    const rawQ = raw.split('&').find((pair) => pair.startsWith('q=')) as string;
    expect(rawQ).toContain('q=trashed%3Dfalse%20and%20appProperties%20has%20%7B%20key%3D');
    expect(decodeURIComponent(rawQ.slice(2))).toBe(EXPECTED_Q);
    expectBodiesConsumed(responses);
  });

  it.each(INVALID_WEDDING_IDS)('weddingId inválido (%j) lança sem chamar o Drive', async (weddingId) => {
    const { fetchFn, calls } = scripted();

    await expect(listGuestFiles(fetchFn, TOKEN, weddingId)).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it('pageSize: padrão 50, máximo 100 e valores inválidos voltam ao padrão', async () => {
    const cases: Array<[number | undefined, string]> = [
      [undefined, '50'],
      [25, '25'],
      [12.7, '12'],
      [100, '100'],
      [500, '100'],
      [0, '50'],
      [-3, '50'],
      [Number.NaN, '50'],
    ];
    for (const [pageSize, expected] of cases) {
      const { fetchFn, calls } = scripted(json({ files: [] }));
      await listGuestFiles(fetchFn, TOKEN, WEDDING, pageSize === undefined ? {} : { pageSize });
      expect(params(calls[0].url).get('pageSize')).toBe(expected);
    }
  });

  it('repassa o pageToken (encodado) e devolve o nextPageToken', async () => {
    const { fetchFn, calls } = scripted(json({ files: [driveFile()], nextPageToken: 'next+/=&token' }));

    const page = await listGuestFiles(fetchFn, TOKEN, WEDDING, { pageToken: 'cur+/=&token' });

    expect(params(calls[0].url).get('pageToken')).toBe('cur+/=&token');
    expect(params(calls[0].url).get('q')).toBe(EXPECTED_Q);
    expect(page.nextPageToken).toBe('next+/=&token');
    expect(page.files).toHaveLength(1);
  });

  it('última página: nextPageToken é null', async () => {
    const { fetchFn } = scripted(json({ files: [driveFile()] }));
    const page = await listGuestFiles(fetchFn, TOKEN, WEDDING);
    expect(page.nextPageToken).toBeNull();
  });

  it('mapeia o arquivo para DriveFileSummary', async () => {
    const { fetchFn } = scripted(
      json({
        files: [
          driveFile({
            id: 'video-1',
            name: 'VID_0002.mp4',
            mimeType: 'video/mp4',
            size: '73400320',
            hasThumbnail: false,
            videoMediaMetadata: { durationMillis: '12345' },
            appProperties: { v: '1', w: WEDDING, g: 'João' },
          }),
          driveFile({ id: 'photo-2', appProperties: { v: '1', w: WEDDING } }),
          driveFile({ id: 'photo-3', size: undefined, hasThumbnail: undefined, videoMediaMetadata: {} }),
          driveFile({ id: 'photo-4', size: 'abc', videoMediaMetadata: { durationMillis: 'xyz' } }),
        ],
      }),
    );

    const { files } = await listGuestFiles(fetchFn, TOKEN, WEDDING);

    const expected: DriveFileSummary[] = [
      {
        id: 'video-1',
        name: 'VID_0002.mp4',
        guestName: 'João',
        mimeType: 'video/mp4',
        size: 73400320,
        createdTime: '2026-09-20T18:30:00.000Z',
        hasThumbnail: false,
        durationMs: 12345,
      },
      {
        id: 'photo-2',
        name: 'IMG_0001.jpg',
        guestName: '',
        mimeType: 'image/jpeg',
        size: 2048,
        createdTime: '2026-09-20T18:30:00.000Z',
        hasThumbnail: true,
        durationMs: null,
      },
      {
        id: 'photo-3',
        name: 'IMG_0001.jpg',
        guestName: 'Ana Souza',
        mimeType: 'image/jpeg',
        size: 0,
        createdTime: '2026-09-20T18:30:00.000Z',
        hasThumbnail: false,
        durationMs: null,
      },
      {
        id: 'photo-4',
        name: 'IMG_0001.jpg',
        guestName: 'Ana Souza',
        mimeType: 'image/jpeg',
        size: 0,
        createdTime: '2026-09-20T18:30:00.000Z',
        hasThumbnail: true,
        durationMs: null,
      },
    ];
    expect(files).toEqual(expected);
  });

  it('nenhuma chave da saída contém "link" nem "parents", mesmo se o Drive devolver esses campos', async () => {
    const { fetchFn } = scripted(
      json({
        nextPageToken: 'tok',
        files: [
          driveFile({
            parents: ['pasta-de-outro-lugar'],
            webViewLink: 'https://drive.google.com/file/d/file-1/view',
            webContentLink: 'https://drive.google.com/uc?id=file-1',
            thumbnailLink: 'https://lh3.googleusercontent.com/abc=s220',
            iconLink: 'https://drive-thirdparty.googleusercontent.com/icon.png',
            videoMediaMetadata: { durationMillis: '900', width: 1920 },
          }),
        ],
      }),
    );

    const result = await listGuestFiles(fetchFn, TOKEN, WEDDING);

    const keys = collectKeys(result);
    expect(keys.filter((key) => /link/i.test(key))).toEqual([]);
    expect(keys).not.toContain('parents');
    expect(Object.keys(result.files[0]).sort()).toEqual(
      ['createdTime', 'durationMs', 'guestName', 'hasThumbnail', 'id', 'mimeType', 'name', 'size'].sort(),
    );
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('drive.google.com');
    expect(serialized).not.toContain('googleusercontent');
    expect(serialized).not.toContain(TOKEN);
  });

  it('descarta arquivos que não pertencem ao casamento mesmo que o Drive os devolva (isolamento)', async () => {
    const { fetchFn } = scripted(
      json({
        files: [
          driveFile({ id: 'mine' }),
          driveFile({ id: 'other-wedding', appProperties: { v: '1', w: OTHER_WEDDING, g: 'Intruso' } }),
          driveFile({ id: 'no-wedding', appProperties: { v: '1' } }),
          driveFile({ id: 'no-version', appProperties: { w: WEDDING } }),
          driveFile({ id: 'wrong-version', appProperties: { v: '2', w: WEDDING } }),
          driveFile({ id: 'no-props', appProperties: undefined }),
          driveFile({ id: 'null-props', appProperties: null }),
        ],
      }),
    );

    const { files } = await listGuestFiles(fetchFn, TOKEN, WEDDING);

    expect(files.map((file) => file.id)).toEqual(['mine']);
  });

  it('descarta entradas sem id ou que não sejam objetos', async () => {
    const { fetchFn } = scripted(
      json({ files: [driveFile({ id: 'ok' }), driveFile({ id: undefined }), driveFile({ id: 42 }), null, 'texto'] }),
    );
    const { files } = await listGuestFiles(fetchFn, TOKEN, WEDDING);
    expect(files.map((file) => file.id)).toEqual(['ok']);
  });

  it('Drive sem a chave files devolve lista vazia', async () => {
    const { fetchFn } = scripted(json({}));
    expect(await listGuestFiles(fetchFn, TOKEN, WEDDING)).toEqual({ files: [], nextPageToken: null });
  });

  it('erro HTTP vira DriveApiError, consome o corpo e não vaza o token', async () => {
    const { fetchFn, responses } = scripted(
      json({ error: { code: 500, message: `falha com ${TOKEN}`, errors: [{ reason: 'backendError' }] } }, 500),
    );

    const error = await listGuestFiles(fetchFn, TOKEN, WEDDING).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DriveApiError);
    expect((error as DriveApiError).status).toBe(500);
    expect((error as DriveApiError).retryable).toBe(true);
    expect((error as Error).message).not.toContain(TOKEN);
    expect(String((error as Error).stack)).not.toContain(TOKEN);
    expectBodiesConsumed(responses);
  });

  it('erro com corpo de texto que repete o token também não o vaza', async () => {
    const { fetchFn, responses } = scripted(new Response(`Bearer ${TOKEN} recusado`, { status: 401 }));

    const error = await listGuestFiles(fetchFn, TOKEN, WEDDING).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DriveApiError);
    expect((error as DriveApiError).status).toBe(401);
    expect((error as DriveApiError).retryable).toBe(false);
    expect((error as Error).message).not.toContain(TOKEN);
    expectBodiesConsumed(responses);
  });

  it('resposta 200 que não é JSON vira DriveApiError 502', async () => {
    const { fetchFn, responses } = scripted(new Response('<html>oi</html>', { status: 200 }));

    const error = await listGuestFiles(fetchFn, TOKEN, WEDDING).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DriveApiError);
    expect((error as DriveApiError).status).toBe(502);
    expectBodiesConsumed(responses);
  });
});

// ---------------------------------------------------------------------------
// summarizeGuestFiles
// ---------------------------------------------------------------------------

describe('summarizeGuestFiles', () => {
  it('usa o mesmo filtro q, pageSize=1000 e fields=nextPageToken,files(size)', async () => {
    const { fetchFn, calls, responses } = scripted(json({ files: [] }));

    const summary = await summarizeGuestFiles(fetchFn, TOKEN, WEDDING);

    expect(summary).toEqual({ count: 0, totalBytes: 0 });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('GET');
    expect(calls[0].headers).toEqual(AUTH);
    expect(calls[0].url.startsWith(`${FILES_URL}?`)).toBe(true);
    const query = params(calls[0].url);
    expect(query.get('q')).toBe(EXPECTED_Q);
    expect(query.get('pageSize')).toBe('1000');
    expect(query.get('fields')).toBe('nextPageToken,files(size)');
    expect(query.has('pageToken')).toBe(false);
    expect(calls[0].url.split('?')[1]).not.toMatch(/[ {}]/);
    expectBodiesConsumed(responses);
  });

  it.each(INVALID_WEDDING_IDS)('weddingId inválido (%j) lança sem chamar o Drive', async (weddingId) => {
    const { fetchFn, calls } = scripted();

    await expect(summarizeGuestFiles(fetchFn, TOKEN, weddingId)).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it('soma várias páginas seguindo o nextPageToken', async () => {
    const { fetchFn, calls, responses } = scripted(
      json({ files: [{ size: '100' }, { size: '250' }], nextPageToken: 'p2' }),
      json({ files: [{ size: '1000' }, {}, { size: 'lixo' }], nextPageToken: 'p3' }),
      json({ files: [{ size: '5' }] }),
    );

    const summary = await summarizeGuestFiles(fetchFn, TOKEN, WEDDING);

    expect(summary).toEqual({ count: 6, totalBytes: 1355 });
    expect(calls).toHaveLength(3);
    expect(params(calls[0].url).has('pageToken')).toBe(false);
    expect(params(calls[1].url).get('pageToken')).toBe('p2');
    expect(params(calls[2].url).get('pageToken')).toBe('p3');
    for (const call of calls) expect(params(call.url).get('q')).toBe(EXPECTED_Q);
    expectBodiesConsumed(responses);
  });

  it('para no limite de segurança de 50 páginas', async () => {
    const { fetchFn, calls } = createFakeFetch(() => json({ files: [{ size: '10' }], nextPageToken: 'sempre-mais' }));

    const summary = await summarizeGuestFiles(fetchFn, TOKEN, WEDDING);

    expect(calls).toHaveLength(50);
    expect(summary).toEqual({ count: 50, totalBytes: 500 });
  });

  it('erro numa página lança (não devolve total parcial) e não vaza o token', async () => {
    const { fetchFn, responses } = scripted(
      json({ files: [{ size: '100' }], nextPageToken: 'p2' }),
      json({ error: { message: `sem acesso: ${TOKEN}` } }, 403),
    );

    const error = await summarizeGuestFiles(fetchFn, TOKEN, WEDDING).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DriveApiError);
    expect((error as DriveApiError).status).toBe(403);
    expect((error as Error).message).not.toContain(TOKEN);
    expectBodiesConsumed(responses);
  });
});

// ---------------------------------------------------------------------------
// getThumbnails
// ---------------------------------------------------------------------------

const THUMB_HOST = 'lh3.googleusercontent.com';
const thumbLink = (id: string, size = 220) => `https://${THUMB_HOST}/thumb-${id}=s${size}`;

const okMeta = (id: string, over: Record<string, unknown> = {}) =>
  json({
    id,
    hasThumbnail: true,
    thumbnailLink: thumbLink(id),
    appProperties: { v: '1', w: WEDDING, g: 'Ana' },
    ...over,
  });

// FF D8 FF E0: início de um JPEG; em base64 vira "/9j/4A==".
const JPEG_BYTES = Uint8Array.of(0xff, 0xd8, 0xff, 0xe0);
const JPEG_B64 = '/9j/4A==';

const image = (bytes: Uint8Array = JPEG_BYTES, type: string | null = 'image/jpeg', status = 200) =>
  new Response(bytes, { status, headers: type === null ? {} : { 'Content-Type': type } });

// Drive falso por id: metadados em www.googleapis.com, imagem em googleusercontent.
interface FakeFile {
  meta?: () => Response;
  image?: () => Response;
}
function fakeDrive(files: Map<string, FakeFile>, hook?: { before?: () => Promise<void> | void; after?: () => void }) {
  return createFakeFetch(async (call) => {
    await hook?.before?.();
    try {
      const url = new URL(call.url);
      if (url.hostname === 'www.googleapis.com') {
        const id = decodeURIComponent(url.pathname.split('/').pop() as string);
        const file = files.get(id);
        return file ? (file.meta ? file.meta() : okMeta(id)) : new Response('{"error":{"code":404}}', { status: 404 });
      }
      const id = decodeURIComponent(url.pathname.slice('/thumb-'.length)).replace(/=s\d+$/, '');
      const file = files.get(id);
      return file?.image ? file.image() : image();
    } finally {
      hook?.after?.();
    }
  });
}

describe('getThumbnails', () => {
  it('sucesso: busca metadados, troca =s220 por =s400 e devolve data URL', async () => {
    const { fetchFn, calls, responses } = scripted(okMeta('file-abc123'), image());

    const result = await getThumbnails(fetchFn, TOKEN, WEDDING, ['file-abc123']);

    expect(result).toEqual({ 'file-abc123': `data:image/jpeg;base64,${JPEG_B64}` });
    expect(calls).toHaveLength(2);
    expect(calls[0].method).toBe('GET');
    expect(calls[0].headers).toEqual(AUTH);
    expect(calls[0].url.startsWith(`${FILES_URL}/file-abc123?`)).toBe(true);
    expect([...params(calls[0].url).keys()]).toEqual(['fields']);
    expect(params(calls[0].url).get('fields')).toBe('id,hasThumbnail,thumbnailLink,appProperties');
    expect(calls[1].url).toBe(`https://${THUMB_HOST}/thumb-file-abc123=s400`);
    expect(calls[1].headers).toEqual(AUTH);
    expect(JSON.stringify(result)).not.toContain(TOKEN);
    expectBodiesConsumed(responses);
  });

  it('tamanho na URL: troca qualquer =s<n> do fim e acrescenta =s400 quando não há', async () => {
    for (const [link, expected] of [
      [`https://${THUMB_HOST}/abc=s1600`, `https://${THUMB_HOST}/abc=s400`],
      [`https://${THUMB_HOST}/abc=s64`, `https://${THUMB_HOST}/abc=s400`],
      [`https://${THUMB_HOST}/abc`, `https://${THUMB_HOST}/abc=s400`],
    ]) {
      const { fetchFn, calls } = scripted(okMeta('f1', { thumbnailLink: link }), image());
      const result = await getThumbnails(fetchFn, TOKEN, WEDDING, ['f1']);
      expect(calls[1].url).toBe(expected);
      expect(result.f1).toBe(`data:image/jpeg;base64,${JPEG_B64}`);
    }
  });

  it('aceita subdomínios de googleusercontent.com', async () => {
    const { fetchFn, calls } = scripted(
      okMeta('f1', { thumbnailLink: 'https://lh3.googleusercontent.com/x=s220' }),
      image(),
      okMeta('f2', { thumbnailLink: 'https://a.b.googleusercontent.com/x=s220' }),
      image(),
    );
    const result = await getThumbnails(fetchFn, TOKEN, WEDDING, ['f1']);
    const second = await getThumbnails(fetchFn, TOKEN, WEDDING, ['f2']);
    expect(result.f1).toBe(`data:image/jpeg;base64,${JPEG_B64}`);
    expect(second.f2).toBe(`data:image/jpeg;base64,${JPEG_B64}`);
    expect(calls[3].url).toBe('https://a.b.googleusercontent.com/x=s400');
  });

  it('ISOLAMENTO: arquivo de outro casamento vira null e a imagem NÃO é buscada', async () => {
    const { fetchFn, calls, responses } = scripted(
      okMeta('alheio', { appProperties: { v: '1', w: OTHER_WEDDING, g: 'Intruso' } }),
    );

    const result = await getThumbnails(fetchFn, TOKEN, WEDDING, ['alheio']);

    expect(result).toEqual({ alheio: null });
    expect(calls).toHaveLength(1);
    expect(calls.some((call) => call.url.includes('googleusercontent.com'))).toBe(false);
    expect(JSON.stringify(result)).not.toContain('data:');
    expectBodiesConsumed(responses);
  });

  it.each([
    ['sem appProperties', { appProperties: undefined }],
    ['appProperties nulo', { appProperties: null }],
    ['sem w', { appProperties: { v: '1' } }],
    ['w vazio', { appProperties: { v: '1', w: '' } }],
    ['sem v', { appProperties: { w: WEDDING } }],
    ['v diferente de "1"', { appProperties: { v: '2', w: WEDDING } }],
    ['v numérico', { appProperties: { v: 1, w: WEDDING } }],
    ['w em maiúsculas (comparação estrita)', { appProperties: { v: '1', w: WEDDING.toUpperCase() } }],
  ])('marca inválida (%s) vira null sem buscar a imagem', async (_label, over) => {
    const { fetchFn, calls } = scripted(okMeta('f1', over));

    const result = await getThumbnails(fetchFn, TOKEN, WEDDING, ['f1']);

    expect(result).toEqual({ f1: null });
    expect(calls).toHaveLength(1);
  });

  it.each([
    ['hasThumbnail false', { hasThumbnail: false }],
    ['sem hasThumbnail', { hasThumbnail: undefined }],
    ['sem thumbnailLink', { thumbnailLink: undefined }],
    ['thumbnailLink vazio', { thumbnailLink: '' }],
    ['thumbnailLink não-string', { thumbnailLink: 42 }],
  ])('sem miniatura (%s) vira null sem buscar a imagem', async (_label, over) => {
    const { fetchFn, calls } = scripted(okMeta('f1', over));

    const result = await getThumbnails(fetchFn, TOKEN, WEDDING, ['f1']);

    expect(result).toEqual({ f1: null });
    expect(calls).toHaveLength(1);
  });

  it.each([
    'http://lh3.googleusercontent.com/x=s220',
    'https://evil.example.com/x=s220',
    'https://evilgoogleusercontent.com/x=s220',
    'https://googleusercontent.com/x=s220',
    'https://lh3.googleusercontent.com.evil.com/x=s220',
    'https://lh3.googleusercontent.com@evil.com/x=s220',
    'https://user:pass@lh3.googleusercontent.com/x=s220',
    'https://lh3.googleusercontent.com:8443/x=s220',
    'https://drive.google.com/thumbnail?id=abc',
    'data:image/png;base64,AAAA',
    'javascript:alert(1)',
    'nao e uma url',
  ])('host/protocolo inválido (%s) vira null e o token não é enviado', async (thumbnailLink) => {
    const { fetchFn, calls } = scripted(okMeta('f1', { thumbnailLink }));

    const result = await getThumbnails(fetchFn, TOKEN, WEDDING, ['f1']);

    expect(result).toEqual({ f1: null });
    expect(calls).toHaveLength(1);
    expect(calls[0].url.startsWith(FILES_URL)).toBe(true);
  });

  it.each([
    ['text/html', 'text/html'],
    ['application/octet-stream', 'application/octet-stream'],
    ['sem content-type', null],
    ['image/ com lixo', 'image/png,evil'],
    ['image/ com espaço', 'image/ png'],
  ])('resposta que não é imagem (%s) vira null', async (_label, type) => {
    const { fetchFn, responses } = scripted(okMeta('f1'), image(JPEG_BYTES, type));

    const result = await getThumbnails(fetchFn, TOKEN, WEDDING, ['f1']);

    expect(result).toEqual({ f1: null });
    expectBodiesConsumed(responses);
  });

  it('usa só o tipo de mídia do content-type na data URL (sem parâmetros, em minúsculas)', async () => {
    const { fetchFn } = scripted(okMeta('f1'), image(JPEG_BYTES, 'IMAGE/PNG; charset=binary'));

    const result = await getThumbnails(fetchFn, TOKEN, WEDDING, ['f1']);

    expect(result.f1).toBe(`data:image/png;base64,${JPEG_B64}`);
  });

  it('imagem de exatamente 500 KB passa; 1 byte a mais vira null', async () => {
    const limit = 500 * 1024;
    const exact = scripted(okMeta('f1'), image(new Uint8Array(limit)));
    const over = scripted(okMeta('f1'), image(new Uint8Array(limit + 1)));

    const okResult = await getThumbnails(exact.fetchFn, TOKEN, WEDDING, ['f1']);
    const bigResult = await getThumbnails(over.fetchFn, TOKEN, WEDDING, ['f1']);

    expect(okResult.f1).toMatch(/^data:image\/jpeg;base64,/);
    expect(bigResult).toEqual({ f1: null });
    expectBodiesConsumed([...exact.responses, ...over.responses]);
  });

  it('base64 correto em imagem grande (cruza os blocos de conversão)', async () => {
    const bytes = Uint8Array.from({ length: 100_003 }, (_, i) => (i * 31 + 7) % 256);
    const { fetchFn } = scripted(okMeta('f1'), image(bytes));

    const result = await getThumbnails(fetchFn, TOKEN, WEDDING, ['f1']);

    const dataUrl = result.f1 as string;
    expect(dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true);
    const decoded = Uint8Array.from(atob(dataUrl.slice('data:image/jpeg;base64,'.length)), (c) => c.charCodeAt(0));
    expect(decoded.length).toBe(bytes.length);
    expect(decoded.every((byte, i) => byte === bytes[i])).toBe(true);
  });

  it('imagem vazia vira null', async () => {
    const { fetchFn } = scripted(okMeta('f1'), image(new Uint8Array(0)));
    expect(await getThumbnails(fetchFn, TOKEN, WEDDING, ['f1'])).toEqual({ f1: null });
  });

  it('metadados com erro HTTP (404/403/500) viram null e consomem o corpo', async () => {
    const { fetchFn, calls, responses } = scripted(
      new Response('{"error":{"code":404}}', { status: 404 }),
      new Response(`negado ${TOKEN}`, { status: 403 }),
      new Response('erro', { status: 500 }),
    );

    const result = await getThumbnails(fetchFn, TOKEN, WEDDING, ['a1', 'b2', 'c3']);

    expect(result).toEqual({ a1: null, b2: null, c3: null });
    expect(calls).toHaveLength(3);
    expect(JSON.stringify(result)).not.toContain(TOKEN);
    expectBodiesConsumed(responses);
  });

  it('metadados que não são JSON viram null', async () => {
    const { fetchFn, calls, responses } = scripted(new Response('<html>', { status: 200 }));

    expect(await getThumbnails(fetchFn, TOKEN, WEDDING, ['f1'])).toEqual({ f1: null });
    expect(calls).toHaveLength(1);
    expectBodiesConsumed(responses);
  });

  it('um id falhando (exceção, 404, sem miniatura, outro casamento) não derruba os outros', async () => {
    const files = new Map<string, FakeFile>([
      ['boom', { meta: () => { throw new Error(`rede caiu com ${TOKEN}`); } }],
      ['sumiu-404', { meta: () => new Response('nope', { status: 404 }) }],
      ['sem-thumb', { meta: () => okMeta('sem-thumb', { hasThumbnail: false }) }],
      ['alheio', { meta: () => okMeta('alheio', { appProperties: { v: '1', w: OTHER_WEDDING } }) }],
      ['boa-1', {}],
      ['boa-2', {}],
    ]);
    const { fetchFn, calls, responses } = fakeDrive(files);

    const result = await getThumbnails(fetchFn, TOKEN, WEDDING, [...files.keys()]);

    const ok = `data:image/jpeg;base64,${JPEG_B64}`;
    expect(result).toEqual({
      boom: null,
      'sumiu-404': null,
      'sem-thumb': null,
      alheio: null,
      'boa-1': ok,
      'boa-2': ok,
    });
    expect(Object.keys(result)).toEqual(['boom', 'sumiu-404', 'sem-thumb', 'alheio', 'boa-1', 'boa-2']);
    // nenhuma imagem buscada para os que não passaram na validação
    const imageCalls = calls.filter((call) => call.url.includes('googleusercontent.com'));
    expect(imageCalls.map((call) => call.url)).toEqual([
      `https://${THUMB_HOST}/thumb-boa-1=s400`,
      `https://${THUMB_HOST}/thumb-boa-2=s400`,
    ]);
    expect(JSON.stringify(result)).not.toContain(TOKEN);
    expectBodiesConsumed(responses);
  });

  it('falha de rede ao buscar a imagem vira null só daquele id', async () => {
    const files = new Map<string, FakeFile>([
      ['img-boom', { image: () => { throw new Error(`socket ${TOKEN}`); } }],
      ['boa', {}],
    ]);
    const { fetchFn } = fakeDrive(files);

    const result = await getThumbnails(fetchFn, TOKEN, WEDDING, ['img-boom', 'boa']);

    expect(result).toEqual({ 'img-boom': null, boa: `data:image/jpeg;base64,${JPEG_B64}` });
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });

  it('weddingId inválido lança sem chamar o Drive', async () => {
    for (const weddingId of INVALID_WEDDING_IDS) {
      const { fetchFn, calls } = scripted();
      await expect(getThumbnails(fetchFn, TOKEN, weddingId, ['f1'])).rejects.toThrow();
      expect(calls).toHaveLength(0);
    }
  });

  it('lista vazia devolve objeto vazio sem chamar o Drive', async () => {
    const { fetchFn, calls } = scripted();
    expect(await getThumbnails(fetchFn, TOKEN, WEDDING, [])).toEqual({});
    expect(calls).toHaveLength(0);
  });

  it('ids repetidos são buscados uma vez só', async () => {
    const { fetchFn, calls } = fakeDrive(new Map([['dup', {}]]));

    const result = await getThumbnails(fetchFn, TOKEN, WEDDING, ['dup', 'dup', 'dup']);

    expect(Object.keys(result)).toEqual(['dup']);
    expect(calls).toHaveLength(2);
  });

  it('ids fora do formato do Drive viram null sem nenhuma chamada (não chegam à URL)', async () => {
    const { fetchFn, calls } = scripted();
    const bad = ['', '.', '..', '../about', 'a/b', 'a?fields=x', 'a b', 'a#b', 'a%2Fb', 'x'.repeat(200)];

    const result = await getThumbnails(fetchFn, TOKEN, WEDDING, bad);

    expect(Object.keys(result)).toEqual(bad);
    expect(Object.values(result).every((value) => value === null)).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it('ids de chaves herdadas (__proto__, constructor...) viram null sem lançar e sem poluir o resultado', async () => {
    const protoBefore = Object.getOwnPropertyNames(Object.prototype).sort();
    const inherited = ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf'];
    const files = new Map<string, FakeFile>([['valido-1', {}]]);
    const { fetchFn } = fakeDrive(files);

    const result = await getThumbnails(fetchFn, TOKEN, WEDDING, [...inherited, 'valido-1']);

    const ok = `data:image/jpeg;base64,${JPEG_B64}`;
    expect(Object.getPrototypeOf(result)).toBeNull();
    expect(Object.keys(result)).toEqual([...inherited, 'valido-1']);
    for (const id of inherited) {
      expect(Object.prototype.hasOwnProperty.call(result, id)).toBe(true);
      expect(result[id]).toBeNull();
    }
    expect(result['valido-1']).toBe(ok);
    expect(JSON.stringify(result)).toBe(
      `{"__proto__":null,"constructor":null,"toString":null,"hasOwnProperty":null,"valueOf":null,"valido-1":"${ok}"}`,
    );
    expect(result).toEqual(Object.fromEntries([...inherited.map((id) => [id, null]), ['valido-1', ok]]));
    // nada vazou para Object.prototype
    expect(Object.getOwnPropertyNames(Object.prototype).sort()).toEqual(protoBefore);
    expect(Object.getPrototypeOf({})).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).valido).toBeUndefined();
  });

  it('inclusive um arquivo cujo id é "constructor" e é válido devolve a miniatura', async () => {
    const { fetchFn } = fakeDrive(new Map([['constructor', {}]]));

    const result = await getThumbnails(fetchFn, TOKEN, WEDDING, ['constructor']);

    expect(result['constructor']).toBe(`data:image/jpeg;base64,${JPEG_B64}`);
    expect(Object.getPrototypeOf(result)).toBeNull();
  });

  it('concorrência máxima de 6 fetches simultâneos', async () => {
    const ids = Array.from({ length: 14 }, (_, i) => `arquivo-${String(i).padStart(2, '0')}`);
    let inFlight = 0;
    let maxInFlight = 0;
    const { fetchFn, calls } = fakeDrive(new Map(ids.map((id) => [id, {}] as [string, FakeFile])), {
      before: async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
      },
      after: () => {
        inFlight -= 1;
      },
    });

    const result = await getThumbnails(fetchFn, TOKEN, WEDDING, ids);

    expect(maxInFlight).toBe(6);
    expect(calls).toHaveLength(ids.length * 2);
    expect(Object.keys(result)).toEqual(ids);
    expect(Object.values(result).every((value) => value === `data:image/jpeg;base64,${JPEG_B64}`)).toBe(true);
  });

  describe('corpo da imagem é sempre consumido ou cancelado', () => {
    // Corpo em stream que registra o cancelamento e o consumo por completo.
    function trackedStream(state: { cancelled: boolean }, chunks?: Uint8Array[]) {
      let next = 0;
      return new ReadableStream<Uint8Array>({
        pull(controller) {
          if (chunks) {
            if (next < chunks.length) controller.enqueue(chunks[next++]);
            else controller.close();
          } else {
            controller.enqueue(new Uint8Array(64 * 1024)); // infinito
          }
        },
        cancel() {
          state.cancelled = true;
        },
      });
    }

    const small = () => [new Uint8Array(1024)];

    const branches: Array<[string, (state: { cancelled: boolean }) => Response]> = [
      [
        'status HTTP de erro',
        (state) => new Response(trackedStream(state, small()), { status: 500, headers: { 'Content-Type': 'image/jpeg' } }),
      ],
      [
        'content-type que não é imagem',
        (state) => new Response(trackedStream(state, small()), { status: 200, headers: { 'Content-Type': 'text/html' } }),
      ],
      [
        'content-length declarado acima do limite',
        (state) =>
          new Response(trackedStream(state, small()), {
            status: 200,
            headers: { 'Content-Type': 'image/jpeg', 'Content-Length': String(600 * 1024) },
          }),
      ],
      [
        'corpo acima do limite sem content-length (stream sem fim)',
        (state) => new Response(trackedStream(state), { status: 200, headers: { 'Content-Type': 'image/jpeg' } }),
      ],
    ];

    it.each(branches)('ramo de falha: %s', async (_label, makeImage) => {
      const state = { cancelled: false };
      const imageResponse = makeImage(state);
      const { fetchFn } = scripted(okMeta('f1'), imageResponse);

      const result = await getThumbnails(fetchFn, TOKEN, WEDDING, ['f1']);

      expect(result).toEqual({ f1: null });
      expect(imageResponse.bodyUsed).toBe(true);
    });

    it('corpo sem fim é cancelado assim que passa do limite (não é lido inteiro)', async () => {
      const state = { cancelled: false };
      const { fetchFn } = scripted(
        okMeta('f1'),
        new Response(trackedStream(state), { status: 200, headers: { 'Content-Type': 'image/jpeg' } }),
      );

      const result = await getThumbnails(fetchFn, TOKEN, WEDDING, ['f1']);

      expect(result).toEqual({ f1: null });
      expect(state.cancelled).toBe(true);
    });

    it('stream que falha no meio da leitura vira null, sem vazar o token', async () => {
      const failing = new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.error(new Error(`falhou com ${TOKEN}`));
        },
      });
      const imageResponse = new Response(failing, { status: 200, headers: { 'Content-Type': 'image/jpeg' } });
      const { fetchFn } = scripted(okMeta('f1'), imageResponse);

      const result = await getThumbnails(fetchFn, TOKEN, WEDDING, ['f1']);

      expect(result).toEqual({ f1: null });
      expect(JSON.stringify(result)).not.toContain(TOKEN);
    });

    it('sucesso lê o corpo até o fim', async () => {
      const state = { cancelled: false };
      const imageResponse = new Response(trackedStream(state, [JPEG_BYTES]), {
        status: 200,
        headers: { 'Content-Type': 'image/jpeg' },
      });
      const { fetchFn } = scripted(okMeta('f1'), imageResponse);

      const result = await getThumbnails(fetchFn, TOKEN, WEDDING, ['f1']);

      expect(result.f1).toBe(`data:image/jpeg;base64,${JPEG_B64}`);
      expect(imageResponse.bodyUsed).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// getQuota
// ---------------------------------------------------------------------------

describe('getQuota', () => {
  it('com limit: calcula free = limit - usage', async () => {
    const { fetchFn, calls, responses } = scripted(
      json({ storageQuota: { limit: '16106127360', usage: '1073741824', usageInDrive: '10' } }),
    );

    const quota = await getQuota(fetchFn, TOKEN);

    expect(quota).toEqual({ limit: 16106127360, usage: 1073741824, free: 15032385536 });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${ABOUT_URL}?fields=storageQuota`);
    expect(calls[0].method).toBe('GET');
    expect(calls[0].headers).toEqual(AUTH);
    expect(JSON.stringify(quota)).not.toContain(TOKEN);
    expectBodiesConsumed(responses);
  });

  it('sem limit (ilimitado): limit e free são null', async () => {
    const { fetchFn } = scripted(json({ storageQuota: { usage: '500' } }));
    expect(await getQuota(fetchFn, TOKEN)).toEqual({ limit: null, usage: 500, free: null });
  });

  it('limit "0" também é ilimitado', async () => {
    const { fetchFn } = scripted(json({ storageQuota: { limit: '0', usage: '500' } }));
    expect(await getQuota(fetchFn, TOKEN)).toEqual({ limit: null, usage: 500, free: null });
  });

  it('usage acima do limit: free nunca fica negativo', async () => {
    const { fetchFn } = scripted(json({ storageQuota: { limit: '1000', usage: '1500' } }));
    expect(await getQuota(fetchFn, TOKEN)).toEqual({ limit: 1000, usage: 1500, free: 0 });
  });

  it('storageQuota ausente ou valores ilegíveis: limit null e usage 0', async () => {
    const empty = scripted(json({}));
    const junk = scripted(json({ storageQuota: { limit: 'abc', usage: 'xyz' } }));
    expect(await getQuota(empty.fetchFn, TOKEN)).toEqual({ limit: null, usage: 0, free: null });
    expect(await getQuota(junk.fetchFn, TOKEN)).toEqual({ limit: null, usage: 0, free: null });
  });

  it('erro HTTP vira DriveApiError, consome o corpo e não vaza o token', async () => {
    const { fetchFn, responses } = scripted(json({ error: { code: 401, message: `token ${TOKEN} inválido` } }, 401));

    const error = await getQuota(fetchFn, TOKEN).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DriveApiError);
    expect((error as DriveApiError).status).toBe(401);
    expect((error as Error).message).not.toContain(TOKEN);
    expectBodiesConsumed(responses);
  });
});
