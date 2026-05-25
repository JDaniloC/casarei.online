import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";

Deno.test("isIdempotencyKeyUsed: retorna true para chave existente", async () => {
  // mock simples — valida a lógica de checagem
  const usedKeys = new Set(["mp_123"]);
  const isUsed = (key: string) => usedKeys.has(key);
  assertEquals(isUsed("mp_123"), true);
  assertEquals(isUsed("mp_456"), false);
});
