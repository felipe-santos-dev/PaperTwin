import { expect, test, type Page } from '@playwright/test';

/**
 * O sensor virtual de qualidade, no navegador.
 *
 * A API é bloqueada de propósito: o instantâneo tem a janela inteira com
 * laudos, viés e faixa, enquanto uma API recém-subida pode ter acabado de
 * acordar sem nenhuma bobina fechada. O caminho é o mesmo nas duas fontes.
 */

const sensor = (page: Page) => page.getByRole('region', { name: 'Sensor virtual de tração MD' });

test.beforeEach(async ({ page }) => {
  await page.route('**://127.0.0.1:3333/**', (route) => route.abort());
});

test('o Laboratório abre no ensaio que não é ilustrativo', async ({ page }) => {
  await page.goto('/#laboratorio');

  await expect(sensor(page)).toBeVisible({ timeout: 60_000 });
  // o número grande, a faixa e o veredito contra a especificação
  await expect(sensor(page)).toContainText(/\d,\d\d/);
  await expect(sensor(page)).toContainText('±');
  await expect(sensor(page)).toContainText(/dentro da faixa|fora da faixa/);
  await expect(sensor(page)).toContainText('laudos');
});

test('a matriz diz qual coluna é medida e qual é ilustrativa', async ({ page }) => {
  await page.goto('/#laboratorio');

  const matriz = page.getByRole('region', { name: 'Bobinas × ensaios' });
  await expect(matriz).toBeVisible({ timeout: 60_000 });
  await expect(matriz.getByText('LAB-1206 medido')).toBeVisible();
  await expect(matriz.getByText('ilustrativo')).toBeVisible();
});

test('escolher outro ensaio troca o sensor pela carta de controle', async ({ page }) => {
  await page.goto('/#laboratorio');
  await expect(sensor(page)).toBeVisible({ timeout: 60_000 });

  const matriz = page.getByRole('region', { name: 'Bobinas × ensaios' });
  await matriz.getByRole('columnheader', { name: /Gurley/ }).click();

  await expect(sensor(page)).toHaveCount(0);
  await expect(page.getByRole('region', { name: /Carta de controle/ })).toBeVisible();

  await matriz.getByRole('columnheader', { name: /Tração MD/ }).click();
  await expect(sensor(page)).toBeVisible();
});
