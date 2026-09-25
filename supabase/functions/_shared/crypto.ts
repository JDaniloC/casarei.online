// AES-GCM em hexadecimal, no MESMO formato de save-mp-credentials e create-payment
// (`encrypted` = hex(texto cifrado || tag de 16 bytes), `iv` = hex de 12 bytes). Guarda o
// refresh token do Google de cada casal. Módulo puro: só a Web Crypto (`crypto.subtle`),
// que existe no Deno e no Node. A chave (secret `ENCRYPTION_KEY`) entra como parâmetro.

const HEX_PATTERN = /^(?:[0-9a-fA-F]{2})*$/;
const IV_BYTES = 12;

export function hexToBytes(hex: string): Uint8Array {
  if (!HEX_PATTERN.test(hex)) throw new Error("Valor hexadecimal inválido");
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function importKey(keyHex: string, usage: "encrypt" | "decrypt"): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", hexToBytes(keyHex), { name: "AES-GCM" }, false, [usage]);
}

export async function encryptValue(
  plainText: string,
  keyHex: string,
): Promise<{ encrypted: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await importKey(keyHex, "encrypt"),
    new TextEncoder().encode(plainText),
  );
  return { encrypted: bytesToHex(new Uint8Array(cipherBuffer)), iv: bytesToHex(iv) };
}

export async function decryptValue(encryptedHex: string, ivHex: string, keyHex: string): Promise<string> {
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: hexToBytes(ivHex) },
    await importKey(keyHex, "decrypt"),
    hexToBytes(encryptedHex),
  );
  return new TextDecoder().decode(plain);
}
