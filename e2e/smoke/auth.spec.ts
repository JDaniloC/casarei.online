import { test, expect } from '@playwright/test';

test('login com email/senha redireciona para dashboard', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[type="email"]', process.env.TEST_EMAIL!);
  await page.fill('input[type="password"]', process.env.TEST_PASSWORD!);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/dashboard/);
});
