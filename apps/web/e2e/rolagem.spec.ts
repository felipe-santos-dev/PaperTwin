import { expect, test, type Page } from '@playwright/test';

/**
 * Só a página rola.
 *
 * É a regra do layout novo, e é a que mais custava antes: o levantamento da
 * fase 0 contou **27** lugares com rolagem própria, e 23 deles eram painéis
 * dentro de uma tela. O efeito é rolagem dentro de rolagem — a pessoa gira a
 * roda, o painel de dentro anda três linhas, acaba, e só então a página começa
 * a andar. Quem usa não sabe de qual barra está puxando, e metade do conteúdo
 * de uma tela fica atrás de uma barra que ninguém vê.
 *
 * Então: `main.page` é o único elemento com rolagem própria da interface.
 * Dentro dela, nenhum elemento pode ter `overflow: auto` ou `scroll` com
 * conteúdo maior do que cabe — o painel cresce, e a página rola.
 *
 * ## O que está fora da regra, e por quê
 *
 * **Sobreposições.** O painel do ativo na cena 3D (`ui/AssetPanel`) e a lista
 * de resultados da busca (`ui/SearchBox`) são `position: absolute` ou `fixed`:
 * eles flutuam **acima** da página, com altura máxima própria, e não disputam a
 * rolagem com ela. Uma lista de 60 resultados que crescesse até empurrar a
 * página seria pior em todos os sentidos. O teste pula o que tem ancestral
 * posicionado dentro da página.
 *
 * **Rolagem horizontal** continua proibida em qualquer lugar, e quem cobra isso
 * é `e2e/largura.spec.ts`.
 *
 * ## Por que medir, e não vasculhar o código
 *
 * Uma busca por `overflow-y-auto` no `.tsx` acha a classe, não o efeito: um
 * painel com `overflow-y-auto` e conteúdo que cabe não rola nada, e um `div`
 * com `overflow` vindo de outra classe rola sem a palavra aparecer. O que
 * importa é o que o navegador faz, e isso só o navegador responde.
 */

const TELAS = [
  'turno',
  'processo',
  'laboratorio',
  'bobinas',
  'mancais',
  'rondas',
  'notas',
  'maquina',
  'simulacao',
  'quebra',
];

/** Quanto se tolera: um pixel de arredondamento de grade, não mais. */
const FOLGA = 1;

interface Rolante {
  readonly onde: string;
  readonly classe: string;
  readonly overflow: string;
  readonly altura: number;
  readonly conteudo: number;
}

async function rolantes(page: Page): Promise<Rolante[]> {
  return page.evaluate((folga) => {
    const achados: Rolante[] = [];
    const pagina = document.querySelector('.page');
    if (!pagina) return achados;

    /** Se um ancestral dentro da página flutua acima dela. */
    const sobreposto = (el: Element): boolean => {
      let atual: Element | null = el;
      while (atual && atual !== pagina) {
        const posicao = getComputedStyle(atual).position;
        if (posicao === 'absolute' || posicao === 'fixed') return true;
        atual = atual.parentElement;
      }
      return false;
    };

    for (const el of Array.from(pagina.querySelectorAll<HTMLElement>('*'))) {
      const estilo = getComputedStyle(el);
      const rola = [estilo.overflowY, estilo.overflow].some(
        (valor) => valor === 'auto' || valor === 'scroll',
      );
      if (!rola) continue;
      if (sobreposto(el)) continue;
      if (el.scrollHeight - el.clientHeight <= folga) continue;

      achados.push({
        onde:
          el.getAttribute('aria-label') ??
          el.closest('section')?.getAttribute('aria-label') ??
          el.tagName.toLowerCase(),
        classe: el.className.slice(0, 120),
        overflow: estilo.overflowY,
        altura: el.clientHeight,
        conteudo: el.scrollHeight,
      });
    }

    return achados;
  }, FOLGA) as Promise<Rolante[]>;
}

/** Um elemento cujo conteúdo não cabe na caixa e não é cortado nem rolado. */
interface Transbordo {
  readonly onde: string;
  readonly classe: string;
  readonly texto: string;
  readonly altura: number;
  readonly conteudo: number;
}

/**
 * Nada transborda a própria caixa.
 *
 * É o outro lado da regra "só a página rola", e o defeito que ela criou na
 * primeira versão da fase 1. Tirar `overflow-y-auto` de um painel que **tem
 * altura travada** não faz o painel crescer: faz o conteúdo sair por fora e
 * desenhar por cima do que vier depois. Foi o que aconteceu com a lista de
 * alarmes do Turno, que passou a cobrir a legenda "Barras: faixa operacional…"
 * no rodapé do mesmo painel — a legenda ficava ilegível e ninguém perdia uma
 * barra de rolagem para notar.
 *
 * Então, para todo elemento dentro de `.page`: se o conteúdo é mais alto que a
 * caixa e o `overflow` é `visible`, o conteúdo está sendo desenhado em cima de
 * outra coisa. Com `hidden` seria um corte deliberado (a cena 3D, uma caixa com
 * reticências); com `auto` seria rolagem aninhada, que o outro teste pega.
 */
async function transbordos(page: Page): Promise<Transbordo[]> {
  return page.evaluate((folga) => {
    const achados: Transbordo[] = [];
    const pagina = document.querySelector('.page');
    if (!pagina) return achados;

    const sobreposto = (el: Element): boolean => {
      let atual: Element | null = el;
      while (atual && atual !== pagina) {
        const posicao = getComputedStyle(atual).position;
        if (posicao === 'absolute' || posicao === 'fixed') return true;
        atual = atual.parentElement;
      }
      return false;
    };

    /*
      Duas exclusões, e as duas são medida, não gosto.

      **Folhas de texto.** Um `<span>` com `leading-none` tem `clientHeight`
      igual ao corpo da fonte e `scrollHeight` igual à caixa do glifo: 28 contra
      32 px, sempre, em todo número grande da interface. Não é conteúdo saindo
      da caixa, é a métrica da fonte — e nada fica ilegível por causa dela. Só
      caixas que contêm outras caixas entram na conta.

      **Quatro pixels de folga.** Pelo mesmo motivo, agora nas caixas: uma linha
      de 18 px com texto de 20 não encobre nada. Os defeitos que este teste
      existe para pegar são de outra ordem — a lista de alarmes do Turno passava
      35 px por cima da legenda, e o painel de setpoint, 36.
    */
    const FOLGA_DE_TEXTO = 4;

    for (const el of Array.from(pagina.querySelectorAll<HTMLElement>('*'))) {
      if (el instanceof SVGElement) continue;
      if (el.childElementCount === 0) continue;
      const estilo = getComputedStyle(el);
      if (estilo.overflowY !== 'visible') continue;
      if (sobreposto(el)) continue;
      if (el.scrollHeight - el.clientHeight <= Math.max(folga, FOLGA_DE_TEXTO)) continue;

      achados.push({
        onde:
          el.getAttribute('aria-label') ??
          el.closest('section')?.getAttribute('aria-label') ??
          el.tagName.toLowerCase(),
        classe: typeof el.className === 'string' ? el.className.slice(0, 100) : el.tagName,
        texto: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60),
        altura: el.clientHeight,
        conteudo: el.scrollHeight,
      });
    }

    return achados;
  }, FOLGA) as Promise<Transbordo[]>;
}

/**
 * Abre a tela e espera o primeiro painel e a primeira medição.
 *
 * O replay mede o instantâneo, e não a API: a quebra do cenário é uma por dia,
 * então uma API recém-subida quase nunca tem uma, e a tela abriria no estado
 * vazio — sem painel para medir.
 */
async function abrir(page: Page, tela: string): Promise<void> {
  if (tela === 'quebra') {
    await page.route('**://127.0.0.1:3333/**', (route) => route.abort());
  }

  await page.goto(`/#${tela}`);
  await expect(page.locator('.page')).toBeVisible({ timeout: 60_000 });
  // os painéis só existem depois da resposta e da primeira medição
  await page.waitForTimeout(3_000);
}

/**
 * Duas alturas, e a mais baixa é a que importa.
 *
 * 720 px é o piso que o projeto garante, e é nele que um painel com altura
 * travada não cabe e começa a rolar por dentro. Em 1080 sobra espaço, e um
 * painel que rolaria em 720 pode passar sem ser notado.
 */
const JANELAS = [
  { nome: '1280×720', width: 1280, height: 720 },
  { nome: '1920×1080', width: 1920, height: 1080 },
] as const;

for (const janela of JANELAS) {
  test.describe(janela.nome, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: janela.width, height: janela.height });
    });

    for (const tela of TELAS) {
      test(`nada rola por dentro da página em ${tela}`, async ({ page }) => {
        await abrir(page, tela);
        const fora = await rolantes(page);

        expect(fora, `rolagem aninhada em ${tela}: ${JSON.stringify(fora, null, 2)}`).toEqual([]);
      });

      test(`nada transborda a própria caixa em ${tela}`, async ({ page }) => {
        await abrir(page, tela);
        const fora = await transbordos(page);

        expect(fora, `conteúdo transbordando em ${tela}: ${JSON.stringify(fora, null, 2)}`).toEqual(
          [],
        );
      });
    }

    test('a página é o único elemento que rola', async ({ page }) => {
      await abrir(page, 'turno');

      const quantos = await page.evaluate(() => {
        const rolando: string[] = [];
        for (const el of Array.from(document.querySelectorAll<HTMLElement>('*'))) {
          const estilo = getComputedStyle(el);
          const rola = [estilo.overflowY, estilo.overflow].some(
            (valor) => valor === 'auto' || valor === 'scroll',
          );
          if (!rola) continue;
          if (estilo.position === 'absolute' || estilo.position === 'fixed') continue;
          if (el.scrollHeight - el.clientHeight <= 1) continue;
          rolando.push(el.className.slice(0, 80) || el.tagName.toLowerCase());
        }
        return rolando;
      });

      /*
        A asserção é "ninguém além da página", e não "a página rola".

        Numa janela de 1080 px uma tela curta pode caber inteira, e aí nem a
        página rola — o que não é defeito nenhum. O defeito é outro elemento
        rolar.
      */
      const outros = quantos.filter((classe) => !classe.includes('page'));
      expect(outros, `rolaram fora da página: ${JSON.stringify(outros)}`).toEqual([]);
    });
  });
}
