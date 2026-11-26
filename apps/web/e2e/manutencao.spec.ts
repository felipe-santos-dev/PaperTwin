import { expect, test, type Page } from '@playwright/test';

/**
 * O ciclo fechado de manutenção, no navegador.
 *
 * A API é bloqueada de propósito: o instantâneo **sempre** tem a sugestão do
 * mancal que degrada, enquanto uma API recém-subida depende de a semeadura ter
 * rodado com a janela certa. O que se testa aqui é o caminho — o cartão no
 * mancal, o contador na moldura, a coluna em Notas e a pendência no Turno —, e
 * ele é o mesmo nas duas fontes.
 *
 * ## Um mancal é apontado uma vez
 *
 * Os dois mancais do cenário degradam, e cada um é apontado por um caminho:
 *
 * - o **CS23** está em zona D e tem alarme de `HH`, e o alarme já abriu nota. O
 *   trabalho dele está na fila da manutenção, e sugerir de novo seria pedir a
 *   mesma ordem de serviço duas vezes. Ele **não** tem nota sugerida, e é isso
 *   que o primeiro teste cobra.
 * - o **CS36** está em zona B: a vibração não alarmou, nenhuma nota se abriu
 *   sozinha, e a única coisa que sabe que ele está indo embora é a reta. É ele
 *   que tem a sugestão — e é ele que mostra o que a Fase 6 vale.
 *
 * Decidir não é testado aqui: o instantâneo não aceita escrita, e é isso que o
 * último teste cobra. Confirmar e dispensar de verdade estão nos testes da API.
 */

const cartão = (page: Page) => page.getByRole('region', { name: 'Nota sugerida pela tendência' });

/** O mancal em zona B, que é o que tem sugestão. */
const CS36 = 'MP1-SEC-G6-CS36-MLC';
/** O mancal em zona D, que tem nota aberta. */
const CS23 = 'MP1-SEC-G4-CS23-MLC';

const escolher = async (page: Page, assetTag: string): Promise<void> => {
  await page.locator(`[role="row"][data-asset="${assetTag}"]`).click();
};

test.beforeEach(async ({ page }) => {
  await page.route('**://127.0.0.1:3333/**', (route) => route.abort());
});

test('o mancal com nota aberta não ganha nota sugerida', async ({ page }) => {
  await page.goto('/#mancais');
  await expect(page.locator(`[role="row"][data-asset="${CS23}"]`)).toBeVisible({
    timeout: 60_000,
  });

  await escolher(page, CS23);

  /**
   * Nem cartão de sugestão, nem silêncio: a nota aberta é que o aponta.
   *
   * Se um dia o cartão voltar aqui, a regra da Fase 6 quebrou — e a tela
   * estará pedindo duas intervenções no mesmo mancal, uma delas com parada e a
   * outra sem.
   */
  await expect(cartão(page)).toHaveCount(0);
});

/**
 * O outro mancal do cenário é o que separa prever de reagir.
 *
 * Ele está em zona B, a vibração não alarmou, e mesmo assim tem nota sugerida
 * — com **prazo**, sem parada. Se um dia esta tela mostrar "já passou" aqui, o
 * caso preditivo sumiu do gêmeo e só sobrou o reativo.
 */
test('o mancal que ainda está subindo tem sugestão com prazo', async ({ page }) => {
  await page.goto('/#mancais');
  await expect(page.locator(`[role="row"][data-asset="${CS36}"]`)).toBeVisible({
    timeout: 60_000,
  });

  await escolher(page, CS36);

  await expect(cartão(page)).toBeVisible();
  await expect(cartão(page)).toContainText('sem número até confirmar');
  await expect(cartão(page)).toContainText('a projeção cruza a fronteira C→D');
  await expect(cartão(page)).toContainText(/\d+ dias/);
  await expect(cartão(page)).toContainText('defeito que acelera chega antes');
  await expect(cartão(page)).not.toContainText('PARADA');
  // a frase é a projeção, não uma previsão de falha
  await expect(cartão(page)).not.toContainText(/vai falhar|vai quebrar/);
});

test('a moldura conta as sugestões esperando decisão', async ({ page }) => {
  await page.goto('/#processo');

  // o contador fica na navegação, e aparece em qualquer tela
  const notas = page.getByRole('navigation', { name: 'Telas' }).getByRole('button', {
    name: /^Notas de manutenção \(\d+\)$/,
  });
  await expect(notas).toBeVisible({ timeout: 60_000 });
});

test('Notas tem a coluna das sugeridas, e dela se chega ao mancal', async ({ page }) => {
  await page.goto('/#notas');

  const coluna = page.getByRole('region', { name: 'Sugeridas' });
  await expect(coluna).toBeVisible({ timeout: 60_000 });
  // um mancal na fila: o outro já está apontado pela nota aberta dele
  await expect(coluna.getByText('sem número').first()).toBeVisible();
  expect(await coluna.getByText('sem número').count()).toBe(1);

  await coluna.getByRole('button', { name: 'Decidir no mancal' }).first().click();

  await expect(page).toHaveURL(/#mancais$/);
  await expect(cartão(page)).toBeVisible({ timeout: 60_000 });
});

/**
 * E a nota aberta do outro mancal está no quadro, com a mesma gravidade.
 *
 * Calar a sugestão só é honesto se a nota que ficou no lugar dela disser o que
 * a sugestão diria. O CS23 está em zona D: a nota tem de sair P1 e exigir
 * parada, pela mesma régua ISO que a sugestão usa.
 */
test('a nota aberta do mancal em zona D pede parada', async ({ page }) => {
  await page.goto('/#notas');

  const coluna = page.getByRole('region', { name: 'Aberta' });
  await expect(coluna).toBeVisible({ timeout: 60_000 });
  await expect(coluna).toContainText('CS23');
  // os números da frase são em português
  await expect(coluna).not.toContainText(/\d\.\d/);
});

test('a passagem de turno lista a decisão parada', async ({ page }) => {
  await page.goto('/#turno');

  const passagem = page.getByRole('region', { name: 'Pendências da passagem de turno' });
  await expect(passagem).toBeVisible({ timeout: 60_000 });
  // a decisão parada é a do mancal sem nota aberta
  await expect(passagem.getByText('Decidir a nota sugerida do mancal CS36 LC')).toBeVisible();
  await expect(passagem.getByText('Decidir a nota sugerida do mancal CS23 LC')).toHaveCount(0);
  // o CS23 entra como trabalho já aberto, e não como decisão
  await expect(passagem.getByText('Programar intervenção no mancal CS23 LC')).toBeVisible();
});

test('no instantâneo os botões dizem que não dá para decidir', async ({ page }) => {
  await page.goto('/#mancais');
  await expect(page.locator(`[role="row"][data-asset="${CS36}"]`)).toBeVisible({
    timeout: 60_000,
  });

  await escolher(page, CS36);

  await expect(cartão(page)).toBeVisible();
  await expect(cartão(page)).toContainText('não aceita decisão');
  // `exact`: "Confirmar" também casaria com "Editar e confirmar"
  await expect(cartão(page).getByRole('button', { name: 'Confirmar', exact: true })).toBeDisabled();
  await expect(cartão(page).getByRole('button', { name: 'Dispensar', exact: true })).toBeDisabled();
});
