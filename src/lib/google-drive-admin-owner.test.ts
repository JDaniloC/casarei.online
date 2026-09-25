import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createHandler,
  type DriveConnectionRow,
  type GoogleDriveAdminDeps,
} from '../../supabase/functions/google-drive-admin/handler';
import {
  DRIVE_FILE_SCOPE,
  DriveApiError,
  InvalidCodeError,
  NeedsReconnectError,
  type CodeExchange,
} from '../../supabase/functions/_shared/google-drive';
import { STATE_TTL_MS, type OAuthState } from '../../supabase/functions/_shared/hmac-state';

const ENDPOINT = 'https://projeto.supabase.co/functions/v1/google-drive-admin';
const ORIGIN = 'https://casarei.online';
const USER_A = 'aaaaaaaa-0000-4000-8000-00000000000a';
const USER_B = 'bbbbbbbb-0000-4000-8000-00000000000b';
const WEDDING_A = '11111111-1111-4111-8111-111111111111';
const WEDDING_B = '22222222-2222-4222-8222-222222222222';
const JWT_A = 'eyJhbGciOiJIUzI1NiJ9.jwt-do-casal-a.assinatura-a';
const TOKEN_A = 'aB3_-x9QzL0aB7cD2eF5gH8jK1mN4pRs';
const NOW = Date.parse('2026-09-25T12:00:00.000Z');
const EPOCH_OLD = '2026-09-25T10:00:00+00:00';
const EPOCH_NEW = '2026-09-25T12:00:00+00:00';
const FOLDER_ID = 'pastaDoCasal_123456';
const FOLDER_URL = `https://drive.google.com/drive/folders/${FOLDER_ID}`;
const CODE = '4/0AXcodigo-de-autorizacao-secreto';
const REFRESH = '1//refresh-token-secreto';
const ACCESS = 'ya29.acesso-secreto';
const EMAIL = 'ana@example.com';
const NAMES = { coupleName: 'Ana & Bruno', partner1Name: 'Ana', partner2Name: 'Bruno' };

const platformRow = (overrides: Partial<DriveConnectionRow> = {}): DriveConnectionRow => ({
  uploadsEnabled: true,
  uploadToken: TOKEN_A,
  ...overrides,
});

const ownerRow = (overrides: Partial<DriveConnectionRow> = {}): DriveConnectionRow => ({
  uploadsEnabled: true,
  uploadToken: TOKEN_A,
  connectedAt: EPOCH_OLD,
  googleEmail: 'velha@example.com',
  needsReconnect: false,
  folderId: FOLDER_ID,
  ...overrides,
});

const signedState = (overrides: Partial<OAuthState> = {}) =>
  `signed:${JSON.stringify({ w: WEDDING_A, u: USER_A, exp: NOW + STATE_TTL_MS, n: 'nonce', ...overrides })}`;

interface HarnessOptions {
  /** `undefined` = casal em modo plataforma; `null` = sem linha de conexão. */
  row?: DriveConnectionRow | null;
  exchange?: Partial<CodeExchange> | Error;
  names?: typeof NAMES | null;
}

function makeHarness(options: HarnessOptions = {}) {
  const calls: string[] = [];
  let row: DriveConnectionRow | null = options.row === undefined ? platformRow() : options.row;
  let tokenCounter = 0;

  const mocks = {
    authenticate: vi.fn<GoogleDriveAdminDeps['authenticate']>(async (header) =>
      header === `Bearer ${JWT_A}` ? { userId: USER_A } : null,
    ),
    getWeddingIdForUser: vi.fn<GoogleDriveAdminDeps['getWeddingIdForUser']>(async (userId) =>
      userId === USER_A ? WEDDING_A : null,
    ),
    get: vi.fn<GoogleDriveAdminDeps['connections']['get']>(async () => (row ? { ...row } : null)),
    create: vi.fn<GoogleDriveAdminDeps['connections']['create']>(async () => {
      throw new Error('create não é usado por estes testes');
    }),
    setEnabled: vi.fn<GoogleDriveAdminDeps['connections']['setEnabled']>(async (_id, enabled) => {
      if (!row) return null;
      row = { ...row, uploadsEnabled: enabled };
      return { ...row };
    }),
    rotateToken: vi.fn<GoogleDriveAdminDeps['connections']['rotateToken']>(async (_id, uploadToken) => {
      if (!row) return null;
      row = { ...row, uploadToken };
      return { ...row };
    }),
    connectOwner: vi.fn<GoogleDriveAdminDeps['connections']['connectOwner']>(async (_id, data, newUploadToken) => {
      calls.push('connections.connectOwner');
      row = {
        uploadsEnabled: row?.uploadsEnabled ?? true,
        uploadToken: row?.uploadToken ?? (newUploadToken as string),
        connectedAt: EPOCH_NEW,
        googleEmail: data.googleEmail,
        needsReconnect: false,
        folderId: data.folderId,
      };
      return { ...row };
    }),
    disconnectOwner: vi.fn<GoogleDriveAdminDeps['connections']['disconnectOwner']>(async () => {
      calls.push('connections.disconnectOwner');
      if (!row) return null;
      row = {
        uploadsEnabled: row.uploadsEnabled,
        uploadToken: row.uploadToken,
        connectedAt: null,
        googleEmail: null,
        needsReconnect: false,
        folderId: null,
      };
      return { ...row };
    }),
    countNamedGuestFolders: vi.fn<GoogleDriveAdminDeps['countNamedGuestFolders']>(async () => 0),
    generateToken: vi.fn<GoogleDriveAdminDeps['generateToken']>(() => {
      tokenCounter += 1;
      return `gen${String(tokenCounter).padStart(2, '0')}${'Q'.repeat(27)}`;
    }),
    getAccessToken: vi.fn<GoogleDriveAdminDeps['getAccessToken']>(async () => ACCESS),
    signState: vi.fn<GoogleDriveAdminDeps['signState']>(async (payload) => `signed:${JSON.stringify(payload)}`),
    verifyState: vi.fn<GoogleDriveAdminDeps['verifyState']>(async (state) => {
      if (!state.startsWith('signed:')) return null;
      const payload = JSON.parse(state.slice('signed:'.length)) as OAuthState;
      return payload.exp > NOW ? payload : null;
    }),
    encryptToken: vi.fn<GoogleDriveAdminDeps['encryptToken']>(async (plain) => ({
      encrypted: `enc(${plain})`,
      iv: 'iv-1',
    })),
    getCoupleNames: vi.fn<GoogleDriveAdminDeps['getCoupleNames']>(async () =>
      options.names === undefined ? NAMES : options.names,
    ),
    clearGuestFolders: vi.fn<GoogleDriveAdminDeps['clearGuestFolders']>(async () => {
      calls.push('clearGuestFolders');
    }),
    buildAuthUrl: vi.fn<GoogleDriveAdminDeps['google']['buildAuthUrl']>(
      (state) => `https://accounts.google.com/o/oauth2/v2/auth?state=${encodeURIComponent(state)}`,
    ),
    exchangeCode: vi.fn<GoogleDriveAdminDeps['google']['exchangeCode']>(async () => {
      calls.push('google.exchangeCode');
      if (options.exchange instanceof Error) throw options.exchange;
      return {
        refreshToken: REFRESH,
        accessToken: ACCESS,
        expiresIn: 3600,
        scopes: ['openid', 'email', DRIVE_FILE_SCOPE],
        email: EMAIL,
        ...options.exchange,
      };
    }),
    createOwnerRootFolder: vi.fn<GoogleDriveAdminDeps['google']['createOwnerRootFolder']>(async () => {
      calls.push('google.createOwnerRootFolder');
      return FOLDER_ID;
    }),
    listGuestFiles: vi.fn<GoogleDriveAdminDeps['drive']['listGuestFiles']>(async () => ({
      files: [],
      nextPageToken: null,
    })),
    summarizeGuestFiles: vi.fn<GoogleDriveAdminDeps['drive']['summarizeGuestFiles']>(async () => ({
      count: 0,
      totalBytes: 0,
    })),
    getThumbnails: vi.fn<GoogleDriveAdminDeps['drive']['getThumbnails']>(async () => Object.create(null)),
  };

  const deps: GoogleDriveAdminDeps = {
    allowedOrigins: [ORIGIN],
    authenticate: mocks.authenticate,
    getWeddingIdForUser: mocks.getWeddingIdForUser,
    connections: {
      get: mocks.get,
      create: mocks.create,
      setEnabled: mocks.setEnabled,
      rotateToken: mocks.rotateToken,
      connectOwner: mocks.connectOwner,
      disconnectOwner: mocks.disconnectOwner,
    },
    countNamedGuestFolders: mocks.countNamedGuestFolders,
    generateToken: mocks.generateToken,
    getAccessToken: mocks.getAccessToken,
    now: () => NOW,
    randomNonce: () => '00'.repeat(16),
    signState: mocks.signState,
    verifyState: mocks.verifyState,
    encryptToken: mocks.encryptToken,
    getCoupleNames: mocks.getCoupleNames,
    clearGuestFolders: mocks.clearGuestFolders,
    google: {
      buildAuthUrl: mocks.buildAuthUrl,
      exchangeCode: mocks.exchangeCode,
      createOwnerRootFolder: mocks.createOwnerRootFolder,
    },
    drive: {
      listGuestFiles: mocks.listGuestFiles,
      summarizeGuestFiles: mocks.summarizeGuestFiles,
      getThumbnails: mocks.getThumbnails,
    },
  };

  return { handler: createHandler(deps), deps, mocks, calls, currentRow: () => row };
}

type Harness = ReturnType<typeof makeHarness>;

function post(h: Harness, body: unknown, jwt: string | null = JWT_A) {
  const headers: Record<string, string> = { 'content-type': 'application/json', origin: ORIGIN };
  if (jwt !== null) headers.authorization = `Bearer ${jwt}`;
  return h.handler(new Request(ENDPOINT, { method: 'POST', headers, body: JSON.stringify(body) }));
}

const bodyOf = async (res: Response) => JSON.parse(await res.text()) as Record<string, unknown>;

const connectBody = (overrides: Record<string, unknown> = {}) => ({
  action: 'connect',
  code: CODE,
  state: signedState(),
  ...overrides,
});

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  errorSpy.mockRestore();
});
const loggedText = () => errorSpy.mock.calls.map((args) => args.map(String).join(' ')).join('\n');

// ---------------------------------------------------------------------------
// auth-url
// ---------------------------------------------------------------------------

describe('google-drive-admin: auth-url', () => {
  it('devolve a URL do Google com um state amarrado ao usuário e ao casamento do JWT', async () => {
    const h = makeHarness();
    const res = await post(h, { action: 'auth-url' });

    expect(res.status).toBe(200);
    const { url } = (await bodyOf(res)) as { url: string };
    const state = new URL(url).searchParams.get('state') as string;
    expect(JSON.parse(state.slice('signed:'.length))).toEqual({
      w: WEDDING_A,
      u: USER_A,
      exp: NOW + STATE_TTL_MS,
      n: '00'.repeat(16),
    });
  });

  it('funciona sem linha de conexão (não exige o recurso ativado)', async () => {
    const h = makeHarness({ row: null });
    expect((await post(h, { action: 'auth-url' })).status).toBe(200);
  });

  it('não lê casamento nem usuário do corpo', async () => {
    const h = makeHarness();
    const res = await post(h, { action: 'auth-url', weddingId: WEDDING_B, userId: USER_B });
    const { url } = (await bodyOf(res)) as { url: string };
    const state = JSON.parse((new URL(url).searchParams.get('state') as string).slice('signed:'.length));
    expect(state.w).toBe(WEDDING_A);
    expect(state.u).toBe(USER_A);
  });

  it('sem autenticação: 401 e nada é assinado', async () => {
    const h = makeHarness();
    expect((await post(h, { action: 'auth-url' }, null)).status).toBe(401);
    expect(h.mocks.signState).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// connect
// ---------------------------------------------------------------------------

describe('google-drive-admin: connect', () => {
  it('conecta: cria a pasta, cifra o token, grava de uma vez, limpa as pastas de convidado e devolve o modo casal', async () => {
    const h = makeHarness();
    const res = await post(h, connectBody());

    expect(res.status).toBe(200);
    expect(await bodyOf(res)).toEqual({
      enabled: true,
      uploadsEnabled: true,
      uploadToken: TOKEN_A,
      driveMode: 'owner',
      googleEmail: EMAIL,
      needsReconnect: false,
      folderUrl: FOLDER_URL,
    });
    expect(h.mocks.exchangeCode).toHaveBeenCalledWith(CODE);
    expect(h.mocks.createOwnerRootFolder).toHaveBeenCalledWith(ACCESS, {
      weddingId: WEDDING_A,
      name: 'Casarei.online – Ana & Bruno',
    });
    expect(h.mocks.encryptToken).toHaveBeenCalledWith(REFRESH);
    // Com linha existente o token do QR não é tocado (terceiro argumento null).
    expect(h.mocks.connectOwner).toHaveBeenCalledWith(
      WEDDING_A,
      { refreshTokenEncrypted: `enc(${REFRESH})`, refreshTokenIv: 'iv-1', googleEmail: EMAIL, folderId: FOLDER_ID },
      null,
    );
    expect(h.mocks.generateToken).not.toHaveBeenCalled();
    expect(h.calls.indexOf('connections.connectOwner')).toBeLessThan(h.calls.indexOf('clearGuestFolders'));
    expect(h.mocks.clearGuestFolders).toHaveBeenCalledWith(WEDDING_A);
  });

  it('a resposta e os logs nunca contêm o código, o state nem os tokens', async () => {
    const h = makeHarness();
    const res = await post(h, connectBody());
    const text = JSON.stringify(await bodyOf(res)) + loggedText();
    for (const secret of [CODE, REFRESH, ACCESS, 'signed:']) expect(text).not.toContain(secret);
  });

  it('sem linha de conexão: cria a linha com um token novo, uma vez', async () => {
    const h = makeHarness({ row: null });
    const res = await post(h, connectBody());

    expect(res.status).toBe(200);
    const token = `gen01${'Q'.repeat(27)}`;
    expect(h.mocks.generateToken).toHaveBeenCalledTimes(1);
    expect(h.mocks.connectOwner.mock.calls[0][2]).toBe(token);
    expect((await bodyOf(res)).uploadToken).toBe(token);
  });

  it('state de outro usuário: 400 invalid_state e o Google nem é chamado', async () => {
    const h = makeHarness();
    const res = await post(h, connectBody({ state: signedState({ u: USER_B }) }));
    expect(res.status).toBe(400);
    expect((await bodyOf(res)).code).toBe('invalid_state');
    expect(h.mocks.exchangeCode).not.toHaveBeenCalled();
    expect(h.mocks.connectOwner).not.toHaveBeenCalled();
  });

  it('state de outro casamento: 400 invalid_state', async () => {
    const h = makeHarness();
    const res = await post(h, connectBody({ state: signedState({ w: WEDDING_B }) }));
    expect((await bodyOf(res)).code).toBe('invalid_state');
    expect(h.mocks.exchangeCode).not.toHaveBeenCalled();
  });

  it.each([
    ['expirado', signedState({ exp: NOW })],
    ['adulterado ou sem assinatura', 'lixo'],
  ])('state %s: 400 invalid_state', async (_label, state) => {
    const h = makeHarness();
    const res = await post(h, connectBody({ state }));
    expect(res.status).toBe(400);
    expect((await bodyOf(res)).code).toBe('invalid_state');
    expect(h.mocks.exchangeCode).not.toHaveBeenCalled();
  });

  it('código inválido (já usado, expirado): 400 invalid_code e nada é gravado', async () => {
    const h = makeHarness({ exchange: new InvalidCodeError('já usado') });
    const res = await post(h, connectBody());
    expect(res.status).toBe(400);
    expect((await bodyOf(res)).code).toBe('invalid_code');
    expect(h.mocks.connectOwner).not.toHaveBeenCalled();
    expect(h.mocks.createOwnerRootFolder).not.toHaveBeenCalled();
  });

  it('sem o escopo do Drive (o casal desmarcou): 400 missing_scope, sem criar pasta nem gravar', async () => {
    const h = makeHarness({ exchange: { scopes: ['openid', 'email'] } });
    const res = await post(h, connectBody());
    expect(res.status).toBe(400);
    const body = await bodyOf(res);
    expect(body.code).toBe('missing_scope');
    expect(String(body.error)).toContain('Marque a permissão de acesso ao Google Drive');
    expect(h.mocks.createOwnerRootFolder).not.toHaveBeenCalled();
    expect(h.mocks.connectOwner).not.toHaveBeenCalled();
  });

  it('erro do Google na troca do código (5xx): 503 unavailable', async () => {
    const h = makeHarness({ exchange: new DriveApiError('Erro do Google Drive (HTTP 503)', 503, true) });
    const res = await post(h, connectBody());
    expect(res.status).toBe(503);
    expect((await bodyOf(res)).code).toBe('unavailable');
  });

  it('falha ao criar a pasta: 503 unavailable e nada é gravado', async () => {
    const h = makeHarness();
    h.mocks.createOwnerRootFolder.mockRejectedValueOnce(new DriveApiError('Erro do Google Drive (HTTP 500)', 500, true));
    const res = await post(h, connectBody());
    expect(res.status).toBe(503);
    expect(h.mocks.connectOwner).not.toHaveBeenCalled();
  });

  it('falha ao gravar: 503 unavailable e as pastas de convidado não são limpas', async () => {
    const h = makeHarness();
    h.mocks.connectOwner.mockRejectedValueOnce(new Error('Falha ao gravar a conexão do casal'));
    const res = await post(h, connectBody());
    expect(res.status).toBe(503);
    expect(h.mocks.clearGuestFolders).not.toHaveBeenCalled();
  });

  it('a limpeza das pastas de convidado é best effort: se falhar, a conexão vale', async () => {
    const h = makeHarness();
    h.mocks.clearGuestFolders.mockRejectedValueOnce(new Error('banco'));
    const res = await post(h, connectBody());
    expect(res.status).toBe(200);
    expect((await bodyOf(res)).driveMode).toBe('owner');
  });

  // Revogar um refresh token no Google derruba a autorização INTEIRA do par (conta Google,
  // app): se a conta for a mesma da plataforma ou de outro casamento, quebraria os dois.
  // Por isso o app nunca revoga; trocar de conta só substitui o que está gravado.
  it('reconexão com OUTRA conta: grava a conexão nova e não revoga nada no Google', async () => {
    const h = makeHarness({ row: ownerRow({ googleEmail: 'velha@example.com' }) });
    const res = await post(h, connectBody());

    expect(res.status).toBe(200);
    expect(h.mocks.connectOwner).toHaveBeenCalledTimes(1);
    expect(h.mocks.connectOwner.mock.calls[0][1]).toMatchObject({ googleEmail: EMAIL, folderId: FOLDER_ID });
    expect(h.mocks.connectOwner.mock.calls[0][2]).toBeNull();
    expect((await bodyOf(res)).googleEmail).toBe(EMAIL);
    // As dependências não têm caminho para revogar nem para ler o token anterior.
    expect(h.deps.google).not.toHaveProperty('revokeToken');
    expect(h.deps).not.toHaveProperty('decryptToken');
    expect(h.deps).not.toHaveProperty('loadOwnerCredentials');
    // Só o Google da troca do código e da criação da pasta é chamado.
    expect(h.calls.filter((call) => call.startsWith('google.'))).toEqual([
      'google.exchangeCode',
      'google.createOwnerRootFolder',
    ]);
  });

  it.each([
    ['sem código', { code: undefined }],
    ['código vazio', { code: '' }],
    ['código grande demais', { code: 'c'.repeat(513) }],
    ['sem state', { state: undefined }],
    ['state grande demais', { state: 's'.repeat(2049) }],
    ['código que não é texto', { code: 42 }],
  ])('corpo inválido (%s): 400 invalid_input', async (_label, overrides) => {
    const h = makeHarness();
    const res = await post(h, connectBody(overrides));
    expect(res.status).toBe(400);
    expect((await bodyOf(res)).code).toBe('invalid_input');
    expect(h.mocks.exchangeCode).not.toHaveBeenCalled();
  });

  it('sem autenticação: 401 e o Google nem é chamado', async () => {
    const h = makeHarness();
    expect((await post(h, connectBody(), null)).status).toBe(401);
    expect(h.mocks.exchangeCode).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// disconnect
// ---------------------------------------------------------------------------

describe('google-drive-admin: disconnect', () => {
  it('modo casal: apaga a conexão gravada, volta ao modo plataforma, limpa as pastas e mantém o token do QR', async () => {
    const h = makeHarness({ row: ownerRow({ googleEmail: EMAIL }) });
    const res = await post(h, { action: 'disconnect' });

    expect(res.status).toBe(200);
    expect(await bodyOf(res)).toEqual({
      enabled: true,
      uploadsEnabled: true,
      uploadToken: TOKEN_A,
      driveMode: 'platform',
      googleEmail: null,
      needsReconnect: false,
      folderUrl: null,
    });
    expect(h.mocks.disconnectOwner).toHaveBeenCalledTimes(1);
    expect(h.mocks.disconnectOwner).toHaveBeenCalledWith(WEDDING_A);
    expect(h.mocks.clearGuestFolders).toHaveBeenCalledWith(WEDDING_A);
    expect(h.calls.indexOf('connections.disconnectOwner')).toBeLessThan(h.calls.indexOf('clearGuestFolders'));
    expect(h.currentRow()?.uploadToken).toBe(TOKEN_A);
    // Nunca revoga no Google: só o que está gravado aqui some.
    expect(h.deps.google).not.toHaveProperty('revokeToken');
    expect(h.deps).not.toHaveProperty('loadOwnerCredentials');
    expect(h.calls.filter((call) => call.startsWith('google.'))).toEqual([]);
  });

  it('é idempotente: no modo plataforma não grava nada e não mexe nas pastas', async () => {
    const h = makeHarness();
    const res = await post(h, { action: 'disconnect' });
    expect(res.status).toBe(200);
    expect((await bodyOf(res)).driveMode).toBe('platform');
    expect(h.mocks.disconnectOwner).not.toHaveBeenCalled();
    expect(h.mocks.clearGuestFolders).not.toHaveBeenCalled();
  });

  it('sem linha de conexão: 200 com "não ativado"', async () => {
    const h = makeHarness({ row: null });
    const res = await post(h, { action: 'disconnect' });
    expect(res.status).toBe(200);
    expect(await bodyOf(res)).toEqual({
      enabled: false,
      uploadsEnabled: false,
      uploadToken: null,
      driveMode: 'platform',
      googleEmail: null,
      needsReconnect: false,
      folderUrl: null,
    });
  });

  it('sem linha de conexão: não grava nada', async () => {
    const h = makeHarness({ row: null });
    await post(h, { action: 'disconnect' });
    expect(h.mocks.disconnectOwner).not.toHaveBeenCalled();
    expect(h.mocks.clearGuestFolders).not.toHaveBeenCalled();
  });

  it('a linha sumiu entre a leitura e a gravação: 200 com "não ativado"', async () => {
    const h = makeHarness({ row: ownerRow() });
    h.mocks.disconnectOwner.mockResolvedValueOnce(null);
    const res = await post(h, { action: 'disconnect' });
    expect(res.status).toBe(200);
    expect((await bodyOf(res)).enabled).toBe(false);
    expect(h.mocks.clearGuestFolders).not.toHaveBeenCalled();
  });

  it('se disconnectOwner falhar (banco): 503 unavailable e as pastas de convidado não são limpas', async () => {
    const h = makeHarness({ row: ownerRow() });
    h.mocks.disconnectOwner.mockRejectedValueOnce(new Error('Falha ao desconectar o Google do casal'));
    const res = await post(h, { action: 'disconnect' });
    expect(res.status).toBe(503);
    expect((await bodyOf(res)).code).toBe('unavailable');
    expect(h.mocks.clearGuestFolders).not.toHaveBeenCalled();
  });

  it('a limpeza das pastas de convidado é best effort: se falhar, a desconexão vale', async () => {
    const h = makeHarness({ row: ownerRow() });
    h.mocks.clearGuestFolders.mockRejectedValueOnce(new Error('banco'));
    const res = await post(h, { action: 'disconnect' });
    expect(res.status).toBe(200);
    expect((await bodyOf(res)).driveMode).toBe('platform');
  });
});

// ---------------------------------------------------------------------------
// Corpo das respostas de conexão
// ---------------------------------------------------------------------------

describe('google-drive-admin: corpo das respostas de conexão', () => {
  it('modo plataforma: sem e-mail, sem link e sem reconexão, mesmo que a linha traga esses campos', async () => {
    const h = makeHarness({
      row: platformRow({ folderId: FOLDER_ID, googleEmail: 'x@example.com', needsReconnect: true }),
    });
    const body = await bodyOf(await post(h, { action: 'status' }));
    expect(body).toEqual({
      enabled: true,
      uploadsEnabled: true,
      uploadToken: TOKEN_A,
      driveMode: 'platform',
      googleEmail: null,
      needsReconnect: false,
      folderUrl: null,
    });
  });

  it('modo casal: e-mail, marca de reconexão e link da pasta', async () => {
    const h = makeHarness({ row: ownerRow({ googleEmail: EMAIL, needsReconnect: true }) });
    const body = await bodyOf(await post(h, { action: 'status' }));
    expect(body).toMatchObject({ driveMode: 'owner', googleEmail: EMAIL, needsReconnect: true, folderUrl: FOLDER_URL });
  });

  it.each([['curto'], ['com/barra_1234567'], ['a'.repeat(101)], ['']])(
    'id de pasta sem formato de id do Drive (%s): folderUrl nulo',
    async (folderId) => {
      const h = makeHarness({ row: ownerRow({ folderId }) });
      expect((await bodyOf(await post(h, { action: 'status' }))).folderUrl).toBeNull();
    },
  );

  it('sem linha: enabled false com o mesmo formato estendido', async () => {
    const h = makeHarness({ row: null });
    const body = await bodyOf(await post(h, { action: 'status' }));
    expect(body).toMatchObject({ enabled: false, uploadToken: null, driveMode: 'platform', folderUrl: null });
  });

  it.each([
    ['set-enabled', { action: 'set-enabled', enabled: false }],
    ['rotate-token', { action: 'rotate-token' }],
    ['enable', { action: 'enable' }],
  ])('%s preserva os campos do modo casal', async (_name, request) => {
    const h = makeHarness({ row: ownerRow({ googleEmail: EMAIL }) });
    const body = await bodyOf(await post(h, request));
    expect(body).toMatchObject({ driveMode: 'owner', googleEmail: EMAIL, folderUrl: FOLDER_URL });
  });
});

// ---------------------------------------------------------------------------
// Leituras do Drive
// ---------------------------------------------------------------------------

const READ_BODIES: Array<[string, Record<string, unknown>]> = [
  ['list', { action: 'list' }],
  ['summary', { action: 'summary' }],
  ['thumbnails', { action: 'thumbnails', fileIds: ['f1'] }],
];

describe('google-drive-admin: leituras no modo casal', () => {
  it.each(READ_BODIES)('needs_reconnect marcado: 409 sem chamar o Google (%s)', async (_name, request) => {
    const h = makeHarness({ row: ownerRow({ needsReconnect: true }) });
    const res = await post(h, request);
    expect(res.status).toBe(409);
    expect((await bodyOf(res)).code).toBe('needs_reconnect');
    expect(h.mocks.getAccessToken).not.toHaveBeenCalled();
  });

  it('o Google recusa o token agora (NeedsReconnectError): 409 needs_reconnect', async () => {
    const h = makeHarness({ row: ownerRow() });
    h.mocks.getAccessToken.mockRejectedValueOnce(new NeedsReconnectError('revogado'));
    const res = await post(h, { action: 'list' });
    expect(res.status).toBe(409);
    expect((await bodyOf(res)).code).toBe('needs_reconnect');
  });

  it('no modo plataforma, NeedsReconnectError continua sendo 503 unavailable', async () => {
    const h = makeHarness();
    h.mocks.getAccessToken.mockRejectedValueOnce(new NeedsReconnectError('revogado'));
    const res = await post(h, { action: 'list' });
    expect(res.status).toBe(503);
    expect((await bodyOf(res)).code).toBe('unavailable');
  });

  it('pede o token do casal certo (casamento + época) e o da plataforma no modo plataforma', async () => {
    const owner = makeHarness({ row: ownerRow({ connectedAt: EPOCH_OLD }) });
    await post(owner, { action: 'list' });
    expect(owner.mocks.getAccessToken).toHaveBeenCalledWith({ kind: 'owner', weddingId: WEDDING_A, epoch: EPOCH_OLD });

    const platform = makeHarness();
    await post(platform, { action: 'list' });
    expect(platform.mocks.getAccessToken).toHaveBeenCalledWith({ kind: 'platform' });
  });
});
