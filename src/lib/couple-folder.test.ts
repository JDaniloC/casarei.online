import { describe, expect, it } from 'vitest';
import {
  OWNER_ROOT_PREFIX,
  coupleFolderName,
  ownerRootFolderName,
} from '../../supabase/functions/_shared/couple-folder';

const names = (overrides: Partial<Record<'coupleName' | 'partner1Name' | 'partner2Name', string>> = {}) => ({
  coupleName: 'Ana & Bruno',
  partner1Name: 'Ana',
  partner2Name: 'Bruno',
  ...overrides,
});

describe('coupleFolderName', () => {
  it('usa o nome do casal', () => {
    expect(coupleFolderName(names())).toBe('Ana & Bruno');
  });

  it('sem nome do casal, junta os parceiros com " & "', () => {
    expect(coupleFolderName(names({ coupleName: '   ' }))).toBe('Ana & Bruno');
  });

  it('nome do casal só com barras conta como vazio', () => {
    expect(coupleFolderName(names({ coupleName: '///' }))).toBe('Ana & Bruno');
  });

  it('pula o parceiro vazio', () => {
    expect(coupleFolderName(names({ coupleName: '', partner2Name: '  ' }))).toBe('Ana');
  });

  it('sem nenhum nome usa "Casal"', () => {
    expect(coupleFolderName({ coupleName: '', partner1Name: '', partner2Name: '' })).toBe('Casal');
  });
});

describe('ownerRootFolderName', () => {
  it('prefixa "Casarei.online – " (travessão) ao nome do casal', () => {
    expect(OWNER_ROOT_PREFIX).toBe('Casarei.online – ');
    expect(ownerRootFolderName(names())).toBe('Casarei.online – Ana & Bruno');
  });

  it('usa os mesmos fallbacks do nome do casal', () => {
    expect(ownerRootFolderName({ coupleName: '', partner1Name: '', partner2Name: '' })).toBe(
      'Casarei.online – Casal',
    );
  });
});
