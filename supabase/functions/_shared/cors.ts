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
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
    ...securityHeaders(),
  };
  if (origin !== null && isOriginAllowed(origin, allowed)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}
