import { test, expect } from '@playwright/test';

test.describe('Full Flow E2E', () => {
  const testEmail = `test_${Date.now()}@casarei.online`;
  const testPassword = 'Password123!';
  const testSlug = `casal-${Date.now()}`;

  test('Deve criar conta, configurar casamento, adicionar presente e acessar página pública', async ({ page }) => {
    // Listen to console logs
    page.on('console', msg => console.log('BROWSER:', msg.text()));

    test.setTimeout(90000); // 90s timeout

    // Mockar validação do Mercado Pago no Dashboard
    await page.route('**/functions/v1/validate-mercadopago', async route => {
      const json = { valid: true, isTestMode: true };
      await route.fulfill({ json });
    });

    // Mockar endpoint de criação de preferência do Mercado Pago
    await page.route('**/functions/v1/create-payment', async route => {
      const json = { id: 'pref-123', orderId: 'order-123', init_point: 'https://sandbox.mercadopago.com.br/checkout/v1/redirect?pref_id=123' };
      await route.fulfill({ json });
    });

    // Mockar submit-rsvp
    await page.route('**/functions/v1/submit-rsvp', async route => {
      await route.fulfill({ json: { success: true } });
    });

    // 1. Register
    await page.goto('/register');
    await page.fill('input[id="fullName"]', 'João & Maria');
    await page.fill('input[id="email"]', testEmail);
    await page.fill('input[id="password"]', testPassword);
    await page.fill('input[id="confirmPassword"]', testPassword);
    await page.click('button[type="submit"]');

    // Aguardar redirecionamento pro dashboard
    await page.waitForURL('**/dashboard**');

    // Fechar possíveis modais ou popups de boas vindas
    // (Opcional, caso a tela mostre algum toast ou intro)
    await page.waitForTimeout(2000);

    // Ir para a aba "Configurar Site" pois agora a aba padrão é "Painel Geral"
    await page.click('button:has-text("Configurar Site")');
    await page.waitForTimeout(1000);

    // O slug é gerado a partir do nome do casal.
    console.log("Current URL before filling coupleName:", page.url());
    await page.fill('input[id="coupleName"]', testSlug);

    // Ir para a sub-aba "Presentes & Pix" para preencher dados de pagamento
    await page.click('button:has-text("Presentes & Pix")');
    await page.waitForTimeout(1000);

    // Preencher credenciais fake do MP para que o botão de pagamento não seja bloqueado
    const inputs = await page.locator('input[placeholder*="APP_USR-"]').all();
    if (inputs.length >= 2) {
      await inputs[0].fill('TEST-1234567890'); // Public Key
      await inputs[1].fill('TEST-0987654321'); // Access Token
    }
    
    // Preencher Chave Pix Manual para habilitar
    await page.fill('input[id="manualPixKey"]', '123.456.789-00');

    // O app salva as configurações e os 20 presentes padrão.
    await page.click('button:has-text("Salvar e Publicar")');
    await page.waitForTimeout(2000); // esperar o toast

    // O app salva as configurações e os 20 presentes padrão.
    await page.click('button:has-text("Salvar e Publicar")');
    await page.waitForTimeout(3000); // esperar o toast e o db

    // Extrair o URL público gerado no Dashboard
    // O Dashboard renderiza <a href={publicUrl} target="_blank"...>
    const publicUrl = await page.getAttribute('a[target="_blank"]', 'href');
    if (!publicUrl) {
      throw new Error("Não foi possível encontrar a URL pública gerada no Dashboard");
    }
    console.log(`URL pública encontrada: ${publicUrl}`);

    // 4. Acessar a página pública
    await page.goto(publicUrl);
    await page.waitForTimeout(2000);

    // Verificar se o presente padrão (gerado pelo sistema) está na página
    await expect(page.locator('h3:has-text("Smart TV")').first()).toBeVisible();

    // Adicionar o presente ao carrinho
    await page.locator('button:has-text("Adicionar ao Carrinho")').first().click();
    await page.waitForTimeout(1000);
    
    // Clicar no botão flutuante do carrinho para abrir o modal de checkout
    await page.locator('button:has(.lucide-shopping-bag)').first().click();
    await page.waitForTimeout(1000);
    
    // STEP 1: Modal de Checkout (Carrinho)
    // Clica no botão para avançar para as informações do convidado
    await page.click('button:has-text("Continuar")');
    await page.waitForTimeout(1000);

    // STEP 2: Informações do Convidado
    await page.fill('input[placeholder="Digite seu nome completo"]', 'Tio Patinhas');
    await page.fill('input[placeholder="Digite seu e-mail"]', 'tio@patinhas.com');
    await page.fill('input[placeholder="(11) 99999-9999"]', '11999999999');
    
    // Selecionar presença (obrigatório)
    await page.click('label:has-text("Sim, estarei presente")');
    
    // Clica no botão de ir para pagamento
    await page.click('button:has-text("Ir para Pagamento")');
    await page.waitForTimeout(2000);
    
    // STEP 3: Pagamento
    // Usaremos Pix Direto no teste E2E pois o Mercado Pago usa um Iframe (Brick) que não carrega com chave falsa
    await page.click('button:has-text("Pagar com Pix Direto")');
    await page.waitForTimeout(500);
    
    // Agora deve ter ido para o step "manual_pix"
    // Preenche o arquivo de comprovante (dummy)
    await page.setInputFiles('input[type="file"]', {
      name: 'comprovante.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from('fake image data')
    });
    await page.waitForTimeout(500);

    // Clica em "Confirmar Pagamento"
    await page.click('button:has-text("Confirmar Pagamento")');
    
    // Aguardar mensagem de sucesso
    await page.waitForTimeout(3000);
    console.log("Fluxo E2E finalizou o teste com URL:", page.url());
  });
});
