import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { encryptValue } from '../../supabase/functions/_shared/crypto';
import {
  MAX_CACHED_TOKENS,
  accessCacheKey,
  createAccessTokenProvider,
  type AccessTokenProviderDeps,
  type OwnerCredentials,
} from '../../supabase/functions/_shared/drive-access';
import { NeedsReconnectError, type FetchFn } from '../../supabase/functions/_shared/google-drive';

const KEY = '11'.repeat(32);
const T0 = 1_000_000;
const EXPIRES_AT_OFFSET = 3600 * 1000 - 60_000; // 3600 s de vida menos a margem de 60 s

let now: number;

beforeAll(() => {
  if (!globalThis.crypto?.subtle) vi.stubGlobal('crypto', webcrypto);
});

beforeEach(() => {
  now = T0;
});

const owner = (weddingId: string, epoch = 'e1') => ({ kind: 'owner' as const, weddingId, epoch });
const platform = { kind: 'platform' as const };

async function seal(refreshToken: string): Promise<OwnerCredentials> {
  const { encrypted, iv } = await encryptValue(refreshToken, KEY);
  return { encrypted, iv };
}

function makeProvider(overrides: Partial<AccessTokenProviderDeps> = {}) {
  const fetchCalls: URLSearchParams[] = [];
  const fetchFn: FetchFn = async (_input, init) => {
    const body = new URLSearchParams(String(init?.body));
    fetchCalls.push(body);
    const refresh = body.get('refresh_token') ?? '';
    if (refresh === '1//revogado') {
      return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 });
    }
    return new Response(JSON.stringify({ access_token: `at(${refresh})#${fetchCalls.length}`, expires_in: 3600 }), {
      status: 200,
    });
  };
  const credentials = new Map<string, OwnerCredentials>();
  const deps: AccessTokenProviderDeps = {
    fetchFn,
    now: () => now,
    platformConfig: () => ({ clientId: 'cid', clientSecret: 'csecret', refreshToken: '1//plataforma' }),
    clientConfig: () => ({ clientId: 'cid', clientSecret: 'csecret' }),
    encryptionKey: () => KEY,
    loadOwnerCredentials: vi.fn(async (weddingId: string) => credentials.get(weddingId) ?? null),
    markNeedsReconnect: vi.fn(async () => {}),
    ...overrides,
  };
  return { provider: createAccessTokenProvider(deps), deps, fetchCalls, credentials };
}

describe('drive-access: chave do cache', () => {
  it('plataforma e casal têm chaves distintas, e a época faz parte da chave do casal', () => {
    expect(accessCacheKey(platform)).toBe('platform');
    expect(accessCacheKey(owner('w1', 'e1'))).toBe('owner:w1:e1');
    expect(accessCacheKey(owner('w1', 'e2'))).not.toBe(accessCacheKey(owner('w1', 'e1')));
  });
});

describe('drive-access: modo plataforma', () => {
  it('troca o refresh token dos secrets, guarda em cache e renova só depois da margem', async () => {
    const { provider, fetchCalls } = makeProvider();

    const first = await provider.getAccessToken(platform);
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].get('refresh_token')).toBe('1//plataforma');

    now = T0 + EXPIRES_AT_OFFSET - 1;
    await expect(provider.getAccessToken(platform)).resolves.toBe(first);
    expect(fetchCalls).toHaveLength(1);

    now = T0 + EXPIRES_AT_OFFSET;
    const renewed = await provider.getAccessToken(platform);
    expect(fetchCalls).toHaveLength(2);
    expect(renewed).not.toBe(first);
  });

  it('chamadas simultâneas com o cache vazio compartilham uma única troca', async () => {
    const { provider, fetchCalls } = makeProvider();
    const tokens = await Promise.all([provider.getAccessToken(platform), provider.getAccessToken(platform), provider.getAccessToken(platform)]);
    expect(fetchCalls).toHaveLength(1);
    expect(new Set(tokens).size).toBe(1);
  });

  it('invalid_grant da plataforma lança NeedsReconnectError e NUNCA marca um casamento', async () => {
    const { provider, deps } = makeProvider({
      platformConfig: () => ({ clientId: 'cid', clientSecret: 'csecret', refreshToken: '1//revogado' }),
    });
    await expect(provider.getAccessToken(platform)).rejects.toBeInstanceOf(NeedsReconnectError);
    expect(deps.markNeedsReconnect).not.toHaveBeenCalled();
  });
});

describe('drive-access: invalidate (o Drive respondeu 401)', () => {
  it('depois de invalidar, o próximo getAccessToken da plataforma renova em vez de servir o cache', async () => {
    const { provider, fetchCalls } = makeProvider();
    const first = await provider.getAccessToken(platform);
    await provider.getAccessToken(platform);
    expect(fetchCalls).toHaveLength(1);

    provider.invalidate(platform);

    const renewed = await provider.getAccessToken(platform);
    expect(fetchCalls).toHaveLength(2);
    expect(renewed).not.toBe(first);
  });

  it('depois de invalidar, o próximo getAccessToken do casal renova e vê o invalid_grant do Google', async () => {
    const { provider, deps, fetchCalls, credentials } = makeProvider();
    credentials.set('w1', await seal('1//casal-1'));
    await provider.getAccessToken(owner('w1', 'e1'));

    // O casal revogou o app no Google: o cache ainda serve o token, até o Drive dizer 401.
    credentials.set('w1', await seal('1//revogado'));
    await expect(provider.getAccessToken(owner('w1', 'e1'))).resolves.toContain('1//casal-1');
    expect(fetchCalls).toHaveLength(1);

    provider.invalidate(owner('w1', 'e1'));

    await expect(provider.getAccessToken(owner('w1', 'e1'))).rejects.toBeInstanceOf(NeedsReconnectError);
    expect(fetchCalls).toHaveLength(2);
    expect(deps.markNeedsReconnect).toHaveBeenCalledWith('w1', 'e1');
  });

  it('invalidar um casamento não afeta outro casamento, outra época nem a plataforma', async () => {
    const { provider, fetchCalls, credentials } = makeProvider();
    credentials.set('w1', await seal('1//casal-1'));
    credentials.set('w2', await seal('1//casal-2'));
    await provider.getAccessToken(owner('w1', 'e1'));
    await provider.getAccessToken(owner('w1', 'e2'));
    await provider.getAccessToken(owner('w2', 'e1'));
    await provider.getAccessToken(platform);
    expect(fetchCalls).toHaveLength(4);

    provider.invalidate(owner('w1', 'e1'));

    await provider.getAccessToken(owner('w1', 'e2'));
    await provider.getAccessToken(owner('w2', 'e1'));
    await provider.getAccessToken(platform);
    expect(fetchCalls).toHaveLength(4);

    await provider.getAccessToken(owner('w1', 'e1'));
    expect(fetchCalls).toHaveLength(5);
  });

  it('invalidar a plataforma não afeta os casais', async () => {
    const { provider, fetchCalls, credentials } = makeProvider();
    credentials.set('w1', await seal('1//casal-1'));
    await provider.getAccessToken(owner('w1'));
    await provider.getAccessToken(platform);

    provider.invalidate(platform);

    await provider.getAccessToken(owner('w1'));
    expect(fetchCalls).toHaveLength(2);
  });

  it('invalidar uma referência desconhecida não faz nada (nem lança)', async () => {
    const { provider, fetchCalls } = makeProvider();
    const cached = await provider.getAccessToken(platform);

    expect(() => provider.invalidate(owner('nunca-visto', 'e9'))).not.toThrow();

    await expect(provider.getAccessToken(platform)).resolves.toBe(cached);
    expect(fetchCalls).toHaveLength(1);
  });
});

describe('drive-access: modo casal', () => {
  it('decifra o refresh token do casal e o troca com o client do app', async () => {
    const { provider, deps, fetchCalls, credentials } = makeProvider();
    credentials.set('w1', await seal('1//casal-1'));

    const token = await provider.getAccessToken(owner('w1'));

    expect(token).toContain('1//casal-1');
    expect(fetchCalls[0].get('client_id')).toBe('cid');
    expect(fetchCalls[0].get('refresh_token')).toBe('1//casal-1');
    expect(deps.loadOwnerCredentials).toHaveBeenCalledWith('w1');
  });

  it('cada casamento tem o seu cache e o seu token', async () => {
    const { provider, fetchCalls, credentials } = makeProvider();
    credentials.set('w1', await seal('1//casal-1'));
    credentials.set('w2', await seal('1//casal-2'));

    const a = await provider.getAccessToken(owner('w1'));
    const b = await provider.getAccessToken(owner('w2'));
    await provider.getAccessToken(owner('w1'));

    expect(a).toContain('1//casal-1');
    expect(b).toContain('1//casal-2');
    expect(fetchCalls).toHaveLength(2);
  });

  it('nova época (reconexão com outra conta) não reaproveita o token da época antiga', async () => {
    const { provider, fetchCalls, credentials } = makeProvider();
    credentials.set('w1', await seal('1//conta-velha'));
    const old = await provider.getAccessToken(owner('w1', 'e1'));

    credentials.set('w1', await seal('1//conta-nova'));
    const fresh = await provider.getAccessToken(owner('w1', 'e2'));

    expect(old).toContain('1//conta-velha');
    expect(fresh).toContain('1//conta-nova');
    expect(fetchCalls).toHaveLength(2);
  });

  it('invalid_grant: lança NeedsReconnectError, marca a época que falhou e não guarda a falha', async () => {
    const { provider, deps, fetchCalls, credentials } = makeProvider();
    credentials.set('w1', await seal('1//revogado'));

    await expect(provider.getAccessToken(owner('w1', 'e7'))).rejects.toBeInstanceOf(NeedsReconnectError);
    expect(deps.markNeedsReconnect).toHaveBeenCalledWith('w1', 'e7');

    await expect(provider.getAccessToken(owner('w1', 'e7'))).rejects.toBeInstanceOf(NeedsReconnectError);
    expect(fetchCalls).toHaveLength(2);
  });

  it('se marcar a reconexão falhar, o erro original continua sendo NeedsReconnectError', async () => {
    const { provider, credentials } = makeProvider({
      markNeedsReconnect: vi.fn(async () => {
        throw new Error('banco fora do ar');
      }),
    });
    credentials.set('w1', await seal('1//revogado'));
    await expect(provider.getAccessToken(owner('w1'))).rejects.toBeInstanceOf(NeedsReconnectError);
  });

  it('falha de rede não marca reconexão e o erro sobe como veio', async () => {
    const { provider, deps, credentials } = makeProvider({
      fetchFn: async () => {
        throw new TypeError('fetch failed');
      },
    });
    credentials.set('w1', await seal('1//casal-1'));
    await expect(provider.getAccessToken(owner('w1'))).rejects.toThrow('fetch failed');
    expect(deps.markNeedsReconnect).not.toHaveBeenCalled();
  });

  it('sem credenciais (o casal desconectou no meio): NeedsReconnectError, sem marcar nada', async () => {
    const { provider, deps } = makeProvider();
    await expect(provider.getAccessToken(owner('w1'))).rejects.toBeInstanceOf(NeedsReconnectError);
    expect(deps.markNeedsReconnect).not.toHaveBeenCalled();
  });

  it('o cache tem teto: passado dele, as entradas mais antigas são descartadas', async () => {
    const { provider, fetchCalls, credentials } = makeProvider();
    for (let i = 0; i <= MAX_CACHED_TOKENS; i += 1) credentials.set(`w${i}`, await seal(`1//casal-${i}`));

    for (let i = 0; i <= MAX_CACHED_TOKENS; i += 1) await provider.getAccessToken(owner(`w${i}`));
    expect(fetchCalls).toHaveLength(MAX_CACHED_TOKENS + 1);

    await provider.getAccessToken(owner('w0')); // a mais antiga já saiu do cache
    expect(fetchCalls).toHaveLength(MAX_CACHED_TOKENS + 2);
    await provider.getAccessToken(owner(`w${MAX_CACHED_TOKENS}`)); // a mais nova continua
    expect(fetchCalls).toHaveLength(MAX_CACHED_TOKENS + 2);
  });
});
