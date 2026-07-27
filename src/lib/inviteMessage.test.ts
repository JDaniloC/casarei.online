import { describe, it, expect } from 'vitest';
import { buildInviteMessage } from './inviteMessage';

const LINK = 'https://casarei.online/carla-e-ewerton/convite/abc123';

describe('buildInviteMessage', () => {
  it('não deve conter nenhum caractere acima de U+00FF', () => {
    const msg = buildInviteMessage({ guestName: 'Danilo', link: LINK, passcode: '4821' });

    const foraDoLatin1 = [...msg].filter((c) => c.codePointAt(0)! > 0xff);
    expect(foraDoLatin1).toEqual([]);
  });

  it('deve preservar os acentos do português', () => {
    const msg = buildInviteMessage({ guestName: 'Danilo', link: LINK });

    expect(msg).toContain('Olá');
    expect(msg).toContain('confirmação de presença');
  });

  it('deve incluir o nome do convidado e o link do convite', () => {
    const msg = buildInviteMessage({ guestName: 'Josilene', link: LINK });

    expect(msg).toContain('Josilene');
    expect(msg).toContain(LINK);
  });

  it('deve incluir a senha de acesso quando informada', () => {
    const msg = buildInviteMessage({ guestName: 'Danilo', link: LINK, passcode: '4821' });

    expect(msg).toContain('4821');
  });

  it('deve omitir a linha de senha quando não houver senha', () => {
    const msg = buildInviteMessage({ guestName: 'Danilo', link: LINK });

    expect(msg).not.toContain('Senha de Acesso');
  });
});
