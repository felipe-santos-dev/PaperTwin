import { expect, test, type Page } from '@playwright/test';

/**
 * A interface cabe nas larguras que o projeto garante.
 *
 * Três perguntas, nas quatro larguras:
 *
 * 1. **Nenhum gráfico passa da borda do painel onde mora.** Os gráficos são SVG
 *    desenhado em pixels reais, com a largura medida do container
 *    (`ui/useWidth`). Quando a medição falha, o SVG fica com o valor de partida
 *    do hook — 470, 560, 900 px — e o excesso é **cortado** pela borda do
 *    painel, sem barra de rolagem e sem erro no console. Some meia hora de
 *    tendência e ninguém fica sabendo.
 * 2. **Nada rola na horizontal.** A moldura não rola, e o conteúdo rola só na
 *    vertical: uma barra horizontal quer dizer que algum painel é mais largo
 *    que a janela, e metade dele está fora da tela.
 * 3. **Nenhum texto de cabeçalho se sobrepõe nem é cortado em silêncio.** É o
 *    que a revisão de 1142 px encontrou em quase toda tela: "Turno B ·
 *    14:00–22:00" atrás de Gramatura, "239 t" em cima de "ritmo da meta 324 t",
 *    "Pré-." no lugar de "Pré-lubrificação". A causa quase sempre é a mesma —
 *    texto sem `min-w-0`/`truncate` dentro de um flex, que não encolhe e por
 *    isso estoura.
 *
 * ## Cortar com reticências é resultado, não falha
 *
 * `truncate` é a correção: o texto que não cabe termina em "…" e o `title` diz
 * o resto. O que o teste reprova é o corte **em silêncio** — o elemento cujo
 * conteúdo não cabe e que não mostra reticências, porque aí quem lê não tem
 * como saber que falta pedaço. "Pré-." é exatamente isso.
 *
 * ## Por que aqui e não no Vitest
 *
 * O jsdom não calcula layout: toda largura vale zero lá, e todo retângulo vale
 * zero. Só o navegador responde a estas perguntas.
 */

const TELAS = [
  'turno',
  'processo',
  'laboratorio',
  'bobinas',
  'mancais',
  'rondas',
  'notas',
  'simulacao',
  'quebra',
];

/**
 * As quatro larguras garantidas.
 *
 * 1280×720 e 1366×768 entraram na revisão de 1142 px: são as duas resoluções de
 * notebook que ainda se encontram numa sala de controle, e abaixo de 1280 a
 * faixa do topo avisa em vez de prometer.
 *
 * 1920×1080 continua na lista mesmo sendo a mais folgada, e não é redundante:
 * um painel que só foi conferido estreito pode ganhar vazio demais ou um gráfico
 * que não acompanha a largura, e isso só aparece em 1920.
 */
const LARGURAS = [
  { nome: '1280×720', width: 1280, height: 720 },
  { nome: '1366×768', width: 1366, height: 768 },
  { nome: '1440×900', width: 1440, height: 900 },
  { nome: '1920×1080', width: 1920, height: 1080 },
] as const;

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

/** Um defeito de texto: o que é, onde, e com o que ele colide. */
interface Defeito {
  readonly tipo: 'sobreposto' | 'cortado' | 'fora do painel';
  readonly onde: string;
  readonly texto: string;
  readonly detalhe: string;
}

/**
 * Os cabeçalhos onde o texto se atropelava, e a barra superior.
 *
 * `section > header` é o cabeçalho de todo painel (`ui/Panel`), e é o lugar
 * apertado por construção: título, contexto, legenda e o "?" disputam uma linha
 * só. A barra superior entra porque é a moldura comum às nove telas — um
 * atropelo lá aparece em todas.
 *
 * ## O que se mede é o que se vê
 *
 * Um texto com `truncate` tem `overflow: hidden`, e os pedaços de texto dentro
 * dele continuam com retângulos do tamanho que pediriam — o navegador só não os
 * pinta. Comparar esses retângulos com a borda do painel acusaria de vazamento
 * justamente o texto que está sendo cortado direito.
 *
 * Então cada retângulo é cruzado com o de todo ancestral que corta, e o que
 * sobra é o que aparece na tela. É sobre esse retângulo que as três perguntas
 * são feitas.
 */
async function defeitosDeTexto(page: Page): Promise<Defeito[]> {
  return page.evaluate((folga) => {
    const achados: Defeito[] = [];

    /** O texto visível de um elemento, curto, para a mensagem de falha. */
    const resumo = (el: Element): string =>
      (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 48);

    interface Caixa {
      readonly left: number;
      readonly right: number;
      readonly top: number;
      readonly bottom: number;
    }

    const cruza = (a: Caixa, b: Caixa): Caixa => ({
      left: Math.max(a.left, b.left),
      right: Math.min(a.right, b.right),
      top: Math.max(a.top, b.top),
      bottom: Math.min(a.bottom, b.bottom),
    });

    const largura = (c: Caixa): number => Math.max(0, c.right - c.left);
    const altura = (c: Caixa): number => Math.max(0, c.bottom - c.top);

    /** Se um ancestral corta o que passa dele. */
    const corta = (estilo: CSSStyleDeclaration): boolean =>
      [estilo.overflowX, estilo.overflowY].some((valor) => valor !== 'visible');

    /** O ancestral que corta e mostra reticências, se houver. */
    const cortaComReticencias = (el: Element): boolean => {
      let atual: Element | null = el;
      while (atual) {
        const estilo = getComputedStyle(atual);
        if (corta(estilo) && estilo.textOverflow === 'ellipsis') return true;
        atual = atual.parentElement;
      }
      return false;
    };

    /** O retângulo que sobra depois de todo corte de ancestral. */
    const visivel = (el: Element): Caixa => {
      const caixa = el.getBoundingClientRect();
      let atual: Caixa = {
        left: caixa.left,
        right: caixa.right,
        top: caixa.top,
        bottom: caixa.bottom,
      };

      let pai: Element | null = el.parentElement;
      while (pai) {
        if (corta(getComputedStyle(pai))) atual = cruza(atual, pai.getBoundingClientRect());
        pai = pai.parentElement;
      }

      return atual;
    };

    /** Folhas de texto: elementos com texto e sem filho que também tenha. */
    const folhasDe = (raiz: Element): HTMLElement[] => {
      const folhas: HTMLElement[] = [];

      for (const el of Array.from(raiz.querySelectorAll<HTMLElement>('*'))) {
        if (resumo(el) === '') continue;
        if (el.getAttribute('aria-hidden') === 'true') continue;

        const estilo = getComputedStyle(el);
        if (estilo.display === 'none' || estilo.visibility === 'hidden') continue;

        const caixa = el.getBoundingClientRect();
        if (caixa.width === 0 || caixa.height === 0) continue;

        const temFilhoComTexto = Array.from(el.children).some((filho) => resumo(filho) !== '');
        if (!temFilhoComTexto) folhas.push(el);
      }

      return folhas;
    };

    const regioes: { readonly nome: string; readonly raiz: Element | null }[] = [
      { nome: 'barra superior', raiz: document.querySelector('header:not(section header)') },
      ...Array.from(document.querySelectorAll('section > header')).map((header) => ({
        nome: `cabeçalho de "${header.closest('section')?.getAttribute('aria-label') ?? '(sem rótulo)'}"`,
        raiz: header,
      })),
    ];

    for (const { nome, raiz } of regioes) {
      if (!raiz) continue;
      const folhas = folhasDe(raiz);

      for (const el of folhas) {
        const cheia = el.getBoundingClientRect();
        const aparece = visivel(el);

        /**
         * Cortado em silêncio: falta pedaço e nada indica que falta.
         *
         * Duas maneiras de faltar pedaço: o próprio elemento não caber no seu
         * `clientWidth`, ou um ancestral cortá-lo. Nos dois casos a correção é a
         * mesma — reticências em algum lugar da cadeia — e é isso que separa
         * "Pré-lubrificação" virando "Pré-." de "Pré-lubrifica…".
         */
        const naoCabeEmSi = el.scrollWidth - el.clientWidth > folga;
        const oAncestralCorta = cheia.width - largura(aparece) > folga;

        if ((naoCabeEmSi || oAncestralCorta) && !cortaComReticencias(el)) {
          achados.push({
            tipo: 'cortado',
            onde: nome,
            texto: resumo(el),
            detalhe: naoCabeEmSi
              ? `pede ${String(el.scrollWidth)} px e tem ${String(el.clientWidth)} px, sem reticências`
              : `${String(Math.round(cheia.width - largura(aparece)))} px cortados por um ancestral, sem reticências`,
          });
        }

        /**
         * Fora do painel: o que aparece passa da borda de quem deveria contê-lo.
         *
         * Sobre o retângulo visível, e não o cheio: um texto cortado direito tem
         * retângulo cheio maior que o painel, e isso é a correção funcionando.
         */
        if (largura(aparece) > folga && altura(aparece) > folga) {
          const dono = el.closest('section') ?? el.closest('header');
          if (dono) {
            const caixaDono = dono.getBoundingClientRect();
            const sobra = Math.round(aparece.right - caixaDono.right);
            if (sobra > folga) {
              achados.push({
                tipo: 'fora do painel',
                onde: nome,
                texto: resumo(el),
                detalhe: `passa ${String(sobra)} px da borda`,
              });
            }
          }
        }
      }

      /**
       * Sobreposto: dois textos que ocupam o mesmo lugar na tela.
       *
       * Só pares que não são parentes — um rótulo dentro de um botão sempre
       * cruza o retângulo do botão, e isso é aninhamento, não atropelo. E só
       * quando a área comum **visível** passa de alguns pixels, para
       * arredondamento de grade não virar falha.
       */
      for (let i = 0; i < folhas.length; i += 1) {
        for (let j = i + 1; j < folhas.length; j += 1) {
          const a = folhas[i];
          const b = folhas[j];
          if (!a || !b) continue;
          if (a.contains(b) || b.contains(a)) continue;

          const comum = cruza(visivel(a), visivel(b));
          if (largura(comum) <= folga || altura(comum) <= folga) continue;

          achados.push({
            tipo: 'sobreposto',
            onde: nome,
            texto: resumo(a),
            detalhe: `cruza "${resumo(b)}" em ${String(Math.round(largura(comum)))}×${String(Math.round(altura(comum)))} px`,
          });
        }
      }
    }

    return achados;
  }, FOLGA) as Promise<Defeito[]>;
}

/**
 * Abre a tela e espera o primeiro painel e a primeira medição.
 *
 * O replay mede o instantâneo, e não a API: a retomada tem teto de 4 h e a
 * quebra do cenário é uma por dia, então uma API recém-subida quase nunca tem
 * uma, e a tela abriria no estado vazio — sem gráfico nenhum para medir. O
 * instantâneo tem sempre a dele.
 */
async function abrir(page: Page, tela: string): Promise<void> {
  if (tela === 'quebra') {
    await page.route('**://127.0.0.1:3333/**', (route) => route.abort());
  }

  await page.goto(`/#${tela}`);
  await expect(page.locator('section').first()).toBeVisible({ timeout: 60_000 });
  // os gráficos só existem depois da resposta da API e da primeira medição
  await page.waitForTimeout(3_000);
}

for (const largura of LARGURAS) {
  test.describe(largura.nome, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: largura.width, height: largura.height });
    });

    for (const tela of TELAS) {
      test(`nenhum gráfico passa da borda do painel em ${tela}`, async ({ page }) => {
        await abrir(page, tela);
        const fora = await vazamentos(page);

        expect(fora, `gráfico fora do painel em ${tela}: ${JSON.stringify(fora, null, 2)}`).toEqual(
          [],
        );
      });

      test(`sem texto sobreposto ou cortado nos cabeçalhos em ${tela}`, async ({ page }) => {
        await abrir(page, tela);
        const defeitos = await defeitosDeTexto(page);

        expect(
          defeitos,
          `texto atropelado em ${tela}: ${JSON.stringify(defeitos, null, 2)}`,
        ).toEqual([]);
      });

      test(`nada rola na horizontal em ${tela}`, async ({ page }) => {
        await abrir(page, tela);

        const rolagem = await page.evaluate(() => {
          const fora: { readonly onde: string; readonly sobra: number }[] = [];
          const raiz = document.documentElement;

          if (raiz.scrollWidth > raiz.clientWidth) {
            fora.push({ onde: 'documento', sobra: raiz.scrollWidth - raiz.clientWidth });
          }

          for (const el of Array.from(document.querySelectorAll<HTMLElement>('main, section'))) {
            const estilo = getComputedStyle(el);
            const rola = estilo.overflowX === 'auto' || estilo.overflowX === 'scroll';
            if (!rola) continue;
            if (el.scrollWidth > el.clientWidth) {
              fora.push({
                onde: el.getAttribute('aria-label') ?? el.tagName.toLowerCase(),
                sobra: el.scrollWidth - el.clientWidth,
              });
            }
          }

          return fora;
        });

        expect(rolagem, `rolagem horizontal em ${tela}: ${JSON.stringify(rolagem)}`).toEqual([]);
      });
    }
  });
}
