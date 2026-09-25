import { describe, expect, it } from 'vitest';
import {
  DRIVE_FILE_SCOPE,
  DriveApiError,
  InvalidCodeError,
  buildAuthUrl,
  exchangeCode,
  revokeToken,
  type FetchFn,
} from '../../supabase/functions/_shared/google-drive';

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: URLSearchParams;
}

function createFakeFetch(make: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const responses: Response[] = [];
  const fetchFn: FetchFn = async (input, init) => {
    const call: Call = {
      url: input,
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: new URLSearchParams(typeof init?.body === 'string' ? init.body : ''),
    };
    calls.push(call);
    const res = await make(call);
    responses.push(res);
    return res;
  };
  return { fetchFn, calls, responses };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const idToken = (payload: unknown) =>
  `cabecalho.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.assinatura`;

const CFG = { clientId: 'cid.apps.googleusercontent.com', clientSecret: 'csecret', redirectUri: 'https://casarei.online/dashboard/google-drive/callback' };

const okBody = (overrides: Record<string, unknown> = {}) => ({
  access_token: 'ya29.acesso',
  refresh_token: '1//refresh',
  expires_in: 3599,
  scope: `openid https://www.googleapis.com/auth/userinfo.email ${DRIVE_FILE_SCOPE}`,
  id_token: idToken({ email: 'ana@example.com', email_verified: true }),
  ...overrides,
});

describe('buildAuthUrl', () => {
  it('monta a URL do Google com escopos, modo offline, consentimento e o state', () => {
    const url = new URL(buildAuthUrl({ clientId: CFG.clientId, redirectUri: CFG.redirectUri, state: 'st.ate' }));
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    const p = url.searchParams;
    expect(p.get('client_id')).toBe(CFG.clientId);
    expect(p.get('redirect_uri')).toBe(CFG.redirectUri);
    expect(p.get('response_type')).toBe('code');
    expect(p.get('scope')).toBe('openid email https://www.googleapis.com/auth/drive.file');
    expect(p.get('access_type')).toBe('offline');
    expect(p.get('prompt')).toBe('consent select_account');
    expect(p.get('include_granted_scopes')).toBe('false');
    expect(p.get('state')).toBe('st.ate');
  });
});

describe('exchangeCode', () => {
  it('troca o código no endpoint de token e devolve tokens, escopos e e-mail', async () => {
    const { fetchFn, calls, responses } = createFakeFetch(() => json(200, okBody()));

    const result = await exchangeCode(fetchFn, CFG, 'codigo-secreto');

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://oauth2.googleapis.com/token');
    expect(calls[0].method).toBe('POST');
    expect(calls[0].body.get('grant_type')).toBe('authorization_code');
    expect(calls[0].body.get('code')).toBe('codigo-secreto');
    expect(calls[0].body.get('client_id')).toBe(CFG.clientId);
    expect(calls[0].body.get('client_secret')).toBe(CFG.clientSecret);
    expect(calls[0].body.get('redirect_uri')).toBe(CFG.redirectUri);
    expect(result).toEqual({
      refreshToken: '1//refresh',
      accessToken: 'ya29.acesso',
      expiresIn: 3599,
      scopes: ['openid', 'https://www.googleapis.com/auth/userinfo.email', DRIVE_FILE_SCOPE],
      email: 'ana@example.com',
    });
    expect(responses.every((r) => r.bodyUsed)).toBe(true);
  });

  it('devolve os escopos como vieram, mesmo sem o do Drive (quem chama decide)', async () => {
    const { fetchFn } = createFakeFetch(() => json(200, okBody({ scope: 'openid email' })));
    const result = await exchangeCode(fetchFn, CFG, 'c');
    expect(result.scopes).toEqual(['openid', 'email']);
  });

  it.each([
    ['sem id_token', { id_token: undefined }],
    ['id_token que não é um JWT', { id_token: 'lixo' }],
    ['payload que não é JSON', { id_token: 'a.%%%.c' }],
    ['e-mail não verificado', { id_token: idToken({ email: 'x@example.com', email_verified: false }) }],
    ['e-mail que não é texto', { id_token: idToken({ email: 42 }) }],
  ])('e-mail nulo quando o id_token não ajuda (%s)', async (_label, overrides) => {
    const { fetchFn } = createFakeFetch(() => json(200, okBody(overrides)));
    const result = await exchangeCode(fetchFn, CFG, 'c');
    expect(result.email).toBeNull();
  });

  it('invalid_grant (código usado, expirado ou inválido): InvalidCodeError', async () => {
    const { fetchFn } = createFakeFetch(() => json(400, { error: 'invalid_grant', error_description: 'Bad Request' }));
    await expect(exchangeCode(fetchFn, CFG, 'c')).rejects.toBeInstanceOf(InvalidCodeError);
  });

  it('sem refresh_token na resposta: InvalidCodeError (não dá para guardar a conexão)', async () => {
    const { fetchFn } = createFakeFetch(() => json(200, okBody({ refresh_token: undefined })));
    await expect(exchangeCode(fetchFn, CFG, 'c')).rejects.toBeInstanceOf(InvalidCodeError);
  });

  it('sem access_token: DriveApiError retentável', async () => {
    const { fetchFn } = createFakeFetch(() => json(200, okBody({ access_token: undefined })));
    const error = await exchangeCode(fetchFn, CFG, 'c').catch((e) => e);
    expect(error).toBeInstanceOf(DriveApiError);
    expect(error.retryable).toBe(true);
  });

  it('erro 5xx do Google: DriveApiError retentável, sem InvalidCodeError', async () => {
    const { fetchFn } = createFakeFetch(() => json(503, { error: 'backend_error' }));
    const error = await exchangeCode(fetchFn, CFG, 'c').catch((e) => e);
    expect(error).toBeInstanceOf(DriveApiError);
    expect(error).not.toBeInstanceOf(InvalidCodeError);
    expect(error.status).toBe(503);
    expect(error.retryable).toBe(true);
  });

  it('a mensagem dos erros nunca contém o código nem os tokens', async () => {
    const { fetchFn } = createFakeFetch(() => json(400, { error: 'invalid_grant' }));
    const error = await exchangeCode(fetchFn, CFG, 'codigo-secreto').catch((e) => e);
    expect(String(error.message)).not.toContain('codigo-secreto');
  });
});

describe('revokeToken', () => {
  it('faz POST em /revoke com o token no corpo e consome a resposta', async () => {
    const { fetchFn, calls, responses } = createFakeFetch(() => json(200, {}));

    await revokeToken(fetchFn, '1//refresh');

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://oauth2.googleapis.com/revoke');
    expect(calls[0].method).toBe('POST');
    expect(calls[0].body.get('token')).toBe('1//refresh');
    expect(responses.every((r) => r.bodyUsed || r.body === null)).toBe(true);
  });

  it('nunca lança: nem com erro HTTP nem com falha de rede', async () => {
    const http = createFakeFetch(() => json(400, { error: 'invalid_token' }));
    await expect(revokeToken(http.fetchFn, 'x')).resolves.toBeUndefined();

    const network: FetchFn = async () => {
      throw new TypeError('fetch failed');
    };
    await expect(revokeToken(network, 'x')).resolves.toBeUndefined();
  });
});
