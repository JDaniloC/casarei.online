import { describe, expect, it } from 'vitest';
import sql from '../../supabase/migrations/20260925150000_drive_owner_connection.sql?raw';

// Testa o TEXTO da migration (não há banco no vitest): o que não pode faltar nem sobrar.
describe('migration 20260925150000_drive_owner_connection', () => {
  it.each([
    'ADD COLUMN IF NOT EXISTS refresh_token_encrypted TEXT',
    'ADD COLUMN IF NOT EXISTS refresh_token_iv TEXT',
    'ADD COLUMN IF NOT EXISTS google_email TEXT',
    'ADD COLUMN IF NOT EXISTS connected_at TIMESTAMPTZ',
    'ADD COLUMN IF NOT EXISTS needs_reconnect BOOLEAN NOT NULL DEFAULT false',
  ])('acrescenta a coluna de forma idempotente: %s', (fragment) => {
    expect(sql).toContain(fragment);
  });

  it('a CHECK amarra token, IV e época: os três preenchidos ou os três vazios', () => {
    expect(sql).toContain('wedding_drive_connections_owner_token_shape');
    expect(sql).toContain('(refresh_token_encrypted IS NULL) = (refresh_token_iv IS NULL)');
    expect(sql).toContain('(refresh_token_encrypted IS NULL) = (connected_at IS NULL)');
  });

  it('é idempotente também na constraint (pode rodar duas vezes)', () => {
    expect(sql).toMatch(/IF NOT EXISTS \(\s*SELECT 1 FROM pg_constraint WHERE conname = 'wedding_drive_connections_owner_token_shape'/);
  });

  it('mantém a tabela fechada: sem policies, sem GRANT, com REVOKE para anon e authenticated', () => {
    expect(sql).not.toMatch(/CREATE\s+POLICY/i);
    expect(sql).not.toMatch(/\bGRANT\b/i);
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.wedding_drive_connections FROM anon, authenticated/);
  });

  it('não apaga nada nem mexe no token do QR', () => {
    expect(sql).not.toMatch(/\bDROP\b/i);
    expect(sql).not.toMatch(/\bDELETE\b/i);
    expect(sql).not.toMatch(/upload_token/);
  });
});
