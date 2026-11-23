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
 * Decidir não é testado aqui: o instantâneo não aceita escrita, e é isso que o
 * último teste cobra. Confirmar e dispensar de verdade estão nos testes da API.
 */

const cartão = (page: Page) => page.getByRole('region', { name: 'Nota sugerida pela tendência' });

test.beforeEach(async ({ page }) => {
  await page.route('**://127.0.0.1:3333/**', (route) => route.abort());
});

test('o mancal que degrada mostra a nota sugerida, pronta e sem número', async ({ page }) => {
  await page.goto('/#mancais');

  await expect(cartão(page)).toBeVisible({ timeout: 60_000 });
  await expect(cartão(page)).toContainText('sem número até confirmar');
  await expect(cartão(page)).toContainText('zona D');
  await expect(cartão(page)).toContainText('defeito que acelera chega antes');
  // a frase é a projeção, não uma previsão de falha
  await expect(cartão(page)).not.toContainText(/vai falhar|vai quebrar/);
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
  await expect(cartão(page)).toBeVisible({ timeout: 60_000 });

  await page.locator('[role="row"][data-asset="MP1-SEC-G6-CS36-MLC"]').click();

  await expect(cartão(page)).toContainText('a projeção cruza a fronteira C→D');
  await expect(cartão(page)).toContainText(/\d+ dias/);
  await expect(cartão(page)).not.toContainText('PARADA');
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
  // os dois mancais do cenário estão na fila, e nenhum tem número ainda
  await expect(coluna.getByText('sem número').first()).toBeVisible();
  expect(await coluna.getByText('sem número').count()).toBe(2);

  await coluna.getByRole('button', { name: 'Decidir no mancal' }).first().click();

  await expect(page).toHaveURL(/#mancais$/);
  await expect(cartão(page)).toBeVisible({ timeout: 60_000 });
});

test('a passagem de turno lista a decisão parada', async ({ page }) => {
  await page.goto('/#turno');

  const passagem = page.getByRole('region', { name: 'Pendências da passagem de turno' });
  await expect(passagem).toBeVisible({ timeout: 60_000 });
  // as duas decisões paradas entram, uma por mancal
  await expect(passagem.getByText('Decidir a nota sugerida do mancal CS23 LC')).toBeVisible();
  await expect(passagem.getByText('Decidir a nota sugerida do mancal CS36 LC')).toBeVisible();
});

test('no instantâneo os botões dizem que não dá para decidir', async ({ page }) => {
  await page.goto('/#mancais');

  await expect(cartão(page)).toBeVisible({ timeout: 60_000 });
  await expect(cartão(page)).toContainText('não aceita decisão');
  // `exact`: "Confirmar" também casaria com "Editar e confirmar"
  await expect(cartão(page).getByRole('button', { name: 'Confirmar', exact: true })).toBeDisabled();
  await expect(cartão(page).getByRole('button', { name: 'Dispensar', exact: true })).toBeDisabled();
});
