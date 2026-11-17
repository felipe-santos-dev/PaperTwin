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
  await page.waitForFunction(() => Boolean(window.__twin), undefined, { timeout: 60_000 });
  // o voo da câmera leva 1,4 s
  await page.waitForTimeout(2200);

  const candidatos = monitoredAssets(MP1)
    .filter((asset) => asset.kind === 'bearing' && asset.tag !== DEGRADANDO)
    .map((asset) => asset.tag);
  const alvo = await page.evaluate((tags) => {
    for (const tag of tags) {
      const ponto = window.__twin?.screenPointOf(tag);
      if (ponto?.onScreen) return { tag, x: ponto.x, y: ponto.y };
    }
    return null;
  }, candidatos);

  expect(alvo, 'nenhum mancal enquadrado no painel').not.toBeNull();
  if (!alvo) return;

  const antes = (await linhaEscolhida(page).getAttribute('data-asset')) ?? '';
  await page.mouse.click(alvo.x, alvo.y);

  /**
   * O pixel do centro de um mancal pode cair num mancal que está na frente
   * dele — a cena escolhe o que o raio acerta primeiro, que é o certo. Então o
   * teste não exige o mancal mirado: exige que a lista tenha passado para outro
   * mancal, e que esse mancal exista no modelo.
   */
  await expect
    .poll(async () => (await linhaEscolhida(page).getAttribute('data-asset')) ?? '', {
      timeout: 20_000,
    })
    .not.toBe(antes);

  const agora = (await linhaEscolhida(page).getAttribute('data-asset')) ?? '';
  expect(assetByTag(MP1, agora)?.kind).toBe('bearing');
});
