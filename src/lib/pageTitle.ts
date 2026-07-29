/**
 * Título da aba da página pública do casamento.
 *
 * O link geral (`/{slug}`) esconde local, dress code, RSVP e mural, então não
 * pode se anunciar como convite — mesmo critério do preview de
 * compartilhamento em `apresentacao.html`.
 */
export const buildWeddingPageTitle = (
  coupleName: string,
  isGuestView: boolean
): string =>
  isGuestView
    ? `${coupleName} | Convite de Casamento`
    : `${coupleName} | Nosso Casamento`;
