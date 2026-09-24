// Rate limit por identificador (IP, casamento…) sobre a tabela rate_limit_log.
// Módulo puro: o acesso ao banco entra por `RateLimitDb`, o relógio por `now`.

export interface RateLimitDb {
  countSince(identifier: string, action: string, sinceIso: string): Promise<number>;
  insert(identifier: string, action: string): Promise<void>;
}

export interface RateLimitOptions {
  identifier: string;
  action: string;
  windowMs: number;
  max: number;
  now?: () => number;
}

// Conta os registros da janela; ao atingir `max` bloqueia SEM registrar, senão
// registra esta tentativa. Não é atômico: requisições simultâneas podem passar
// um pouco do limite (mesma limitação do rate limit inline do submit-rsvp).
export async function checkAndLog(
  db: RateLimitDb,
  opts: RateLimitOptions,
): Promise<{ allowed: boolean; remaining: number }> {
  const since = new Date((opts.now?.() ?? Date.now()) - opts.windowMs).toISOString();
  const count = await db.countSince(opts.identifier, opts.action, since);
  if (count >= opts.max) {
    return { allowed: false, remaining: 0 };
  }
  await db.insert(opts.identifier, opts.action);
  return { allowed: true, remaining: opts.max - count - 1 };
}

// IP do cliente: primeiro item de x-forwarded-for, depois cf-connecting-ip.
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || headers.get("cf-connecting-ip") || "unknown";
}

// Adaptador para a tabela rate_limit_log(identifier, action, created_at). As
// mensagens de erro não carregam o identificador (é o IP do cliente).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rateLimitDbFromSupabase(client: { from(table: string): any }): RateLimitDb {
  return {
    async countSince(identifier, action, sinceIso) {
      const { count, error } = await client
        .from("rate_limit_log")
        .select("id", { count: "exact", head: true })
        .eq("identifier", identifier)
        .eq("action", action)
        .gte("created_at", sinceIso);
      if (error) {
        throw new Error("Falha ao consultar o limite de requisições.");
      }
      return count ?? 0;
    },
    async insert(identifier, action) {
      const { error } = await client.from("rate_limit_log").insert({ identifier, action });
      if (error) {
        throw new Error("Falha ao registrar a requisição no limite.");
      }
    },
  };
}
