import { test, expect, Page } from '@playwright/test';
import { createTestUser, deleteTestUser, loginViaUI, TestUser } from './helpers/testUser';
import { proxyEdgeFunctionsCors } from './helpers/corsProxy';
import { fetchGuestToken, removeStorageByPrefix } from './helpers/db';

/**
 * Cobertura dos fluxos extras verificados em 2026-07-13:
 * 1. Senhas de convite: global (link /convite genérico) e individual (token),
 *    validadas server-side pela edge function verify-passcode.
 * 2. Mural de recados: convidado publica na visão convite, noivo modera
 *    (ocultar/aprovar) no Painel Geral.
 * 3. Abandono de checkout: fechar o modal na etapa de dados registra o
 *    abandono, visível na aba Abandonos.
 * 4. QR Code do pix: upload no dashboard (bucket wedding-assets) e exibição
 *    no passo de pagamento manual do convidado.
 */

// PNG 1x1 transparente para uploads de teste
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

const createdUsers: TestUser[] = [];

test.afterAll(async () => {
  for (const u of createdUsers) {
    await deleteTestUser(u);
  }
});

/** Cria conta + casamento publicado. Retorna o slug e o usuário. */
async function setupWedding(page: Page, prefix: string): Promise<{ slug: string; user: TestUser }> {
  const slug = `casal-${prefix}-${Date.now()}-${Math.floor(Math.random() * 9999)}`;

  await proxyEdgeFunctionsCors(page);
  await page.route('**/functions/v1/validate-mercadopago', (route) =>
    route.fulfill({ json: { valid: true, isTestMode: true } })
  );
  await page.route('**/functions/v1/save-mp-credentials', (route) =>
    route.fulfill({ json: { success: true } })
  );

  const user = await createTestUser(`Casal ${prefix} E2E`, prefix);
  createdUsers.push(user);
  await loginViaUI(page, user);
  await page.waitForTimeout(2000);

  await page.click('button:has-text("Configurar Site")');
  await page.waitForTimeout(1000);
  await page.fill('input[id="coupleName"]', slug);

  await page.click('button:has-text("Presentes & Pix")');
  await page.waitForTimeout(1000);
  await page.fill('input[id="manualPixKey"]', '123.456.789-00');

  await page.click('button:has-text("Salvar e Publicar")');
  await page.waitForTimeout(2500);

  return { slug, user };
}

test.describe('Extras: senhas, mural, abandono e QR do pix', () => {
  test('Senha global e senha individual protegem o convite (verify-passcode)', async ({ page }) => {
    test.setTimeout(150000);

    const { slug } = await setupWedding(page, 'pass');

    // Noivo define a senha global e um convidado com senha individual
    await page.click('button:has-text("Convidados")');
    await page.waitForTimeout(1500);
    await page.fill('input[placeholder="Ex: noivos2026"]', 'segredo123');
    await page.fill('input[placeholder="Ex: Sr. e Sra. Silva"]', 'Convidado Senha E2E');
    await page.fill('input[placeholder="Deixe em branco para sem senha"]', 'chave456');
    await page.click('button:has-text("Adicionar Convidado")');
    await page.waitForTimeout(1200);
    await page.click('button:has-text("Salvar e Publicar")');
    await page.waitForTimeout(2500);

    // Link genérico /convite: gate global
    await page.goto(`/${slug}/convite`);
    await expect(page.locator('text=Convite Protegido')).toBeVisible({ timeout: 15000 });

    await page.fill('input[placeholder="Digite a senha"]', 'senha-errada');
    await page.click('button:has-text("Acessar Convite")');
    await expect(
      page.locator('[data-sonner-toast]').filter({ hasText: /senha incorreta/i }).first()
    ).toBeVisible({ timeout: 10000 });

    await page.fill('input[placeholder="Digite a senha"]', 'segredo123');
    await page.click('button:has-text("Acessar Convite")');
    await expect(page.locator('#rsvp')).toBeVisible({ timeout: 15000 });

    // Convite individual por token: gate com a senha do convidado
    const token = await fetchGuestToken(slug, 'Convidado Senha E2E');
    await page.goto(`/${slug}/convite/${token}`);
    await expect(page.locator('text=Convite Protegido')).toBeVisible({ timeout: 15000 });

    // A senha global NÃO deve abrir o convite individual
    await page.fill('input[placeholder="Digite a senha"]', 'segredo123');
    await page.click('button:has-text("Acessar Convite")');
    await expect(
      page.locator('[data-sonner-toast]').filter({ hasText: /senha incorreta/i }).first()
    ).toBeVisible({ timeout: 10000 });

    await page.fill('input[placeholder="Digite a senha"]', 'chave456');
    await page.click('button:has-text("Acessar Convite")');
    await expect(page.locator('#rsvp')).toBeVisible({ timeout: 15000 });
  });

  test('Mural de recados: convidado publica e noivo modera', async ({ page }) => {
    test.setTimeout(150000);

    const { slug } = await setupWedding(page, 'mural');

    // Convidado deixa mensagem na visão convite
    await page.goto(`/${slug}/convite`);
    await page.waitForTimeout(2500);
    await page.fill('#messageName', 'Amigo Mural E2E');
    await page.fill('#messageEmail', 'mural@e2e.casarei.test');
    await page.fill('#messageText', 'Felicidades ao casal! Que dia lindo.');
    await page.click('button:has-text("Enviar Mensagem")');
    await expect(
      page.locator('[data-sonner-toast]').filter({ hasText: /sucesso/i }).first()
    ).toBeVisible({ timeout: 10000 });

    // Mensagem persiste no mural após recarregar
    await page.reload();
    await page.waitForTimeout(2500);
    await expect(page.locator('text=Amigo Mural E2E').first()).toBeVisible({ timeout: 10000 });

    // Noivo vê a mensagem no Painel Geral e a oculta do mural
    await page.goto('/dashboard');
    await page.waitForTimeout(2500);
    await page.click('button:has-text("Mensagens")');
    await page.waitForTimeout(1000);
    await expect(page.locator('text=Amigo Mural E2E')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=No mural').first()).toBeVisible();
    await page.click('button:has-text("Ocultar do Mural")');
    await page.waitForTimeout(1500);
    await expect(page.locator('text=Oculta').first()).toBeVisible();

    // Mensagem some do mural público
    await page.goto(`/${slug}/convite`);
    await page.waitForTimeout(2500);
    await expect(page.locator('text=Amigo Mural E2E')).toHaveCount(0);
  });

  test('Abandono de checkout é registrado e aparece na aba Abandonos', async ({ page }) => {
    test.setTimeout(150000);

    const { slug } = await setupWedding(page, 'aband');

    // Convidado adiciona presente, preenche os dados e desiste
    await page.goto(`/${slug}`);
    await page.waitForTimeout(2000);
    await page.locator('button:has-text("Adicionar ao Carrinho")').first().click();
    await page.waitForTimeout(800);
    await page.locator('button:has(.lucide-shopping-bag)').first().click();
    await page.waitForTimeout(1000);
    await page.click('button:has-text("Continuar")');
    await page.waitForTimeout(1000);
    await page.fill('input[placeholder="Digite seu nome completo"]', 'Desistente E2E');
    await page.fill('input[placeholder="Digite seu e-mail"]', 'desiste@e2e.casarei.test');

    // Fecha o modal na etapa de dados → registra o abandono.
    // O checkout é um overlay custom (sem suporte a Escape): fechar pelo X.
    await page.locator('div.fixed button:has(.lucide-x)').first().click();
    await page.waitForTimeout(2000);

    // Noivo vê o abandono no Painel Geral
    await page.goto('/dashboard');
    await page.waitForTimeout(2500);
    await page.click('button:has-text("Abandonos")');
    await page.waitForTimeout(1000);
    await expect(page.locator('text=Desistente E2E')).toBeVisible({ timeout: 10000 });
  });

  test('QR Code do pix: upload no dashboard e exibição no checkout do convidado', async ({ page }) => {
    test.setTimeout(150000);

    const { slug, user } = await setupWedding(page, 'qr');

    try {
      // Noivo envia a imagem do QR na sub-aba Presentes & Pix
      await page.click('button:has-text("Presentes & Pix")');
      await page.waitForTimeout(1000);
      const qrInput = page.locator(
        'div:has(> label:has-text("QR Code da Chave PIX")) input[type="file"]'
      );
      await qrInput.setInputFiles({
        name: 'qr-pix.png',
        mimeType: 'image/png',
        buffer: TINY_PNG,
      });
      await expect(
        page.locator('text=Imagem do QR Code enviada com sucesso!').first()
      ).toBeVisible({ timeout: 15000 });
      await page.click('button:has-text("Salvar e Publicar")');
      await page.waitForTimeout(2500);

      // Convidado chega ao passo de pagamento manual e vê o QR
      await page.goto(`/${slug}`);
      await page.waitForTimeout(2000);
      await page.locator('button:has-text("Adicionar ao Carrinho")').first().click();
      await page.waitForTimeout(800);
      await page.locator('button:has(.lucide-shopping-bag)').first().click();
      await page.waitForTimeout(1000);
      await page.click('button:has-text("Continuar")');
      await page.waitForTimeout(1000);
      await page.fill('input[placeholder="Digite seu nome completo"]', 'Pagador QR E2E');
      await page.fill('input[placeholder="Digite seu e-mail"]', 'qr@e2e.casarei.test');
      await page.fill('input[placeholder="(11) 99999-9999"]', '11999999999');
      const presence = page.locator('label:has-text("Sim, estarei presente")');
      if (await presence.isVisible().catch(() => false)) {
        await presence.click();
      }
      await page.click('button:has-text("Ir para Pagamento")');
      await page.waitForTimeout(2000);
      const pixDirectBtn = page.locator('button:has-text("Pagar com Pix Direto")');
      if (await pixDirectBtn.isVisible().catch(() => false)) {
        await pixDirectBtn.click();
        await page.waitForTimeout(500);
      }

      const qrImage = page.locator('img[alt="QR Code da Chave PIX"]');
      await expect(qrImage).toBeVisible({ timeout: 10000 });
      expect(await qrImage.getAttribute('src')).toContain('wedding-assets');
    } finally {
      // Remove a imagem enviada (o delete do usuário não limpa o storage)
      await removeStorageByPrefix('wedding-assets', `${user.id}-qr-`);
    }
  });
});
