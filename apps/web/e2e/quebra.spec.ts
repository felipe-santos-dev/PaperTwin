import { expect, test, type Page } from '@playwright/test';

/**
 * O replay de quebra, pelos caminhos reais até ele.
 *
 * A tela não está na barra lateral de propósito: ela só existe dentro de uma
 * quebra. Então o que precisa ser testado no navegador não é só que ela
 * desenha — é que **dá para chegar nela** a partir de onde uma quebra aparece.
 */

const linha = (page: Page) => page.getByRole('region', { name: 'Os 10 min antes da quebra' });
const variaveis = (page: Page) => page.getByRole('region', { name: 'O que se mexeu' });

test.beforeEach(async ({ page }) => {
  // o instantâneo tem uma quebra; a API ao vivo pode ter outra, e as duas servem
  await page.route('**://127.0.0.1:3333/**', (route) => route.abort());
});

test('a URL abre o replay da quebra mais recente', async ({ page }) => {
  await page.goto('/#quebra');

  await expect(linha(page)).toBeVisible({ timeout: 60_000 });
  await expect(linha(page).getByText(/Primeiro desvio:|Nenhuma das variáveis/)).toBeVisible();
});

test('a lista está na ordem em que as variáveis saíram do normal', async ({ page }) => {
  await page.goto('/#quebra');
  await expect(variaveis(page)).toBeVisible({ timeout: 60_000 });

  const linhas = variaveis(page).locator('ol > li');
  const quantas = await linhas.count();
  test.skip(quantas === 0, 'esta quebra não teve desvio para ordenar');

  /** O tempo de antecedência de cada linha, do texto `9,5 min` / `47 s`. */
  const antecedências: number[] = [];
  for (let i = 0; i < quantas; i += 1) {
    const texto = (await linhas.nth(i).innerText()).split('\n')[0] ?? '';
    const casado = /^(\d+(?:,\d+)?)\s*(s|min)/.exec(texto.trim());
    expect(casado, `linha ${String(i)} sem tempo: ${texto}`).not.toBeNull();
    const valor = Number((casado?.[1] ?? '0').replace(',', '.'));
    antecedências.push(casado?.[2] === 'min' ? valor * 60 : valor);
  }

  // do mais antigo para o mais recente: a antecedência só diminui
  const ordenadas = [...antecedências].sort((a, b) => b - a);
  expect(antecedências).toEqual(ordenadas);
});

/**
 * A reprodução é o que a tela tem de diferente de um gráfico parado.
 */
test('reproduzir anda com o cursor', async ({ page }) => {
  await page.goto('/#quebra');
  await expect(linha(page)).toBeVisible({ timeout: 60_000 });

  const cursor = linha(page).getByLabel('Instante do replay');
  await cursor.fill('0');
  expect(Number(await cursor.inputValue())).toBe(0);

  await linha(page).getByRole('button', { name: 'Reproduzir o replay' }).click();
  await expect(linha(page).getByRole('button', { name: 'Pausar o replay' })).toBeVisible();

  await expect
    .poll(async () => Number(await cursor.inputValue()), { timeout: 15_000 })
    .toBeGreaterThan(0);

  await linha(page).getByRole('button', { name: 'Pausar o replay' }).click();
  const parado = Number(await cursor.inputValue());
  await page.waitForTimeout(800);
  expect(Number(await cursor.inputValue())).toBe(parado);
});

test('o mapa marca a seção da quebra', async ({ page }) => {
  await page.goto('/#quebra');

  const local = page.getByRole('region', { name: 'Onde, e o que já aconteceu ali' });
  await expect(local).toBeVisible({ timeout: 60_000 });
  await expect(local.locator('g[aria-label="Seção da quebra"]')).toHaveCount(1);
});

/**
 * O caminho de Bobinas: é lá que alguém está quando percebe que uma bobina
 * terminou mais curta do que devia.
 */
test('de Bobinas se chega ao replay', async ({ page }) => {
  await page.goto('/#bobinas');

  const lista = page.getByRole('region', { name: /Bobinas/ }).first();
  await expect(lista).toBeVisible({ timeout: 60_000 });

  const atalho = lista.getByRole('button', { name: /replay$/ }).first();
  test.skip((await atalho.count()) === 0, 'o instantâneo não tem quebra no período das bobinas');

  await atalho.click();
  await expect(page).toHaveURL(/#quebra$/);
  await expect(linha(page)).toBeVisible({ timeout: 60_000 });
});

/**
 * A busca é o caminho de teclado para a tela sem tecla.
 */
test('a busca acha a tela de replay', async ({ page }) => {
  await page.goto('/#turno');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60_000 });

  /*
    `/` abre a busca.

    Na largura padrão do `Desktop Chrome` (1280 px) o campo não fica na linha do
    topo: abaixo de 1500 px ele vira o botão da lupa e abre numa faixa sob a
    barra. A tecla abre do mesmo jeito, e é o caminho de teclado que este teste
    descreve.
  */
  await page.keyboard.press('/');
  await page.getByRole('combobox', { name: /Buscar/ }).fill('replay');
  await page
    .getByRole('option', { name: /Replay de quebra/ })
    .first()
    .click();

  await expect(page).toHaveURL(/#quebra$/);
});
