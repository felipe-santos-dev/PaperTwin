import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Acessibilidade básica — o que uma varredura automática alcança.
 *
 * Ela não diz que a aplicação é acessível: nenhuma varredura diz. O que ela
 * pega é a classe de defeito que passa despercebida e custa barato arrumar —
 * contraste insuficiente, botão sem nome, campo sem rótulo, tabela sem
 * cabeçalho, ordem de títulos quebrada. É uma rede, não um laudo, e dizer isso
 * é parte de usá-la honestamente.
 *
 * O que ela **não** cobre e esta aplicação precisa ter: navegação por teclado
 * de ponta a ponta (as teclas 1–7 estão em `telas.spec.ts`), leitura por
 * leitor de tela, e a cena 3D — que não tem como ser acessível por varredura e
 * tem tabela equivalente ao lado, que é a resposta certa para ela.
 *
 * O corte é em **sério e crítico**. Violações "menores" e "moderadas" do axe
 * incluem muita recomendação discutível, e um limiar que ninguém consegue
 * manter em zero é um limiar que se desliga na primeira semana.
 */

const TELAS = [
  { ancora: '#turno', nome: 'Turno' },
  { ancora: '#bobinas', nome: 'Bobinas' },
  { ancora: '#processo', nome: 'Processo' },
  { ancora: '#mancais', nome: 'Mancais' },
  { ancora: '#rondas', nome: 'Rondas' },
  { ancora: '#notas', nome: 'Notas' },
] as const;

/** WCAG 2.1 A e AA, que é o alvo declarado. */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

const GRAVES = new Set(['serious', 'critical']);

async function waitForData(page: Page): Promise<void> {
  await expect(page.getByRole('status').filter({ hasText: /API|demonstração/i })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText(/^Carregando/).first()).toBeHidden({ timeout: 60_000 });
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});

for (const tela of TELAS) {
  test(`${tela.nome} não tem violação séria de acessibilidade`, async ({ page }) => {
    await page.goto(`/${tela.ancora}`);
    await waitForData(page);

    const resultado = await new AxeBuilder({ page }).withTags(TAGS).analyze();

    const graves = resultado.violations
      .filter((violation) => GRAVES.has(violation.impact ?? ''))
      .map(
        (violation) =>
          `${violation.impact}: ${violation.id} — ${violation.help} ` +
          `(${String(violation.nodes.length)} elemento(s): ` +
          `${violation.nodes
            .slice(0, 3)
            .map((node) => node.target.join(' '))
            .join(', ')})`,
      );

    expect(graves, `violações sérias em ${tela.nome}`).toEqual([]);
  });
}

/**
 * A cena fica de fora da varredura e tem o seu próprio teste.
 *
 * Um `canvas` de WebGL é opaco para o axe: ele não tem o que inspecionar lá
 * dentro, e passaria sem dizer nada. O que se pode cobrar é o que a aplicação
 * oferece a quem não vê a cena — a lista de seções em botões de verdade, com
 * nome, alcançáveis por teclado.
 */
test('a cena oferece as seções como botões nomeados, e não só como pixels', async ({ page }) => {
  await page.goto('/#maquina');
  await expect(page.getByText(/CENA NAVEGÁVEL/i)).toBeVisible({ timeout: 60_000 });

  const secoes = page.getByRole('button', { name: /Vis(ã|a)o geral|Pr(é|e)-secagem|Calandra/i });
  expect(await secoes.count(), 'as seções são botões').toBeGreaterThan(0);

  await expect(secoes.first()).toBeEnabled();
});
