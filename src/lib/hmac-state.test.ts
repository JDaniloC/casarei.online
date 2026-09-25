import { beforeAll, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import {
  STATE_TTL_MS,
  signState,
  verifyState,
  type OAuthState,
} from '../../supabase/functions/_shared/hmac-state';

const SECRET = 'ab'.repeat(32);
const OTHER_SECRET = 'cd'.repeat(32);
const NOW = Date.parse('2026-09-25T12:00:00.000Z');

const payload = (overrides: Partial<OAuthState> = {}): OAuthState => ({
  w: '11111111-1111-4111-8111-111111111111',
  u: 'aaaaaaaa-0000-4000-8000-00000000000a',
  exp: NOW + STATE_TTL_MS,
  n: '0123456789abcdef0123456789abcdef',
  ...overrides,
});

beforeAll(() => {
  if (!globalThis.crypto?.subtle) vi.stubGlobal('crypto', webcrypto);
});

describe('hmac-state', () => {
  it('a validade é de 10 minutos', () => {
    expect(STATE_TTL_MS).toBe(600_000);
  });

  it('um state assinado é aceito e devolve o mesmo conteúdo', async () => {
    const state = await signState(payload(), SECRET);
    await expect(verifyState(state, SECRET, NOW)).resolves.toEqual(payload());
  });

  it('usa só caracteres de URL (base64url) separados por um ponto', async () => {
    const state = await signState(payload(), SECRET);
    expect(state).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });

  it('secret errado: recusado', async () => {
    const state = await signState(payload(), SECRET);
    await expect(verifyState(state, OTHER_SECRET, NOW)).resolves.toBeNull();
  });

  it('conteúdo adulterado (troca de casamento): recusado', async () => {
    const forged = await signState(payload({ w: '22222222-2222-4222-8222-222222222222' }), SECRET);
    const original = await signState(payload(), SECRET);
    // Junta o conteúdo do state forjado com a assinatura do original.
    const mixed = `${forged.split('.')[0]}.${original.split('.')[1]}`;
    await expect(verifyState(mixed, SECRET, NOW)).resolves.toBeNull();
  });

  it('assinatura adulterada: recusada', async () => {
    const state = await signState(payload(), SECRET);
    const [data, signature] = state.split('.');
    const flipped = (signature.startsWith('A') ? 'B' : 'A') + signature.slice(1);
    await expect(verifyState(`${data}.${flipped}`, SECRET, NOW)).resolves.toBeNull();
  });

  it('expirado (exp <= agora): recusado; um ms antes: aceito', async () => {
    const state = await signState(payload({ exp: NOW }), SECRET);
    await expect(verifyState(state, SECRET, NOW)).resolves.toBeNull();
    await expect(verifyState(state, SECRET, NOW - 1)).resolves.not.toBeNull();
  });

  it.each([
    ['vazio', ''],
    ['sem ponto', 'abc'],
    ['partes demais', 'a.b.c'],
    ['base64 inválido', '@@@.@@@'],
    ['grande demais', 'a'.repeat(3000)],
  ])('formato inválido (%s): recusado', async (_label, value) => {
    await expect(verifyState(value, SECRET, NOW)).resolves.toBeNull();
  });

  it('dois states do mesmo casamento com nonces diferentes são diferentes', async () => {
    const a = await signState(payload({ n: '00'.repeat(16) }), SECRET);
    const b = await signState(payload({ n: '11'.repeat(16) }), SECRET);
    expect(a).not.toBe(b);
  });

  it('conteúdo assinado com formato errado (campos que não são texto): recusado', async () => {
    const bad = await signState({ w: 1, u: 'x', exp: NOW + 1, n: 'n' } as unknown as OAuthState, SECRET);
    await expect(verifyState(bad, SECRET, NOW)).resolves.toBeNull();
  });
});
