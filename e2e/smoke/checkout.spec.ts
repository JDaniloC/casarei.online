import { test, expect } from '@playwright/test';

test('página pública carrega lista de presentes', async ({ page }) => {
  await page.goto(`/${process.env.TEST_WEDDING_SLUG}`);
  await expect(page.locator('[data-testid="gift-card"]').first()).toBeVisible();
});
