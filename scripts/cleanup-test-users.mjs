/**
 * Auditoria e limpeza de contas sintéticas criadas pelos testes E2E.
 *
 * Contexto: os testes antigos cadastravam contas via /register com e-mails
 * falsos (test_*, store_*, admin_*@casarei.online). Com confirmação de e-mail
 * ativa, cada cadastro disparou um e-mail para caixa inexistente → hard bounce
 * → aviso oficial do Supabase sobre restrição de envio.
 *
 * Uso (na raiz do repo, precisa de SUPABASE_SERVICE_ROLE_KEY no .env):
 *   node scripts/cleanup-test-users.mjs           # só lista (dry-run)
 *   node scripts/cleanup-test-users.mjs --delete  # exclui as contas de teste
 *
 * A exclusão cascateia (weddings.user_id ON DELETE CASCADE) e remove
 * casamentos, presentes, pedidos e convidados dessas contas de teste.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);

const url = env.VITE_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Faltam VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env');
  process.exit(1);
}

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

// Padrões sintéticos dos specs antigos e novos. O timestamp de 13 dígitos
// torna colisão com conta real praticamente impossível.
const TEST_PATTERNS = [
  /^(test|store|admin|smoke)_\d{13}(_\d+)?@(casarei\.online|test\.com)$/i,
  /^test_house_\d{13}@casarei\.online$/i,
  /@e2e\.casarei\.test$/i, // novos testes (teardown já exclui; isto pega sobras)
];

const isTestUser = (email) => email && TEST_PATTERNS.some((p) => p.test(email));

const all = [];
let page = 1;
for (;;) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
  if (error) {
    console.error('erro listUsers:', error.message);
    process.exit(1);
  }
  all.push(...data.users);
  if (data.users.length < 200) break;
  page++;
}

const testUsers = all.filter((u) => isTestUser(u.email));
const doDelete = process.argv.includes('--delete');

console.log(`Total de usuários no projeto: ${all.length}`);
console.log(`Contas sintéticas de teste identificadas: ${testUsers.length}\n`);
for (const u of testUsers) {
  console.log(`  ${u.email}  criado=${u.created_at?.slice(0, 10)}  confirmado=${u.email_confirmed_at ? 'sim' : 'não'}`);
}

if (!doDelete) {
  console.log('\nDry-run. Rode com --delete para excluir as contas acima.');
  process.exit(0);
}

let ok = 0;
for (const u of testUsers) {
  const { error } = await admin.auth.admin.deleteUser(u.id);
  if (error) console.error(`  FALHA ao excluir ${u.email}: ${error.message}`);
  else ok++;
}
console.log(`\nExcluídas ${ok}/${testUsers.length} contas de teste.`);
