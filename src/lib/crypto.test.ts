import { beforeAll, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { bytesToHex, decryptValue, encryptValue, hexToBytes } from '../../supabase/functions/_shared/crypto';

// Vetor gerado com o `crypto` do Node (AES-256-GCM; texto cifrado + tag de 16 bytes, tudo em hex):
// é o mesmo formato que save-mp-credentials e create-payment gravam no banco.
const KEY = '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';
const VECTOR = {
  iv: 'a0a1a2a3a4a5a6a7a8a9aaab',
  plain: '1//0gRefreshTokenDeTeste-123_abc',
  encrypted: 'd737531d229967d91000f4bb5315abbb1ee83c44f7c43609b13f14b520ca176240d2ee91c0c9fbde7474cf2a420bf3f4',
};
const OTHER_KEY = 'ff'.repeat(32);

beforeAll(() => {
  // O ambiente jsdom pode não expor a Web Crypto completa; o Deno e o Node de verdade expõem.
  if (!globalThis.crypto?.subtle) vi.stubGlobal('crypto', webcrypto);
});

describe('crypto: hex', () => {
  it('converte bytes em hex e de volta', () => {
    expect(bytesToHex(hexToBytes('00ff10ab'))).toBe('00ff10ab');
    expect(Array.from(hexToBytes('00ff10ab'))).toEqual([0x00, 0xff, 0x10, 0xab]);
  });

  it.each(['abc', 'zz', '0g', ' 00'])('recusa hex inválido (%s)', (value) => {
    expect(() => hexToBytes(value)).toThrow();
  });
});

describe('crypto: AES-GCM', () => {
  it('decifra o vetor gerado pelo Node (compatível com o formato do Mercado Pago)', async () => {
    await expect(decryptValue(VECTOR.encrypted, VECTOR.iv, KEY)).resolves.toBe(VECTOR.plain);
  });

  it('cifra e decifra (ida e volta), inclusive com acentos', async () => {
    const plain = '1//refresh-ção-ñ-✓';
    const { encrypted, iv } = await encryptValue(plain, KEY);
    await expect(decryptValue(encrypted, iv, KEY)).resolves.toBe(plain);
  });

  it('usa IV de 12 bytes (24 hex) e um IV diferente a cada cifra', async () => {
    const a = await encryptValue('mesmo texto', KEY);
    const b = await encryptValue('mesmo texto', KEY);
    expect(a.iv).toMatch(/^[0-9a-f]{24}$/);
    expect(a.iv).not.toBe(b.iv);
    expect(a.encrypted).not.toBe(b.encrypted);
  });

  it('chave errada lança', async () => {
    await expect(decryptValue(VECTOR.encrypted, VECTOR.iv, OTHER_KEY)).rejects.toThrow();
  });

  it('texto cifrado adulterado lança (a tag do GCM não confere)', async () => {
    const tampered = (VECTOR.encrypted.startsWith('d7') ? 'd8' : 'd7') + VECTOR.encrypted.slice(2);
    await expect(decryptValue(tampered, VECTOR.iv, KEY)).rejects.toThrow();
  });

  it('IV ou chave em hex inválido lançam', async () => {
    await expect(decryptValue(VECTOR.encrypted, 'zz', KEY)).rejects.toThrow();
    await expect(encryptValue('x', 'não-é-hex')).rejects.toThrow();
  });
});
