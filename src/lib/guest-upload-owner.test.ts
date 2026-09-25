import { describe, expect, it, vi } from 'vitest';
import {
  createHandler,
  type GuestUploadConnection,
  type GuestUploadDeps,
} from '../../supabase/functions/guest-upload/handler';
import { NeedsReconnectError, type GuestFolderStore } from '../../supabase/functions/_shared/google-drive';
import type { RateLimitDb } from '../../supabase/functions/_shared/rate-limit';

const ENDPOINT = 'https://projeto.supabase.co/functions/v1/guest-upload';
const ORIGIN = 'https://casarei.online';
const TOKEN = 'abcDEF123_-abcDEF123_-xyz';
const WEDDING_ID = '11111111-1111-4111-8111-111111111111';
const ACCESS_TOKEN = 'ya29.token-de-acesso-secreto';
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?upload_id=sessao-secreta';
const EPOCH = '2026-09-25T12:00:00+00:00';
const NOW = Date.parse('2026-09-25T12:00:00.000Z');
const NAMES = { coupleName: 'Ana & Bruno', partner1Name: 'Ana', partner2Name: 'Bruno' };

const validBody = () => ({
  token: TOKEN,
  fileName: 'IMG_0001.JPG',
  mimeType: 'image/jpeg',
  size: 1_500_000,
  guestName: 'Maria da Silva',
});

function makeHarness(connection: Partial<GuestUploadConnection> = {}) {
  const calls: string[] = [];
  const rateRows: Array<{ identifier: string; action: string }> = [];
  const found: GuestUploadConnection = {
    weddingId: WEDDING_ID,
    uploadsEnabled: true,
    folderId: 'root-1',
    ...connection,
  };

  const rateLimitDb: RateLimitDb = {
    async countSince(identifier, action) {
      return rateRows.filter((r) => r.identifier === identifier && r.action === action).length;
    },
    async insert(identifier, action) {
      rateRows.push({ identifier, action });
    },
  };
  const guestFolders: GuestFolderStore = {
    get: async () => null,
    count: async () => 0,
    insertIfAbsent: async (_w, _k, _d, folderId) => folderId,
    update: async () => {},
  };

  const mocks = {
    findConnection: vi.fn<GuestUploadDeps['findConnection']>(async () => found),
    getCoupleNames: vi.fn<GuestUploadDeps['getCoupleNames']>(async () => NAMES),
    saveRootFolder: vi.fn<GuestUploadDeps['saveRootFolder']>(async (_id, _expected, newId) => {
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
    ensureRootFolder: vi.fn<GuestUploadDeps['drive']['ensureRootFolder']>(async (_t, opts) => {
      calls.push('drive:ensureRootFolder');
      return opts.folderId ?? 'root-plataforma-novo';
    }),
    ensureOwnerRootFolder: vi.fn<GuestUploadDeps['drive']['ensureOwnerRootFolder']>(async (_t, opts) => {
      calls.push('drive:ensureOwnerRootFolder');
      return opts.folderId ?? 'root-casal-novo';
    }),
    trashFolder: vi.fn<GuestUploadDeps['drive']['trashFolder']>(async () => {
      calls.push('drive:trashFolder');
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
    allowedOrigins: [ORIGIN],
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
      ensureOwnerRootFolder: mocks.ensureOwnerRootFolder,
      trashFolder: mocks.trashFolder,
      resolveGuestFolder: mocks.resolveGuestFolder,
      getQuota: mocks.getQuota,
      initSession: mocks.initSession,
    },
  };

  return { handler: createHandler(deps), mocks, calls };
}

type Harness = ReturnType<typeof makeHarness>;

const postReq = (body: unknown = validBody()) =>
  new Request(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN, 'x-forwarded-for': '203.0.113.7' },
    body: JSON.stringify(body),
  });

const getReq = () =>
  new Request(`${ENDPOINT}?token=${TOKEN}`, {
    method: 'GET',
    headers: { origin: ORIGIN, 'x-forwarded-for': '203.0.113.7' },
  });

const json = async (res: Response) => JSON.parse(await res.text()) as Record<string, unknown>;
const driveCalls = (h: Harness) => h.calls.filter((c) => c.startsWith('drive:'));

describe('guest-upload: casal precisa reconectar o Google', () => {
  it('GET: envio ligado + needsReconnect: available false com reason "unavailable"', async () => {
    const h = makeHarness({ connectedAt: EPOCH, needsReconnect: true });
    const res = await h.handler(getReq());

    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({
      coupleName: 'Ana & Bruno',
      available: false,
      reason: 'unavailable',
    });
    expect(driveCalls(h)).toEqual([]);
  });

  it('GET: envio desligado pelo casal continua sendo "disabled", mesmo com needsReconnect', async () => {
    const h = makeHarness({ connectedAt: EPOCH, needsReconnect: true, uploadsEnabled: false });
    const body = await json(await h.handler(getReq()));
    expect(body).toMatchObject({ available: false, reason: 'disabled' });
  });

  it('GET: modo casal saudável: available true e sem reason', async () => {
    const h = makeHarness({ connectedAt: EPOCH, needsReconnect: false });
    const body = await json(await h.handler(getReq()));
    expect(body.available).toBe(true);
    expect(body).not.toHaveProperty('reason');
  });

  it('POST: 503 unavailable sem NENHUMA chamada ao Google e sem cair no Drive da plataforma', async () => {
    const h = makeHarness({ connectedAt: EPOCH, needsReconnect: true });
    const res = await h.handler(postReq());

    expect(res.status).toBe(503);
    expect(await json(res)).toEqual({ error: 'Envio temporariamente indisponível', code: 'unavailable' });
    expect(driveCalls(h)).toEqual([]);
    expect(h.mocks.getAccessToken).not.toHaveBeenCalled();
  });

  it('POST: o Google recusa o token no meio do envio (NeedsReconnectError): 503, sem tentar o Drive da plataforma', async () => {
    const h = makeHarness({ connectedAt: EPOCH });
    h.mocks.getAccessToken.mockRejectedValueOnce(new NeedsReconnectError('revogado'));
    const res = await h.handler(postReq());

    expect(res.status).toBe(503);
    expect((await json(res)).code).toBe('unavailable');
    expect(h.mocks.getAccessToken).toHaveBeenCalledTimes(1);
    expect(h.mocks.ensureRootFolder).not.toHaveBeenCalled();
    expect(h.mocks.ensureOwnerRootFolder).not.toHaveBeenCalled();
    expect(h.mocks.initSession).not.toHaveBeenCalled();
  });
});

describe('guest-upload: modo casal', () => {
  it('usa o token do casal, cria a raiz no topo do Drive dele e devolve a sessão de upload', async () => {
    const h = makeHarness({ connectedAt: EPOCH, folderId: 'pastaDoCasal_123456' });
    const res = await h.handler(postReq());

    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ uploadUrl: UPLOAD_URL });
    expect(h.mocks.getAccessToken).toHaveBeenCalledWith({ kind: 'owner', weddingId: WEDDING_ID, epoch: EPOCH });
    expect(h.mocks.ensureOwnerRootFolder).toHaveBeenCalledWith(ACCESS_TOKEN, {
      weddingId: WEDDING_ID,
      name: 'Casarei.online – Ana & Bruno',
      folderId: 'pastaDoCasal_123456',
    });
    expect(h.mocks.ensureRootFolder).not.toHaveBeenCalled();
    expect(h.mocks.initSession).toHaveBeenCalledWith(
      ACCESS_TOKEN,
      expect.objectContaining({ parentId: 'pasta-convidado-1', weddingId: WEDDING_ID }),
    );
  });

  it('raiz apagada pelo casal: recria, grava com compare-and-set e limpa as pastas de convidado', async () => {
    const h = makeHarness({ connectedAt: EPOCH, folderId: 'pasta-apagada' });
    h.mocks.ensureOwnerRootFolder.mockResolvedValueOnce('pasta-nova-do-casal');

    const res = await h.handler(postReq());

    expect(res.status).toBe(200);
    expect(h.mocks.saveRootFolder).toHaveBeenCalledWith(WEDDING_ID, 'pasta-apagada', 'pasta-nova-do-casal');
    expect(h.mocks.clearGuestFolders).toHaveBeenCalledWith(WEDDING_ID);
    expect(h.mocks.trashFolder).not.toHaveBeenCalled();
  });

  it('perde a corrida da raiz: manda a pasta que criou para a lixeira e usa a do vencedor', async () => {
    const h = makeHarness({ connectedAt: EPOCH, folderId: null });
    h.mocks.ensureOwnerRootFolder.mockResolvedValueOnce('minha-pasta');
    h.mocks.saveRootFolder.mockResolvedValueOnce('pasta-do-vencedor');

    const res = await h.handler(postReq());

    expect(res.status).toBe(200);
    expect(h.mocks.trashFolder).toHaveBeenCalledWith(ACCESS_TOKEN, 'minha-pasta');
    expect(h.mocks.resolveGuestFolder).toHaveBeenCalledWith(
      ACCESS_TOKEN,
      expect.anything(),
      expect.objectContaining({ rootFolderId: 'pasta-do-vencedor' }),
    );
  });
});

describe('guest-upload: modo plataforma (sem mudança)', () => {
  it('usa o token da plataforma e a raiz dentro de "Casarei.online"', async () => {
    const h = makeHarness({ folderId: 'root-1' });
    const res = await h.handler(postReq());

    expect(res.status).toBe(200);
    expect(h.mocks.getAccessToken).toHaveBeenCalledWith({ kind: 'platform' });
    expect(h.mocks.ensureRootFolder).toHaveBeenCalledWith(ACCESS_TOKEN, {
      weddingId: WEDDING_ID,
      name: 'Ana & Bruno',
      folderId: 'root-1',
    });
    expect(h.mocks.ensureOwnerRootFolder).not.toHaveBeenCalled();
  });
});
