import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  base64UrlEncode,
  createHandler,
  generateUploadToken,
  UPLOAD_TOKEN_BYTES,
  type DriveConnectionRow,
  type GoogleDriveAdminDeps,
} from '../../supabase/functions/google-drive-admin/handler';
import handlerSource from '../../supabase/functions/google-drive-admin/handler.ts?raw';
import {
  DriveApiError,
  NeedsReconnectError,
  QuotaExceededError,
} from '../../supabase/functions/_shared/google-drive';
import type { DriveFileSummary } from '../../supabase/functions/_shared/google-drive-read';

// ---------------------------------------------------------------------------
// Constantes e fakes
// ---------------------------------------------------------------------------

const ENDPOINT = 'https://projeto.supabase.co/functions/v1/google-drive-admin';
const ORIGIN = 'https://casarei.online';
const ACCESS_TOKEN = 'ya29.token-de-acesso-secreto';

// Casal A: o usuário autenticado na maioria dos testes.
const USER_A = 'aaaaaaaa-0000-4000-8000-00000000000a';
const WEDDING_A = '11111111-1111-4111-8111-111111111111';
const JWT_A = 'eyJhbGciOiJIUzI1NiJ9.jwt-do-casal-a.assinatura-a';
const TOKEN_A = 'aB3_-x9QzL0aB7cD2eF5gH8jK1mN4pRs';

// Casal B: outro cliente pagante. Nada dele pode aparecer para o casal A.
const USER_B = 'bbbbbbbb-0000-4000-8000-00000000000b';
const WEDDING_B = '22222222-2222-4222-8222-222222222222';
const JWT_B = 'eyJhbGciOiJIUzI1NiJ9.jwt-do-casal-b.assinatura-b';
const TOKEN_B = 'Zy9_-w8VuT7sR6qP5oN4mL3kJ2iH1gFe';

// Usuário autenticado que ainda não tem casamento.
const USER_C = 'cccccccc-0000-4000-8000-00000000000c';
const JWT_C = 'eyJhbGciOiJIUzI1NiJ9.jwt-sem-casamento.assinatura-c';

// Token de upload gerado pelo fake: 32 caracteres de [A-Za-z0-9_-].
const generated = (n: number) => `gen${String(n).padStart(2, '0')}${'Q'.repeat(27)}`;

const fileOf = (id: string, guestName: string, overrides: Partial<DriveFileSummary> = {}): DriveFileSummary => ({
  id,
  name: `${id}.jpg`,
  guestName,
  mimeType: 'image/jpeg',
  size: 1000,
  createdTime: '2026-09-24T12:00:00.000Z',
  hasThumbnail: true,
  durationMs: null,
  ...overrides,
});

const FILES_A = [fileOf('fileA1', 'Maria'), fileOf('fileA2', 'João', { mimeType: 'video/mp4', durationMs: 4200 })];
const FILES_B = [fileOf('fileB1', 'Convidado Secreto de B')];

interface Couple {
  userId: string;
  jwt: string;
  /** null = o usuário está autenticado mas não tem casamento. */
  weddingId: string | null;
  row: DriveConnectionRow | null;
  namedGuestFolders: number;
  files: DriveFileSummary[];
}

const coupleA = (overrides: Partial<Couple> = {}): Couple => ({
  userId: USER_A,
  jwt: JWT_A,
  weddingId: WEDDING_A,
  row: { uploadsEnabled: true, uploadToken: TOKEN_A },
  namedGuestFolders: 2,
  files: FILES_A,
  ...overrides,
});

const coupleB = (overrides: Partial<Couple> = {}): Couple => ({
  userId: USER_B,
  jwt: JWT_B,
  weddingId: WEDDING_B,
  row: { uploadsEnabled: true, uploadToken: TOKEN_B },
  namedGuestFolders: 5,
  files: FILES_B,
  ...overrides,
});

const coupleWithoutWedding = (): Couple => ({
  userId: USER_C,
  jwt: JWT_C,
  weddingId: null,
  row: null,
  namedGuestFolders: 0,
  files: [],
});

interface HarnessOptions {
  couples?: Couple[];
  allowedOrigins?: string[];
  /** Faz as dependências devolverem campos a mais (links do Drive, ids internos). */
  leaky?: boolean;
  generateToken?: () => string;
}

// Monta as dependências falsas sobre um "banco" e um "Drive" em memória que
// respeitam o isolamento por casamento como os módulos reais: o Drive falso só
// devolve o que pertence ao weddingId RECEBIDO. Assim, se o handler passar o
// weddingId errado, o vazamento aparece nos testes. `calls` guarda a ordem das
// chamadas e `seenWeddingIds` todo weddingId que alguma dependência recebeu.
function makeHarness(options: HarnessOptions = {}) {
  const calls: string[] = [];
  const seenWeddingIds: string[] = [];
  const couples = options.couples ?? [coupleA()];
  const leaky = options.leaky ?? false;
  let tokenCounter = 0;

  const rows = new Map<string, DriveConnectionRow>();
  const namedFolders = new Map<string, number>();
  const filesByWedding = new Map<string, DriveFileSummary[]>();
  for (const couple of couples) {
    if (couple.weddingId === null) continue;
    if (couple.row) rows.set(couple.weddingId, { ...couple.row });
    namedFolders.set(couple.weddingId, couple.namedGuestFolders);
    filesByWedding.set(couple.weddingId, couple.files);
  }

  const seen = (weddingId: string) => {
    seenWeddingIds.push(weddingId);
  };
  // O que uma dependência "vazadora" devolveria além do contrato.
  const asRow = (row: DriveConnectionRow, weddingId: string): DriveConnectionRow =>
    leaky
      ? ({
          ...row,
          weddingId,
          folderId: 'raiz-secreta-do-drive',
          webViewLink: 'https://drive.google.com/drive/folders/raiz-secreta-do-drive',
        } as DriveConnectionRow)
      : { ...row };

  const mocks = {
    authenticate: vi.fn<GoogleDriveAdminDeps['authenticate']>(async (authHeader) => {
      calls.push('authenticate');
      const couple = couples.find((c) => authHeader === `Bearer ${c.jwt}`);
      return couple ? { userId: couple.userId } : null;
    }),
    getWeddingIdForUser: vi.fn<GoogleDriveAdminDeps['getWeddingIdForUser']>(async (userId) => {
      calls.push('getWeddingIdForUser');
      return couples.find((c) => c.userId === userId)?.weddingId ?? null;
    }),
    get: vi.fn<GoogleDriveAdminDeps['connections']['get']>(async (weddingId) => {
      calls.push('connections.get');
      seen(weddingId);
      const row = rows.get(weddingId);
      return row ? asRow(row, weddingId) : null;
    }),
    create: vi.fn<GoogleDriveAdminDeps['connections']['create']>(async (weddingId, uploadToken) => {
      calls.push('connections.create');
      seen(weddingId);
      const existing = rows.get(weddingId);
      if (existing) return asRow(existing, weddingId);
      const row = { uploadsEnabled: true, uploadToken };
      rows.set(weddingId, row);
      return asRow(row, weddingId);
    }),
    setEnabled: vi.fn<GoogleDriveAdminDeps['connections']['setEnabled']>(async (weddingId, enabled) => {
      calls.push('connections.setEnabled');
      seen(weddingId);
      const row = rows.get(weddingId);
      if (!row) return null;
      row.uploadsEnabled = enabled;
      return asRow(row, weddingId);
    }),
    rotateToken: vi.fn<GoogleDriveAdminDeps['connections']['rotateToken']>(async (weddingId, uploadToken) => {
      calls.push('connections.rotateToken');
      seen(weddingId);
      const row = rows.get(weddingId);
      if (!row) return null;
      row.uploadToken = uploadToken;
      return asRow(row, weddingId);
    }),
    countNamedGuestFolders: vi.fn<GoogleDriveAdminDeps['countNamedGuestFolders']>(async (weddingId) => {
      calls.push('countNamedGuestFolders');
      seen(weddingId);
      return namedFolders.get(weddingId) ?? 0;
    }),
    generateToken: vi.fn<GoogleDriveAdminDeps['generateToken']>(
      options.generateToken ??
        (() => {
          calls.push('generateToken');
          tokenCounter += 1;
          return generated(tokenCounter);
        }),
    ),
    getAccessToken: vi.fn<GoogleDriveAdminDeps['getAccessToken']>(async () => {
      calls.push('getAccessToken');
      return ACCESS_TOKEN;
    }),
    listGuestFiles: vi.fn<GoogleDriveAdminDeps['drive']['listGuestFiles']>(async (_token, weddingId, opts) => {
      calls.push('drive:list');
      seen(weddingId);
      const files = filesByWedding.get(weddingId) ?? [];
      return {
        files: leaky
          ? files.map((file) => ({
              ...file,
              webViewLink: 'https://drive.google.com/file/d/abc/view',
              webContentLink: 'https://drive.google.com/uc?id=abc',
              thumbnailLink: 'https://lh3.googleusercontent.com/abc=s220',
              iconLink: 'https://drive-thirdparty.googleusercontent.com/16/type/image/jpeg',
              parents: ['pasta-raiz-secreta'],
              appProperties: { w: weddingId },
            }))
          : files,
        nextPageToken: opts?.pageToken ? null : 'proxima-pagina',
      };
    }),
    summarizeGuestFiles: vi.fn<GoogleDriveAdminDeps['drive']['summarizeGuestFiles']>(async (_token, weddingId) => {
      calls.push('drive:summarize');
      seen(weddingId);
      const files = filesByWedding.get(weddingId) ?? [];
      const summary = { count: files.length, totalBytes: files.reduce((sum, file) => sum + file.size, 0) };
      return leaky ? ({ ...summary, quotaLimit: 15_000_000_000, folderId: 'raiz-secreta' } as typeof summary) : summary;
    }),
    getThumbnails: vi.fn<GoogleDriveAdminDeps['drive']['getThumbnails']>(async (_token, weddingId, fileIds) => {
      calls.push('drive:thumbnails');
      seen(weddingId);
      const owned = new Set((filesByWedding.get(weddingId) ?? []).map((file) => file.id));
      // Objeto sem protótipo, como o helper real.
      const result: Record<string, string | null> = Object.create(null);
      for (const id of fileIds) {
        result[id] = owned.has(id) ? `data:image/jpeg;base64,${btoa(`miniatura-de-${weddingId}-${id}`)}` : null;
      }
      return result;
    }),
  };

  const deps: GoogleDriveAdminDeps = {
    allowedOrigins: options.allowedOrigins ?? [ORIGIN, 'http://localhost:8080'],
    authenticate: mocks.authenticate,
    getWeddingIdForUser: mocks.getWeddingIdForUser,
    connections: {
      get: mocks.get,
      create: mocks.create,
      setEnabled: mocks.setEnabled,
      rotateToken: mocks.rotateToken,
    },
    countNamedGuestFolders: mocks.countNamedGuestFolders,
    generateToken: mocks.generateToken,
    getAccessToken: mocks.getAccessToken,
    drive: {
      listGuestFiles: mocks.listGuestFiles,
      summarizeGuestFiles: mocks.summarizeGuestFiles,
      getThumbnails: mocks.getThumbnails,
    },
  };

  return { handler: createHandler(deps), deps, mocks, calls, seenWeddingIds, rows };
}

type Harness = ReturnType<typeof makeHarness>;

interface ReqOptions {
  /** JWT do Bearer; null = sem cabeçalho Authorization. */
  jwt?: string | null;
  authorization?: string;
  origin?: string | null;
  method?: string;
}

function req(body: unknown, options: ReqOptions = {}): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (options.authorization !== undefined) headers.authorization = options.authorization;
  else if (options.jwt !== null) headers.authorization = `Bearer ${options.jwt ?? JWT_A}`;
  const origin = options.origin === undefined ? ORIGIN : options.origin;
  if (origin !== null) headers.origin = origin;
  const method = options.method ?? 'POST';
  const hasBody = method !== 'GET' && method !== 'HEAD';
  return new Request(ENDPOINT, {
    method,
    headers,
    ...(hasBody ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
  });
}

const call = (h: Harness, body: unknown, options: ReqOptions = {}) => h.handler(req(body, options));

// Forma (toda opcional) das respostas, só para o teste ler os campos sem `any`.
interface AdminBody {
  error?: string;
  code?: string;
  enabled?: boolean;
  uploadsEnabled?: boolean;
  uploadToken?: string | null;
  files?: DriveFileSummary[];
  nextPageToken?: string | null;
  count?: number;
  totalBytes?: number;
  guests?: number;
  thumbnails?: Record<string, string | null>;
}

async function bodyOf(res: Response): Promise<AdminBody> {
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

// Procura, em qualquer profundidade, chaves *link*/parents e textos com
// drive.google.com. Devolve a lista de achados (vazia = limpo).
function findLeaks(value: unknown, path = '$'): string[] {
  const leaks: string[] = [];
  if (typeof value === 'string') {
    if (/drive\.google\.com/i.test(value)) leaks.push(`${path} = ${value}`);
    return leaks;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => leaks.push(...findLeaks(item, `${path}[${index}]`)));
    return leaks;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (/link/i.test(key) || /^parents$/i.test(key)) leaks.push(`${path}.${key}`);
      leaks.push(...findLeaks(item, `${path}.${key}`));
    }
  }
  return leaks;
}

const loggedText = () => errorSpy.mock.calls.map((args) => args.map(String).join(' ')).join('\n');

// Um pedido válido por ação (a ação `thumbnails` pede um arquivo de cada casal).
const ACTION_BODIES: Array<[string, Record<string, unknown>]> = [
  ['status', { action: 'status' }],
  ['enable', { action: 'enable' }],
  ['set-enabled', { action: 'set-enabled', enabled: false }],
  ['rotate-token', { action: 'rotate-token' }],
  ['list', { action: 'list' }],
  ['summary', { action: 'summary' }],
  ['thumbnails', { action: 'thumbnails', fileIds: ['fileA1', 'fileB1'] }],
];

const DRIVE_ACTION_BODIES = ACTION_BODIES.filter(([name]) => ['list', 'summary', 'thumbnails'].includes(name));
const ROW_ACTION_BODIES = ACTION_BODIES.filter(([name]) => name !== 'status' && name !== 'enable');

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

describe('google-drive-admin: OPTIONS, configuração e métodos', () => {
  it('OPTIONS responde 204 com CORS da origem permitida e não toca em nada', async () => {
    const h = makeHarness();
    const res = await h.handler(new Request(ENDPOINT, { method: 'OPTIONS', headers: { origin: ORIGIN } }));
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('authorization');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(h.calls).toEqual([]);
  });

  it('OPTIONS não devolve Access-Control-Allow-Origin para origem fora da lista', async () => {
    const h = makeHarness();
    const res = await h.handler(new Request(ENDPOINT, { method: 'OPTIONS', headers: { origin: 'https://evil.example' } }));
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('ALLOWED_ORIGINS vazio falha fechado: 500 unavailable, sem tocar em nada e sem autenticar', async () => {
    const h = makeHarness({ allowedOrigins: [] });
    const res = await call(h, { action: 'status' });
    await expectError(res, 500, 'unavailable');
    expect(h.calls).toEqual([]);
    expect(errorSpy).toHaveBeenCalled();
  });

  it.each(['GET', 'PUT', 'DELETE', 'PATCH'])('método %s responde 405 method_not_allowed sem tocar em nada', async (method) => {
    const h = makeHarness();
    const res = await call(h, { action: 'status' }, { method });
    await expectError(res, 405, 'method_not_allowed');
    expect(res.headers.get('Allow')).toBe('POST, OPTIONS');
    expect(h.calls).toEqual([]);
  });

  it('respostas JSON levam Content-Type, Cache-Control: no-store e CORS da origem', async () => {
    const h = makeHarness();
    const res = await call(h, { action: 'status' });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/json');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });
});

// ---------------------------------------------------------------------------
// Autenticação: o JWT é verificado antes de qualquer acesso a dados
// ---------------------------------------------------------------------------

describe('google-drive-admin: autenticação', () => {
  it('sem cabeçalho Authorization: 401 unauthorized e nenhuma dependência é chamada', async () => {
    const h = makeHarness();
    const res = await call(h, { action: 'status' }, { jwt: null });
    await expectError(res, 401, 'unauthorized');
    expect(h.calls).toEqual([]);
  });

  it('esquema que não é Bearer: 401 unauthorized e nenhuma dependência é chamada', async () => {
    const h = makeHarness();
    const res = await call(h, { action: 'status' }, { authorization: `Basic ${JWT_A}` });
    await expectError(res, 401, 'unauthorized');
    expect(h.calls).toEqual([]);
  });

  it('Bearer sem token: 401 unauthorized e nenhuma dependência é chamada', async () => {
    const h = makeHarness();
    const res = await call(h, { action: 'status' }, { authorization: 'Bearer' });
    await expectError(res, 401, 'unauthorized');
    expect(h.calls).toEqual([]);
  });

  it('usuário inválido (authenticate devolve null): 401 e NENHUM acesso a dados', async () => {
    const h = makeHarness();
    const res = await call(h, { action: 'status' }, { jwt: 'jwt-forjado' });
    await expectError(res, 401, 'unauthorized');
    expect(h.calls).toEqual(['authenticate']);
  });

  it.each(ACTION_BODIES)('ação %s com usuário inválido: 401 e nenhum dado lido, escrito ou consultado no Drive', async (_name, body) => {
    const h = makeHarness();
    const res = await call(h, body, { jwt: 'jwt-forjado' });
    await expectError(res, 401, 'unauthorized');
    expect(h.calls).toEqual(['authenticate']);
  });

  it('repassa o cabeçalho Authorization inteiro ao authenticate', async () => {
    const h = makeHarness();
    await call(h, { action: 'status' });
    expect(h.mocks.authenticate).toHaveBeenCalledWith(`Bearer ${JWT_A}`);
  });

  it('authenticate devolvendo userId vazio: 401 e nenhum acesso a dados', async () => {
    const h = makeHarness();
    h.mocks.authenticate.mockResolvedValueOnce({ userId: '' });
    const res = await call(h, { action: 'status' });
    await expectError(res, 401, 'unauthorized');
    expect(h.mocks.getWeddingIdForUser).not.toHaveBeenCalled();
  });

  it('authenticate lançando erro (falha de infraestrutura): 503 unavailable, sem acesso a dados e sem vazar o JWT', async () => {
    const h = makeHarness();
    h.mocks.authenticate.mockRejectedValueOnce(new TypeError(`fetch failed Bearer ${JWT_A}`));
    const res = await call(h, { action: 'status' });
    await expectError(res, 503, 'unavailable');
    expect(h.mocks.getWeddingIdForUser).not.toHaveBeenCalled();
    expect(h.mocks.get).not.toHaveBeenCalled();
    expect(loggedText()).toContain('TypeError');
    expect(loggedText()).not.toContain(JWT_A);
  });
});

// ---------------------------------------------------------------------------
// Casamento do usuário
// ---------------------------------------------------------------------------

describe('google-drive-admin: casamento do usuário', () => {
  it.each(ACTION_BODIES)('ação %s sem casamento: 404 wedding_not_found e nada é lido nem escrito', async (_name, body) => {
    const h = makeHarness({ couples: [coupleWithoutWedding(), coupleB()] });
    const res = await call(h, body, { jwt: JWT_C });
    await expectError(res, 404, 'wedding_not_found');
    expect(h.calls).toEqual(['authenticate', 'getWeddingIdForUser']);
  });

  it('getWeddingIdForUser recebe o id do usuário autenticado (e só ele)', async () => {
    const h = makeHarness();
    await call(h, { action: 'status' });
    expect(h.mocks.getWeddingIdForUser).toHaveBeenCalledTimes(1);
    expect(h.mocks.getWeddingIdForUser).toHaveBeenCalledWith(USER_A);
  });

  it('getWeddingIdForUser lançando erro: 503 unavailable', async () => {
    const h = makeHarness();
    h.mocks.getWeddingIdForUser.mockRejectedValueOnce(new Error('Falha ao buscar o casamento do usuário'));
    const res = await call(h, { action: 'status' });
    await expectError(res, 503, 'unavailable');
    expect(h.mocks.get).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Corpo e ação
// ---------------------------------------------------------------------------

describe('google-drive-admin: corpo e ação', () => {
  it.each([
    ['JSON inválido', '{ isto não é json'],
    ['corpo vazio', ''],
    ['null', 'null'],
    ['array', '[{"action":"status"}]'],
    ['número', '42'],
    ['texto', '"status"'],
    ['sem action', '{}'],
    ['action que não é texto', '{"action":7}'],
    ['action vazia', '{"action":""}'],
    ['action desconhecida', '{"action":"disconnect"}'],
    ['action com maiúsculas trocadas', '{"action":"Status"}'],
    ['action herdada do Object (constructor)', '{"action":"constructor"}'],
    ['action herdada do Object (__proto__)', '{"action":"__proto__"}'],
    ['action herdada do Object (toString)', '{"action":"toString"}'],
  ])('%s: 400 invalid_input e nada é lido nem escrito', async (_label, body) => {
    const h = makeHarness();
    const res = await call(h, body);
    await expectError(res, 400, 'invalid_input');
    expect(h.calls).toEqual(['authenticate']);
  });

  it('corpo acima do teto: 400 invalid_input', async () => {
    const h = makeHarness();
    const res = await call(h, JSON.stringify({ action: 'status', enchimento: 'x'.repeat(20_000) }));
    await expectError(res, 400, 'invalid_input');
    expect(h.calls).toEqual(['authenticate']);
  });

  it('a mensagem de erro é fixa e em pt-BR (nada do corpo é ecoado)', async () => {
    const h = makeHarness();
    const res = await call(h, { action: 'apagar-tudo-de-todos-os-casais' });
    const body = await expectError(res, 400, 'invalid_input');
    expect(body.error).toBe('Requisição inválida');
  });
});

// ---------------------------------------------------------------------------
// status
// ---------------------------------------------------------------------------

describe('google-drive-admin: status', () => {
  it('com conexão: devolve enabled, uploadsEnabled e uploadToken (só isso)', async () => {
    const h = makeHarness();
    const res = await call(h, { action: 'status' });
    expect(res.status).toBe(200);
    expect(await bodyOf(res)).toEqual({ enabled: true, uploadsEnabled: true, uploadToken: TOKEN_A });
    expect(h.mocks.get).toHaveBeenCalledWith(WEDDING_A);
  });

  it('recebimento desativado: enabled continua true e uploadsEnabled false', async () => {
    const h = makeHarness({ couples: [coupleA({ row: { uploadsEnabled: false, uploadToken: TOKEN_A } })] });
    const res = await call(h, { action: 'status' });
    expect(await bodyOf(res)).toEqual({ enabled: true, uploadsEnabled: false, uploadToken: TOKEN_A });
  });

  it('sem conexão: recurso não ativado (enabled false, sem token) e sem criar nada', async () => {
    const h = makeHarness({ couples: [coupleA({ row: null })] });
    const res = await call(h, { action: 'status' });
    expect(res.status).toBe(200);
    expect(await bodyOf(res)).toEqual({ enabled: false, uploadsEnabled: false, uploadToken: null });
    expect(h.mocks.create).not.toHaveBeenCalled();
    expect(h.mocks.generateToken).not.toHaveBeenCalled();
  });

  it('só banco: não pede token do Google nem chama o Drive, e funciona com o Google fora do ar', async () => {
    const h = makeHarness();
    h.mocks.getAccessToken.mockRejectedValue(new Error('google_config_missing'));
    const res = await call(h, { action: 'status' });
    expect(res.status).toBe(200);
    expect(h.mocks.getAccessToken).not.toHaveBeenCalled();
    expect(h.calls.filter((c) => c.startsWith('drive:'))).toEqual([]);
  });

  it('devolve só os três campos do contrato, mesmo que a dependência devolva mais', async () => {
    const h = makeHarness({ leaky: true });
    const res = await call(h, { action: 'status' });
    const body = await bodyOf(res);
    expect(Object.keys(body).sort()).toEqual(['enabled', 'uploadToken', 'uploadsEnabled']);
    expect(JSON.stringify(body)).not.toContain('raiz-secreta');
  });

  it('erro do banco: 503 unavailable', async () => {
    const h = makeHarness();
    h.mocks.get.mockRejectedValueOnce(new Error('Falha ao ler a conexão'));
    await expectError(await call(h, { action: 'status' }), 503, 'unavailable');
  });
});

// ---------------------------------------------------------------------------
// enable
// ---------------------------------------------------------------------------

describe('google-drive-admin: enable', () => {
  it('sem linha: cria com um token novo e devolve enabled true, uploadsEnabled true e o token', async () => {
    const h = makeHarness({ couples: [coupleA({ row: null })] });
    const res = await call(h, { action: 'enable' });
    expect(res.status).toBe(200);
    expect(await bodyOf(res)).toEqual({ enabled: true, uploadsEnabled: true, uploadToken: generated(1) });
    expect(h.mocks.generateToken).toHaveBeenCalledTimes(1);
    expect(h.mocks.create).toHaveBeenCalledTimes(1);
    expect(h.mocks.create).toHaveBeenCalledWith(WEDDING_A, generated(1));
    expect(h.rows.get(WEDDING_A)).toEqual({ uploadsEnabled: true, uploadToken: generated(1) });
  });

  it('é idempotente: com linha existente devolve o token atual, sem gerar nem gravar nada', async () => {
    const h = makeHarness();
    const res = await call(h, { action: 'enable' });
    expect(res.status).toBe(200);
    expect(await bodyOf(res)).toEqual({ enabled: true, uploadsEnabled: true, uploadToken: TOKEN_A });
    expect(h.mocks.generateToken).not.toHaveBeenCalled();
    expect(h.mocks.create).not.toHaveBeenCalled();
    expect(h.rows.get(WEDDING_A)?.uploadToken).toBe(TOKEN_A);
  });

  it('chamado duas vezes seguidas: o mesmo token nas duas respostas', async () => {
    const h = makeHarness({ couples: [coupleA({ row: null })] });
    const first = await bodyOf(await call(h, { action: 'enable' }));
    const second = await bodyOf(await call(h, { action: 'enable' }));
    expect(second.uploadToken).toBe(first.uploadToken);
    expect(h.mocks.create).toHaveBeenCalledTimes(1);
    expect(h.mocks.generateToken).toHaveBeenCalledTimes(1);
  });

  it('não reativa o recebimento que o casal desligou (só cria a linha se faltar)', async () => {
    const h = makeHarness({ couples: [coupleA({ row: { uploadsEnabled: false, uploadToken: TOKEN_A } })] });
    const res = await call(h, { action: 'enable' });
    expect(await bodyOf(res)).toEqual({ enabled: true, uploadsEnabled: false, uploadToken: TOKEN_A });
    expect(h.mocks.setEnabled).not.toHaveBeenCalled();
  });

  it('corrida: se outra requisição criou a linha primeiro, devolve o token vencedor (o da linha, não o gerado)', async () => {
    const h = makeHarness({ couples: [coupleA({ row: null })] });
    h.mocks.create.mockResolvedValueOnce({ uploadsEnabled: true, uploadToken: TOKEN_A });
    const res = await call(h, { action: 'enable' });
    expect((await bodyOf(res)).uploadToken).toBe(TOKEN_A);
  });

  it('não cria a pasta raiz nem chama o Drive (a função pública cria a raiz sob demanda)', async () => {
    const h = makeHarness({ couples: [coupleA({ row: null })] });
    await call(h, { action: 'enable' });
    expect(h.mocks.getAccessToken).not.toHaveBeenCalled();
    expect(h.calls.filter((c) => c.startsWith('drive:'))).toEqual([]);
  });

  it.each([
    ['curto demais', 'abc'],
    ['longo demais', 'a'.repeat(33)],
    ['com caractere fora do alfabeto', `${'a'.repeat(31)}=`],
    ['com barra (base64 comum)', `${'a'.repeat(31)}/`],
    ['vazio', ''],
  ])('token gerado %s: falha fechado (503), nada é gravado', async (_label, token) => {
    const h = makeHarness({ couples: [coupleA({ row: null })], generateToken: () => token });
    const res = await call(h, { action: 'enable' });
    await expectError(res, 503, 'unavailable');
    expect(h.mocks.create).not.toHaveBeenCalled();
  });

  it('erro ao gravar: 503 unavailable', async () => {
    const h = makeHarness({ couples: [coupleA({ row: null })] });
    h.mocks.create.mockRejectedValueOnce(new Error('Falha ao criar a conexão'));
    await expectError(await call(h, { action: 'enable' }), 503, 'unavailable');
  });
});

// ---------------------------------------------------------------------------
// set-enabled
// ---------------------------------------------------------------------------

describe('google-drive-admin: set-enabled', () => {
  it('enabled false: desliga o recebimento e devolve o estado novo', async () => {
    const h = makeHarness();
    const res = await call(h, { action: 'set-enabled', enabled: false });
    expect(res.status).toBe(200);
    expect(await bodyOf(res)).toEqual({ enabled: true, uploadsEnabled: false, uploadToken: TOKEN_A });
    expect(h.mocks.setEnabled).toHaveBeenCalledWith(WEDDING_A, false);
    expect(h.rows.get(WEDDING_A)?.uploadsEnabled).toBe(false);
  });

  it('enabled true: religa o recebimento e mantém o token', async () => {
    const h = makeHarness({ couples: [coupleA({ row: { uploadsEnabled: false, uploadToken: TOKEN_A } })] });
    const res = await call(h, { action: 'set-enabled', enabled: true });
    expect(await bodyOf(res)).toEqual({ enabled: true, uploadsEnabled: true, uploadToken: TOKEN_A });
    expect(h.mocks.setEnabled).toHaveBeenCalledWith(WEDDING_A, true);
  });

  it('sem linha: 404 not_enabled e nada é gravado', async () => {
    const h = makeHarness({ couples: [coupleA({ row: null })] });
    const res = await call(h, { action: 'set-enabled', enabled: true });
    await expectError(res, 404, 'not_enabled');
    expect(h.mocks.setEnabled).not.toHaveBeenCalled();
  });

  it('a linha some entre a leitura e a gravação (setEnabled devolve null): 404 not_enabled', async () => {
    const h = makeHarness();
    h.mocks.setEnabled.mockResolvedValueOnce(null);
    await expectError(await call(h, { action: 'set-enabled', enabled: true }), 404, 'not_enabled');
  });

  it.each([
    ['ausente', undefined],
    ['texto "true"', 'true'],
    ['número 1', 1],
    ['null', null],
    ['objeto', {}],
  ])('enabled %s: 400 invalid_input e nada é gravado', async (_label, enabled) => {
    const h = makeHarness();
    const res = await call(h, { action: 'set-enabled', enabled });
    await expectError(res, 400, 'invalid_input');
    expect(h.mocks.setEnabled).not.toHaveBeenCalled();
  });

  it('não chama o Drive', async () => {
    const h = makeHarness();
    await call(h, { action: 'set-enabled', enabled: false });
    expect(h.mocks.getAccessToken).not.toHaveBeenCalled();
  });

  it('erro do banco: 503 unavailable', async () => {
    const h = makeHarness();
    h.mocks.setEnabled.mockRejectedValueOnce(new Error('Falha ao atualizar a conexão'));
    await expectError(await call(h, { action: 'set-enabled', enabled: false }), 503, 'unavailable');
  });
});

// ---------------------------------------------------------------------------
// rotate-token
// ---------------------------------------------------------------------------

describe('google-drive-admin: rotate-token', () => {
  it('troca o token e devolve o novo (diferente do antigo)', async () => {
    const h = makeHarness();
    const res = await call(h, { action: 'rotate-token' });
    expect(res.status).toBe(200);
    const body = await bodyOf(res);
    expect(body).toEqual({ enabled: true, uploadsEnabled: true, uploadToken: generated(1) });
    expect(body.uploadToken).not.toBe(TOKEN_A);
    expect(h.mocks.rotateToken).toHaveBeenCalledWith(WEDDING_A, generated(1));
    expect(h.rows.get(WEDDING_A)?.uploadToken).toBe(generated(1));
  });

  it('depois de girar, status devolve o token novo; cada giro gera um token diferente', async () => {
    const h = makeHarness();
    const first = await bodyOf(await call(h, { action: 'rotate-token' }));
    const second = await bodyOf(await call(h, { action: 'rotate-token' }));
    expect(second.uploadToken).not.toBe(first.uploadToken);
    const status = await bodyOf(await call(h, { action: 'status' }));
    expect(status.uploadToken).toBe(second.uploadToken);
  });

  it('não muda o estado de recebimento (desligado continua desligado)', async () => {
    const h = makeHarness({ couples: [coupleA({ row: { uploadsEnabled: false, uploadToken: TOKEN_A } })] });
    const body = await bodyOf(await call(h, { action: 'rotate-token' }));
    expect(body.uploadsEnabled).toBe(false);
    expect(h.mocks.setEnabled).not.toHaveBeenCalled();
  });

  it('sem linha: 404 not_enabled, sem gerar token e sem gravar', async () => {
    const h = makeHarness({ couples: [coupleA({ row: null })] });
    const res = await call(h, { action: 'rotate-token' });
    await expectError(res, 404, 'not_enabled');
    expect(h.mocks.generateToken).not.toHaveBeenCalled();
    expect(h.mocks.rotateToken).not.toHaveBeenCalled();
  });

  it('a linha some entre a leitura e a gravação (rotateToken devolve null): 404 not_enabled', async () => {
    const h = makeHarness();
    h.mocks.rotateToken.mockResolvedValueOnce(null);
    await expectError(await call(h, { action: 'rotate-token' }), 404, 'not_enabled');
  });

  it('token gerado inválido: falha fechado (503) e o token antigo continua valendo', async () => {
    const h = makeHarness({ generateToken: () => 'curto' });
    await expectError(await call(h, { action: 'rotate-token' }), 503, 'unavailable');
    expect(h.mocks.rotateToken).not.toHaveBeenCalled();
    expect(h.rows.get(WEDDING_A)?.uploadToken).toBe(TOKEN_A);
  });

  it('não chama o Drive', async () => {
    const h = makeHarness();
    await call(h, { action: 'rotate-token' });
    expect(h.mocks.getAccessToken).not.toHaveBeenCalled();
  });

  it('erro do banco: 503 unavailable', async () => {
    const h = makeHarness();
    h.mocks.rotateToken.mockRejectedValueOnce(new Error('Falha ao girar o token'));
    await expectError(await call(h, { action: 'rotate-token' }), 503, 'unavailable');
  });
});

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

describe('google-drive-admin: list', () => {
  it('caminho feliz: lista os arquivos do casamento derivado, com o token do Google e a próxima página', async () => {
    const h = makeHarness();
    const res = await call(h, { action: 'list' });
    expect(res.status).toBe(200);
    expect(await bodyOf(res)).toEqual({ files: FILES_A, nextPageToken: 'proxima-pagina' });
    expect(h.mocks.listGuestFiles).toHaveBeenCalledTimes(1);
    const [token, weddingId, opts] = h.mocks.listGuestFiles.mock.calls[0];
    expect(token).toBe(ACCESS_TOKEN);
    expect(weddingId).toBe(WEDDING_A);
    expect(opts?.pageToken).toBeUndefined();
  });

  it('repassa o pageToken recebido; nextPageToken volta como null na última página', async () => {
    const h = makeHarness();
    const res = await call(h, { action: 'list', pageToken: 'pagina-2' });
    expect(await bodyOf(res)).toEqual({ files: FILES_A, nextPageToken: null });
    expect(h.mocks.listGuestFiles.mock.calls[0][2]?.pageToken).toBe('pagina-2');
  });

  it('pageToken null equivale a ausente', async () => {
    const h = makeHarness();
    const res = await call(h, { action: 'list', pageToken: null });
    expect(res.status).toBe(200);
    expect(h.mocks.listGuestFiles.mock.calls[0][2]?.pageToken).toBeUndefined();
  });

  it.each([
    ['número', 7],
    ['objeto', { a: 1 }],
    ['array', ['x']],
    ['booleano', true],
    ['texto enorme', 'p'.repeat(2049)],
  ])('pageToken %s: 400 invalid_input e o Drive não é chamado', async (_label, pageToken) => {
    const h = makeHarness();
    const res = await call(h, { action: 'list', pageToken });
    await expectError(res, 400, 'invalid_input');
    expect(h.mocks.getAccessToken).not.toHaveBeenCalled();
    expect(h.mocks.listGuestFiles).not.toHaveBeenCalled();
  });

  it('sem linha de conexão: 404 not_enabled e o Drive não é chamado', async () => {
    const h = makeHarness({ couples: [coupleA({ row: null })] });
    await expectError(await call(h, { action: 'list' }), 404, 'not_enabled');
    expect(h.mocks.getAccessToken).not.toHaveBeenCalled();
    expect(h.mocks.listGuestFiles).not.toHaveBeenCalled();
  });

  it('devolve só os campos do contrato, mesmo que o Drive falso devolva links, parents e propriedades', async () => {
    const h = makeHarness({ leaky: true });
    const res = await call(h, { action: 'list' });
    const body = await bodyOf(res);
    expect(body.files).toEqual(FILES_A);
    for (const file of body.files) {
      expect(Object.keys(file).sort()).toEqual(
        ['createdTime', 'durationMs', 'guestName', 'hasThumbnail', 'id', 'mimeType', 'name', 'size'],
      );
    }
    expect(findLeaks(body)).toEqual([]);
  });

  it('uma lista vazia é uma resposta válida', async () => {
    const h = makeHarness({ couples: [coupleA({ files: [] })] });
    const body = await bodyOf(await call(h, { action: 'list' }));
    expect(body.files).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// summary
// ---------------------------------------------------------------------------

describe('google-drive-admin: summary', () => {
  it('caminho feliz: count e totalBytes do Drive e guests = pastas de convidados nomeados', async () => {
    const h = makeHarness({ couples: [coupleA({ namedGuestFolders: 7 })] });
    const res = await call(h, { action: 'summary' });
    expect(res.status).toBe(200);
    expect(await bodyOf(res)).toEqual({ count: 2, totalBytes: 2000, guests: 7 });
    expect(h.mocks.summarizeGuestFiles.mock.calls[0].slice(0, 2)).toEqual([ACCESS_TOKEN, WEDDING_A]);
    expect(h.mocks.countNamedGuestFolders).toHaveBeenCalledWith(WEDDING_A);
  });

  it('devolve só count, totalBytes e guests, mesmo que o Drive falso devolva mais', async () => {
    const h = makeHarness({ leaky: true });
    const body = await bodyOf(await call(h, { action: 'summary' }));
    expect(Object.keys(body).sort()).toEqual(['count', 'guests', 'totalBytes']);
    expect(JSON.stringify(body)).not.toContain('quotaLimit');
  });

  it('sem linha de conexão: 404 not_enabled', async () => {
    const h = makeHarness({ couples: [coupleA({ row: null })] });
    await expectError(await call(h, { action: 'summary' }), 404, 'not_enabled');
    expect(h.mocks.summarizeGuestFiles).not.toHaveBeenCalled();
    expect(h.mocks.countNamedGuestFolders).not.toHaveBeenCalled();
  });

  it('erro na contagem de pastas: 503 unavailable', async () => {
    const h = makeHarness();
    h.mocks.countNamedGuestFolders.mockRejectedValueOnce(new Error('Falha ao contar as pastas'));
    await expectError(await call(h, { action: 'summary' }), 503, 'unavailable');
  });
});

// ---------------------------------------------------------------------------
// thumbnails
// ---------------------------------------------------------------------------

describe('google-drive-admin: thumbnails', () => {
  it('caminho feliz: repassa os ids e o weddingId derivado e devolve { thumbnails }', async () => {
    const h = makeHarness();
    const res = await call(h, { action: 'thumbnails', fileIds: ['fileA1', 'fileA2'] });
    expect(res.status).toBe(200);
    const body = await bodyOf(res);
    expect(Object.keys(body)).toEqual(['thumbnails']);
    expect(body.thumbnails.fileA1).toMatch(/^data:image\/jpeg;base64,/);
    expect(body.thumbnails.fileA2).toMatch(/^data:image\/jpeg;base64,/);
    expect(h.mocks.getThumbnails).toHaveBeenCalledWith(ACCESS_TOKEN, WEDDING_A, ['fileA1', 'fileA2']);
  });

  it('id que não é do casamento vem como null (o Drive falso, como o real, só entrega o que é do weddingId)', async () => {
    const h = makeHarness({ couples: [coupleA(), coupleB()] });
    const body = await bodyOf(await call(h, { action: 'thumbnails', fileIds: ['fileA1', 'fileB1'] }));
    expect(body.thumbnails.fileA1).toMatch(/^data:image\//);
    expect(body.thumbnails.fileB1).toBeNull();
  });

  it('aceita o objeto sem protótipo do helper (chave __proto__ incluída) sem chamar métodos dele', async () => {
    const h = makeHarness();
    h.mocks.getThumbnails.mockImplementationOnce(async () => {
      const result: Record<string, string | null> = Object.create(null);
      result['__proto__'] = null;
      result['constructor'] = 'data:image/png;base64,AAAA';
      return result;
    });
    const res = await call(h, { action: 'thumbnails', fileIds: ['__proto__', 'constructor'] });
    expect(res.status).toBe(200);
    const body = await bodyOf(res);
    expect(Object.keys(body.thumbnails).sort()).toEqual(['__proto__', 'constructor']);
    expect(Object.getOwnPropertyDescriptor(body.thumbnails, 'constructor')?.value).toBe('data:image/png;base64,AAAA');
  });

  it('exatamente 24 ids é aceito; 200 caracteres por id é aceito', async () => {
    const h = makeHarness();
    const ids = Array.from({ length: 24 }, (_v, i) => `id${i}`);
    expect((await call(h, { action: 'thumbnails', fileIds: ids })).status).toBe(200);
    expect((await call(h, { action: 'thumbnails', fileIds: ['a'.repeat(200)] })).status).toBe(200);
  });

  it.each([
    ['25 ids', { fileIds: Array.from({ length: 25 }, (_v, i) => `id${i}`) }],
    ['lista vazia', { fileIds: [] }],
    ['fileIds ausente', {}],
    ['fileIds texto', { fileIds: 'fileA1' }],
    ['fileIds objeto', { fileIds: { 0: 'fileA1', length: 1 } }],
    ['fileIds null', { fileIds: null }],
    ['id número', { fileIds: ['fileA1', 7] }],
    ['id null', { fileIds: [null] }],
    ['id objeto', { fileIds: [{ id: 'fileA1' }] }],
    ['id lista', { fileIds: [['fileA1']] }],
    ['id vazio', { fileIds: ['fileA1', ''] }],
    ['id com 201 caracteres', { fileIds: ['a'.repeat(201)] }],
  ])('%s: 400 invalid_input e o Drive não é chamado', async (_label, extra) => {
    const h = makeHarness();
    const res = await call(h, { action: 'thumbnails', ...extra });
    await expectError(res, 400, 'invalid_input');
    expect(h.mocks.getAccessToken).not.toHaveBeenCalled();
    expect(h.mocks.getThumbnails).not.toHaveBeenCalled();
  });

  it('sem linha de conexão: 404 not_enabled e o Drive não é chamado', async () => {
    const h = makeHarness({ couples: [coupleA({ row: null })] });
    await expectError(await call(h, { action: 'thumbnails', fileIds: ['fileA1'] }), 404, 'not_enabled');
    expect(h.mocks.getThumbnails).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// ISOLAMENTO ENTRE CASAIS
// ---------------------------------------------------------------------------

describe('google-drive-admin: isolamento entre casais', () => {
  // Campos de weddingId plantados no corpo por um casal mal-intencionado.
  const foreignFields = {
    weddingId: WEDDING_B,
    wedding_id: WEDDING_B,
    weddingID: WEDDING_B,
    params: { weddingId: WEDDING_B, wedding_id: WEDDING_B },
    filter: { weddingId: WEDDING_B },
    userId: USER_B,
    user_id: USER_B,
  };

  it.each(ACTION_BODIES)(
    'ação %s: com weddingId de OUTRO casal no corpo, toda dependência recebe só o weddingId derivado do usuário',
    async (_name, body) => {
      const h = makeHarness({ couples: [coupleA(), coupleB()] });
      const res = await call(h, { ...body, ...foreignFields });
      expect(res.status).toBe(200);

      expect(h.seenWeddingIds.length).toBeGreaterThan(0);
      expect(new Set(h.seenWeddingIds)).toEqual(new Set([WEDDING_A]));
      expect(h.mocks.getWeddingIdForUser).toHaveBeenCalledWith(USER_A);
      expect(h.mocks.getWeddingIdForUser).not.toHaveBeenCalledWith(USER_B);

      // Nenhuma chamada a nenhuma dependência menciona o casal B.
      for (const mock of Object.values(h.mocks)) {
        const serialized = JSON.stringify(mock.mock.calls);
        expect(serialized).not.toContain(WEDDING_B);
        expect(serialized).not.toContain(USER_B);
      }
    },
  );

  it.each(ACTION_BODIES)('ação %s: a resposta ao casal A nunca contém dados do casal B', async (_name, body) => {
    const h = makeHarness({ couples: [coupleA(), coupleB()] });
    const res = await call(h, { ...body, ...foreignFields });
    const text = await res.text();
    // O id 'fileB1' pode aparecer como CHAVE em thumbnails (foi o casal A quem o
    // pediu), mas a miniatura, o nome do convidado e o resto do casal B não.
    const thumbnailOfB = btoa(`miniatura-de-${WEDDING_B}-fileB1`);
    for (const secret of [TOKEN_B, WEDDING_B, USER_B, JWT_B, 'Convidado Secreto de B', 'raiz-secreta', thumbnailOfB]) {
      expect(text).not.toContain(secret);
    }
  });

  it.each(ACTION_BODIES)('ação %s: a linha do casal B não é lida nem alterada por pedidos do casal A', async (_name, body) => {
    const h = makeHarness({ couples: [coupleA(), coupleB()] });
    await call(h, { ...body, ...foreignFields });
    expect(h.rows.get(WEDDING_B)).toEqual({ uploadsEnabled: true, uploadToken: TOKEN_B });
    expect(h.mocks.get).not.toHaveBeenCalledWith(WEDDING_B);
  });

  it('status com weddingId do casal B no corpo devolve o token do casal A, não o do B', async () => {
    const h = makeHarness({ couples: [coupleA(), coupleB()] });
    const body = await bodyOf(await call(h, { action: 'status', weddingId: WEDDING_B, wedding_id: WEDDING_B }));
    expect(body.uploadToken).toBe(TOKEN_A);
  });

  it('list com weddingId do casal B no corpo devolve só os arquivos do casal A', async () => {
    const h = makeHarness({ couples: [coupleA(), coupleB()] });
    const body = await bodyOf(await call(h, { action: 'list', weddingId: WEDDING_B }));
    expect(body.files.map((file: DriveFileSummary) => file.id)).toEqual(['fileA1', 'fileA2']);
  });

  it('summary com weddingId do casal B no corpo devolve os números do casal A', async () => {
    const h = makeHarness({ couples: [coupleA({ namedGuestFolders: 2 }), coupleB({ namedGuestFolders: 5 })] });
    const body = await bodyOf(await call(h, { action: 'summary', weddingId: WEDDING_B }));
    expect(body).toEqual({ count: 2, totalBytes: 2000, guests: 2 });
  });

  it('thumbnails de ids do casal B, pedidos pelo casal A, vêm null (com o weddingId do A no Drive)', async () => {
    const h = makeHarness({ couples: [coupleA(), coupleB()] });
    const body = await bodyOf(await call(h, { action: 'thumbnails', fileIds: ['fileB1'], weddingId: WEDDING_B }));
    expect(body.thumbnails).toEqual({ fileB1: null });
    expect(h.mocks.getThumbnails.mock.calls[0][1]).toBe(WEDDING_A);
  });

  it('cada casal, com o próprio JWT, vê só o que é seu (dois casais no mesmo handler)', async () => {
    const h = makeHarness({ couples: [coupleA(), coupleB()] });

    const asA = await bodyOf(await call(h, { action: 'list' }, { jwt: JWT_A }));
    const asB = await bodyOf(await call(h, { action: 'list' }, { jwt: JWT_B }));
    expect(asA.files.map((f: DriveFileSummary) => f.id)).toEqual(['fileA1', 'fileA2']);
    expect(asB.files.map((f: DriveFileSummary) => f.id)).toEqual(['fileB1']);

    const statusA = await bodyOf(await call(h, { action: 'status' }, { jwt: JWT_A }));
    const statusB = await bodyOf(await call(h, { action: 'status' }, { jwt: JWT_B }));
    expect(statusA.uploadToken).toBe(TOKEN_A);
    expect(statusB.uploadToken).toBe(TOKEN_B);
  });

  it('girar o token e desligar o recebimento como A não mexe na linha do B', async () => {
    const h = makeHarness({ couples: [coupleA(), coupleB()] });
    await call(h, { action: 'rotate-token' }, { jwt: JWT_A });
    await call(h, { action: 'set-enabled', enabled: false }, { jwt: JWT_A });
    expect(h.rows.get(WEDDING_B)).toEqual({ uploadsEnabled: true, uploadToken: TOKEN_B });
    expect(h.rows.get(WEDDING_A)?.uploadsEnabled).toBe(false);
  });

  it('enable como A (sem linha) cria a linha do A, nunca a do B', async () => {
    const h = makeHarness({ couples: [coupleA({ row: null }), coupleB()] });
    await call(h, { action: 'enable', weddingId: WEDDING_B });
    expect(h.mocks.create).toHaveBeenCalledWith(WEDDING_A, generated(1));
    expect(h.rows.get(WEDDING_B)?.uploadToken).toBe(TOKEN_B);
  });

  it('um usuário sem casamento não alcança nada, nem informando o weddingId de outro casal', async () => {
    const h = makeHarness({ couples: [coupleWithoutWedding(), coupleA(), coupleB()] });
    for (const [, body] of ACTION_BODIES) {
      const res = await call(h, { ...body, ...foreignFields, weddingId: WEDDING_A }, { jwt: JWT_C });
      await expectError(res, 404, 'wedding_not_found');
    }
    expect(h.calls.filter((c) => c !== 'authenticate' && c !== 'getWeddingIdForUser')).toEqual([]);
    expect(h.rows.get(WEDDING_A)).toEqual({ uploadsEnabled: true, uploadToken: TOKEN_A });
    expect(h.rows.get(WEDDING_B)).toEqual({ uploadsEnabled: true, uploadToken: TOKEN_B });
  });

  it('JWT de um usuário que não existe não alcança nenhum casamento', async () => {
    const h = makeHarness({ couples: [coupleA(), coupleB()] });
    const res = await call(h, { action: 'list', weddingId: WEDDING_A }, { jwt: 'jwt-de-ninguem' });
    await expectError(res, 401, 'unauthorized');
    expect(h.calls).toEqual(['authenticate']);
  });
});

// ---------------------------------------------------------------------------
// Nenhum link do Drive em nenhuma resposta
// ---------------------------------------------------------------------------

describe('google-drive-admin: nenhum link do Drive em nenhuma resposta', () => {
  it('findLeaks acha chaves *link*, parents e drive.google.com em qualquer profundidade (o detector funciona)', () => {
    expect(findLeaks({ a: { webViewLink: 'x' } })).toHaveLength(1);
    expect(findLeaks({ a: [{ thumbnailLink: 'x' }] })).toHaveLength(1);
    expect(findLeaks({ iconLink: 1, webContentLink: 2 })).toHaveLength(2);
    expect(findLeaks({ files: [{ parents: ['x'] }] })).toHaveLength(1);
    expect(findLeaks({ a: ['https://drive.google.com/file/d/1/view'] })).toHaveLength(1);
    expect(findLeaks({ a: { b: { c: 'ok', d: 'data:image/jpeg;base64,AAAA' } } })).toEqual([]);
  });

  it.each(ACTION_BODIES)('ação %s (dependências vazadoras): a resposta não tem chave *link*, parents nem drive.google.com', async (_name, body) => {
    const h = makeHarness({ leaky: true });
    const res = await call(h, body);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(findLeaks(JSON.parse(text))).toEqual([]);
    for (const forbidden of ['drive.google.com', 'webViewLink', 'webContentLink', 'thumbnailLink', 'iconLink', 'parents', 'googleusercontent']) {
      expect(text).not.toContain(forbidden);
    }
  });

  it('respostas de erro também não vazam nada além de { error, code }', async () => {
    const h = makeHarness({ leaky: true });
    h.mocks.listGuestFiles.mockRejectedValueOnce(new DriveApiError('https://drive.google.com/x', 500, true));
    const res = await call(h, { action: 'list' });
    const body = await expectError(res, 503, 'unavailable');
    expect(findLeaks(body)).toEqual([]);
    expect(body.error).not.toContain('drive');
  });
});

// ---------------------------------------------------------------------------
// Falha fechada e registro em log
// ---------------------------------------------------------------------------

describe('google-drive-admin: falha fechada', () => {
  it.each(DRIVE_ACTION_BODIES)('ação %s: NeedsReconnectError ao obter o token do Google vira 503 unavailable', async (_name, body) => {
    const h = makeHarness();
    h.mocks.getAccessToken.mockRejectedValueOnce(new NeedsReconnectError('refresh token revogado'));
    const res = await call(h, body);
    await expectError(res, 503, 'unavailable');
    expect(h.calls.filter((c) => c.startsWith('drive:'))).toEqual([]);
  });

  it('list: NeedsReconnectError vindo do Drive vira 503 unavailable', async () => {
    const h = makeHarness();
    h.mocks.listGuestFiles.mockRejectedValueOnce(new NeedsReconnectError('sem acesso'));
    await expectError(await call(h, { action: 'list' }), 503, 'unavailable');
  });

  it('summary: NeedsReconnectError vindo do Drive vira 503 unavailable', async () => {
    const h = makeHarness();
    h.mocks.summarizeGuestFiles.mockRejectedValueOnce(new NeedsReconnectError('sem acesso'));
    await expectError(await call(h, { action: 'summary' }), 503, 'unavailable');
  });

  it('thumbnails: NeedsReconnectError vindo do Drive vira 503 unavailable', async () => {
    const h = makeHarness();
    h.mocks.getThumbnails.mockRejectedValueOnce(new NeedsReconnectError('sem acesso'));
    await expectError(await call(h, { action: 'thumbnails', fileIds: ['fileA1'] }), 503, 'unavailable');
  });

  it.each([
    ['DriveApiError 500', () => new DriveApiError('Erro do Google Drive (HTTP 500)', 500, true)],
    ['DriveApiError 403', () => new DriveApiError('Erro do Google Drive (HTTP 403)', 403, false)],
    ['QuotaExceededError', () => new QuotaExceededError('O Google Drive está sem espaço')],
    ['erro de rede (TypeError)', () => new TypeError('fetch failed')],
    ['valor lançado que não é Error', () => 'texto solto' as unknown as Error],
  ])('list: %s vira 503 unavailable com corpo { error, code } fixo', async (_label, makeError) => {
    const h = makeHarness();
    h.mocks.listGuestFiles.mockRejectedValueOnce(makeError());
    const body = await expectError(await call(h, { action: 'list' }), 503, 'unavailable');
    expect(body.error).toBe('Serviço temporariamente indisponível');
  });

  it('variáveis do Google ausentes (getAccessToken lança): só as ações do Drive dão 503; as de banco seguem funcionando', async () => {
    const h = makeHarness({ couples: [coupleA(), coupleB()] });
    h.mocks.getAccessToken.mockRejectedValue(new Error('google_config_missing'));

    for (const [, body] of DRIVE_ACTION_BODIES) {
      await expectError(await call(h, body), 503, 'unavailable');
    }
    expect((await call(h, { action: 'status' })).status).toBe(200);
    expect((await call(h, { action: 'enable' })).status).toBe(200);
    expect((await call(h, { action: 'set-enabled', enabled: false })).status).toBe(200);
    expect((await call(h, { action: 'rotate-token' })).status).toBe(200);
  });

  it('o log leva só prefixo, etapa e classe do erro: nunca a mensagem, tokens, ids nem o JWT', async () => {
    const h = makeHarness();
    h.mocks.listGuestFiles.mockRejectedValueOnce(
      new TypeError(`fetch failed ${ACCESS_TOKEN} ${JWT_A} ${USER_A} ${WEDDING_A} ${TOKEN_A} https://www.googleapis.com/x`),
    );
    await call(h, { action: 'list' });
    const logged = loggedText();
    expect(errorSpy).toHaveBeenCalled();
    expect(logged).toContain('[google-drive-admin]');
    expect(logged).toContain('TypeError');
    for (const secret of [ACCESS_TOKEN, JWT_A, USER_A, WEDDING_A, TOKEN_A, 'fetch failed', 'googleapis']) {
      expect(logged).not.toContain(secret);
    }
  });

  it('DriveApiError: o log leva a classe e o status, nunca a mensagem interna', async () => {
    const h = makeHarness();
    h.mocks.listGuestFiles.mockRejectedValueOnce(new DriveApiError('mensagem interna secreta', 502, true));
    await call(h, { action: 'list' });
    const logged = loggedText();
    expect(logged).toContain('DriveApiError');
    expect(logged).toContain('502');
    expect(logged).not.toContain('mensagem interna secreta');
  });

  it('NeedsReconnectError: o log leva a classe, nunca a mensagem', async () => {
    const h = makeHarness();
    h.mocks.getAccessToken.mockRejectedValueOnce(new NeedsReconnectError('refresh token 1//abc revogado'));
    await call(h, { action: 'list' });
    const logged = loggedText();
    expect(logged).toContain('NeedsReconnectError');
    expect(logged).not.toContain('1//abc');
  });

  it('nenhum log de erro no caminho feliz', async () => {
    const h = makeHarness();
    for (const [, body] of ACTION_BODIES) await call(h, body);
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Ordem das etapas (a autenticação vem antes de qualquer acesso a dados)
// ---------------------------------------------------------------------------

describe('google-drive-admin: ordem das chamadas', () => {
  it('list: authenticate, casamento, conexão, token do Google, listagem (nessa ordem)', async () => {
    const h = makeHarness();
    await call(h, { action: 'list' });
    expect(h.calls).toEqual(['authenticate', 'getWeddingIdForUser', 'connections.get', 'getAccessToken', 'drive:list']);
  });

  it('enable sem linha: authenticate, casamento, leitura, geração do token, criação', async () => {
    const h = makeHarness({ couples: [coupleA({ row: null })] });
    await call(h, { action: 'enable' });
    expect(h.calls).toEqual([
      'authenticate',
      'getWeddingIdForUser',
      'connections.get',
      'generateToken',
      'connections.create',
    ]);
  });

  it.each(ROW_ACTION_BODIES)('ação %s sem linha: não pede token do Google nem chama o Drive', async (_name, body) => {
    const h = makeHarness({ couples: [coupleA({ row: null })] });
    await expectError(await call(h, body), 404, 'not_enabled');
    expect(h.calls).toEqual(['authenticate', 'getWeddingIdForUser', 'connections.get']);
  });
});

// ---------------------------------------------------------------------------
// Token de upload: codificação
// ---------------------------------------------------------------------------

describe('google-drive-admin: base64UrlEncode', () => {
  const bytes = (...values: number[]) => Uint8Array.from(values);
  const text = (value: string) => new TextEncoder().encode(value);

  it('bate com os vetores da RFC 4648 (sem padding)', () => {
    expect(base64UrlEncode(bytes())).toBe('');
    expect(base64UrlEncode(text('f'))).toBe('Zg');
    expect(base64UrlEncode(text('fo'))).toBe('Zm8');
    expect(base64UrlEncode(text('foo'))).toBe('Zm9v');
    expect(base64UrlEncode(text('foob'))).toBe('Zm9vYg');
    expect(base64UrlEncode(text('fooba'))).toBe('Zm9vYmE');
    expect(base64UrlEncode(text('foobar'))).toBe('Zm9vYmFy');
  });

  it('bytes 0xFB e 0xFF produzem "-" e "_" (nunca "+" nem "/")', () => {
    expect(base64UrlEncode(bytes(0xfb, 0xff, 0xbf))).toBe('-_-_');
    expect(base64UrlEncode(bytes(0xff, 0xff, 0xff))).toBe('____');
    expect(base64UrlEncode(bytes(0xfb))).toBe('-w');
    expect(base64UrlEncode(bytes(0xff))).toBe('_w');
    expect(base64UrlEncode(bytes(0xfb, 0xff))).toBe('-_8');
  });

  it('nunca produz +, / nem = em nenhuma das 256 possibilidades de byte', () => {
    for (let value = 0; value < 256; value += 1) {
      expect(base64UrlEncode(bytes(value, 255 - value, value))).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });
});

describe('google-drive-admin: generateUploadToken', () => {
  const realFill = (target: Uint8Array) => {
    crypto.getRandomValues(target);
  };

  it('pede exatamente 24 bytes aleatórios à função injetada', () => {
    const fill = vi.fn((target: Uint8Array) => {
      target.fill(7);
    });
    generateUploadToken(fill);
    expect(UPLOAD_TOKEN_BYTES).toBe(24);
    expect(fill).toHaveBeenCalledTimes(1);
    expect(fill.mock.calls[0][0]).toBeInstanceOf(Uint8Array);
    expect(fill.mock.calls[0][0].length).toBe(24);
  });

  it('devolve 32 caracteres de [A-Za-z0-9_-], sem padding, aceitos pela função pública ({20,64})', () => {
    for (let i = 0; i < 50; i += 1) {
      const token = generateUploadToken(realFill);
      expect(token).toHaveLength(32);
      expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
      expect(token).toMatch(/^[A-Za-z0-9_-]{20,64}$/);
      expect(token).not.toContain('=');
    }
  });

  it('codifica os bytes recebidos em base64url', () => {
    const fixed = Uint8Array.from({ length: 24 }, (_v, i) => i * 9 + 1);
    const token = generateUploadToken((target) => target.set(fixed));
    expect(token).toBe(base64UrlEncode(fixed));
  });

  it('bytes 0xFF e 0xFB viram "_" e "-"', () => {
    expect(generateUploadToken((target) => target.fill(0xff))).toBe('_'.repeat(32));
    const token = generateUploadToken((target) => {
      for (let i = 0; i < target.length; i += 3) target.set([0xfb, 0xff, 0xbf], i);
    });
    expect(token).toBe('-_-_'.repeat(8));
  });

  it('duas chamadas com bytes aleatórios diferem (e 200 tokens não repetem)', () => {
    expect(generateUploadToken(realFill)).not.toBe(generateUploadToken(realFill));
    const many = new Set(Array.from({ length: 200 }, () => generateUploadToken(realFill)));
    expect(many.size).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// handler.ts é puro
// ---------------------------------------------------------------------------

describe('google-drive-admin: handler.ts é puro', () => {
  const code = handlerSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('não usa Deno.*, o fetch global, imports por URL, process.env nem cliente Supabase', () => {
    expect(code).not.toMatch(/\bDeno\b/);
    expect(code).not.toMatch(/(^|[^.\w])fetch\s*\(/);
    expect(code).not.toMatch(/from\s+["']https?:/);
    expect(code).not.toMatch(/\bprocess\.env\b/);
    expect(code).not.toMatch(/createClient/);
  });

  it('não gera aleatoriedade por conta própria (Math.random ou crypto global): tudo é injetado', () => {
    expect(code).not.toMatch(/Math\.random/);
    expect(code).not.toMatch(/\bcrypto\b/);
  });

  it('não consulta a cota da conta da plataforma', () => {
    expect(code).not.toMatch(/getQuota/);
    expect(code).not.toMatch(/storageQuota/);
  });
});
