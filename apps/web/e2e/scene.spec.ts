import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';
import { assetByTag, MP1 } from '@mp1/shared';

/**
 * A cena só quebra de verdade no navegador: um material descartado cedo demais,
 * uma geometria sem índice ou um chunk que não carrega não aparecem no `tsc`
 * nem no Vitest. Estes testes rodam contra o build de produção.
 */

/** Ruído conhecido do ambiente, que não indica defeito na aplicação. */
const IGNORED = [/Download the React DevTools/i, /favicon/i];

function collectProblems(page: Page): { errors: string[]; failures: string[] } {
  const errors: string[] = [];
  const failures: string[] = [];

  page.on('console', (message: ConsoleMessage) => {
    if (message.type() !== 'error' && message.type() !== 'warning') return;
    const text = message.text();
    if (IGNORED.some((pattern) => pattern.test(text))) return;
    errors.push(`[${message.type()}] ${text}`);
  });

  page.on('pageerror', (error) => {
    errors.push(`[pageerror] ${error.message}`);
  });

  page.on('requestfailed', (request) => {
    failures.push(`${request.method()} ${request.url()}`);
  });

  return { errors, failures };
}

/** Espera a cena sair do estado de carregamento e começar a desenhar. */
async function waitForScene(page: Page) {
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible({ timeout: 60_000 });

  // o canvas existe antes de ter conteúdo; espera um quadro de verdade
  await page.waitForFunction(
    () => {
      const element = document.querySelector('canvas');
      return element !== null && element.width > 0 && element.height > 0;
    },
    undefined,
    { timeout: 60_000 },
  );

  return canvas;
}

test.describe('cena 3D', () => {
  test('carrega sem erro no console e sem requisição falha', async ({ page }) => {
    const { errors, failures } = collectProblems(page);

    await page.goto('/');
    await waitForScene(page);
    await page.waitForTimeout(2500);

    expect(errors, 'console limpo').toEqual([]);
    expect(failures, 'nenhuma requisição falha').toEqual([]);
  });

  test('não baixa o three.js antes da cena entrar', async ({ page }) => {
    const scripts: string[] = [];
    page.on('request', (request) => {
      if (request.resourceType() === 'script') scripts.push(request.url());
    });

    await page.goto('/');
    await waitForScene(page);

    // o pedaço do three existe, mas não pode estar entre os primeiros scripts:
    // o index e o react vêm antes dele.
    const three = scripts.findIndex((url) => /\/three-[^/]+\.js$/.test(url));
    const entry = scripts.findIndex((url) => /\/index-[^/]+\.js$/.test(url));

    expect(entry, 'chunk de entrada requisitado').toBeGreaterThanOrEqual(0);
    expect(three, 'chunk do three requisitado ao abrir a cena').toBeGreaterThan(entry);
  });

  test('clicar num mancal abre o painel com a tag do ativo', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    const canvas = await waitForScene(page);

    // vista que enche a tela de mancais, para o clique ter onde cair
    await page.getByRole('button', { name: /Mancais e juntas/ }).click();
    await page.waitForTimeout(2000); // o voo da câmera leva 1,4 s

    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    const painel = page.getByRole('complementary');

    // alguns pontos do centro da tela; o primeiro que acertar um mancal resolve
    const alvos = [
      [0.5, 0.5],
      [0.42, 0.42],
      [0.58, 0.58],
      [0.35, 0.6],
      [0.65, 0.35],
    ] as const;

    for (const [fx, fy] of alvos) {
      await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
      if (await painel.isVisible()) break;
    }

    await expect(painel, 'painel do ativo aberto').toBeVisible();

    const tag = (await painel.locator('p').first().innerText()).trim();

    // a tag mostrada tem de existir no modelo e ser mesmo de um mancal
    const ativo = assetByTag(MP1, tag);
    expect(ativo, `tag ${tag} não existe no modelo`).not.toBeNull();
    expect(ativo?.kind).toBe('bearing');
    expect(tag).toMatch(/-M(LA|LC)$/);

    // e o painel descreve o ativo que a tag nomeia
    await expect(painel.getByRole('heading')).toContainText('Mancal');
    await expect(painel).toContainText(ativo?.side === 'LA' ? 'lado acionamento' : 'lado comando');
  });

  test('o painel do mancal mostra a vibração vinda da API', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    const canvas = await waitForScene(page);

    await page.getByRole('button', { name: /Mancais e juntas/ }).click();
    await page.waitForTimeout(2000);

    const box = await canvas.boundingBox();
    if (!box) throw new Error('canvas sem área');

    const painel = page.getByRole('complementary');
    for (const [fx, fy] of [
      [0.5, 0.5],
      [0.42, 0.42],
      [0.58, 0.58],
      [0.35, 0.6],
    ] as const) {
      await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
      if (await painel.isVisible()) break;
    }
    await expect(painel).toBeVisible();

    // a zona só aparece depois de a API responder — é a fatia vertical inteira
    await expect(painel).toContainText(/ISO 20816 · zona [ABCD]/, { timeout: 15_000 });
    await expect(painel.getByRole('img', { name: /Vibração RMS/ })).toBeVisible();
    await expect(painel).toContainText(/mm\/s/);

    // e o gráfico tem a sua alternativa em tabela
    await painel.getByRole('button', { name: 'Ver como tabela' }).click();
    await expect(painel.getByRole('table')).toBeVisible();
    expect(await painel.locator('tbody tr').count()).toBeGreaterThan(10);
  });

  test('clicar fora desfaz a seleção', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    const canvas = await waitForScene(page);

    await page.getByRole('button', { name: /Mancais e juntas/ }).click();
    await page.waitForTimeout(2000);

    const box = await canvas.boundingBox();
    if (!box) throw new Error('canvas sem área');

    const painel = page.getByRole('complementary');
    for (const [fx, fy] of [
      [0.5, 0.5],
      [0.42, 0.42],
      [0.58, 0.58],
    ] as const) {
      await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
      if (await painel.isVisible()) break;
    }
    await expect(painel).toBeVisible();

    // o topo da cena é céu: clique no vazio
    await page.mouse.click(box.x + box.width * 0.5, box.y + 12);
    await expect(painel).toBeHidden();
  });
});
