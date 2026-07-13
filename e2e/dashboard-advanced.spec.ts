import { test, expect } from '@playwright/test';
import { createTestUser, deleteTestUser, loginViaUI, TestUser } from './helpers/testUser';

test.describe('Dashboard Advanced Features', () => {
  let user: TestUser | undefined;

  test.afterEach(async () => {
    await deleteTestUser(user);
    user = undefined;
  });

  // Helper para fazer login e criar conta antes de cada teste
  test.beforeEach(async ({ page }) => {
    const testSlug = `casal-adv-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    // 1. Setup network intercepts for dashboard operations
    await page.route('**/functions/v1/validate-mercadopago', async route => {
      await route.fulfill({ json: { valid: true, isTestMode: true } });
    });

    await page.route('**/functions/v1/save-mp-credentials', async route => {
      await route.fulfill({ json: { success: true } });
    });

    // 2. Conta de teste via Admin API (sem e-mail de confirmação → sem bounce)
    // e login pela UI. NÃO usar /register aqui: dispara e-mail real.
    user = await createTestUser('Casal Teste Avançado', 'adv');
    await loginViaUI(page, user);
    await page.waitForTimeout(1000);
    
    // As in full-flow, select "Configurar Site" first
    await page.click('button:has-text("Configurar Site")');
    await page.waitForTimeout(1000);

    await page.fill('input[id="coupleName"]', testSlug);
    await page.click('button:has-text("Salvar e Publicar")');
    await page.waitForTimeout(2000);
  });

  test('Deve realizar a importação de lista de presentes via CSV com sucesso', async ({ page }) => {
    test.setTimeout(60000); // 60s timeout

    // Vai para a sub-aba "Presentes & Pix"
    await page.click('button:has-text("Presentes & Pix")');
    await page.waitForTimeout(1000);

    // Cria um conteúdo de CSV fake (Nome,Categoria,Preço,Link,Imagem)
    const csvContent = "Nome,Categoria,Preço\nGeladeira Inox,Eletrodomésticos,3500.00\nFogão 4 Bocas,Eletrodomésticos,800.00\nMicroondas,Eletrodomésticos,450.00";
    
    // Faz o upload do arquivo CSV via evento filechooser
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.click('button:has-text("Importar CSV")');
    const fileChooser = await fileChooserPromise;
    
    await fileChooser.setFiles({
      name: 'lista-presentes.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csvContent)
    });

    // Aguarda o processamento
    await page.waitForTimeout(2000);

    // Verifica se os itens aparecem na lista do Dashboard
    await expect(page.locator('text=Geladeira Inox')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Fogão 4 Bocas')).toBeVisible();
    await expect(page.locator('text=Microondas')).toBeVisible();
  });

  test('Deve gerar um presente usando AI Scrape via URL', async ({ page }) => {
    test.setTimeout(60000);

    // Vai para a sub-aba "Presentes & Pix"
    await page.click('button:has-text("Presentes & Pix")');
    await page.waitForTimeout(1000);

    // Clica em "Adicionar Presente" para abrir o formulário
    await page.click('button:has-text("Adicionar Presente")');
    await page.waitForTimeout(1000);

    // Mockar a resposta do web-scrape
    await page.route('**/functions/v1/scrape-gift', async route => {
      await route.fulfill({ 
        json: { 
          title: "Smart TV 55 polegadas 4K",
          price: "2499.00",
          image: "https://example.com/tv.jpg"
        } 
      });
    });

    // Tenta encontrar o input por type e na área correta
    const inputLocator = page.locator('input[placeholder="https://www.loja..."]').first();
    await inputLocator.fill('https://www.loja-exemplo.com.br/smart-tv');
    
    // O botão de Scraping está adjacente ao input
    await page.locator('div:has(> input[placeholder="https://www.loja..."]) > button').first().click();
    
    // Aguarda o resultado e verifica
    await expect(page.locator('input[placeholder="Ex: Jogo de Panelas"]')).toHaveValue('Smart TV 55 polegadas 4K', { timeout: 10000 });
    
    // Salva o presente criado
    await page.locator('button:has-text("Adicionar Presente")').last().click({ force: true });
    await page.waitForTimeout(1000);
  });
});
