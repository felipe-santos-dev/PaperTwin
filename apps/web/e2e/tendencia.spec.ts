import { expect, test, type Page } from '@playwright/test';

/**
 * A Tendência tem de desenhar, qualquer que seja a origem da série.
 *
 * A Fase 3 criou duas famílias de TAG que não ocupam linha no historiador: a
 * **autônoma**, que é função pura de (semente, passo, canal), e a **calculada
 * na leitura**, que é conta sobre quem já grava. A rota resolve as duas por
 * reconstrução, e a tela não deveria saber de onde a série veio — um gráfico
 * que desenha diferente conforme a origem é um gráfico que ensina a
 * desconfiar do dado certo.
 *
 * O teste roda no modo de demonstração de propósito: é onde o buraco estava.
 * O instantâneo só gravava a tendência de quem arquiva, então justamente as
 * duas famílias novas abriam vazias — e é assim que quase todo mundo vê o
 * projeto.
 */

/** Uma de cada família, as três no preparo. */
const CASOS = [
  { tag: 'FIC-105', familia: 'arquivada' },
  { tag: 'JI-111', familia: 'autônoma' },
  { tag: 'XI-161', familia: 'calculada na leitura' },
] as const;

const tendencia = (page: Page) => page.getByRole('region', { name: 'Tendência' });

async function soComAsTres(page: Page): Promise<void> {
  await page.goto('/#processo');
  await expect(tendencia(page)).toBeVisible({ timeout: 60_000 });

  /**
   * Esvazia o que a tela escolheu sozinha, menos o que já serve.
   *
   * Um por vez, relendo a lista a cada volta: o clique redesenha o cabeçalho, e
   * um instantâneo dos botões feito antes do primeiro clique já está velho no
   * segundo.
   */
  for (let volta = 0; volta < 6; volta += 1) {
    const rótulos = await tendencia(page)
      .getByRole('button', { name: /^Tirar / })
      .evaluateAll((nós) => nós.map((nó) => nó.getAttribute('aria-label') ?? ''));
    const sobra = rótulos.find((rótulo) => !CASOS.some((caso) => rótulo.includes(caso.tag)));
    if (sobra === undefined) break;
    await tendencia(page).getByRole('button', { name: sobra, exact: true }).click();
  }

  for (const caso of CASOS) {
    const chip = tendencia(page).getByRole('button', { name: `Tirar ${caso.tag} da tendência` });
    if ((await chip.count()) > 0) continue;
    await tendencia(page).getByRole('button', { name: '+ TAG' }).click();
    await tendencia(page).getByLabel('TAG para a tendência').selectOption(caso.tag);
  }
}

test('desenha arquivada, autônoma e calculada na leitura', async ({ page }) => {
  await page.route('**://127.0.0.1:3333/**', (route) => route.abort());
  await soComAsTres(page);

  for (const caso of CASOS) {
    const svg = tendencia(page).locator(`svg[aria-label="Tendência de ${caso.tag}"]`);
    await expect(svg, `${caso.tag} (${caso.familia}) não tem gráfico`).toBeVisible({
      timeout: 60_000,
    });

    // um desenho de verdade: a linha tem mais de um ponto
    const d = await svg.locator('path').first().getAttribute('d');
    expect(
      (d ?? '').match(/L/g)?.length ?? 0,
      `${caso.tag}: a linha tem um ponto só`,
    ).toBeGreaterThan(1);

    // e a faixa tem altura: um painel espremido a zero não mostra nada
    const caixa = await svg.boundingBox();
    expect(caixa?.height ?? 0, `${caso.tag}: a faixa ficou sem altura`).toBeGreaterThan(30);
  }

  await expect(tendencia(page).getByText('sem série na janela')).toHaveCount(0);
});

/**
 * As TAGs escolhidas moram no cabeçalho, com os botões de janela.
 *
 * No corpo elas comiam uma linha inteira da área que é o painel: o gráfico.
 * E no cabeçalho elas têm de caber numa linha só — duas linhas devolveriam ao
 * gráfico metade do que a mudança lhe deu.
 */
const UMA_LINHA = 32;

for (const [largura, altura] of [
  [1920, 1080],
  [1440, 900],
] as const) {
  test(`em ${String(largura)}, as TAGs e o "+ TAG" cabem na linha do título`, async ({ page }) => {
    await page.setViewportSize({ width: largura, height: altura });
    await page.route('**://127.0.0.1:3333/**', (route) => route.abort());
    await page.goto('/#processo');

    const cabeçalho = tendencia(page).locator('header');
    await expect(cabeçalho).toBeVisible({ timeout: 60_000 });

    await expect(cabeçalho.getByRole('button', { name: /^Tirar / }).first()).toBeVisible();
    await expect(cabeçalho.getByRole('button', { name: '+ TAG' })).toBeVisible();
    await expect(cabeçalho.getByRole('group', { name: 'Janela da tendência' })).toBeVisible();

    const caixa = await cabeçalho.boundingBox();
    expect(caixa?.height ?? 99, 'o cabeçalho quebrou em duas linhas').toBeLessThanOrEqual(
      UMA_LINHA,
    );

    // e nada disso vaza para fora do painel
    const painel = await tendencia(page).boundingBox();
    expect(caixa?.width ?? 0).toBeLessThanOrEqual((painel?.width ?? 0) + 1);
  });
}

/**
 * O que não cabe vira "+N", e o "+N" abre a lista.
 *
 * Esconder uma TAG sem dizer que ela existe seria pior do que a segunda linha:
 * o gráfico dela continua desenhado embaixo, e o cabeçalho estaria mentindo
 * sobre o que está na tela.
 */
test('as TAGs que não cabem viram "+N", e o "+N" abre a lista', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route('**://127.0.0.1:3333/**', (route) => route.abort());
  await page.goto('/#processo');

  const cabeçalho = tendencia(page).locator('header');
  await expect(cabeçalho).toBeVisible({ timeout: 60_000 });

  // os gráficos primeiro: é com eles que a contagem do cabeçalho tem de bater
  await expect(tendencia(page).locator('svg[aria-label^="Tendência de"]').first()).toBeVisible({
    timeout: 60_000,
  });

  const mais = cabeçalho.getByRole('button', { name: /^Mais \d+ TAG/ });
  await expect(mais).toBeVisible();

  const naLinha = await cabeçalho.getByRole('button', { name: /^Tirar / }).count();
  await mais.click();

  const lista = page.getByRole('dialog', { name: 'TAGs da tendência' });
  await expect(lista).toBeVisible();
  expect(await lista.getByRole('button', { name: /^Tirar / }).count()).toBeGreaterThan(0);

  // a soma bate: o que está na linha mais o que está na lista é o que o gráfico desenha
  const escondidas = await lista.getByRole('button', { name: /^Tirar / }).count();
  const gráficos = await tendencia(page).locator('svg[aria-label^="Tendência de"]').count();
  expect(naLinha + escondidas).toBe(gráficos);
});

/**
 * Em 1920 cabem todas, e aí o "+N" não deve existir.
 *
 * Um "+0" ou um botão vazio na tela larga seria o sintoma de a conta estar
 * chutando em vez de medir.
 */
test('em 1920 não sobra "+N": todas cabem', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.route('**://127.0.0.1:3333/**', (route) => route.abort());
  await page.goto('/#processo');

  const cabeçalho = tendencia(page).locator('header');
  await expect(cabeçalho.getByRole('button', { name: '+ TAG' })).toBeVisible({ timeout: 60_000 });
  await expect(tendencia(page).locator('svg[aria-label^="Tendência de"]').first()).toBeVisible({
    timeout: 60_000,
  });

  await expect(cabeçalho.getByRole('button', { name: /^Mais \d+ TAG/ })).toHaveCount(0);

  const naLinha = await cabeçalho.getByRole('button', { name: /^Tirar / }).count();
  const gráficos = await tendencia(page).locator('svg[aria-label^="Tendência de"]').count();
  expect(naLinha).toBe(gráficos);
});

/**
 * A coluna SP mostrava "–" em toda malha, inclusive nas que têm setpoint.
 *
 * Era falta de dado na API: a rota de valores mandava `setpoint: null` fixo,
 * sem perguntar ao motor — que sabe, inclusive o que a cascata escreve na
 * escrava.
 */
test('a coluna SP traz o setpoint das malhas', async ({ page }) => {
  await page.route('**://127.0.0.1:3333/**', (route) => route.abort());
  await page.goto('/#processo');

  const tabela = page.getByRole('table', { name: /Variáveis de/ });
  await expect(tabela).toBeVisible({ timeout: 60_000 });

  const linha = tabela.getByRole('row').filter({ hasText: 'FIC-105' }).first();
  const células = linha.getByRole('cell');
  // Variável · Faixa · PV · SP · Malha · Última 1 h
  await expect(células.nth(3)).toHaveText(/\d/);

  const setpoint = page.getByRole('region', { name: 'Alteração de setpoint' });
  await expect(setpoint.getByText('SP atual').locator('..')).toHaveText(/\d/);
});
