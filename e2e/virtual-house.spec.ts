import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, loginViaUI, TestUser } from './helpers/testUser';
import { proxyEdgeFunctionsCors } from './helpers/corsProxy';

test.describe('Casa Virtual 2D E2E', () => {
  const testSlug = `casal-house-${Date.now()}`;
  let user: TestUser | undefined;

  test.afterAll(async () => {
    await deleteTestUser(user);
  });

  test('Deve configurar a Casa Virtual no Dashboard, ativar a seção e visualizar no convite público', async ({ page }) => {
    // Listen to console logs
    page.on('console', msg => console.log('BROWSER:', msg.text()));
    page.on('pageerror', exception => console.log('PAGE ERROR:', exception));

    test.setTimeout(90000); // 90s timeout

    // Proxy de CORS para as edge functions reais (registrar ANTES dos mocks)
    await proxyEdgeFunctionsCors(page);

    // Mockar validação do Mercado Pago no Dashboard
    await page.route('**/functions/v1/validate-mercadopago', async route => {
      const json = { valid: true, isTestMode: true };
      await route.fulfill({ json });
    });

    // 1. Conta de teste via Admin API (sem e-mail de confirmação → sem bounce)
    // e login pela UI. NÃO usar /register aqui: dispara e-mail real.
    user = await createTestUser('Pedro & Ana', 'vh');
    await loginViaUI(page, user);
    await page.waitForTimeout(2000);

    // Ir para a aba "Configurar Site"
    await page.click('button:has-text("Configurar Site")');
    await page.waitForTimeout(1000);

    // Configurar o slug
    await page.fill('input[id="coupleName"]', testSlug);

    // Habilitar a seção "Casa dos Sonhos (2D)" nas seções do site
    // Ela fica sob a sub-aba Aparência
    await page.click('button:has-text("Casa dos Sonhos (2D)")');
    await page.waitForTimeout(500);

    // Ir para a sub-aba "Casa Virtual"
    await page.click('button:has-text("Casa Virtual")');
    await page.waitForTimeout(1000);

    // Verificar se o construtor visual de planta baixa está montado
    await expect(page.locator('h3:has-text("Planta Baixa Interativa")').first()).toBeVisible();

    // Clicar em "Gerenciar Catálogo (Preços)"
    await page.click('button:has-text("Gerenciar Catálogo (Preços)")');
    await page.waitForTimeout(1000);

    // Verificar se o cabeçalho do catálogo está visível
    await expect(page.locator('h2:has-text("Catálogo de Construção")').first()).toBeVisible();

    // Ativar o presente "Geladeira" (item do catálogo de móveis).
    // O switch de ativação é o último button[role=switch] da linha do item
    // (o primeiro é o "Já Concluído?", que só aparece após ativar).
    const fridgeRow = page.locator('div.bg-card').filter({
      has: page.locator('h4', { hasText: /^Geladeira$/ }),
    });
    await fridgeRow.locator('button[role="switch"]').last().click();
    await page.waitForTimeout(500);

    // Salvar o Catálogo
    await page.click('button:has-text("Salvar Catálogo")');
    await page.waitForTimeout(2000); // esperar o toast

    // Voltar para a sub-aba Aparência para publicar as alterações no site
    await page.click('button:has-text("Aparência & Seções")');
    await page.waitForTimeout(1000);

    // Salvar e publicar o site
    await page.click('button:has-text("Salvar e Publicar")');
    await page.waitForTimeout(3000); // esperar o toast e o banco de dados

    // Obter o URL público gerado no Dashboard
    const publicUrl = await page.getAttribute('a[href*="casal-house-"]', 'href');
    if (!publicUrl) {
      throw new Error("Não foi possível encontrar a URL pública gerada no Dashboard");
    }
    console.log(`URL pública encontrada: ${publicUrl}`);

    // 2. Acessar a página pública
    await page.goto(publicUrl);
    await page.waitForTimeout(3000);

    // Verificar se o cabeçalho da Casa Virtual está renderizado na página
    await expect(page.locator('h2:has-text("Casa dos Sonhos")').first()).toBeVisible();

    // Verificar se o container de grama da casa está visível
    await expect(page.locator('div.bg-col-span-8, div.bg-\\[\\#4a5f41\\]').first()).toBeVisible();
  });
});
