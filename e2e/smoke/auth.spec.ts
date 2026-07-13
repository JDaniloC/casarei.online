import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, TestUser } from '../helpers/testUser';

// O cadastro via UI (/register) não é coberto aqui de propósito: com a
// confirmação de e-mail ativa, cada signUp real dispara e-mail para endereço
// inexistente e gera hard bounce no Supabase. Cobrir /register exige stack
// local (supabase start) com Inbucket/Mailpit.
test('login com email/senha redireciona para dashboard e logout retorna', async ({ page }) => {
  let user: TestUser | undefined;
  try {
    user = await createTestUser('Teste Smoke', 'smoke');

    // Login
    await page.goto('/login');
    await page.fill('input[type="email"]', user.email);
    await page.fill('input[type="password"]', user.password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });

    // Logout — aguarda o ProtectedRoute expulsar do dashboard (signOut concluído)
    await page.click('button:has(.lucide-log-out)');
    await page.waitForURL((url) => !url.pathname.startsWith('/dashboard'), { timeout: 15000 });

    // Login novamente para garantir que a sessão foi encerrada e recriada
    await page.goto('/login');
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 10000 });
    await page.fill('input[type="email"]', user.email);
    await page.fill('input[type="password"]', user.password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });
  } finally {
    await deleteTestUser(user);
  }
});
