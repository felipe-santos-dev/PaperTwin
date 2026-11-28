import { expect, test, type Page } from '@playwright/test';
import { assetByTag, MP1, monitoredAssets } from '@mp1/shared';

/**
 * O painel da máquina na tela de Mancais, nos dois caminhos.
 *
 * O padrão é o mapa 2D, e o que ele garante não é só desenho: abrir Mancais
 * **não baixa o three**. A cena continua a um clique, e aí sim o pedaço vem.
 * Os dois caminhos são testados aqui porque a promessa da fase é essa — a tela
 * ficou leve sem perder o 3D.
 */

const DEGRADANDO = 'MP1-SEC-G4-CS23-MLC';

const linhaEscolhida = (page: Page) => page.locator('[role="row"][aria-selected="true"]');
const mapa = (page: Page) => page.locator('svg[aria-label^="Mapa da máquina"]');
const pontoEscolhido = (page: Page) => mapa(page).locator('g[aria-current="true"]');

/** Os pedidos de script da página, para saber quando o three entra. */
function espiaScripts(page: Page): string[] {
  const urls: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'script') urls.push(request.url());
  });
  return urls;
}

const temThree = (urls: readonly string[]) => urls.some((url) => /\/three-[^/]+\.js$/.test(url));

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
});

test('o mapa é o painel padrão, e o three não vem junto', async ({ page }) => {
  const scripts = espiaScripts(page);

  await page.goto('/#mancais');
  await expect(linhaEscolhida(page)).toBeVisible({ timeout: 60_000 });
  await expect(mapa(page)).toBeVisible();

  // o pior mancal abre escolhido, e o mapa marca o ponto dele
  await expect(linhaEscolhida(page)).toContainText('Cilindro secador 23');
  await expect(pontoEscolhido(page)).toHaveAttribute('aria-label', /Cilindro secador 23/);

  expect(temThree(scripts), 'a tela de Mancais não baixa o three sozinha').toBe(false);
});

test('clicar num ponto do mapa escolhe o mancal na lista', async ({ page }) => {
  await page.goto('/#mancais');
  await expect(linhaEscolhida(page)).toBeVisible({ timeout: 60_000 });

  await mapa(page)
    .getByRole('button', { name: /Cilindro secador 21 · lado comando/ })
    .click();

  await expect(linhaEscolhida(page)).toContainText('Cilindro secador 21');
  await expect(pontoEscolhido(page)).toHaveAttribute('aria-label', /Cilindro secador 21/);
});

test('escolher na lista marca o ponto no mapa', async ({ page }) => {
  await page.goto('/#mancais');
  await expect(linhaEscolhida(page)).toBeVisible({ timeout: 60_000 });

  const outra = page.locator('[role="row"][aria-selected="false"]').first();
  const tag = (await outra.getAttribute('data-asset')) ?? '';
  const nome = assetByTag(MP1, tag)?.label ?? '';
  await outra.click();

  expect(nome, 'a linha devia ter a tag do ativo').not.toBe('');
  await expect(pontoEscolhido(page)).toHaveAttribute(
    'aria-label',
    new RegExp(nome.replace(/^Mancal (LA|LC) · /, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
  );
});

test('"ver em 3D" traz a cena, e é aí que o three é baixado', async ({ page }) => {
  const scripts = espiaScripts(page);

  await page.goto('/#mancais');
  await expect(linhaEscolhida(page)).toBeVisible({ timeout: 60_000 });
  expect(temThree(scripts)).toBe(false);

  await page.getByRole('button', { name: 'ver em 3D' }).click();

  const canvas = page.getByRole('region', { name: 'Máquina · mancais' }).locator('canvas');
  await expect(canvas).toBeVisible({ timeout: 60_000 });
  await page.waitForFunction(() => Boolean(window.__twin), undefined, { timeout: 60_000 });
  expect(temThree(scripts), 'o three vem quando a cena entra').toBe(true);

  // o mapa saiu de cena, e volta pelo mesmo botão
  await expect(mapa(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'ver o mapa' }).click();
  await expect(mapa(page)).toBeVisible();
});

test('na cena, clicar num mancal escolhe ele na lista', async ({ page }) => {
  await page.goto('/#mancais');
  await expect(linhaEscolhida(page)).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: /mostrar todos/ }).click();
  await page.getByRole('button', { name: 'ver em 3D' }).click();

  const canvas = page.getByRole('region', { name: 'Máquina · mancais' }).locator('canvas');
  await expect(canvas).toBeVisible({ timeout: 60_000 });
  /**
   * A coluna rola quando o mancal tem nota sugerida.
   *
   * Com o cartão da Fase 6 entre o detalhe e a cena, a cena pode começar
   * abaixo da dobra — e `screenPointOf` devolve coordenadas de viewport, que só
   * servem para clicar depois que ela está à vista. É o que alguém faria.
   */
  /*
    A cena vai para o **meio** da janela, e nao so para dentro dela.

    Desde a fase 1 a pagina rola inteira, e o painel da cena e mais alto que a
    janela em 1280x720: `scrollIntoViewIfNeeded` traz o topo dele a vista e para
    ai, deixando a faixa onde os mancais aparecem abaixo da dobra. Centralizado,
    o que a camera enquadra e o que esta na tela — e e o que alguem faria antes
    de clicar num mancal.
  */
  await canvas.evaluate((el) => {
    el.scrollIntoView({ block: 'center' });
  });
  await page.waitForFunction(() => Boolean(window.__twin), undefined, { timeout: 60_000 });
  // o voo da câmera leva 1,4 s
  await page.waitForTimeout(2200);

  const candidatos = monitoredAssets(MP1)
    .filter((asset) => asset.kind === 'bearing' && asset.tag !== DEGRADANDO)
    .map((asset) => asset.tag);
  /*
    Dois filtros, e o segundo é novo.

    `onScreen` é sobre a **cena**: ele diz que o mancal cai dentro do recorte da
    câmera (`TestHook`, em NDC). Isso não garante que o pixel esteja na
    **janela** — desde a fase 1 a página rola inteira, e parte do painel pode
    ficar fora da dobra. Clicar fora da janela não acerta nada, e o teste
    esperava vinte segundos por uma seleção que nunca vinha.
  */
  const pontos = await page.evaluate((tags) => {
    const dentro: { tag: string; x: number; y: number }[] = [];
    for (const tag of tags) {
      const ponto = window.__twin?.screenPointOf(tag);
      if (!ponto?.onScreen) continue;
      if (ponto.x <= 0 || ponto.y <= 0) continue;
      if (ponto.x >= window.innerWidth || ponto.y >= window.innerHeight) continue;
      dentro.push({ tag, x: ponto.x, y: ponto.y });
    }
    return dentro;
  }, candidatos);

  expect(pontos.length, 'nenhum mancal enquadrado na janela').toBeGreaterThan(0);

  /**
   * O pixel do centro de um mancal pode cair num mancal que está na frente
   * dele — a cena escolhe o que o raio acerta primeiro, que é o certo. E o que
   * está na frente pode ser justamente o mancal **já escolhido**, e aí a lista
   * não muda e o teste falha por um acerto correto.
   *
   * Então o teste tenta os mancais enquadrados em ordem e para no primeiro que
   * muda a escolha. O que ele afirma continua sendo o que importa: clicar na
   * cena escolhe um mancal na lista, e esse mancal existe no modelo.
   */
  const antes = (await linhaEscolhida(page).getAttribute('data-asset')) ?? '';
  let agora = antes;

  for (const ponto of pontos.slice(0, 8)) {
    await page.mouse.click(ponto.x, ponto.y);
    // o voo da câmera até o mancal escolhido leva 1,4 s
    await page.waitForTimeout(1800);
    agora = (await linhaEscolhida(page).getAttribute('data-asset')) ?? '';
    if (agora !== antes) break;
  }

  expect(agora, 'clicar na cena não mudou o mancal escolhido').not.toBe(antes);
  expect(assetByTag(MP1, agora)?.kind).toBe('bearing');
});
