// Liga o módulo puro drive-access.ts ao mundo real: variáveis de ambiente do Deno e o banco
// (service role). SÓ os index.ts das edge functions importam este arquivo; não roda no vitest.
// Nunca loga valores: só o NOME da variável que falta.

import { createAccessTokenProvider, type DriveAccessRef, type OwnerCredentials } from "./drive-access.ts";
import type { FetchFn } from "./google-drive.ts";

// deno-lint-ignore no-explicit-any
type SupabaseLike = { from(table: string): any };

const CONNECTIONS = "wedding_drive_connections";

/** Lê as variáveis pelo nome, na hora de usar. Se faltar alguma, loga só os nomes e lança. */
export function requireEnv(logPrefix: string, names: readonly string[]): string[] {
  const missing = names.filter((name) => !Deno.env.get(name));
  if (missing.length > 0) {
    console.error(`${logPrefix} variáveis ausentes: ${missing.join(", ")}`);
    throw new Error("google_config_missing");
  }
  return names.map((name) => Deno.env.get(name) as string);
}

export function createDenoDriveAccess(
  supabase: SupabaseLike,
  fetchFn: FetchFn,
  logPrefix: string,
): {
  getAccessToken(ref: DriveAccessRef): Promise<string>;
  /** Descarta o token em cache da conta (o Drive respondeu 401 com ele); o próximo pedido renova. */
  invalidateAccessToken(ref: DriveAccessRef): void;
} {
  // Os erros do banco não entram nas mensagens: podem carregar ids e detalhes internos.
  async function loadOwnerCredentials(weddingId: string): Promise<OwnerCredentials | null> {
    const { data, error } = await supabase
      .from(CONNECTIONS)
      .select("refresh_token_encrypted, refresh_token_iv")
      .eq("wedding_id", weddingId)
      .maybeSingle();
    if (error) throw new Error("Falha ao ler as credenciais do casal");
    if (!data?.refresh_token_encrypted || !data?.refresh_token_iv) return null;
    return { encrypted: data.refresh_token_encrypted, iv: data.refresh_token_iv };
  }

  const provider = createAccessTokenProvider({
    fetchFn,
    now: () => Date.now(),
    platformConfig() {
      const [clientId, clientSecret, refreshToken] = requireEnv(logPrefix, [
        "GOOGLE_DRIVE_CLIENT_ID",
        "GOOGLE_DRIVE_CLIENT_SECRET",
        "GOOGLE_DRIVE_REFRESH_TOKEN",
      ]);
      return { clientId, clientSecret, refreshToken };
    },
    clientConfig() {
      const [clientId, clientSecret] = requireEnv(logPrefix, ["GOOGLE_DRIVE_CLIENT_ID", "GOOGLE_DRIVE_CLIENT_SECRET"]);
      return { clientId, clientSecret };
    },
    encryptionKey: () => requireEnv(logPrefix, ["ENCRYPTION_KEY"])[0],
    loadOwnerCredentials,
    async markNeedsReconnect(weddingId, epoch) {
      // Condicional: só vale se a conexão ainda for a da época que falhou.
      const { error } = await supabase
        .from(CONNECTIONS)
        .update({ needs_reconnect: true })
        .eq("wedding_id", weddingId)
        .eq("connected_at", epoch);
      if (error) throw new Error("Falha ao marcar a necessidade de reconexão");
    },
  });

  return { getAccessToken: provider.getAccessToken, invalidateAccessToken: provider.invalidate };
}
