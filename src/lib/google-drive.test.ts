import { describe, it, expect } from 'vitest';
import {
  DRIVE_FOLDER_MIME,
  MAX_GUEST_FOLDERS,
  NeedsReconnectError,
  QuotaExceededError,
  DriveApiError,
  mapDriveError,
  refreshAccessToken,
  ensureFolder,
  resolveGuestFolder,
  initResumableSession,
  type FetchFn,
  type GuestFolderStore,
} from '../../supabase/functions/_shared/google-drive';

// ---------------------------------------------------------------------------
// Fetch falso: grava cada chamada (URL, método, headers, corpo) e devolve
// Responses roteirizadas.
// ---------------------------------------------------------------------------

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

function createFakeFetch(handler: (call: Call, index: number) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const responses: Response[] = [];
  const fetchFn: FetchFn = async (input, init) => {
    const call: Call = {
      url: input,
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === 'string' ? init.body : undefined,
    };
    calls.push(call);
    const res = await handler(call, calls.length - 1);
    responses.push(res);
    return res;
  };
  return { fetchFn, calls, responses };
}

// Todo corpo que chegou do fetch precisa ter sido lido ou cancelado (senão a
// conexão fica presa no runtime do Deno). Corpo nulo não tem o que consumir.
function expectBodiesConsumed(responses: Response[]) {
  for (const res of responses) {
    if (res.body !== null) expect(res.bodyUsed).toBe(true);
  }
}

// Devolve as respostas na ordem; uma chamada além do roteiro derruba o teste.
function scripted(...responses: Response[]) {
  return createFakeFetch((call, index) => {
    const response = responses[index];
    if (!response) throw new Error(`fetch inesperado #${index}: ${call.method} ${call.url}`);
    return response;
  });
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

const driveError = (status: number, reason: string) =>
  json({ error: { code: status, message: 'erro', errors: [{ reason }] } }, status);

const parseBody = (call: Call) => JSON.parse(call.body as string);

const TOKEN = 'ya29.token';
const AUTH = { Authorization: `Bearer ${TOKEN}` };
const WEDDING = '0a0b0c0d-0000-4000-8000-000000000001';
const ROOT = 'root-folder';

const utf8Bytes = (value: string) => new TextEncoder().encode(value).length;

// ---------------------------------------------------------------------------
// mapDriveError
// ---------------------------------------------------------------------------

describe('mapDriveError', () => {
  it('storageQuotaExceeded em error.errors[].reason vira QuotaExceededError', () => {
    const error = mapDriveError(403, { error: { errors: [{ reason: 'storageQuotaExceeded' }] } });
    expect(error).toBeInstanceOf(QuotaExceededError);
  });

  it('storageQuotaExceeded em error.details[].reason vira QuotaExceededError', () => {
    const error = mapDriveError(403, {
      error: { status: 'PERMISSION_DENIED', details: [{ '@type': 'ErrorInfo', reason: 'storageQuotaExceeded' }] },
    });
    expect(error).toBeInstanceOf(QuotaExceededError);
  });

  it('storageQuotaExceeded em error.status vira QuotaExceededError', () => {
    expect(mapDriveError(403, { error: { status: 'storageQuotaExceeded' } })).toBeInstanceOf(QuotaExceededError);
  });

  it.each([429, 500, 502, 503, 504])('status %i é DriveApiError retryable', (status) => {
    const error = mapDriveError(status, { error: { message: 'x' } });
    expect(error).toBeInstanceOf(DriveApiError);
    expect(error).not.toBeInstanceOf(QuotaExceededError);
    expect((error as DriveApiError).status).toBe(status);
    expect((error as DriveApiError).retryable).toBe(true);
  });

  it.each(['userRateLimitExceeded', 'rateLimitExceeded'])('403 com reason %s é retryable', (reason) => {
    const error = mapDriveError(403, { error: { errors: [{ reason }] } }) as DriveApiError;
    expect(error).toBeInstanceOf(DriveApiError);
    expect(error.status).toBe(403);
    expect(error.retryable).toBe(true);
  });

  it.each([
    [400, { error: { errors: [{ reason: 'badRequest' }] } }],
    [401, { error: { errors: [{ reason: 'authError' }] } }],
    [403, { error: { errors: [{ reason: 'forbidden' }] } }],
    [404, { error: { errors: [{ reason: 'notFound' }] } }],
  ])('status %i com outro reason não é retryable', (status, body) => {
    const error = mapDriveError(status, body) as DriveApiError;
    expect(error).toBeInstanceOf(DriveApiError);
    expect(error).not.toBeInstanceOf(QuotaExceededError);
    expect(error.status).toBe(status);
    expect(error.retryable).toBe(false);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['string', 'Bad Gateway'],
    ['número', 42],
    ['objeto vazio', {}],
    ['error string', { error: 'invalid_request' }],
    ['error nulo', { error: null }],
    ['errors que não é lista', { error: { errors: 'x' } }],
    ['errors com itens estranhos', { error: { errors: [null, 7, 'x', { reason: 5 }] } }],
  ])('aceita corpo %s sem quebrar', (_nome, body) => {
    const error = mapDriveError(400, body) as DriveApiError;
    expect(error).toBeInstanceOf(DriveApiError);
    expect(error.status).toBe(400);
    expect(error.retryable).toBe(false);
    expect((mapDriveError(503, body) as DriveApiError).retryable).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// refreshAccessToken
// ---------------------------------------------------------------------------

describe('refreshAccessToken', () => {
  const cfg = { clientId: 'cid', clientSecret: 'secret', refreshToken: 'refresh' };

  it('troca o refresh token por um access token com POST form-urlencoded', async () => {
    const { fetchFn, calls } = scripted(json({ access_token: 'ya29.novo', expires_in: 3599, token_type: 'Bearer' }));

    const result = await refreshAccessToken(fetchFn, cfg);

    expect(result).toEqual({ accessToken: 'ya29.novo', expiresIn: 3599 });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://oauth2.googleapis.com/token');
    expect(calls[0].method).toBe('POST');
    expect(calls[0].headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(Object.fromEntries(new URLSearchParams(calls[0].body))).toEqual({
      client_id: 'cid',
      client_secret: 'secret',
      refresh_token: 'refresh',
      grant_type: 'refresh_token',
    });
  });

  it('codifica no corpo valores com caracteres especiais', async () => {
    const { fetchFn, calls } = scripted(json({ access_token: 't', expires_in: 1 }));

    await refreshAccessToken(fetchFn, { clientId: 'a&b=c', clientSecret: 's e+g', refreshToken: '1//0x/y' });

    const sent = new URLSearchParams(calls[0].body);
    expect(sent.get('client_id')).toBe('a&b=c');
    expect(sent.get('client_secret')).toBe('s e+g');
    expect(sent.get('refresh_token')).toBe('1//0x/y');
  });

  it('invalid_grant vira NeedsReconnectError', async () => {
    const { fetchFn } = scripted(
      json({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }, 400),
    );

    await expect(refreshAccessToken(fetchFn, cfg)).rejects.toBeInstanceOf(NeedsReconnectError);
  });

  it.each([
    [429, true],
    [500, true],
    [503, true],
    [400, false],
    [401, false],
  ])('erro %i vira DriveApiError com retryable=%s', async (status, retryable) => {
    const { fetchFn } = scripted(json({ error: 'invalid_client' }, status));

    const error = await refreshAccessToken(fetchFn, cfg).catch((e) => e);

    expect(error).toBeInstanceOf(DriveApiError);
    expect(error).not.toBeInstanceOf(NeedsReconnectError);
    expect(error.status).toBe(status);
    expect(error.retryable).toBe(retryable);
  });

  it('aceita erro com corpo que não é JSON', async () => {
    const { fetchFn } = scripted(new Response('Bad Gateway', { status: 502 }));

    const error = await refreshAccessToken(fetchFn, cfg).catch((e) => e);

    expect(error).toBeInstanceOf(DriveApiError);
    expect(error.status).toBe(502);
    expect(error.retryable).toBe(true);
  });

  it('resposta OK sem access_token é DriveApiError 502 retryable', async () => {
    const { fetchFn } = scripted(json({ expires_in: 3599 }));

    const error = await refreshAccessToken(fetchFn, cfg).catch((e) => e);

    expect(error).toBeInstanceOf(DriveApiError);
    expect(error.status).toBe(502);
    expect(error.retryable).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ensureFolder
// ---------------------------------------------------------------------------

describe('ensureFolder', () => {
  it('devolve o id guardado quando a pasta está viva, sem criar nada', async () => {
    const { fetchFn, calls } = scripted(json({ id: 'folder-1', trashed: false }));

    const id = await ensureFolder(fetchFn, TOKEN, { weddingId: WEDDING, name: 'Casal', folderId: 'folder-1' });

    expect(id).toBe('folder-1');
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('GET');
    expect(calls[0].url).toBe('https://www.googleapis.com/drive/v3/files/folder-1?fields=id,trashed');
    expect(calls[0].headers).toEqual(AUTH);
  });

  it('cria outra pasta quando a guardada está na lixeira', async () => {
    const { fetchFn, calls } = scripted(json({ id: 'folder-1', trashed: true }), json({ id: 'folder-2' }));

    const id = await ensureFolder(fetchFn, TOKEN, {
      weddingId: WEDDING,
      name: 'Casal',
      folderId: 'folder-1',
      parentId: ROOT,
    });

    expect(id).toBe('folder-2');
    expect(calls).toHaveLength(2);
    expect(calls[1].method).toBe('POST');
    expect(calls[1].url).toBe('https://www.googleapis.com/drive/v3/files?fields=id');
  });

  it('cria outra pasta quando a guardada não existe mais (404)', async () => {
    const { fetchFn, calls } = scripted(driveError(404, 'notFound'), json({ id: 'folder-2' }));

    const id = await ensureFolder(fetchFn, TOKEN, { weddingId: WEDDING, name: 'Casal', folderId: 'folder-1' });

    expect(id).toBe('folder-2');
    expect(calls.map((c) => c.method)).toEqual(['GET', 'POST']);
  });

  it('no 404 da consulta o corpo da resposta é descartado (a conexão não fica presa) antes de criar a pasta', async () => {
    const { fetchFn, responses } = scripted(driveError(404, 'notFound'), json({ id: 'folder-2' }));

    await ensureFolder(fetchFn, TOKEN, { weddingId: WEDDING, name: 'Casal', folderId: 'folder-1' });

    expect(responses).toHaveLength(2);
    expect(responses[0].body).not.toBeNull();
    expectBodiesConsumed(responses);
  });

  it('cria a pasta direto quando não há folderId', async () => {
    const { fetchFn, calls } = scripted(json({ id: 'folder-9' }));

    const id = await ensureFolder(fetchFn, TOKEN, { weddingId: WEDDING, name: 'Casal' });

    expect(id).toBe('folder-9');
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('POST');
  });

  it('trata folderId nulo como ausente', async () => {
    const { fetchFn, calls } = scripted(json({ id: 'folder-9' }));

    await ensureFolder(fetchFn, TOKEN, { weddingId: WEDDING, name: 'Casal', folderId: null, parentId: null });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('POST');
  });

  it('a criação leva name, mimeType de pasta, appProperties.w e parents', async () => {
    const { fetchFn, calls } = scripted(json({ id: 'folder-9' }));

    await ensureFolder(fetchFn, TOKEN, { weddingId: WEDDING, name: 'Carla & Ewerton', parentId: ROOT });

    expect(DRIVE_FOLDER_MIME).toBe('application/vnd.google-apps.folder');
    expect(calls[0].headers).toEqual({ ...AUTH, 'Content-Type': 'application/json' });
    expect(parseBody(calls[0])).toEqual({
      name: 'Carla & Ewerton',
      mimeType: 'application/vnd.google-apps.folder',
      appProperties: { w: WEDDING },
      parents: [ROOT],
    });
  });

  it('a criação sem parentId não envia parents', async () => {
    const { fetchFn, calls } = scripted(json({ id: 'folder-9' }));

    await ensureFolder(fetchFn, TOKEN, { weddingId: WEDDING, name: 'Casal' });

    const body = parseBody(calls[0]);
    expect(body).not.toHaveProperty('parents');
    expect(body.appProperties).toEqual({ w: WEDDING });
  });

  it('erro diferente de 404 ao consultar a pasta é mapeado e nada é criado', async () => {
    const { fetchFn, calls } = scripted(driveError(500, 'backendError'));

    const error = await ensureFolder(fetchFn, TOKEN, { weddingId: WEDDING, name: 'Casal', folderId: 'folder-1' }).catch(
      (e) => e,
    );

    expect(error).toBeInstanceOf(DriveApiError);
    expect(error.status).toBe(500);
    expect(error.retryable).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it('403 de cota ao consultar a pasta vira QuotaExceededError', async () => {
    const { fetchFn } = scripted(driveError(403, 'storageQuotaExceeded'));

    await expect(
      ensureFolder(fetchFn, TOKEN, { weddingId: WEDDING, name: 'Casal', folderId: 'folder-1' }),
    ).rejects.toBeInstanceOf(QuotaExceededError);
  });

  it('erro ao criar a pasta é mapeado', async () => {
    const { fetchFn } = scripted(driveError(403, 'storageQuotaExceeded'));

    await expect(ensureFolder(fetchFn, TOKEN, { weddingId: WEDDING, name: 'Casal' })).rejects.toBeInstanceOf(
      QuotaExceededError,
    );
  });

  it('resposta de criação sem id é DriveApiError 502 retryable', async () => {
    const { fetchFn } = scripted(json({}));

    const error = await ensureFolder(fetchFn, TOKEN, { weddingId: WEDDING, name: 'Casal' }).catch((e) => e);

    expect(error).toBeInstanceOf(DriveApiError);
    expect(error.status).toBe(502);
    expect(error.retryable).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// resolveGuestFolder
// ---------------------------------------------------------------------------

interface MemoryStore extends GuestFolderStore {
  rows: Map<string, { displayName: string; folderId: string }>;
  events: string[];
}

// Store em memória; insertIfAbsent é atômico (o primeiro a chegar vence), como a
// chave primária do banco. `rowCount` força o valor devolvido por count().
function memoryStore(
  initial: Record<string, string> = {},
  options: { rowCount?: number; forcedWinner?: string } = {},
): MemoryStore {
  const rows = new Map<string, { displayName: string; folderId: string }>();
  for (const [key, folderId] of Object.entries(initial)) rows.set(key, { displayName: key, folderId });
  const events: string[] = [];
  return {
    rows,
    events,
    async get(_weddingId, guestKey) {
      events.push(`get:${guestKey}`);
      return rows.get(guestKey)?.folderId ?? null;
    },
    async count() {
      events.push('count');
      return options.rowCount ?? rows.size;
    },
    async insertIfAbsent(_weddingId, guestKey, displayName, folderId) {
      events.push(`insert:${guestKey}:${displayName}:${folderId}`);
      if (options.forcedWinner) return options.forcedWinner;
      const existing = rows.get(guestKey);
      if (existing) return existing.folderId;
      rows.set(guestKey, { displayName, folderId });
      return folderId;
    },
    async update(_weddingId, guestKey, folderId) {
      events.push(`update:${guestKey}:${folderId}`);
      const existing = rows.get(guestKey);
      rows.set(guestKey, { displayName: existing?.displayName ?? guestKey, folderId });
    },
  };
}

const creates = (calls: Call[]) => calls.filter((c) => c.method === 'POST');

describe('resolveGuestFolder', () => {
  it('convidado novo: cria a pasta sob a raiz e registra no store', async () => {
    const store = memoryStore();
    const { fetchFn, calls } = scripted(json({ id: 'f-maria' }));

    const id = await resolveGuestFolder(fetchFn, TOKEN, store, {
      weddingId: WEDDING,
      rootFolderId: ROOT,
      guestName: 'Maria Silva',
    });

    expect(id).toBe('f-maria');
    expect(calls).toHaveLength(1);
    expect(parseBody(calls[0])).toEqual({
      name: 'Maria Silva',
      mimeType: DRIVE_FOLDER_MIME,
      appProperties: { w: WEDDING },
      parents: [ROOT],
    });
    expect(store.events).toContain('insert:maria silva:Maria Silva:f-maria');
    expect(store.rows.get('maria silva')).toEqual({ displayName: 'Maria Silva', folderId: 'f-maria' });
  });

  it('convidado repetido: reaproveita a pasta guardada, sem criar e sem update', async () => {
    const store = memoryStore({ 'maria silva': 'f-maria' });
    const { fetchFn, calls } = scripted(json({ id: 'f-maria', trashed: false }));

    const id = await resolveGuestFolder(fetchFn, TOKEN, store, {
      weddingId: WEDDING,
      rootFolderId: ROOT,
      guestName: 'Maria Silva',
    });

    expect(id).toBe('f-maria');
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('GET');
    expect(calls[0].url).toBe('https://www.googleapis.com/drive/v3/files/f-maria?fields=id,trashed');
    expect(store.events.some((e) => e.startsWith('update:') || e.startsWith('insert:'))).toBe(false);
  });

  it('Maria, maria e María usam a mesma pasta', async () => {
    const store = memoryStore();
    const { fetchFn, calls } = scripted(
      json({ id: 'f-maria' }),
      json({ id: 'f-maria', trashed: false }),
      json({ id: 'f-maria', trashed: false }),
    );
    const resolve = (guestName: string) =>
      resolveGuestFolder(fetchFn, TOKEN, store, { weddingId: WEDDING, rootFolderId: ROOT, guestName });

    expect(await resolve('Maria')).toBe('f-maria');
    expect(await resolve('maria')).toBe('f-maria');
    expect(await resolve('  MARÍA ')).toBe('f-maria');

    expect(creates(calls)).toHaveLength(1);
    expect(store.rows.size).toBe(1);
  });

  it.each([undefined, null, '', '   ', 'Anônimo', 'anonimo', '///'])(
    'anônimo (%j): usa a pasta Anônimo com chave vazia e não consulta o teto',
    async (guestName) => {
      const store = memoryStore();
      const { fetchFn, calls } = scripted(json({ id: 'f-anon' }));

      const id = await resolveGuestFolder(fetchFn, TOKEN, store, {
        weddingId: WEDDING,
        rootFolderId: ROOT,
        guestName,
      });

      expect(id).toBe('f-anon');
      expect(parseBody(calls[0]).name).toBe('Anônimo');
      expect(store.events).toContain('insert::Anônimo:f-anon');
      expect(store.events).not.toContain('count');
    },
  );

  it('anônimo repetido reaproveita a pasta Anônimo', async () => {
    const store = memoryStore({ '': 'f-anon' });
    const { fetchFn, calls } = scripted(json({ id: 'f-anon', trashed: false }));

    const id = await resolveGuestFolder(fetchFn, TOKEN, store, {
      weddingId: WEDDING,
      rootFolderId: ROOT,
      guestName: undefined,
    });

    expect(id).toBe('f-anon');
    expect(creates(calls)).toHaveLength(0);
  });

  it('teto de 300 pastas: convidado novo cai para a pasta Anônimo', async () => {
    expect(MAX_GUEST_FOLDERS).toBe(300);
    const store = memoryStore({}, { rowCount: MAX_GUEST_FOLDERS });
    const { fetchFn, calls } = scripted(json({ id: 'f-anon' }));

    const id = await resolveGuestFolder(fetchFn, TOKEN, store, {
      weddingId: WEDDING,
      rootFolderId: ROOT,
      guestName: 'Joana Nova',
    });

    expect(id).toBe('f-anon');
    expect(parseBody(calls[0]).name).toBe('Anônimo');
    expect(store.events).toContain('insert::Anônimo:f-anon');
    expect(store.events.some((e) => e.startsWith('insert:joana nova'))).toBe(false);
  });

  it('teto de 300 pastas: cai para a Anônimo que já existe', async () => {
    const store = memoryStore({ '': 'f-anon' }, { rowCount: MAX_GUEST_FOLDERS });
    const { fetchFn, calls } = scripted(json({ id: 'f-anon', trashed: false }));

    const id = await resolveGuestFolder(fetchFn, TOKEN, store, {
      weddingId: WEDDING,
      rootFolderId: ROOT,
      guestName: 'Joana Nova',
    });

    expect(id).toBe('f-anon');
    expect(creates(calls)).toHaveLength(0);
  });

  it('com 299 pastas ainda cria a pasta do convidado novo', async () => {
    const store = memoryStore({}, { rowCount: MAX_GUEST_FOLDERS - 1 });
    const { fetchFn, calls } = scripted(json({ id: 'f-joana' }));

    const id = await resolveGuestFolder(fetchFn, TOKEN, store, {
      weddingId: WEDDING,
      rootFolderId: ROOT,
      guestName: 'Joana Nova',
    });

    expect(id).toBe('f-joana');
    expect(parseBody(calls[0]).name).toBe('Joana Nova');
  });

  it('teto de 300 pastas não afeta quem já tem pasta', async () => {
    const store = memoryStore({ joana: 'f-joana' }, { rowCount: MAX_GUEST_FOLDERS });
    const { fetchFn } = scripted(json({ id: 'f-joana', trashed: false }));

    const id = await resolveGuestFolder(fetchFn, TOKEN, store, {
      weddingId: WEDDING,
      rootFolderId: ROOT,
      guestName: 'Joana',
    });

    expect(id).toBe('f-joana');
  });

  it('pasta guardada apagada (404) é recriada e o store é atualizado', async () => {
    const store = memoryStore({ joana: 'f-velha' });
    const { fetchFn, calls } = scripted(driveError(404, 'notFound'), json({ id: 'f-nova' }));

    const id = await resolveGuestFolder(fetchFn, TOKEN, store, {
      weddingId: WEDDING,
      rootFolderId: ROOT,
      guestName: 'Joana',
    });

    expect(id).toBe('f-nova');
    expect(calls[0].url).toBe('https://www.googleapis.com/drive/v3/files/f-velha?fields=id,trashed');
    expect(parseBody(calls[1])).toEqual({
      name: 'Joana',
      mimeType: DRIVE_FOLDER_MIME,
      appProperties: { w: WEDDING },
      parents: [ROOT],
    });
    expect(store.events).toContain('update:joana:f-nova');
    expect(store.events.some((e) => e.startsWith('insert:'))).toBe(false);
    expect(store.rows.get('joana')?.folderId).toBe('f-nova');
  });

  it('pasta guardada na lixeira é recriada e o store é atualizado', async () => {
    const store = memoryStore({ joana: 'f-velha' });
    const { fetchFn } = scripted(json({ id: 'f-velha', trashed: true }), json({ id: 'f-nova' }));

    const id = await resolveGuestFolder(fetchFn, TOKEN, store, {
      weddingId: WEDDING,
      rootFolderId: ROOT,
      guestName: 'Joana',
    });

    expect(id).toBe('f-nova');
    expect(store.events).toContain('update:joana:f-nova');
  });

  it('disputa: se insertIfAbsent devolve outro id, a pasta criada vai para a lixeira', async () => {
    const store = memoryStore({}, { forcedWinner: 'f-vencedora' });
    const { fetchFn, calls } = scripted(json({ id: 'f-perdedora' }), json({ id: 'f-perdedora' }));

    const id = await resolveGuestFolder(fetchFn, TOKEN, store, {
      weddingId: WEDDING,
      rootFolderId: ROOT,
      guestName: 'Maria',
    });

    expect(id).toBe('f-vencedora');
    expect(calls).toHaveLength(2);
    expect(calls[1].method).toBe('PATCH');
    expect(calls[1].url).toBe('https://www.googleapis.com/drive/v3/files/f-perdedora');
    expect(calls[1].headers).toEqual({ ...AUTH, 'Content-Type': 'application/json' });
    expect(parseBody(calls[1])).toEqual({ trashed: true });
  });

  it('disputa: falha (HTTP ou de rede) ao mandar para a lixeira é ignorada', async () => {
    const httpFailure = memoryStore({}, { forcedWinner: 'f-vencedora' });
    const http = scripted(json({ id: 'f-perdedora' }), driveError(500, 'backendError'));
    expect(
      await resolveGuestFolder(http.fetchFn, TOKEN, httpFailure, {
        weddingId: WEDDING,
        rootFolderId: ROOT,
        guestName: 'Maria',
      }),
    ).toBe('f-vencedora');
    expect(http.calls[1].method).toBe('PATCH');

    const networkFailure = memoryStore({}, { forcedWinner: 'f-vencedora' });
    const network = createFakeFetch((call) => {
      if (call.method === 'PATCH') throw new TypeError('network down');
      return json({ id: 'f-perdedora' });
    });
    expect(
      await resolveGuestFolder(network.fetchFn, TOKEN, networkFailure, {
        weddingId: WEDDING,
        rootFolderId: ROOT,
        guestName: 'Maria',
      }),
    ).toBe('f-vencedora');
  });

  it('sem disputa (insertIfAbsent devolve o próprio id) nada vai para a lixeira', async () => {
    const store = memoryStore();
    const { fetchFn, calls } = scripted(json({ id: 'f-maria' }));

    await resolveGuestFolder(fetchFn, TOKEN, store, { weddingId: WEDDING, rootFolderId: ROOT, guestName: 'Maria' });

    expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
  });

  it('dois envios simultâneos de um convidado novo terminam na mesma pasta e a extra é descartada', async () => {
    const store = memoryStore();
    let createdCount = 0;
    const { fetchFn, calls } = createFakeFetch(async (call) => {
      if (call.method === 'POST') {
        const id = `f-${++createdCount}`;
        // Deixa as duas chamadas se intercalarem antes do insertIfAbsent.
        await Promise.resolve();
        return json({ id });
      }
      return json({ id: 'ok' });
    });
    const resolve = () =>
      resolveGuestFolder(fetchFn, TOKEN, store, { weddingId: WEDDING, rootFolderId: ROOT, guestName: 'Maria' });

    const [a, b] = await Promise.all([resolve(), resolve()]);

    expect(a).toBe(b);
    expect(store.rows.get('maria')?.folderId).toBe(a);
    expect(creates(calls)).toHaveLength(2);
    const trashed = calls.filter((c) => c.method === 'PATCH');
    expect(trashed).toHaveLength(1);
    const trashedId = trashed[0].url.split('/').pop();
    expect(trashedId).not.toBe(a);
    expect(['f-1', 'f-2']).toContain(trashedId);
  });

  it('o nome da pasta é o nome sanitizado do convidado', async () => {
    const store = memoryStore();
    const { fetchFn, calls } = scripted(json({ id: 'f-x' }));

    await resolveGuestFolder(fetchFn, TOKEN, store, {
      weddingId: WEDDING,
      rootFolderId: ROOT,
      guestName: '  ..Tio   Zé  Silva  ',
    });

    expect(parseBody(calls[0]).name).toBe('Tio Zé Silva');
    expect(store.events.some((e) => e.startsWith('insert:tio ze silva:Tio Zé Silva:'))).toBe(true);
  });

  it('propaga o erro do Drive ao criar a pasta, sem tocar no store', async () => {
    const store = memoryStore();
    const { fetchFn } = scripted(driveError(403, 'storageQuotaExceeded'));

    await expect(
      resolveGuestFolder(fetchFn, TOKEN, store, { weddingId: WEDDING, rootFolderId: ROOT, guestName: 'Maria' }),
    ).rejects.toBeInstanceOf(QuotaExceededError);
    expect(store.events.some((e) => e.startsWith('insert:') || e.startsWith('update:'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// initResumableSession
// ---------------------------------------------------------------------------

describe('initResumableSession', () => {
  const SESSION_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=abc';
  const base = {
    parentId: 'f-maria',
    name: 'IMG_0001.jpg',
    mimeType: 'image/jpeg',
    size: 12345,
    weddingId: WEDDING,
    guestName: 'Maria Silva',
  };
  const ok = () => new Response(null, { status: 200, headers: { Location: SESSION_URL } });

  it('cria a sessão com URL, headers e corpo exatos e devolve o Location', async () => {
    const { fetchFn, calls } = scripted(ok());

    const uploadUrl = await initResumableSession(fetchFn, TOKEN, { ...base, origin: 'https://casarei.online' });

    expect(uploadUrl).toBe(SESSION_URL);
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toBe('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id');
    expect(calls[0].headers).toEqual({
      Authorization: 'Bearer ya29.token',
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': 'image/jpeg',
      'X-Upload-Content-Length': '12345',
      Origin: 'https://casarei.online',
    });
    expect(parseBody(calls[0])).toEqual({
      name: 'IMG_0001.jpg',
      parents: ['f-maria'],
      appProperties: { v: '1', w: WEDDING, g: 'Maria Silva' },
    });
  });

  it.each([undefined, null, ''])('não envia Origin quando origin é %j', async (origin) => {
    const { fetchFn, calls } = scripted(ok());

    await initResumableSession(fetchFn, TOKEN, { ...base, origin });

    expect(Object.keys(calls[0].headers)).not.toContain('Origin');
    expect(calls[0].headers).toEqual({
      Authorization: 'Bearer ya29.token',
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': 'image/jpeg',
      'X-Upload-Content-Length': '12345',
    });
  });

  it('omite appProperties.g quando o convidado é anônimo', async () => {
    const { fetchFn, calls } = scripted(ok());

    await initResumableSession(fetchFn, TOKEN, { ...base, guestName: '' });

    const { appProperties } = parseBody(calls[0]);
    expect(appProperties).toEqual({ v: '1', w: WEDDING });
    expect(Object.keys(appProperties)).not.toContain('g');
  });

  it('corta g em 120 bytes UTF-8 sem partir um emoji', async () => {
    const { fetchFn, calls } = scripted(ok());
    const guestName = 'a'.repeat(119) + '😀';

    await initResumableSession(fetchFn, TOKEN, { ...base, guestName });

    const { g } = parseBody(calls[0]).appProperties;
    expect(g).toBe('a'.repeat(119));
    expect(utf8Bytes(g)).toBeLessThanOrEqual(120);
  });

  it('corta g em 120 bytes com caracteres de vários bytes', async () => {
    const { fetchFn, calls } = scripted(ok());

    await initResumableSession(fetchFn, TOKEN, { ...base, guestName: '日'.repeat(60) });

    const { g } = parseBody(calls[0]).appProperties;
    expect(g).toBe('日'.repeat(40));
    expect(utf8Bytes(g)).toBe(120);
  });

  it('mantém g inteiro quando cabe em 120 bytes', async () => {
    const { fetchFn, calls } = scripted(ok());
    const guestName = 'a'.repeat(120);

    await initResumableSession(fetchFn, TOKEN, { ...base, guestName });

    expect(parseBody(calls[0]).appProperties.g).toBe(guestName);
  });

  it('sem header Location é DriveApiError 502 retryable', async () => {
    const { fetchFn } = scripted(new Response(null, { status: 200 }));

    const error = await initResumableSession(fetchFn, TOKEN, base).catch((e) => e);

    expect(error).toBeInstanceOf(DriveApiError);
    expect(error.message).toBe('Resposta inesperada do Google');
    expect(error.status).toBe(502);
    expect(error.retryable).toBe(true);
  });

  it('depois de ler o Location, o corpo da resposta de sucesso é descartado', async () => {
    const withBody = () => new Response('{"id":"arquivo-1"}', { status: 200, headers: { Location: SESSION_URL } });
    const { fetchFn, responses } = scripted(withBody());

    const uploadUrl = await initResumableSession(fetchFn, TOKEN, base);

    expect(uploadUrl).toBe(SESSION_URL);
    expect(responses[0].body).not.toBeNull();
    expectBodiesConsumed(responses);
  });

  it('sem Location, o corpo da resposta de sucesso também é descartado antes de lançar', async () => {
    const { fetchFn, responses } = scripted(new Response('{"id":"arquivo-1"}', { status: 200 }));

    const error = await initResumableSession(fetchFn, TOKEN, base).catch((e) => e);

    expect(error).toBeInstanceOf(DriveApiError);
    expect(responses[0].body).not.toBeNull();
    expectBodiesConsumed(responses);
  });

  it('403 de cota vira QuotaExceededError', async () => {
    const { fetchFn } = scripted(driveError(403, 'storageQuotaExceeded'));

    await expect(initResumableSession(fetchFn, TOKEN, base)).rejects.toBeInstanceOf(QuotaExceededError);
  });

  it('erro 503 vira DriveApiError retryable', async () => {
    const { fetchFn } = scripted(driveError(503, 'backendError'));

    const error = await initResumableSession(fetchFn, TOKEN, base).catch((e) => e);

    expect(error).toBeInstanceOf(DriveApiError);
    expect(error.status).toBe(503);
    expect(error.retryable).toBe(true);
  });

  it('erro 400 vira DriveApiError não retryable, mesmo com corpo que não é JSON', async () => {
    const { fetchFn } = scripted(new Response('Bad Request', { status: 400 }));

    const error = await initResumableSession(fetchFn, TOKEN, base).catch((e) => e);

    expect(error).toBeInstanceOf(DriveApiError);
    expect(error.status).toBe(400);
    expect(error.retryable).toBe(false);
  });
});
