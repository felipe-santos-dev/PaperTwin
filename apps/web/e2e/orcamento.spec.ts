import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test, type Page } from '@playwright/test';

/**
 * O orçamento: o que a aplicação pode custar antes de alguém reclamar.
 *
 * Os limites são **folgados de propósito**, e isso é o ponto. Um orçamento
 * apertado numa máquina de CI sem GPU vira falha intermitente, e um teste que
 * falha sozinho é um teste que se desliga. O que estes números pegam é
 * regressão de ordem de grandeza — um `import` que arrasta a biblioteca inteira
 * para o chunk de entrada, uma cena que passou a desenhar a cada quadro o que
 * dava para desenhar uma vez.
 *
 * Os valores medidos de verdade, e não os tetos, estão em
 * `docs/notas-para-readme.md`.
 */

const DIST = fileURLToPath(new URL('../dist/assets', import.meta.url));

/**
 * O teto do chunk de entrada, em kB.
 *
 * Quem abre a tela de Turno não deve baixar a cena 3D junto. O three.js e o
 * R3F passam de 1 MB sozinhos, então um chunk de entrada acima disto significa
 * que o code splitting parou de funcionar — que é exatamente o defeito que não
 * quebra nada e torna a primeira tela lenta para sempre.
 */
const ENTRADA_MAX_KB = 400;

/** O teto de tudo o que a aplicação baixa até a primeira tela estar de pé. */
const PRIMEIRA_TELA_MAX_KB = 600;

/**
 * O piso de quadros por segundo da cena.
 *
 * **Quatro**, e não trinta. Trinta é o limiar em que o giro da câmera deixa de
 * parecer contínuo, e é o alvo num desktop com GPU — mas aqui o Chromium
 * desenha por software, com o SwiftShader, no mesmo processador que roda o
 * teste. Medido nesta máquina: **8,7 quadros por segundo**.
 *
 * Um piso de trinta num ambiente que entrega nove seria um teste vermelho de
 * nascença, e um teste vermelho de nascença se desliga na primeira semana. O
 * que este piso pega é regressão de **ordem de grandeza**: uma cena que passou
 * a recriar geometria a cada quadro cai para menos de um, não para oito.
 *
 * O número de verdade, com GPU, está nas notas e é medido à mão.
 */
const FPS_MIN = 4;

function arquivos(): { nome: string; kb: number }[] {
  return readdirSync(DIST)
    .filter((nome) => nome.endsWith('.js'))
    .map((nome) => ({ nome, kb: statSync(join(DIST, nome)).size / 1024 }));
}

test.describe('orçamento de bytes', () => {
  test('o chunk de entrada cabe no teto', () => {
    /*
     * O chunk de entrada é o maior que não é de biblioteca: o Vite nomeia o
     * dele com o nome do ponto de entrada, e os demais com o da dependência.
     */
    const entrada = arquivos().find((arquivo) => /^index-/.test(arquivo.nome));

    expect(entrada, 'o build tem um chunk de entrada').toBeDefined();
    expect(
      Math.round(entrada?.kb ?? 0),
      `o chunk de entrada passou de ${String(ENTRADA_MAX_KB)} kB`,
    ).toBeLessThan(ENTRADA_MAX_KB);
  });

  test('a primeira tela não baixa a cena 3D', async ({ page }) => {
    const baixados: { url: string; kb: number }[] = [];

    page.on('response', async (response) => {
      if (!/\.js(\?|$)/.test(response.url())) return;
      const corpo = await response.body().catch(() => null);
      if (corpo) baixados.push({ url: response.url(), kb: corpo.byteLength / 1024 });
    });

    await page.goto('/#turno');
    await expect(page.getByText(/PASSAGEM DE TURNO/i).first()).toBeVisible({ timeout: 60_000 });

    const total = baixados.reduce((soma, arquivo) => soma + arquivo.kb, 0);

    expect(
      baixados.filter((arquivo) => /\/three-[^/]+\.js$/.test(arquivo.url)),
      'o three.js não entra na primeira tela',
    ).toEqual([]);

    expect(
      Math.round(total),
      `a primeira tela baixou mais de ${String(PRIMEIRA_TELA_MAX_KB)} kB de JavaScript`,
    ).toBeLessThan(PRIMEIRA_TELA_MAX_KB);
  });
});

/**
 * Mede quadros por segundo contando `requestAnimationFrame` por dois segundos.
 *
 * Não é um profiler: é a mesma coisa que o olho mede. Dois segundos porque o
 * primeiro é o da compilação dos shaders, e incluí-lo mediria o carregamento
 * em vez do desenho.
 */
async function medirFps(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let quadros = 0;
        const comecou = performance.now();

        const contar = (): void => {
          quadros += 1;
          if (performance.now() - comecou < 2000) {
            requestAnimationFrame(contar);
            return;
          }
          resolve((quadros * 1000) / (performance.now() - comecou));
        };

        requestAnimationFrame(contar);
      }),
  );
}

test.describe('orçamento da cena', () => {
  test('a cena desenha acima do piso', async ({ page }) => {
    await page.goto('/#maquina');

    // o mesmo sinal que `scene.spec.ts` espera: a tela de desenho com tamanho
    // e o gancho de projeção instalado, que o R3F só registra depois do
    // primeiro quadro
    await page.waitForFunction(
      () => {
        const element = document.querySelector('canvas');
        return element !== null && element.width > 0 && Boolean(window.__twin);
      },
      undefined,
      { timeout: 60_000 },
    );

    // o primeiro segundo é o da compilação dos shaders
    await page.waitForTimeout(1000);
    const fps = await medirFps(page);

    console.log(`[orçamento] cena a ${fps.toFixed(1)} quadros por segundo`);
    expect(fps, `a cena caiu abaixo de ${String(FPS_MIN)} quadros por segundo`).toBeGreaterThan(
      FPS_MIN,
    );
  });
});
