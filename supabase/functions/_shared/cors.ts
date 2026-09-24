import { securityHeaders } from "./security-headers.ts";

// CORS por lista de origens permitidas (variável ALLOWED_ORIGINS, separada por
// vírgula). A comparação é exata (esquema + host + porta): sem curinga, sem
// sufixo, sem normalização de maiúsculas. O navegador nunca envia barra final
// em `Origin`, então ela é removida das entradas da lista.
export function parseAllowedOrigins(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((item) => item.trim().replace(/\/+$/, ""))
    .filter((item) => item !== "");
}

export function isOriginAllowed(origin: string | null, allowed: string[]): boolean {
  if (!origin || allowed.length === 0) return false;
  // Array.includes compara por igualdade estrita: sem chaves herdadas de objeto.
  return allowed.includes(origin);
}

export function corsHeadersFor(origin: string | null, allowed: string[]): Record<string, string> {
  const headers: Record<string, string> = {
    // Mesma lista das demais edge functions do repositório: os quatro cabeçalhos clássicos
    // do supabase-js mais os x-supabase-client-* que as versões novas dele passam a enviar
    // (sem eles, o preflight das chamadas entre origens do painel falharia).
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
    ...securityHeaders(),
  };
  if (origin !== null && isOriginAllowed(origin, allowed)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}
