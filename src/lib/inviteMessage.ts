/**
 * Monta a mensagem de convite enviada por WhatsApp.
 *
 * Restrição deliberada: a mensagem só usa caracteres até U+00FF (Latin-1).
 * Emojis quebraram no aparelho de um cliente — nossa saída era UTF-8 válido do
 * fonte até o bundle em produção, então a perda acontece na renderização do
 * dispositivo que recebe. Acentos do português cabem em Latin-1 e são mantidos;
 * qualquer caractere acima disso é risco de virar "?" na tela do convidado.
 * A formatação fica por conta do *negrito* nativo do WhatsApp.
 */
export interface InviteMessageParams {
  guestName: string;
  link: string;
  passcode?: string | null;
}

export const buildInviteMessage = ({ guestName, link, passcode }: InviteMessageParams): string => {
  let msg =
    `Olá, *${guestName}*!\n\n` +
    `É com muita alegria que convidamos você para celebrar esse momento tão especial conosco!\n\n` +
    `*Acesse seu convite exclusivo pelo link:*\n${link}`;

  if (passcode) {
    msg += `\n\n*Senha de Acesso:* \`${passcode}\``;
  }

  msg += `\n\nAguardamos a sua confirmação de presença!`;

  return msg;
};
