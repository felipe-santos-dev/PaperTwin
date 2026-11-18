import { expect, test, type Page } from '@playwright/test';

/**
 * O "e se" nos dois caminhos: com API e sem ela.
 *
 * O que só o navegador prova é que o segundo caminho existe de verdade. No
 * modo de demonstração não há servidor para calcular: o estado do motor vem do
 * instantâneo e a conta roda num Web Worker, com o mesmo núcleo. Um teste de
 * unidade não pegaria um worker que não carrega, um import que o empacotador
 * pôs no lugar errado ou um `BASE_URL` que não acha o `sim-state.json`.
 */

const painel = (page: Page) => page.getByRole('region', { name: 'Simular antes de aplicar' });

/** Pede a previsão de um aumento na velocidade da máquina. */
async function simular(page: Page): Promise<void> {
  await page.goto('/#processo');
  await expect(painel(page)).toBeVisible({ timeout: 60_000 });
  await painel(page).getByRole('button', { name: 'Velocidade da máquina' }).click();
}

test('com a API no ar, a previsão vem do servidor', async ({ page, request }) => {
  /**
   * O Playwright reaproveita uma API que já esteja na porta (fora do CI).
   *
   * Se essa API for de um build anterior a esta fase, ela não tem a rota, e o
   * teste estaria medindo a idade do processo em vez do código. Melhor pular
   * dizendo isso do que falhar sem explicar — no CI a API sobe do zero e o
   * teste roda de verdade.
   */
  const sonda = await request.post('http://127.0.0.1:3333/process/what-if', {
    data: { changes: [{ tag: 'AIC-902', value: 77 }], horizonS: 60 },
    failOnStatusCode: false,
  });
  test.skip(
    sonda.status() === 404,
    'a API na porta 3333 é de um build sem a rota /process/what-if; reinicie `npm run dev:api`',
  );

  const chamadas: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/process/what-if')) chamadas.push(request.method());
  });

  await simular(page);

  // a frase gerada dos números é o que diz que a previsão chegou
  await expect(painel(page).getByText(/sobe|cai/)).toBeVisible({ timeout: 60_000 });
  expect(chamadas, 'a rota POST foi chamada').toContain('POST');

  // e as duas curvas estão desenhadas
  const curvas = painel(page).locator('svg[aria-label^="Previsão de"]');
  expect(await curvas.count()).toBeGreaterThan(0);
});

test('sem API, a mesma previsão roda no navegador', async ({ page }) => {
  const baixados: string[] = [];
  page.on('response', (response) => {
    const url = response.url();
    if (url.includes('sim-state.json') || url.includes('whatif-worker')) baixados.push(url);
  });

  // a API some: a aplicação cai para o instantâneo, como no GitHub Pages
  await page.route('**://127.0.0.1:3333/**', (route) => route.abort());

  await simular(page);

  await expect(painel(page).getByText(/sobe|cai/)).toBeVisible({ timeout: 60_000 });
  expect(
    baixados.some((url) => url.includes('sim-state.json')),
    'o estado do motor veio do instantâneo',
  ).toBe(true);
  expect(
    baixados.some((url) => url.includes('whatif-worker')),
    'o pedaço do worker foi baixado',
  ).toBe(true);
});

test('o pedaço do worker não entra no carregamento inicial', async ({ page }) => {
  const scripts: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'script') scripts.push(request.url());
  });

  await page.goto('/#turno');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });

  expect(
    scripts.filter((url) => /whatif-worker/.test(url)),
    'o motor só é baixado quando alguém simula',
  ).toEqual([]);
});
