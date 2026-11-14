import { expect, test, type Page } from '@playwright/test';
import { assetByTag, MP1, monitoredAssets } from '@mp1/shared';

/**
 * O painel "Vista 3D" da tela de Mancais: a cena real em tamanho reduzido, com
 * o clique sincronizado com a lista nos dois sentidos.
 */

const DEGRADING = 'MP1-SEC-G4-CS23-MLC';

const selectedRow = (page: Page) => page.locator('[role="row"][aria-selected="true"]');

async function waitForPanelScene(page: Page) {
  const canvas = page.getByRole('region', { name: 'Vista 3D da máquina' }).locator('canvas');
  await expect(canvas).toBeVisible({ timeout: 60_000 });
  await page.waitForFunction(() => Boolean(window.__twin), undefined, { timeout: 60_000 });
  // o voo da câmera leva 1,4 s
  await page.waitForTimeout(2200);
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
});

test('escolher na lista enquadra o mancal na cena', async ({ page }) => {
  await page.goto('/#mancais');
  await expect(selectedRow(page)).toBeVisible({ timeout: 60_000 });
  await waitForPanelScene(page);

  // o pior mancal abre escolhido: o que degrada na simulação
  await expect(selectedRow(page)).toContainText('Cilindro secador 23');

  const second = page.locator('[role="row"][aria-selected="false"]').first();
  const label =
    (await second.locator('[role="cell"]').first().locator('div').first().textContent()) ?? '';
  await second.click();
  await expect(selectedRow(page)).toContainText(label);
  await page.waitForTimeout(2200);

  const tag = (await selectedRow(page).getAttribute('data-asset')) ?? '';
  const point = await page.evaluate((t) => window.__twin?.screenPointOf(t) ?? null, tag);
  expect(point?.onScreen, `${tag} não ficou enquadrado no painel`).toBe(true);
});

test('clicar num mancal na cena escolhe ele na lista', async ({ page }) => {
  await page.goto('/#mancais');
  await expect(selectedRow(page)).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: /mostrar todos/ }).click();
  await waitForPanelScene(page);

  // um mancal vizinho do escolhido que esteja enquadrado no painel
  const candidates = monitoredAssets(MP1)
    .filter((asset) => asset.kind === 'bearing' && asset.tag !== DEGRADING)
    .map((asset) => asset.tag);
  const target = await page.evaluate((tags) => {
    for (const tag of tags) {
      const point = window.__twin?.screenPointOf(tag);
      if (point?.onScreen) return { tag, x: point.x, y: point.y };
    }
    return null;
  }, candidates);

  expect(target, 'nenhum outro mancal enquadrado no painel').not.toBeNull();
  if (!target) return;

  /**
   * O pixel do centro de um mancal pode cair num mancal que está na frente dele
   * — a cena escolhe o que o raio acerta primeiro, que é o certo. Então o teste
   * não exige o mancal mirado: exige que a lista passe para um mancal diferente
   * do anterior, que esse mancal exista no modelo e que a cena o enquadre.
   */
  await page.mouse.click(target.x, target.y);
  await expect(selectedRow(page)).not.toHaveAttribute('data-asset', DEGRADING, { timeout: 10_000 });

  const chosen = (await selectedRow(page).getAttribute('data-asset')) ?? '';
  expect(assetByTag(MP1, chosen)?.kind).toBe('bearing');
  await page.waitForTimeout(2200);
  const point = await page.evaluate((t) => window.__twin?.screenPointOf(t) ?? null, chosen);
  expect(point?.onScreen, `${chosen} não ficou enquadrado no painel`).toBe(true);
});
