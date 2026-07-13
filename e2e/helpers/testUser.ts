import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { Page } from '@playwright/test';

/**
 * Criação de usuários de teste SEM disparar e-mails.
 *
 * NUNCA cadastre contas de teste pela UI de /register: com confirmação de
 * e-mail ativa no projeto, cada signUp dispara um e-mail de confirmação para
 * um endereço inexistente, que devolve hard bounce e degrada a reputação de
 * envio do projeto Supabase (já recebemos aviso oficial por isso).
 *
 * Aqui usamos a Admin API com `email_confirm: true`, que não envia e-mail
 * algum, e um domínio sob o TLD reservado `.test` (RFC 6761), que não é
 * roteável — mesmo que algum fluxo dispare e-mail por acidente, ele jamais
 * chega a um provedor real.
 */

const PASSWORD = 'Password123!';
const EMAIL_DOMAIN = 'e2e.casarei.test';

export interface TestUser {
  id: string;
  email: string;
  password: string;
}

function loadRootEnv(): Record<string, string> {
  // Playwright é executado a partir da raiz do repositório (onde fica o .env)
  const envPath = resolve(process.cwd(), '.env');
  const entries = readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]);
  return Object.fromEntries(entries);
}

let cachedAdmin: SupabaseClient | null = null;

function adminClient(): SupabaseClient {
  if (cachedAdmin) return cachedAdmin;
  const env = loadRootEnv();
  const url = process.env.VITE_SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não encontrados (.env na raiz ou variáveis de ambiente)'
    );
  }
  cachedAdmin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cachedAdmin;
}

export async function createTestUser(fullName: string, prefix = 'e2e'): Promise<TestUser> {
  const email = `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}@${EMAIL_DOMAIN}`;
  const { data, error } = await adminClient().auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error || !data.user) {
    throw new Error(`createTestUser falhou: ${error?.message ?? 'sem usuário retornado'}`);
  }
  return { id: data.user.id, email, password: PASSWORD };
}

/**
 * Exclui o usuário de teste; o FK ON DELETE CASCADE de weddings.user_id
 * limpa casamento, presentes, pedidos, convidados etc. junto.
 */
export async function deleteTestUser(user: TestUser | undefined): Promise<void> {
  if (!user) return;
  const { error } = await adminClient().auth.admin.deleteUser(user.id);
  if (error) {
    console.warn(`teardown: não foi possível excluir ${user.email}: ${error.message}`);
  }
}

export async function loginViaUI(page: Page, user: TestUser): Promise<void> {
  await page.goto('/login');
  await page.fill('input[type="email"]', user.email);
  await page.fill('input[type="password"]', user.password);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard**', { timeout: 15000 });
}
