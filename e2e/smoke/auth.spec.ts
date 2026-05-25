import { test, expect } from '@playwright/test';

test('login com email/senha redireciona para dashboard', async ({ page }) => {
  const testEmail = `smoke_${Date.now()}@test.com`;
  const testPassword = 'Password123!';

  // Register first
  await page.goto('/register');
  await page.fill('input[id="fullName"]', 'Teste Smoke');
  await page.fill('input[id="email"]', testEmail);
  await page.fill('input[id="password"]', testPassword);
  await page.fill('input[id="confirmPassword"]', testPassword);
  await page.click('button[type="submit"]');
  
  await expect(page).toHaveURL(/dashboard/, { timeout: 10000 });

  // Logout
  await page.click('button:has-text("Sair")');
  await expect(page).toHaveURL(/login/);

  // Login
  await page.fill('input[type="email"]', testEmail);
  await page.fill('input[type="password"]', testPassword);
  await page.click('button[type="submit"]');
  
  await expect(page).toHaveURL(/dashboard/, { timeout: 10000 });
});
