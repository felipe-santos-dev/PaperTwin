import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';
import { assetByTag, MP1 } from '@mp1/shared';

/**
 * A cena só quebra de verdade no navegador: um material descartado cedo demais,
 * uma geometria sem índice ou um chunk que não carrega não aparecem no `tsc`
 * nem no Vitest. Estes testes rodam contra o build.
 */

/** Mancal usado nos testes de clique — o mesmo que degrada na simulação. */
const BEARING = 'MP1-SEC-G4-CS23-MLA';

/**
 * A cena mora na tela de Máquina, que é a sétima.
 *
 * Desde a Fase 6 a aplicação tem sete telas e abre na de Turno, então um teste
 * da cena precisa pedir a tela dela. `?asset=` continua levando direto para lá —
 * é o link direto da Fase 3 — mas quem não passa ativo nenhum precisa da âncora.
 */
const SCENE = '/#maquina';

/** A URL da cena com um ativo selecionado. */
const sceneWith = (tag: string): string => `/?asset=${encodeURIComponent(tag)}#maquina`;

/** Ruído conhecido do ambiente, que não indica defeito na aplicação. */
const IGNORED = [/Download the React DevTools/i, /favicon/i];

// `window.__twin` vem declarado em src/scene/TestHook.tsx, no mesmo programa
// do TypeScript — redeclarar aqui só criaria duas versões do mesmo tipo.

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

/** Espera a cena sair do carregamento e o gancho de projeção aparecer. */
async function waitForScene(page: Page) {
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible({ timeout: 60_000 });

  await page.waitForFunction(
    () => {
      const element = document.querySelector('canvas');
      return element !== null && element.width > 0 && element.height > 0 && Boolean(window.__twin);
    },
    undefined,
    { timeout: 60_000 },
  );

  // o voo da câmera leva 1,4 s; projetar antes dele terminar dá a posição errada
  await page.waitForTimeout(2200);
  return canvas;
}

/** Clica no ativo onde ele realmente está, em vez de numa coordenada fixa. */
async function clickAsset(page: Page, tag: string) {
  const point = await page.evaluate((t) => window.__twin?.screenPointOf(t) ?? null, tag);

  expect(point, `gancho de teste indisponível para ${tag}`).not.toBeNull();
  if (!point) return;
  expect(point.onScreen, `${tag} não está enquadrado`).toBe(true);

  await page.mouse.click(point.x, point.y);
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});

test.describe('carregamento', () => {
  test('a cena carrega sem erro no console e sem requisição falha', async ({ page }) => {
    const { errors, failures } = collectProblems(page);

    await page.goto(SCENE);
    await waitForScene(page);

    expect(errors, 'console limpo').toEqual([]);
    expect(failures, 'nenhuma requisição falha').toEqual([]);
  });

  /**
   * O teste ficou mais forte com as sete telas.
   *
   * Antes a aplicação era só a cena, então o máximo que se podia cobrar era a
   * **ordem**: o chunk do three depois do de entrada. Agora dá para cobrar o que
   * importa de verdade — quem abre a tela de Turno não baixa 1 MB de three.js —
   * porque existe uma tela sem cena para abrir.
   */
  test('o three.js só é baixado quando a tela de Máquina entra', async ({ page }) => {
    const scripts: string[] = [];
    page.on('request', (request) => {
      if (request.resourceType() === 'script') scripts.push(request.url());
    });

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });

    const threeNaAbertura = scripts.filter((url) => /\/three-[^/]+\.js$/.test(url));
    expect(threeNaAbertura, 'three.js não entra no carregamento inicial').toEqual([]);

    await page.goto(SCENE);
    await waitForScene(page);

    const three = scripts.findIndex((url) => /\/three-[^/]+\.js$/.test(url));
    expect(three, 'chunk do three requisitado ao abrir a cena').toBeGreaterThanOrEqual(0);
  });
});

test.describe('seleção por URL', () => {
  test('`?asset=` abre o painel do ativo e enquadra a câmera nele', async ({ page }) => {
    await page.goto(sceneWith(BEARING));
    await waitForScene(page);

    const painel = page.getByRole('complementary');
    await expect(painel).toBeVisible();
    await expect(painel.getByText(BEARING)).toBeVisible();

    // enquadrada quer dizer visível: o gancho confirma que o ativo está na tela
    const point = await page.evaluate((t) => window.__twin?.screenPointOf(t) ?? null, BEARING);
    expect(point?.onScreen).toBe(true);
  });

  test('uma tag inventada na URL não trava a cena', async ({ page }) => {
    const { errors } = collectProblems(page);

    await page.goto('/?asset=MP1-NAO-EXISTE#maquina');
    await waitForScene(page);

    await expect(page.getByRole('complementary')).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('clicar num ativo grava a tag na URL', async ({ page }) => {
    await page.goto(sceneWith(BEARING));
    await waitForScene(page);

    // dentro do painel: fora dele, "Fechar" também casaria com "Fechar portas"
    await page.getByRole('complementary').getByRole('button', { name: 'Fechar' }).click();
    await expect(page).toHaveURL((url) => !url.searchParams.has('asset'));

    await clickAsset(page, BEARING);
    await expect(page).toHaveURL((url) => url.searchParams.get('asset') === BEARING);
  });
});

test.describe('interação com a cena', () => {
  test('clicar num mancal abre o painel com a tag do ativo', async ({ page }) => {
    // abre enquadrado no mancal e fecha o painel, para o clique partir do zero
    await page.goto(sceneWith(BEARING));
    await waitForScene(page);

    const painel = page.getByRole('complementary');
    await painel.getByRole('button', { name: 'Fechar' }).click();
    await expect(painel).toBeHidden();

    await clickAsset(page, BEARING);

    await expect(painel, 'painel do ativo aberto').toBeVisible();
    await expect(painel.getByText(BEARING)).toBeVisible();

    const ativo = assetByTag(MP1, BEARING);
    expect(ativo?.kind).toBe('bearing');
    await expect(painel.getByRole('heading')).toContainText('Mancal');
    await expect(painel).toContainText('lado acionamento');
  });

  test('clicar fora desfaz a seleção', async ({ page }) => {
    await page.goto(sceneWith(BEARING));
    const canvas = await waitForScene(page);

    const painel = page.getByRole('complementary');
    await expect(painel).toBeVisible();

    // só os mancais respondem ao clique; qualquer outro ponto da cena é "fora"
    const box = await canvas.boundingBox();
    if (!box) throw new Error('canvas sem área');
    await page.mouse.click(box.x + box.width * 0.5, box.y + 8);

    await expect(painel).toBeHidden();
    await expect(page).toHaveURL((url) => !url.searchParams.has('asset'));
  });

  test('o painel do mancal mostra a vibração vinda da API', async ({ page }) => {
    await page.goto(sceneWith(BEARING));
    await waitForScene(page);

    const painel = page.getByRole('complementary');

    // a zona só aparece depois de a API responder — é a fatia vertical inteira
    await expect(painel).toContainText(/ISO 20816 · zona [ABCD]/, { timeout: 20_000 });
    await expect(painel.getByRole('img', { name: /Vibração RMS/ })).toBeVisible();
    await expect(painel).toContainText('mm/s');

    // o mancal que degrada na simulação termina em zona D
    await expect(painel).toContainText('zona D');
    await expect(painel.getByRole('status')).toContainText('Crítico');

    // e o gráfico tem a sua alternativa em tabela
    await painel.getByRole('button', { name: 'Ver como tabela' }).click();
    await expect(painel.getByRole('table')).toBeVisible();
    expect(await painel.locator('tbody tr').count()).toBeGreaterThan(10);
  });
});
