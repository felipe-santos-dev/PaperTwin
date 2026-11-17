import { expect, test, type Page } from '@playwright/test';

/**
 * Nenhum gráfico passa da borda do painel onde mora.
 *
 * Os gráficos desta interface são SVG desenhado em pixels reais, com a largura
 * medida do container (`ui/useWidth`). Quando a medição falha, o SVG fica com o
 * valor de partida do hook — 470, 560, 900 px — e o excesso é **cortado** pela
 * borda do painel, sem barra de rolagem e sem erro no console. Some meia hora
 * de tendência e ninguém fica sabendo.
 *
 * Por isso o teste é aqui e não no Vitest: o jsdom não calcula layout, e toda
 * largura vale zero lá. Só o navegador responde a pergunta.
 *
 * O recorte é 1440×900, a tela mais estreita que o projeto promete. Em 1920 há
 * folga demais e os valores de partida cabem por acidente — foi exatamente
 * assim que o corte no "Efeito do refino" passou despercebido.
 */

const TELAS = ['turno', 'processo', 'laboratorio', 'bobinas', 'mancais', 'rondas', 'notas'];

/** Quanto se tolera: meio pixel de arredondamento de grade, não mais. */
const FOLGA = 1;

interface Vazamento {
  readonly painel: string;
  readonly svg: string;
  readonly sobra: number;
  readonly larguraSvg: number;
  readonly larguraPainel: number;
}

async function vazamentos(page: Page): Promise<Vazamento[]> {
  return page.evaluate((folga) => {
    const fora: Vazamento[] = [];

    for (const svg of Array.from(document.querySelectorAll('svg'))) {
      const painel = svg.closest('section');
      if (!painel) continue;

      const caixaSvg = svg.getBoundingClientRect();
      const caixaPainel = painel.getBoundingClientRect();
      if (caixaSvg.width === 0) continue;

      const sobra = Math.round(caixaSvg.right - caixaPainel.right);
      if (sobra > folga) {
        fora.push({
          painel: painel.getAttribute('aria-label') ?? '(sem rótulo)',
          svg: svg.getAttribute('aria-label') ?? svg.getAttribute('role') ?? '(sem rótulo)',
          sobra,
          larguraSvg: Math.round(caixaSvg.width),
          larguraPainel: Math.round(caixaPainel.width),
        });
      }
    }

    return fora;
  }, FOLGA) as Promise<Vazamento[]>;
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});

for (const tela of TELAS) {
  test(`nenhum gráfico passa da borda do painel em ${tela}`, async ({ page }) => {
    await page.goto(`/#${tela}`);
    await expect(page.locator('section').first()).toBeVisible({ timeout: 60_000 });
    // os gráficos só existem depois da resposta da API e da primeira medição
    await page.waitForTimeout(3_000);

    const fora = await vazamentos(page);

    expect(fora, `gráfico fora do painel em ${tela}: ${JSON.stringify(fora)}`).toEqual([]);
  });
}
