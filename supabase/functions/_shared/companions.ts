/**
 * Teto absoluto de acompanhantes. Vem do clamp que submit-rsvp já aplica em
 * guests_count (1..20): 19 acompanhantes + o titular do convite.
 */
export const MAX_COMPANIONS_CEILING = 19;

/**
 * Resolve quantos acompanhantes um convite pode levar.
 *
 * `guestMax` nulo/indefinido significa "herda o padrão do casamento"; zero é um
 * valor legítimo e NÃO cai no padrão.
 */
export const resolveCompanionLimit = (
  guestMax: number | null | undefined,
  weddingDefault: number | null | undefined,
): number => {
  const raw = guestMax ?? weddingDefault ?? 0;
  if (!Number.isFinite(raw) || raw < 0) return 0;
  return Math.min(Math.floor(raw), MAX_COMPANIONS_CEILING);
};
