import type { Page } from '@playwright/test';

/**
 * As edge functions em produção respondem CORS apenas para
 * https://casarei.online (secret ALLOWED_ORIGIN). Rodando o app em
 * http://localhost:8080, o browser bloqueia todas as chamadas — a página
 * pública nem carrega.
 *
 * Este proxy intercepta as rotas de `functions/v1` e refaz a requisição fora
 * do browser (via route.fetch, sem enforcement de CORS), devolvendo a resposta
 * REAL da função com cabeçalhos permissivos. Nada é mockado aqui.
 *
 * Importante: registre este proxy ANTES de mocks específicos de função
 * (page.route posterior tem precedência no Playwright).
 */
export async function proxyEdgeFunctionsCors(page: Page): Promise<void> {
  await page.route('**/functions/v1/**', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        },
        body: '',
      });
    }
    const response = await route.fetch();
    return route.fulfill({
      response,
      headers: { ...response.headers(), 'access-control-allow-origin': '*' },
    });
  });
}
