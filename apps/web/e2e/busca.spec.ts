import { expect, test } from '@playwright/test';

/**
 * A busca da moldura, no aplicativo de verdade.
 *
 * Os testes de componente já cobrem o teclado e a ordem dos resultados. O que
 * só o navegador prova é a ligação: que o campo existe na moldura de todas as
 * telas, que a barra `/` chega nele, e que escolher um resultado leva à tela
 * certa **com o item aberto** — que é a promessa da fase.
 */

const campo = 'Buscar tela, TAG, mancal, bobina ou nota';

test('a barra abre a busca e a tela escolhida', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });

  await page.keyboard.press('/');
  await expect(page.getByRole('combobox', { name: campo })).toBeFocused();

  await page.keyboard.type('rondas');
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(/#rondas$/);
});

/**
 * Duas larguras, e a segunda é a do CI.
 *
 * 1920 é a largura para a qual a tela foi desenhada; 1280 × 720 é o padrão do
 * `Desktop Chrome`, que é o que o CI usa quando o teste não troca a janela. Em
 * 1280 cabe **um** chip no cabeçalho da Tendência e os outros viram "+N" — é a
 * largura em que a promessa da busca (a TAG escolhida fica à vista) é mais
 * fácil de quebrar.
 */
for (const [largura, altura] of [
  [1920, 1080],
  [1280, 720],
] as const) {
  test(`escolher uma TAG abre a tendência dela em Processo · ${String(largura)}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: largura, height: altura });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });

    await page.getByRole('combobox', { name: campo }).click();
    await page.keyboard.type('PIC-514');
    await expect(page.getByRole('listbox')).toBeVisible();
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/#processo$/);

    /**
     * A seção da TAG abre junto, e a TAG entra na tendência.
     *
     * Duas provas, e as duas importam. A primeira é o **gráfico**: é isso que a
     * busca promete. A segunda é o **chip** no cabeçalho, que é como alguém vê
     * que a TAG está ali e pode tirá-la.
     *
     * O chip é procurado **por papel**, e não por texto. O cabeçalho tem uma
     * régua invisível com uma cópia de cada peça, para medir o que cabe na
     * linha; ela vem antes no DOM, e um `getByText(...).first()` pega a cópia
     * escondida — foi assim que este teste quebrou no CI, e quebraria nas duas
     * larguras. A régua é `aria-hidden`, e uma consulta por papel não a
     * enxerga.
     *
     * A TAG escolhida entra no **começo** da lista (`[tag, ...list]`), então
     * hoje ela é sempre a que fica na linha, inclusive em 1280, onde só um chip
     * cabe. O caminho do "+N" está aqui por garantia: no dia em que essa ordem
     * mudar, o teste procura a TAG onde ela estiver em vez de falhar.
     */
    const tendencia = page.getByRole('region', { name: 'Tendência' });
    await expect(tendencia.locator('svg[aria-label="Tendência de PIC-514"]')).toBeVisible({
      timeout: 30_000,
    });

    const cabeçalho = tendencia.locator('header');
    const naLinha = cabeçalho.getByRole('button', { name: 'Tirar PIC-514 da tendência' });

    if ((await naLinha.count()) > 0) {
      await expect(naLinha).toBeVisible();
    } else {
      await cabeçalho.getByRole('button', { name: /^Mais \d+ TAG/ }).click();
      const lista = page.getByRole('dialog', { name: 'TAGs da tendência' });
      await expect(lista.getByRole('button', { name: 'Tirar PIC-514 da tendência' })).toBeVisible();
    }
  });
}

test('o "?" de um bloco explica o bloco', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  const placar = page.getByRole('region', { name: 'Placar do turno' });
  await expect(placar).toBeVisible({ timeout: 30_000 });

  await placar.getByRole('button', { name: 'Ajuda: Placar do turno' }).click();

  const ajuda = page.getByRole('dialog', { name: 'Ajuda: Placar do turno' });
  await expect(ajuda).toContainText('Produção, eficiência, quebras e refugo');

  await page.keyboard.press('Escape');
  await expect(ajuda).toBeHidden();
});
