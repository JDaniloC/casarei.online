import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Consultas de apoio aos testes E2E via service role (somente dados
 * sintéticos criados pelos próprios testes).
 */

let cachedAdmin: SupabaseClient | null = null;

function adminClient(): SupabaseClient {
  if (cachedAdmin) return cachedAdmin;
  const envPath = resolve(process.cwd(), '.env');
  const env = Object.fromEntries(
    readFileSync(envPath, 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
  );
  const url = process.env.VITE_SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes');
  cachedAdmin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  return cachedAdmin;
}

export async function fetchWeddingIdBySlug(slug: string): Promise<string> {
  const { data, error } = await adminClient()
    .from('weddings')
    .select('id')
    .eq('slug', slug)
    .single();
  if (error || !data) throw new Error(`wedding não encontrado para slug ${slug}: ${error?.message}`);
  return data.id;
}

/** Token do convite individual de um convidado criado pelo teste. */
export async function fetchGuestToken(slug: string, guestName: string): Promise<string> {
  const weddingId = await fetchWeddingIdBySlug(slug);
  const { data, error } = await adminClient()
    .from('guests')
    .select('token')
    .eq('wedding_id', weddingId)
    .eq('name', guestName)
    .single();
  if (error || !data?.token) throw new Error(`convidado "${guestName}" sem token: ${error?.message}`);
  return data.token;
}

/**
 * A submit-rsvp limita 3 confirmações por IP a cada 10 min. Execuções
 * consecutivas da suíte estouram o limite e o RSVP falha com 429. Limpamos as
 * entradas recentes de 'rsvp' antes do teste (dado transitório anti-abuso).
 */
export async function clearRecentRsvpRateLimit(): Promise<void> {
  const tenMinutesAgo = new Date(Date.now() - 600_000).toISOString();
  const { error } = await adminClient()
    .from('rate_limit_log')
    .delete()
    .eq('action', 'rsvp')
    .gte('created_at', tenMinutesAgo);
  if (error) console.warn(`não foi possível limpar rate_limit_log: ${error.message}`);
}

/**
 * true se a migration 20260713120000_add_guest_checkin já foi aplicada no
 * banco remoto. O teste de check-in se auto-ativa quando ela existir.
 */
export async function guestCheckinColumnsExist(): Promise<boolean> {
  const { error } = await adminClient().from('guests').select('checked_in').limit(1);
  return !error;
}

/** Remove do bucket os arquivos enviados pelo teste (ex.: QR code do pix). */
export async function removeStorageByPrefix(bucket: string, prefix: string): Promise<void> {
  const { data, error } = await adminClient().storage.from(bucket).list('', {
    limit: 100,
    search: prefix,
  });
  if (error || !data?.length) return;
  const names = data.map((f) => f.name).filter((n) => n.startsWith(prefix));
  if (names.length) await adminClient().storage.from(bucket).remove(names);
}

/** Status dos pedidos do casamento de teste (para asserções de fluxo de compra). */
export async function fetchOrderStatuses(slug: string): Promise<string[]> {
  const weddingId = await fetchWeddingIdBySlug(slug);
  const { data, error } = await adminClient()
    .from('orders')
    .select('status')
    .eq('wedding_id', weddingId);
  if (error) throw new Error(`erro ao consultar orders: ${error.message}`);
  return (data ?? []).map((o) => o.status as string);
}
