import { describe, it, expect } from 'vitest';
import {
  resolveCompanionLimit,
  MAX_COMPANIONS_CEILING,
} from '../../supabase/functions/_shared/companions';

describe('resolveCompanionLimit', () => {
  it('usa o limite do convidado quando definido', () => {
    expect(resolveCompanionLimit(3, 0)).toBe(3);
  });

  it('cai no padrão do casamento quando o convidado é null', () => {
    expect(resolveCompanionLimit(null, 4)).toBe(4);
  });

  it('cai no padrão do casamento quando o convidado é undefined', () => {
    expect(resolveCompanionLimit(undefined, 4)).toBe(4);
  });

  it('respeita zero do convidado sem cair no padrão', () => {
    expect(resolveCompanionLimit(0, 5)).toBe(0);
  });

  it('devolve zero quando nem convidado nem casamento têm valor', () => {
    expect(resolveCompanionLimit(null, null)).toBe(0);
  });

  it('nunca devolve valor negativo', () => {
    expect(resolveCompanionLimit(-2, 3)).toBe(0);
  });

  it('limita ao teto de 19', () => {
    expect(resolveCompanionLimit(99, 0)).toBe(MAX_COMPANIONS_CEILING);
    expect(MAX_COMPANIONS_CEILING).toBe(19);
  });

  it('trunca valores fracionários para baixo', () => {
    expect(resolveCompanionLimit(2.9, 0)).toBe(2);
  });
});
