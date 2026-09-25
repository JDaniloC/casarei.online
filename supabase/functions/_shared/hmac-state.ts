// `state` do OAuth do Google: um pequeno JSON assinado com HMAC-SHA256. Amarra o retorno
// do Google ao usuário e ao casamento que começaram a conexão (o `connect` confere os dois
// contra o JWT do casal) e vence em 10 minutos. Módulo puro: só a Web Crypto e o `btoa`/`atob`
// do Deno e do Node; o secret (`GOOGLE_OAUTH_STATE_SECRET`, 64 hex) entra como parâmetro.

import { hexToBytes } from "./crypto.ts";

export interface OAuthState {
  /** Casamento. */
  w: string;
  /** Usuário do casal. */
  u: string;
  /** Validade, em milissegundos desde a época. */
  exp: number;
  /** Nonce (hex). Só garante que dois states nunca são iguais. */
  n: string;
}

/** Validade do state: o casal tem 10 minutos para concluir a tela do Google. */
export const STATE_TTL_MS = 10 * 60_000;

const MAX_STATE_CHARS = 2048;

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) return null;
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  try {
    return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

async function hmacKey(secretHex: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", hexToBytes(secretHex), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

/** `base64url(json).base64url(hmac)`. */
export async function signState(payload: OAuthState, secretHex: string): Promise<string> {
  const data = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secretHex, "sign"), new TextEncoder().encode(data));
  return `${data}.${toBase64Url(new Uint8Array(signature))}`;
}

/**
 * Devolve o conteúdo se o formato, a assinatura e a validade conferem; senão `null`.
 * A comparação da assinatura é feita por `crypto.subtle.verify` (tempo constante).
 */
export async function verifyState(state: string, secretHex: string, nowMs: number): Promise<OAuthState | null> {
  if (typeof state !== "string" || state.length === 0 || state.length > MAX_STATE_CHARS) return null;
  const parts = state.split(".");
  if (parts.length !== 2) return null;
  const [data, signatureText] = parts;

  const signature = fromBase64Url(signatureText);
  if (!signature) return null;
  const valid = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(secretHex, "verify"),
    signature,
    new TextEncoder().encode(data),
  );
  if (!valid) return null;

  const bytes = fromBase64Url(data);
  if (!bytes) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;

  const { w, u, exp, n } = parsed as Record<string, unknown>;
  if (typeof w !== "string" || typeof u !== "string" || typeof n !== "string") return null;
  if (typeof exp !== "number" || !Number.isFinite(exp)) return null;
  if (exp <= nowMs) return null;
  return { w, u, exp, n };
}
