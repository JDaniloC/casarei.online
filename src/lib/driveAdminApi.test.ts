import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockInvoke } = vi.hoisted(() => ({ mockInvoke: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: mockInvoke } },
}));

import {
  DriveAdminError,
  GENERIC_ERROR_MESSAGE,
  MAX_THUMBNAIL_BATCH,
  enable,
  getStatus,
  getSummary,
  getThumbnails,
  listFiles,
  rotateToken,
  setEnabled,
  type DriveFileSummary,
} from './driveAdminApi';

const TOKEN = 'aBcDeFgHiJkLmNoPqRsTuVwXyZ012345';

const connection = { enabled: true, uploadsEnabled: true, uploadToken: TOKEN };

const file = (overrides: Partial<DriveFileSummary> = {}): DriveFileSummary => ({
  id: 'f1',
  name: 'IMG_0001.jpg',
  guestName: 'Maria',
  mimeType: 'image/jpeg',
  size: 1234,
  createdTime: '2026-09-20T15:30:00.000Z',
  hasThumbnail: true,
  durationMs: null,
  ...overrides,
});

/** Erro como o supabase-js devolve para um não-2xx: `context` é a `Response` crua. */
function httpError(status: number, body: unknown, rawBody?: string) {
  return {
    name: 'FunctionsHttpError',
    message: 'Edge Function returned a non-2xx status code',
    context: new Response(rawBody ?? JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  };
}

const lastBody = () => mockInvoke.mock.calls.at(-1)?.[1]?.body as Record<string, unknown>;

async function rejectionOf(promise: Promise<unknown>): Promise<DriveAdminError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(DriveAdminError);
    return error as DriveAdminError;
  }
  throw new Error('esperava uma rejeição, mas a promessa resolveu');
}

beforeEach(() => {
  mockInvoke.mockReset();
});

// ---------------------------------------------------------------------------
// Corpo enviado por ação
// ---------------------------------------------------------------------------

describe('corpo enviado a cada ação', () => {
  it('getStatus chama google-drive-admin com { action: "status" }', async () => {
    mockInvoke.mockResolvedValue({ data: connection, error: null });

    const result = await getStatus();

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke.mock.calls[0][0]).toBe('google-drive-admin');
    expect(lastBody()).toEqual({ action: 'status' });
    expect(result).toEqual(connection);
  });

  it('getStatus aceita "não ativado" (uploadToken nulo)', async () => {
    mockInvoke.mockResolvedValue({
      data: { enabled: false, uploadsEnabled: false, uploadToken: null },
      error: null,
    });

    await expect(getStatus()).resolves.toEqual({ enabled: false, uploadsEnabled: false, uploadToken: null });
  });

  it('enable envia { action: "enable" }', async () => {
    mockInvoke.mockResolvedValue({ data: connection, error: null });

    await expect(enable()).resolves.toEqual(connection);
    expect(lastBody()).toEqual({ action: 'enable' });
  });

  it('setEnabled envia { action: "set-enabled", enabled } com o booleano recebido', async () => {
    mockInvoke.mockResolvedValue({ data: { ...connection, uploadsEnabled: false }, error: null });

    await expect(setEnabled(false)).resolves.toEqual({ ...connection, uploadsEnabled: false });
    expect(lastBody()).toEqual({ action: 'set-enabled', enabled: false });

    await setEnabled(true);
    expect(lastBody()).toEqual({ action: 'set-enabled', enabled: true });
  });

  it('rotateToken envia { action: "rotate-token" } e devolve o token novo', async () => {
    const novo = { ...connection, uploadToken: 'NOVO0123456789abcdefghijklmnopqr' };
    mockInvoke.mockResolvedValue({ data: novo, error: null });

    await expect(rotateToken()).resolves.toEqual(novo);
    expect(lastBody()).toEqual({ action: 'rotate-token' });
  });

  it('listFiles sem página envia só { action: "list" }', async () => {
    mockInvoke.mockResolvedValue({ data: { files: [file()], nextPageToken: 'proxima' }, error: null });

    const page = await listFiles();

    expect(lastBody()).toEqual({ action: 'list' });
    expect(page).toEqual({ files: [file()], nextPageToken: 'proxima' });
  });

  it('listFiles com pageToken o envia; sem próxima página devolve nextPageToken nulo', async () => {
    mockInvoke.mockResolvedValue({ data: { files: [file({ id: 'f2' })], nextPageToken: null }, error: null });

    const page = await listFiles('proxima');

    expect(lastBody()).toEqual({ action: 'list', pageToken: 'proxima' });
    expect(page.nextPageToken).toBeNull();
    expect(page.files.map((f) => f.id)).toEqual(['f2']);
  });

  it('listFiles descarta entradas sem id e normaliza campos ausentes', async () => {
    mockInvoke.mockResolvedValue({
      data: { files: [{ id: 'x1' }, { name: 'sem id' }, null, 'lixo'], nextPageToken: 42 },
      error: null,
    });

    const page = await listFiles();

    expect(page.nextPageToken).toBeNull();
    expect(page.files).toEqual([
      {
        id: 'x1',
        name: '',
        guestName: '',
        mimeType: '',
        size: 0,
        createdTime: '',
        hasThumbnail: false,
        durationMs: null,
      },
    ]);
  });

  it('getSummary envia { action: "summary" } e devolve os totais', async () => {
    mockInvoke.mockResolvedValue({ data: { count: 12, totalBytes: 3456, guests: 4 }, error: null });

    await expect(getSummary()).resolves.toEqual({ count: 12, totalBytes: 3456, guests: 4 });
    expect(lastBody()).toEqual({ action: 'summary' });
  });

  it('getThumbnails envia { action: "thumbnails", fileIds } e devolve o mapa', async () => {
    mockInvoke.mockResolvedValue({
      data: { thumbnails: { a: 'data:image/jpeg;base64,AAAA', b: null } },
      error: null,
    });

    const thumbs = await getThumbnails(['a', 'b']);

    expect(lastBody()).toEqual({ action: 'thumbnails', fileIds: ['a', 'b'] });
    expect(thumbs.a).toBe('data:image/jpeg;base64,AAAA');
    expect(thumbs.b).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Miniaturas: lotes e saneamento
// ---------------------------------------------------------------------------

describe('getThumbnails', () => {
  it('sem ids não chama o servidor', async () => {
    await expect(getThumbnails([])).resolves.toEqual({});
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('recusa mais de 24 ids sem chamar o servidor (o limite do backend é 24)', async () => {
    const ids = Array.from({ length: MAX_THUMBNAIL_BATCH + 1 }, (_, i) => `id${i}`);

    await expect(getThumbnails(ids)).rejects.toThrow();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('aceita exatamente 24 ids', async () => {
    const ids = Array.from({ length: MAX_THUMBNAIL_BATCH }, (_, i) => `id${i}`);
    mockInvoke.mockResolvedValue({ data: { thumbnails: {} }, error: null });

    await getThumbnails(ids);

    expect(lastBody().fileIds).toEqual(ids);
  });

  it('só devolve data URL de imagem: qualquer outro valor (inclusive links) vira null; id ausente também', async () => {
    mockInvoke.mockResolvedValue({
      data: {
        thumbnails: {
          ok: 'data:image/png;base64,AAAA',
          link: 'https://lh3.googleusercontent.com/abc=s400',
          html: 'data:text/html;base64,PHNjcmlwdD4=',
          numero: 7,
          nulo: null,
          intruso: 'data:image/png;base64,ZZZZ',
        },
      },
      error: null,
    });

    const thumbs = await getThumbnails(['ok', 'link', 'html', 'numero', 'nulo', 'ausente']);

    expect(thumbs.ok).toBe('data:image/png;base64,AAAA');
    expect(thumbs.link).toBeNull();
    expect(thumbs.html).toBeNull();
    expect(thumbs.numero).toBeNull();
    expect(thumbs.nulo).toBeNull();
    expect(thumbs.ausente).toBeNull();
    // Só as chaves pedidas voltam.
    expect(Object.keys(thumbs).sort()).toEqual(['ausente', 'html', 'link', 'nulo', 'numero', 'ok']);
  });

  it('trata "__proto__" e "constructor" como ids comuns (mapa sem protótipo)', async () => {
    mockInvoke.mockResolvedValue({ data: { thumbnails: {} }, error: null });

    const thumbs = await getThumbnails(['__proto__', 'constructor']);

    expect(Object.keys(thumbs).sort()).toEqual(['__proto__', 'constructor']);
    expect(Object.prototype.hasOwnProperty.call(thumbs, '__proto__')).toBe(true);
    expect(thumbs['__proto__']).toBeNull();
    expect(thumbs['constructor']).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// O cliente nunca manda o id do casamento
// ---------------------------------------------------------------------------

describe('isolamento: o cliente não envia weddingId', () => {
  it('nenhum corpo carrega chave relacionada a casamento ou usuário', async () => {
    mockInvoke.mockImplementation(async (_name: string, opts: { body: { action: string } }) => {
      switch (opts.body.action) {
        case 'list':
          return { data: { files: [], nextPageToken: null }, error: null };
        case 'summary':
          return { data: { count: 0, totalBytes: 0, guests: 0 }, error: null };
        case 'thumbnails':
          return { data: { thumbnails: {} }, error: null };
        default:
          return { data: connection, error: null };
      }
    });

    await getStatus();
    await enable();
    await setEnabled(true);
    await rotateToken();
    await listFiles();
    await listFiles('p');
    await getSummary();
    await getThumbnails(['a']);

    expect(mockInvoke).toHaveBeenCalledTimes(8);
    const allowed = new Set(['action', 'enabled', 'pageToken', 'fileIds']);
    for (const call of mockInvoke.mock.calls) {
      expect(call[0]).toBe('google-drive-admin');
      const keys = Object.keys(call[1].body);
      expect(keys.filter((key) => !allowed.has(key))).toEqual([]);
      expect(keys.some((key) => /wedding|user/i.test(key))).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Erros
// ---------------------------------------------------------------------------

describe('erros do servidor', () => {
  it('extrai a mensagem pt-BR de context.json() de um FunctionsHttpError', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: httpError(404, { error: 'O envio de fotos e vídeos ainda não foi ativado', code: 'not_enabled' }),
    });

    const error = await rejectionOf(listFiles());

    expect(error.message).toBe('O envio de fotos e vídeos ainda não foi ativado');
    expect(error.code).toBe('not_enabled');
    expect(error.status).toBe(404);
    expect(error.name).toBe('DriveAdminError');
  });

  it('vale para todas as ações (503 unavailable)', async () => {
    mockInvoke.mockImplementation(async () => ({
      data: null,
      error: httpError(503, { error: 'Serviço temporariamente indisponível', code: 'unavailable' }),
    }));

    for (const call of [
      () => getStatus(),
      () => enable(),
      () => setEnabled(true),
      () => rotateToken(),
      () => listFiles(),
      () => getSummary(),
      () => getThumbnails(['a']),
    ]) {
      const error = await rejectionOf(call());
      expect(error.message).toBe('Serviço temporariamente indisponível');
      expect(error.code).toBe('unavailable');
    }
  });

  it('corpo sem JSON legível cai na mensagem genérica', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: httpError(502, null, '<html>Bad gateway</html>'),
    });

    const error = await rejectionOf(getStatus());

    expect(error.message).toBe(GENERIC_ERROR_MESSAGE);
    expect(error.code).toBeNull();
    expect(error.status).toBe(502);
  });

  it('corpo do gateway sem campo "error" (ex.: { message: "Invalid JWT" }) não vaza texto em inglês', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: httpError(401, { code: 401, message: 'Invalid JWT' }),
    });

    const error = await rejectionOf(getStatus());

    expect(error.message).toBe(GENERIC_ERROR_MESSAGE);
    expect(error.message).not.toMatch(/JWT/);
  });

  it('"error" vazio ou que não seja texto cai na mensagem genérica', async () => {
    mockInvoke.mockResolvedValueOnce({ data: null, error: httpError(500, { error: '   ' }) });
    expect((await rejectionOf(getStatus())).message).toBe(GENERIC_ERROR_MESSAGE);

    mockInvoke.mockResolvedValueOnce({ data: null, error: httpError(500, { error: { detalhe: 'x' } }) });
    expect((await rejectionOf(getStatus())).message).toBe(GENERIC_ERROR_MESSAGE);
  });

  it('erro de rede (FunctionsFetchError, sem Response) usa a mensagem genérica', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: { name: 'FunctionsFetchError', message: 'Failed to send a request to the Edge Function', context: new TypeError('Failed to fetch') },
    });

    const error = await rejectionOf(enable());

    expect(error.message).toBe(GENERIC_ERROR_MESSAGE);
    expect(error.status).toBeNull();
  });

  it('erro sem context algum também usa a mensagem genérica', async () => {
    mockInvoke.mockResolvedValue({ data: null, error: new Error('boom') });

    expect((await rejectionOf(getSummary())).message).toBe(GENERIC_ERROR_MESSAGE);
  });

  it('quando o próprio invoke lança, vira DriveAdminError genérico', async () => {
    mockInvoke.mockRejectedValue(new Error('socket hang up'));

    const error = await rejectionOf(rotateToken());

    expect(error.message).toBe(GENERIC_ERROR_MESSAGE);
    expect(error.message).not.toMatch(/socket/);
  });

  it('a mensagem genérica está em pt-BR e sugere tentar de novo', () => {
    expect(GENERIC_ERROR_MESSAGE).toMatch(/tente novamente/i);
  });
});

describe('resposta 2xx com formato inesperado', () => {
  it('status sem corpo ou com tipos errados vira erro genérico', async () => {
    mockInvoke.mockResolvedValueOnce({ data: null, error: null });
    expect((await rejectionOf(getStatus())).message).toBe(GENERIC_ERROR_MESSAGE);

    mockInvoke.mockResolvedValueOnce({ data: { enabled: 'sim' }, error: null });
    expect((await rejectionOf(getStatus())).message).toBe(GENERIC_ERROR_MESSAGE);

    // Ativado, mas sem token: o painel não teria o que mostrar no QR code.
    mockInvoke.mockResolvedValueOnce({
      data: { enabled: true, uploadsEnabled: true, uploadToken: null },
      error: null,
    });
    expect((await rejectionOf(enable())).message).toBe(GENERIC_ERROR_MESSAGE);
  });

  it('list sem "files" e summary sem números viram erro genérico', async () => {
    mockInvoke.mockResolvedValueOnce({ data: { nextPageToken: null }, error: null });
    expect((await rejectionOf(listFiles())).message).toBe(GENERIC_ERROR_MESSAGE);

    mockInvoke.mockResolvedValueOnce({ data: { count: 'muitos' }, error: null });
    expect((await rejectionOf(getSummary())).message).toBe(GENERIC_ERROR_MESSAGE);
  });

  it('thumbnails sem o objeto "thumbnails" vira erro genérico', async () => {
    mockInvoke.mockResolvedValueOnce({ data: {}, error: null });
    expect((await rejectionOf(getThumbnails(['a']))).message).toBe(GENERIC_ERROR_MESSAGE);
  });
});
