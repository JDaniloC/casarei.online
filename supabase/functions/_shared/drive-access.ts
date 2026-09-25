// Access token do Google POR CASAMENTO. No modo plataforma é o refresh token dos secrets
// (como sempre foi); no modo casal é o refresh token do casal, guardado cifrado no banco.
// Módulo puro: `fetch`, relógio, variáveis de ambiente e banco entram por `deps` (a ligação
// real com o Deno e o Supabase fica em drive-access-deno.ts).
//
// O cache (em memória do isolate) usa `platform` ou `owner:<casamento>:<época>`, onde a
// época é o `connected_at` da conexão: reconectar (talvez com outra conta) muda a época e o
// token da conta antiga nunca é servido depois disso. Nada aqui loga tokens.

import { decryptValue } from "./crypto.ts";
import {
  NeedsReconnectError,
  refreshAccessToken,
  type FetchFn,
  type GoogleOAuthConfig,
} from "./google-drive.ts";

export type DriveAccessRef =
  | { kind: "platform" }
  | {
      kind: "owner";
      weddingId: string;
      /** `connected_at` da conexão do casal, exatamente como veio do banco. */
      epoch: string;
    };

/** Refresh token do casal, cifrado (AES-GCM, hex). */
export interface OwnerCredentials {
  encrypted: string;
  iv: string;
}

export interface AccessTokenProviderDeps {
  fetchFn: FetchFn;
  now: () => number;
  /** Credenciais da conta da plataforma (secrets). Lança se faltar variável. */
  platformConfig(): GoogleOAuthConfig;
  /** Client id/secret do app, para renovar o token do casal. Lança se faltar variável. */
  clientConfig(): { clientId: string; clientSecret: string };
  /** Chave AES em hex (`ENCRYPTION_KEY`). Lança se faltar. */
  encryptionKey(): string;
  /** Refresh token cifrado do casamento; `null` se não há (modo plataforma). */
  loadOwnerCredentials(weddingId: string): Promise<OwnerCredentials | null>;
  /**
   * Marca `needs_reconnect` SÓ se `connected_at` do casamento ainda for `epoch`
   * (senão um token antigo marcaria uma conexão recém-feita).
   */
  markNeedsReconnect(weddingId: string, epoch: string): Promise<void>;
}

const SAFETY_MARGIN_MS = 60_000;

/** Teto de entradas no cache; passado dele, saem as mais antigas. */
export const MAX_CACHED_TOKENS = 200;

export function accessCacheKey(ref: DriveAccessRef): string {
  return ref.kind === "platform" ? "platform" : `owner:${ref.weddingId}:${ref.epoch}`;
}

export function createAccessTokenProvider(deps: AccessTokenProviderDeps): {
  getAccessToken(ref: DriveAccessRef): Promise<string>;
} {
  const cache = new Map<string, { value: string; expiresAt: number }>();
  const inFlight = new Map<string, Promise<string>>();

  function remember(key: string, value: string, expiresInSeconds: number): void {
    const now = deps.now();
    for (const [existingKey, entry] of cache) {
      if (entry.expiresAt <= now) cache.delete(existingKey);
    }
    while (cache.size >= MAX_CACHED_TOKENS) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
    cache.set(key, { value, expiresAt: now + expiresInSeconds * 1000 - SAFETY_MARGIN_MS });
  }

  async function exchange(ref: DriveAccessRef): Promise<{ accessToken: string; expiresIn: number }> {
    if (ref.kind === "platform") return refreshAccessToken(deps.fetchFn, deps.platformConfig());

    const credentials = await deps.loadOwnerCredentials(ref.weddingId);
    // O casal desconectou entre a leitura da conexão e agora: não há o que marcar.
    if (!credentials) throw new NeedsReconnectError("A conexão do casal não existe mais");

    const refreshToken = await decryptValue(credentials.encrypted, credentials.iv, deps.encryptionKey());
    try {
      return await refreshAccessToken(deps.fetchFn, { ...deps.clientConfig(), refreshToken });
    } catch (error) {
      if (error instanceof NeedsReconnectError) {
        try {
          await deps.markNeedsReconnect(ref.weddingId, ref.epoch);
        } catch {
          // o erro que importa é o do Google; falha ao marcar não o esconde
        }
      }
      throw error;
    }
  }

  async function getAccessToken(ref: DriveAccessRef): Promise<string> {
    const key = accessCacheKey(ref);
    const cached = cache.get(key);
    if (cached && deps.now() < cached.expiresAt) return cached.value;

    // Requisições simultâneas com o cache vazio compartilham a mesma troca.
    const pending = inFlight.get(key);
    if (pending) return pending;

    const promise = (async () => {
      const { accessToken, expiresIn } = await exchange(ref);
      remember(key, accessToken, expiresIn);
      return accessToken;
    })().finally(() => {
      inFlight.delete(key);
    });
    inFlight.set(key, promise);
    return promise;
  }

  return { getAccessToken };
}
