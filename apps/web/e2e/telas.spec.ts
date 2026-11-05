import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';

/**
 * As sete telas, contra a API Java de verdade.
 *
 * O que estes testes cobrem e os de unidade não: a aplicação **inteira** — o
 * build minificado, o code splitting, a negociação entre API e instantâneo, e o
 * contrato HTTP de ponta a ponta. Um campo que o Java renomeou passa no `tsc`
 * se os tipos gerados não tiverem sido regerados; aqui não passa, porque a tela
 * fica vazia.
 *
 * A fonte é a API, e não o instantâneo: o `playwright.config.ts` sobe o
 * `DevServer` contra o Postgres embutido antes de servir a web.
 */

/** Ruído conhecido do ambiente, que não indica defeito na aplicação. */
const IGNORED = [/Download the React DevTools/i, /favicon/i];

/**
 * As sete telas, com a âncora e um texto que só aparece quando os dados
 * chegaram — nunca o título, que o React desenha antes de qualquer requisição.
 */
const TELAS = [
  { tecla: '1', ancora: '#turno', nome: 'Turno', pronta: /PASSAGEM DE TURNO/i },
  { tecla: '2', ancora: '#bobinas', nome: 'Bobinas', pronta: /BOBINA JUMBO/i },
  { tecla: '3', ancora: '#processo', nome: 'Processo', pronta: /PROCESSO E CONTROLE/i },
  { tecla: '4', ancora: '#mancais', nome: 'Mancais', pronta: /VIBRAÇÃO E TEMPERATURA/i },
  { tecla: '5', ancora: '#rondas', nome: 'Rondas', pronta: /RONDA DE INSPEÇÃO/i },
  { tecla: '6', ancora: '#notas', nome: 'Notas', pronta: /MANUTENÇÃO/i },
  { tecla: '7', ancora: '#maquina', nome: 'Máquina', pronta: /CENA NAVEGÁVEL/i },
] as const;

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
    const failure = request.failure()?.errorText ?? '';
    // o cancelamento de uma busca superada é o comportamento esperado
    if (failure.includes('ERR_ABORTED')) return;
    failures.push(`${request.method()} ${request.url()} — ${failure}`);
  });

  return { errors, failures };
}

/**
 * Espera a faixa dizer de onde vêm os dados.
 *
 * A aplicação sonda a API antes de escolher a fonte, e uma tela consultada
 * antes disso está honestamente vazia. Sem esta espera o teste mediria a
 * sondagem, não a tela.
 */
async function waitForSource(page: Page, source: RegExp): Promise<void> {
  /*
   * `.first()` porque há dois: a pastilha do cabeçalho e, no modo de
   * demonstração, a faixa que explica por quê. As duas dizem a mesma coisa, e
   * qualquer uma serve de sinal.
   */
  await expect(page.getByRole('status').filter({ hasText: source }).first()).toBeVisible({
    timeout: 60_000,
  });
}

/**
 * Espera a tela terminar de carregar.
 *
 * A pastilha da fonte aparece assim que a sondagem decide, e isso é **antes**
 * de os dados chegarem: a primeira requisição do dia dispara a retomada, que
 * leva segundos. Sem esta espera o teste olha para a tela no meio do caminho.
 */
async function waitForLoaded(page: Page): Promise<void> {
  await expect(page.getByText(/^Carregando/).first()).toBeHidden({ timeout: 90_000 });
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});

test.describe('as sete telas, com dados da API', () => {
  for (const tela of TELAS) {
    test(`${tela.nome} carrega e mostra conteúdo`, async ({ page }) => {
      const { errors, failures } = collectProblems(page);

      await page.goto(`/${tela.ancora}`);
      await waitForSource(page, /API/i);

      await expect(page.getByText(tela.pronta).first()).toBeVisible({ timeout: 60_000 });

      // nenhuma tela pode deixar o estado de carregamento para trás
      await waitForLoaded(page);

      expect(errors, `console limpo na tela de ${tela.nome}`).toEqual([]);
      expect(failures, `nenhuma requisição falha na tela de ${tela.nome}`).toEqual([]);
    });
  }

  test('as teclas 1 a 7 trocam de tela', async ({ page }) => {
    await page.goto('/');
    await waitForSource(page, /API/i);

    for (const tela of TELAS) {
      await page.keyboard.press(tela.tecla);
      await expect(page).toHaveURL(new RegExp(`${tela.ancora}$`));
    }
  });
});

test.describe('o que a tela diz que o processo fez', () => {
  /**
   * Não é um teste de valor: os números mudam a cada execução, porque a
   * simulação corre até agora. O que ele cobra é que a **colheita** chegou à
   * tela — bobinas com gramatura medida, e não uma lista vazia com o título
   * certo.
   */
  test('as bobinas recentes trazem a gramatura medida', async ({ page }) => {
    /*
     * A tela de Bobinas, e não a de Turno.
     *
     * A de Turno mostra o turno **corrente**, e a janela da retomada pode cair
     * logo no começo de um — aí não há bobina fechada, e o teste falharia por
     * causa do relógio, não do código. A lista de bobinas recentes atravessa o
     * turno, e a janela de quatro horas sempre fecha algumas.
     */
    await page.goto('/#bobinas');
    await waitForSource(page, /API/i);
    await waitForLoaded(page);

    const tabela = page.getByRole('table', { name: /Bobinas jumbo recentes/i });
    await expect(tabela).toBeVisible({ timeout: 60_000 });

    /*
     * `button`, e não `row`: a linha desta tabela é clicável — abre a bobina —
     * e o componente a monta como botão. `getByRole('row')` acharia só o
     * cabeçalho, e o teste passaria a contar zero para sempre.
     */
    const fechadas = tabela.getByRole('button').filter({ hasText: /\d\d,\d{2}/ });
    expect(await fechadas.count(), 'há bobina fechada com gramatura').toBeGreaterThan(0);
  });

  test('os mancais classificam pela ISO 20816 e o CS23 aparece em zona D', async ({ page }) => {
    await page.goto('/#mancais');
    await waitForSource(page, /API/i);
    await waitForLoaded(page);

    // o mancal que degrada é escolha do cenário, e termina a janela em zona D
    const pior = page.getByRole('button').filter({ hasText: 'VI-5123A' }).first();
    await expect(pior).toBeVisible({ timeout: 60_000 });
    await expect(pior).toContainText('D');
  });
});

test.describe('o modo de demonstração', () => {
  /**
   * O instantâneo é o que o GitHub Pages serve, e ele tem de abrir sozinho.
   *
   * Bloquear a API é o jeito honesto de testá-lo: é exatamente o que acontece
   * quando o host dormiu. O que se cobra é que a tela abre com dados — e que a
   * faixa diz que são de demonstração, porque números velhos sem rótulo são
   * piores que nenhum.
   */
  test('com a API fora do ar, a tela abre com o instantâneo e diz que é dele', async ({ page }) => {
    await page.route('**/127.0.0.1:3333/**', (route) => route.abort());

    await page.goto('/#turno');
    await waitForSource(page, /demonstração/i);
    await waitForLoaded(page);

    await expect(page.getByText(/PASSAGEM DE TURNO/i).first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('table', { name: /Bobinas do turno/i })).toBeVisible({
      timeout: 60_000,
    });
  });

  test('o instantâneo não aceita escrita, e diz isso em vez de fingir', async ({ page }) => {
    await page.route('**/127.0.0.1:3333/**', (route) => route.abort());

    await page.goto('/#processo');
    await waitForSource(page, /demonstração/i);
    await waitForLoaded(page);

    // a tela de Processo esconde o formulário de escrita quando a fonte é
    // somente leitura: fingir que aceitou seria pior que recusar
    await expect(page.getByRole('button', { name: /escrever/i })).toHaveCount(0);
  });
});
