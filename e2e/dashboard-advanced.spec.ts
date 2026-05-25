import { test, expect } from '@playwright/test';

test.describe('Dashboard Advanced Features', () => {
  const testEmail = `admin_${Date.now()}@casarei.online`;
  const testPassword = 'Password123!';
  const testSlug = `casal-adv-${Date.now()}`;

  // Helper para fazer login e criar conta antes de cada teste
  test.beforeEach(async ({ page }) => {
    // 1. Setup network intercepts for dashboard operations
    await page.route('**/functions/v1/validate-mercadopago', async route => {
      await route.fulfill({ json: { valid: true, isTestMode: true } });
    });

    await page.route('**/functions/v1/save-mp-credentials', async route => {
      await route.fulfill({ json: { success: true } });
    });

    // 2. Register
    await page.goto('/register');
    await page.fill('input[id="fullName"]', 'Casal Teste Avançado');
    await page.fill('input[id="email"]', testEmail);
    await page.fill('input[id="password"]', testPassword);
    await page.fill('input[id="confirmPassword"]', testPassword);
    await page.click('button[type="submit"]');

    // 3. Aguardar dashboard e configurar o slug inicial
    await page.waitForURL('**/dashboard**');
    await page.waitForTimeout(1000);
    
    // As in full-flow, select "Configurar Site" first
    await page.click('button:has-text("Configurar Site")');
    await page.waitForTimeout(1000);
    await page.click('button:has-text("Configurações")');
    await page.waitForTimeout(500);

    await page.fill('input[id="coupleName"]', testSlug);
    await page.click('button:has-text("Salvar e Publicar")');
    await page.waitForTimeout(2000);
  });

  test('Deve realizar a importação de lista de presentes via CSV com sucesso', async ({ page }) => {
    test.setTimeout(60000); // 60s timeout

    // Vai para a sub-aba "Presentes & Pix"
    await page.click('button:has-text("Presentes & Pix")');
    await page.waitForTimeout(1000);

    // Cria um conteúdo de CSV fake
    const csvContent = "Item,Preço\nGeladeira Inox,3500.00\nFogão 4 Bocas,800.00\nMicroondas,450.00";
    
    // Faz o upload do arquivo CSV
    await page.setInputFiles('input[type="file"][accept=".csv"]', {
      name: 'lista-presentes.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csvContent)
    });

    // Verifica se os itens aparecem na lista do Dashboard
    // O Dashboard simplesmente insere eles na array de `gifts` que aparece listada
    await expect(page.locator('text=Geladeira Inox')).toBeVisible();
    await expect(page.locator('text=Fogão 4 Bocas')).toBeVisible();
    await expect(page.locator('text=Microondas')).toBeVisible();

    // Aguarda toast de sucesso
    await expect(page.locator('text=Importação Concluída!')).toBeVisible({ timeout: 5000 });
  });

  test('Deve gerar um presente usando AI Scrape via URL', async ({ page }) => {
    test.setTimeout(60000);

    // Vai para a sub-aba "Presentes & Pix"
    await page.click('button:has-text("Presentes & Pix")');
    await page.waitForTimeout(1000);

    // Mockar a resposta do web-scrape (Firecrawl edge function)
    await page.route('**/functions/v1/web-scrape', async route => {
      await route.fulfill({ 
        json: { 
          title: "Smart TV 55 polegadas 4K",
          price: "2499.00",
          image: "https://example.com/tv.jpg"
        } 
      });
    });

    // Preenche a URL no campo de "Colar URL do Produto"
    const inputLocator = page.locator('input[placeholder="Cole o link do produto aqui..."]');
    await inputLocator.fill('https://www.loja-exemplo.com.br/smart-tv');
    
    // O botão de Scraping está adjacente e tem a classe bg-gold e text-background
    await page.click('button.bg-gold.text-background:has(svg)');
    
    // Aguarda o resultado e verifica
    await expect(page.locator('text=Smart TV 55 polegadas 4K')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('input[value="2499"]')).toBeVisible(); // Preço deve estar preenchido
    
    // Clica para adicionar ao painel
    await page.click('button:has-text("Adicionar Presente")');
    
    // Toast de sucesso
    await expect(page.locator('text=Presente adicionado com sucesso')).toBeVisible();
  });
});
