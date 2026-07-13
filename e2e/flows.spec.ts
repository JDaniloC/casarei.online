import { test, expect, Page } from '@playwright/test';
import { createTestUser, deleteTestUser, loginViaUI, TestUser } from './helpers/testUser';
import { proxyEdgeFunctionsCors } from './helpers/corsProxy';
import {
  clearRecentRsvpRateLimit,
  fetchGuestToken,
  fetchOrderStatuses,
  guestCheckinColumnsExist,
} from './helpers/db';

/**
 * Fluxos ponta-a-ponta pedidos na verificação de 2026-07-13:
 * 1. Chave PIX: noivo cadastra → convidado vê no checkout.
 * 2. Presente: cadastro → compra via pix → confirmação pelo noivo →
 *    indisponibilização (estoque 0 → "Esgotado").
 * 3. Lista de convidados privada: adicionar → RSVP pelo link com token
 *    (confirma e recusa) → visão do noivo com contadores.
 * 4. Tipos de presente: vaquinha (meta + arrecadado via trigger) e
 *    valor livre. (Cotas e compra única já cobertos em store/full-flow.)
 *
 * Observação: NÃO existe funcionalidade de check-in no dia do evento
 * (marcar quem chegou); o produto só tem confirmação prévia de RSVP.
 */

const PIX_KEY = '123.456.789-00';

const createdUsers: TestUser[] = [];

test.afterAll(async () => {
  for (const u of createdUsers) {
    await deleteTestUser(u);
  }
});

/** Cria conta + casamento publicado com chave pix manual. Retorna o slug. */
async function setupWedding(page: Page, prefix: string): Promise<string> {
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

  // Fluxo 1 (lado noivo): cadastra a chave pix manual
  await page.click('button:has-text("Presentes & Pix")');
  await page.waitForTimeout(1000);
  await page.fill('input[id="manualPixKey"]', PIX_KEY);

  await page.click('button:has-text("Salvar e Publicar")');
  await page.waitForTimeout(2500);

  return slug;
}

/** Adiciona um presente pelo dialog do dashboard (já na sub-aba Presentes & Pix). */
async function addGift(
  page: Page,
  opts: { name: string; price?: string; vaquinha?: boolean; openPrice?: boolean }
) {
  await page.click('button:has-text("Adicionar Presente")');
  await page.waitForTimeout(800);

  await page.fill('input[placeholder="Ex: Jogo de Panelas"]', opts.name);
  if (opts.vaquinha) {
    await page.click('label:has-text("É uma Vaquinha?")');
    await page.waitForTimeout(300);
  }
  if (opts.openPrice && !opts.vaquinha) {
    await page.click('label:has-text("Permitir valor livre")');
    await page.waitForTimeout(300);
  }
  if (opts.price) {
    await page.fill('input[placeholder="0.00"]', opts.price);
  }

  await page.click('button:has-text("Salvar Presente")');
  await page.waitForTimeout(1500);
}

/** Do carrinho aberto até confirmar o pagamento via pix manual. */
async function checkoutViaManualPix(page: Page, guestName: string) {
  await page.locator('button:has(.lucide-shopping-bag)').first().click();
  await page.waitForTimeout(1000);

  await page.click('button:has-text("Continuar")');
  await page.waitForTimeout(1000);

  await page.fill('input[placeholder="Digite seu nome completo"]', guestName);
  await page.fill('input[placeholder="Digite seu e-mail"]', 'convidado@e2e.casarei.test');
  await page.fill('input[placeholder="(11) 99999-9999"]', '11999999999');

  // Presença só aparece na visão convite; no link geral foi removida (6f2504c)
  const presence = page.locator('label:has-text("Sim, estarei presente")');
  if (await presence.isVisible().catch(() => false)) {
    await presence.click();
  }

  await page.click('button:has-text("Ir para Pagamento")');
  await page.waitForTimeout(2000);

  // Sem credenciais MP o checkout pula direto para o passo manual_pix
  const pixDirectBtn = page.locator('button:has-text("Pagar com Pix Direto")');
  if (await pixDirectBtn.isVisible().catch(() => false)) {
    await pixDirectBtn.click();
    await page.waitForTimeout(500);
  }

  // Fluxo 1 (lado convidado): a chave pix cadastrada pelo noivo é exibida
  await expect(page.locator('text=Chave PIX dos Noivos')).toBeVisible({ timeout: 10000 });
  await expect(page.locator(`text=${PIX_KEY}`)).toBeVisible();

  await page.click('button:has-text("Confirmar Pagamento")');
  await page.waitForTimeout(3000);
}

/** No dashboard, abre o primeiro pedido pendente e confirma o recebimento. */
async function approveFirstOrder(page: Page) {
  await page.goto('/dashboard');
  await page.waitForTimeout(2500);

  // Aba padrão do Painel Geral já é "Pedidos"; expande o primeiro pedido
  await page.locator('button:has-text("R$")').first().click();
  await page.waitForTimeout(500);

  await page.click('button:has-text("Confirmar Recebimento")');
  await page.waitForTimeout(2000);
  await expect(page.locator('span:has-text("Aprovado")').first()).toBeVisible({ timeout: 10000 });
}

test.describe('Fluxos: pix, presentes, convidados e tipos de presente', () => {
  test('Fluxo 1+2: chave pix visível, compra, confirmação pelo noivo e esgotamento', async ({ page }) => {
    test.setTimeout(150000);

    const slug = await setupWedding(page, 'flow');

    // Noivo cadastra presente de compra única
    await page.click('button:has-text("Presentes & Pix")');
    await page.waitForTimeout(1000);
    await addGift(page, { name: 'Cafeteira E2E', price: '150' });
    await page.click('button:has-text("Salvar e Publicar")');
    await page.waitForTimeout(2500);

    // Convidado vê o presente e compra via pix manual
    await page.goto(`/${slug}`);
    await page.waitForTimeout(2000);
    const card = page
      .locator('div')
      .filter({ has: page.locator('h3', { hasText: 'Cafeteira E2E' }) })
      .last();
    await expect(card).toBeVisible({ timeout: 10000 });
    await card.locator('button:has-text("Adicionar ao Carrinho")').click();
    await page.waitForTimeout(800);

    await checkoutViaManualPix(page, 'Convidado Comprador E2E');

    // Pedido real registrado como pendente
    const pendentes = await fetchOrderStatuses(slug);
    expect(pendentes).toContain('pending');

    // Noivo vê o pedido e confirma o recebimento
    await approveFirstOrder(page);
    const aprovados = await fetchOrderStatuses(slug);
    expect(aprovados).toContain('approved');

    // Noivo indisponibiliza o presente (estoque 0)
    await page.click('button:has-text("Configurar Site")');
    await page.waitForTimeout(1000);
    await page.click('button:has-text("Presentes & Pix")');
    await page.waitForTimeout(1000);

    const giftCard = page.locator('div.group').filter({ hasText: 'Cafeteira E2E' }).first();
    await giftCard.hover();
    await giftCard.locator('button').first().click({ force: true });
    await page.waitForTimeout(800);

    const editDialog = page.locator('[role="dialog"]', { hasText: 'Editar Presente' });
    await editDialog.locator('input[placeholder="Ilimitado"]').fill('0');
    await editDialog.locator('button:has-text("Atualizar Presente")').click();
    await page.waitForTimeout(1000);
    await page.click('button:has-text("Salvar e Publicar")');
    await page.waitForTimeout(2500);

    // Convidado agora vê "Esgotado" — esgotados são ordenados por último e
    // podem cair fora da primeira página; a busca garante que o card apareça
    await page.goto(`/${slug}`);
    await page.waitForTimeout(2000);
    await page.fill('input[placeholder="Buscar presente..."]', 'Cafeteira E2E');
    await page.waitForTimeout(500);
    const soldOutCard = page
      .locator('div')
      .filter({ has: page.locator('h3', { hasText: 'Cafeteira E2E' }) })
      .last();
    await expect(soldOutCard.locator('button:has-text("Esgotado")')).toBeDisabled();
  });

  test('Fluxo 3: lista privada, RSVP por token (confirma/recusa) e visão do noivo', async ({ page }) => {
    test.setTimeout(150000);

    const slug = await setupWedding(page, 'guest');

    // Noivo cria a lista privada de convidados
    await page.click('button:has-text("Convidados")');
    await page.waitForTimeout(1500);

    for (const guestName of ['Família Confirma E2E', 'Família Declina E2E']) {
      await page.fill('input[placeholder="Ex: Sr. e Sra. Silva"]', guestName);
      await page.click('button:has-text("Adicionar Convidado")');
      await page.waitForTimeout(1200);
      await expect(page.locator(`text=${guestName}`).first()).toBeVisible();
    }

    // Evita 429 da submit-rsvp (3 confirmações/IP/10min) em execuções seguidas
    await clearRecentRsvpRateLimit();

    // Convidado 1 confirma presença pelo convite com token
    const token1 = await fetchGuestToken(slug, 'Família Confirma E2E');
    await page.goto(`/${slug}/convite/${token1}`);
    await page.waitForTimeout(2500);

    const nameInput = page.locator('#name');
    await nameInput.scrollIntoViewIfNeeded();
    if (!(await nameInput.inputValue())) {
      await nameInput.fill('Família Confirma E2E');
    }
    const emailInput = page.locator('#email');
    if (await emailInput.isVisible().catch(() => false)) {
      await emailInput.fill('confirma@e2e.casarei.test');
    }
    await page.click('label:has-text("Sim, estarei presente")');
    await page.click('button:has-text("Enviar Confirmação")');
    await expect(
      page.locator('[data-sonner-toast]').filter({ hasText: /sucesso/i }).first()
    ).toBeVisible({ timeout: 10000 });

    // Convidado 2 recusa
    const token2 = await fetchGuestToken(slug, 'Família Declina E2E');
    await page.goto(`/${slug}/convite/${token2}`);
    await page.waitForTimeout(2500);

    const nameInput2 = page.locator('#name');
    await nameInput2.scrollIntoViewIfNeeded();
    if (!(await nameInput2.inputValue())) {
      await nameInput2.fill('Família Declina E2E');
    }
    const emailInput2 = page.locator('#email');
    if (await emailInput2.isVisible().catch(() => false)) {
      await emailInput2.fill('declina@e2e.casarei.test');
    }
    await page.click('label:has-text("Não poderei ir")');
    await page.click('button:has-text("Enviar Confirmação")');
    await expect(
      page.locator('[data-sonner-toast]').filter({ hasText: /sucesso/i }).first()
    ).toBeVisible({ timeout: 10000 });

    // Noivo vê os status e contadores atualizados
    await page.goto('/dashboard');
    await page.waitForTimeout(2000);
    await page.click('button:has-text("Convidados")');
    await page.waitForTimeout(2000);

    // Título exato: a linha também tem botões de ação "Marcar como Confirmado"
    const confirmedRow = page.locator('tr').filter({ hasText: 'Família Confirma E2E' });
    await expect(
      confirmedRow.locator('button[title="Confirmado (Clique para desmarcar)"]')
    ).toBeVisible({ timeout: 10000 });

    const declinedRow = page.locator('tr').filter({ hasText: 'Família Declina E2E' });
    await expect(
      declinedRow.locator('button[title="Não Irá (Clique para confirmar)"]')
    ).toBeVisible();

    // Cards de métricas: 1 confirmado (grupo) e 1 não irá
    const confirmedCard = page
      .locator('div.bg-card')
      .filter({ has: page.locator('span:text-is("Confirmados (Grupos)")') });
    await expect(confirmedCard.locator('p').first()).toHaveText('1');

    const declinedCard = page
      .locator('div.bg-card')
      .filter({ has: page.locator('span:text-is("Não Irão")') });
    await expect(declinedCard.locator('p').first()).toHaveText('1');
  });

  test('Fluxo 3b: check-in no dia do evento (marcar chegada e contar presentes)', async ({ page }) => {
    // Auto-ativa quando a migration 20260713120000_add_guest_checkin for aplicada
    test.skip(
      !(await guestCheckinColumnsExist()),
      'migration 20260713120000_add_guest_checkin ainda não aplicada no banco remoto (npx supabase db push)'
    );
    test.setTimeout(150000);

    const slug = await setupWedding(page, 'checkin');

    // Noivo adiciona convidado e confirma manualmente
    await page.click('button:has-text("Convidados")');
    await page.waitForTimeout(1500);
    await page.fill('input[placeholder="Ex: Sr. e Sra. Silva"]', 'Família Chegada E2E');
    await page.click('button:has-text("Adicionar Convidado")');
    await page.waitForTimeout(1200);
    await page.click('button[title="Pendente (Clique para confirmar)"]');
    await page.waitForTimeout(1200);

    // Sub-aba de check-in: contadores zerados
    await page.click('button:has-text("Check-in do Dia")');
    await page.waitForTimeout(800);
    await expect(page.locator('p', { hasText: 'de 1 confirmados' })).toHaveText(/^0\s*de 1 confirmados$/);
    await expect(page.locator('p', { hasText: 'de 1 esperadas' })).toHaveText(/^0\s*de 1 esperadas$/);

    // Marca a chegada
    await page.click('button:has-text("Marcar chegada")');
    await page.waitForTimeout(1500);
    await expect(page.locator('text=Chegou')).toBeVisible();
    await expect(page.locator('p', { hasText: 'de 1 confirmados' })).toHaveText(/^1\s*de 1 confirmados$/);
    await expect(page.locator('p', { hasText: 'de 1 esperadas' })).toHaveText(/^1\s*de 1 esperadas$/);

    // Persistência: recarrega o dashboard e o check-in continua registrado
    await page.goto('/dashboard');
    await page.waitForTimeout(2000);
    await page.click('button:has-text("Convidados")');
    await page.waitForTimeout(1500);
    await page.click('button:has-text("Check-in do Dia")');
    await page.waitForTimeout(800);
    await expect(page.locator('text=Chegou')).toBeVisible();

    // Desfaz e os contadores voltam
    await page.click('button:has-text("Desfazer")');
    await page.waitForTimeout(1500);
    await expect(page.locator('button:has-text("Marcar chegada")')).toBeVisible();
    await expect(page.locator('p', { hasText: 'de 1 confirmados' })).toHaveText(/^0\s*de 1 confirmados$/);
  });

  test('Fluxo 4: vaquinha com meta (arrecadado via aprovação) e valor livre', async ({ page }) => {
    test.setTimeout(150000);

    const slug = await setupWedding(page, 'tipos');

    await page.click('button:has-text("Presentes & Pix")');
    await page.waitForTimeout(1000);
    await addGift(page, { name: 'Lua de Mel E2E', price: '1000', vaquinha: true });
    await addGift(page, { name: 'Presente Livre E2E', openPrice: true });
    await page.click('button:has-text("Salvar e Publicar")');
    await page.waitForTimeout(2500);

    // Página pública: vaquinha mostra barra de meta; valor livre mostra input
    await page.goto(`/${slug}`);
    await page.waitForTimeout(2000);

    const vaquinhaCard = page
      .locator('div')
      .filter({ has: page.locator('h3', { hasText: 'Lua de Mel E2E' }) })
      .last();
    await expect(vaquinhaCard.locator('text=Arrecadado: R$ 0,00')).toBeVisible({ timeout: 10000 });
    await expect(vaquinhaCard.locator('text=Meta: R$ 1000,00')).toBeVisible();
    await expect(vaquinhaCard.locator('text=Com quanto deseja apoiar essa meta?')).toBeVisible();

    const livreCard = page
      .locator('div')
      .filter({ has: page.locator('h3', { hasText: 'Presente Livre E2E' }) })
      .last();
    await expect(livreCard.locator('text=Quanto deseja contribuir?')).toBeVisible();

    // Convidado apoia a vaquinha com R$ 50
    await vaquinhaCard.locator('input[placeholder="Valor..."]').fill('50');
    await vaquinhaCard.locator('button:has-text("Adicionar ao Carrinho")').click();
    await page.waitForTimeout(800);

    await checkoutViaManualPix(page, 'Apoiador Vaquinha E2E');

    // Noivo aprova → trigger atualiza o arrecadado da vaquinha
    await approveFirstOrder(page);

    await page.goto(`/${slug}`);
    await page.waitForTimeout(2000);
    const vaquinhaAfter = page
      .locator('div')
      .filter({ has: page.locator('h3', { hasText: 'Lua de Mel E2E' }) })
      .last();
    await expect(vaquinhaAfter.locator('text=Arrecadado: R$ 50,00')).toBeVisible({ timeout: 10000 });
  });
});
