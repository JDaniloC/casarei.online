import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";

function buildApprovedEmailSubject(giftName: string): string {
  return `Presente comprado: ${giftName}`;
}

Deno.test("buildApprovedEmailSubject: inclui nome do presente", () => {
  const subject = buildApprovedEmailSubject("Jogo de panelas");
  assertEquals(subject, "Presente comprado: Jogo de panelas");
});
