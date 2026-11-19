import { expect, test, type Page } from '@playwright/test';

/**
 * A tela de Simulação nos dois caminhos: com API e sem ela.
 *
 * O que só o navegador prova é que o segundo caminho existe de verdade. No
 * modo de demonstração não há servidor para calcular: o estado do motor vem do
 * instantâneo e a conta roda num Web Worker, com o mesmo núcleo. Um teste de
 * unidade não pegaria um worker que não carrega, um import que o empacotador
 * pôs no lugar errado ou um `BASE_URL` que não acha o `sim-state.json`.
 */

const curvas = (page: Page) => page.getByRole('region', { name: 'Resposta prevista' });

test('a tecla 9 abre a Simulação já com uma previsão, sem clique nenhum', async ({ page }) => {
  await page.route('**://127.0.0.1:3333/**', (route) => route.abort());
  await page.goto('/#turno');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60_000 });

  await page.keyboard.press('9');

  await expect(page).toHaveURL(/#simulacao$/);
  await expect(curvas(page).getByText(/sobe|cai/)).toBeVisible({ timeout: 60_000 });
  // e não existe botão de disparar a conta: ela sai sozinha
  await expect(page.getByRole('button', { name: /^Simular$/ })).toHaveCount(0);
});

test('com a API no ar, a previsão vem do servidor', async ({ page }) => {
  const resposta = await page.request
    .post('http://127.0.0.1:3333/process/what-if', {
      data: { changes: [{ tag: 'SIC-1104', value: 1260 }], horizonS: 60, mode: 'auto' },
      failOnStatusCode: false,
    })
    .catch(() => null);

  test.skip(
    resposta === null || resposta.status() === 404,
    'a API em pé não tem POST /process/what-if: suba `npm run dev:api` deste commit',
  );

  const chamadas: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/process/what-if')) chamadas.push(request.method());
  });

  await page.goto('/#simulacao');
  await expect(curvas(page).getByText(/sobe|cai/)).toBeVisible({ timeout: 60_000 });

  expect(chamadas, 'a rota POST foi chamada').toContain('POST');
  expect(await curvas(page).locator('svg[aria-label^="Previsão de"]').count()).toBeGreaterThan(0);
});

test('sem API, a mesma previsão roda no navegador', async ({ page }) => {
  const baixados: string[] = [];
  page.on('response', (response) => {
    const url = response.url();
    if (url.includes('sim-state.json') || url.includes('whatif-worker')) baixados.push(url);
  });

  // a API some: a aplicação cai para o instantâneo, como no GitHub Pages
  await page.route('**://127.0.0.1:3333/**', (route) => route.abort());

  await page.goto('/#simulacao');
  await expect(curvas(page).getByText(/sobe|cai/)).toBeVisible({ timeout: 60_000 });

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

/**
 * A ida e a volta entre as duas telas.
 *
 * É o caminho inteiro da feature: da malha que se quer mexer para a previsão,
 * e da previsão de volta para o único lugar que escreve. Se uma das duas
 * pontas se perder, a tela de Simulação vira um brinquedo separado do processo.
 */
test('"Simular esta malha" leva a malha, e "Aplicar no processo" traz o valor', async ({
  page,
}) => {
  await page.route('**://127.0.0.1:3333/**', (route) => route.abort());
  await page.goto('/#processo');

  const setpoint = page.getByRole('region', { name: 'Alteração de setpoint' });
  await expect(setpoint).toBeVisible({ timeout: 60_000 });
  const malha = await setpoint.getByRole('combobox').first().inputValue();

  await setpoint.getByRole('button', { name: 'Simular esta malha' }).click();

  await expect(page).toHaveURL(/#simulacao$/);
  const entrada = page.getByRole('region', { name: 'O que mexer' });
  await expect(entrada.getByLabel('Malha', { exact: true })).toHaveValue(malha);
  await expect(curvas(page).getByText(/sobe|cai|não move/)).toBeVisible({ timeout: 60_000 });

  const proposto = await entrada.getByLabel(`Novo valor de ${malha}`).inputValue();
  await entrada.getByRole('button', { name: 'Aplicar no processo' }).click();

  await expect(page).toHaveURL(/#processo$/);
  const volta = page.getByRole('region', { name: 'Alteração de setpoint' });
  await expect(volta).toBeVisible({ timeout: 60_000 });
  await expect(volta.getByLabel('Novo SP')).toHaveValue(proposto);
});
