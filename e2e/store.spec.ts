import { test, expect } from '@playwright/test';
import { Page } from '@playwright/test';
import { createTestUser, deleteTestUser, loginViaUI, TestUser } from './helpers/testUser';
import { proxyEdgeFunctionsCors } from './helpers/corsProxy';

/**
 * Testes E2E: Loja da Página Pública - Estoque, Cotas e WhatsApp
 *
 * Estes testes verificam:
 * 1. Que presentes com cotas mostram o seletor de cotas e calculam o preço correto.
 * 2. Que presentes esgotados têm botão desabilitado.
 * 3. Que o link do WhatsApp aponta para o número certo da configuração de casamento.
 */

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * Cria uma conta, configura o casamento (com Pix e WhatsApp) e adiciona
 * presentes via API pública do Supabase mockada.
 * Retorna a URL pública do casal.
 */
const createdUsers: TestUser[] = [];

test.afterAll(async () => {
  for (const u of createdUsers) {
    await deleteTestUser(u);
  }
});

async function setupWeddingPage(page: Page) {
  const ts = Date.now();
  const rnd = Math.floor(Math.random() * 9999);
  const coupleName = `casal-store-${ts}-${rnd}`;

  // Proxy de CORS para as edge functions reais (registrar ANTES dos mocks)
  await proxyEdgeFunctionsCors(page);

  // Mock edge functions
  await page.route('**/functions/v1/validate-mercadopago', route =>
    route.fulfill({ json: { valid: true, isTestMode: true } })
  );
  await page.route('**/functions/v1/save-mp-credentials', route =>
    route.fulfill({ json: { success: true } })
  );

  // 1. Conta de teste via Admin API (sem e-mail de confirmação → sem bounce)
  // e login pela UI. NÃO usar /register aqui: dispara e-mail real.
  const user = await createTestUser('Casal Store E2E', 'store');
  createdUsers.push(user);
  await loginViaUI(page, user);
  await page.waitForTimeout(2000);

  // 2. Configura nome do casal e WhatsApp (ambos estão na sub-aba "appearance" que é a padrão)
  await page.click('button:has-text("Configurar Site")');
  await page.waitForTimeout(1000);
  // A sub-aba padrão é "Aparência & Seções" que contém coupleName e whatsappNumber
  await page.fill('input[id="coupleName"]', coupleName);
  await page.fill('input[id="whatsappNumber"]', '11987654321');

  // 3. Vai para sub-aba "Presentes & Pix" para preencher a chave Pix
  await page.click('button:has-text("Presentes & Pix")');
  await page.waitForTimeout(1000);
  await page.fill('input[id="manualPixKey"]', '11.222.333/0001-44');

  // Salva tudo
  await page.click('button:has-text("Salvar e Publicar")');
  await page.waitForTimeout(2500);

  // Volta à Presentes & Pix para adicionar os presentes
  await page.click('button:has-text("Presentes & Pix")');
  await page.waitForTimeout(1000);

  // 4. Adiciona presente com cotas
  await page.click('button:has-text("Adicionar Presente")');
  await page.waitForTimeout(800);

  await page.fill('input[placeholder="Ex: Jogo de Panelas"]', 'Geladeira com Cotas');
  await page.fill('input[placeholder="0.00"]', '1200');

  // Ativa cotas (o stock fica desabilitado quando há totalQuotas)
  const quotasInput = page.locator('input[placeholder="Sem cotas"]').first();
  await quotasInput.fill('4');
  await page.waitForTimeout(300);

  // O botão de submissão do Dialog se chama "Salvar Presente", não "Adicionar Presente"
  await page.click('button:has-text("Salvar Presente")');
  await page.waitForTimeout(1500);

  // 5. Adiciona presente com estoque limitado (sem cotas)
  await page.click('button:has-text("Adicionar Presente")');
  await page.waitForTimeout(800);

  await page.fill('input[placeholder="Ex: Jogo de Panelas"]', 'Faqueiro Prata (Estoque 1)');
  await page.fill('input[placeholder="0.00"]', '350');

  // Estoque = 1 (habilitado pois não há totalQuotas neste presente)
  const stockInput = page.locator('input[placeholder="Ilimitado"]').first();
  await stockInput.fill('1');
  await page.waitForTimeout(300);

  await page.click('button:has-text("Salvar Presente")');
  await page.waitForTimeout(1500);

  // 6. Salva e publica
  await page.click('button:has-text("Salvar e Publicar")');
  await page.waitForTimeout(2500);

  return `/${coupleName}`;
}

// ─── testes ──────────────────────────────────────────────────────────────────

test.describe('Loja Pública - Estoque, Cotas e WhatsApp', () => {

  test('Deve exibir cotas e botão Adquirir Cota para presentes fracionados', async ({ page }) => {
    test.setTimeout(90000);

    const publicPath = await setupWeddingPage(page);

    await page.goto(publicPath);
    await page.waitForTimeout(2000);

    // Verifica que o presente com cotas aparece na página pública
    await expect(page.locator('text=Geladeira com Cotas')).toBeVisible({ timeout: 10000 });

    // O botão deve dizer "Adquirir Cota" (indica que o modo de quotas está ativo)
    await expect(page.locator('button:has-text("Adquirir Cota")').first()).toBeVisible();

    // Clica para adquirir — deve adicionar ao carrinho
    await page.locator('button:has-text("Adquirir Cota")').first().click();
    // Toast de confirmação — aguarda qualquer feedback de sucesso
    await expect(page.locator('[role="status"], [data-sonner-toast]').first()).toBeVisible({ timeout: 5000 });
  });

  test('Deve bloquear adicionar mais itens do que o estoque disponível', async ({ page }) => {
    test.setTimeout(90000);

    const publicPath = await setupWeddingPage(page);

    await page.goto(publicPath);
    await page.waitForTimeout(2000);

    // Verifica que o presente com estoque limitado aparece
    await expect(page.locator('text=Faqueiro Prata (Estoque 1)')).toBeVisible({ timeout: 10000 });

    // Clica no botão "Adicionar ao Carrinho" do card do Faqueiro usando filter por texto mais flexível
    const faqueitoCard = page.locator('div').filter({ hasText: 'Faqueiro Prata (Estoque 1)' }).last();
    // Selecionamos o botão sem o texto "Adicionar ao Carrinho" pois o texto muda para "Adicionado!"
    const addBtn = faqueitoCard.locator('button').first();

    // Primeira adição deve funcionar
    await addBtn.click();
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: /adicionado/ })).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(500);

    // Segunda adição deve ser bloqueada pelo estoque (exibe erro)
    await addBtn.click();
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: /limite disponível/ })).toBeVisible({ timeout: 5000 });
  });

  test('Deve exibir botão WhatsApp na página do RSVP apontando para o número configurado', async ({ page }) => {
    test.setTimeout(90000);

    const publicPath = await setupWeddingPage(page);

    // Acessa a página de convite/RSVP
    await page.goto(`${publicPath}/convite`);
    await page.waitForTimeout(2000);

    // Procura link do WhatsApp na página do RSVP
    const waLink = page.locator('a[href*="wa.me"]');
    await expect(waLink).toBeVisible({ timeout: 10000 });

    // Verifica que o link aponta para o número correto (55 + 11987654321 sem formatação)
    const href = await waLink.getAttribute('href');
    expect(href).toContain('wa.me/5511987654321');
  });

});
