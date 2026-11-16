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

test('escolher uma TAG abre a tendência dela em Processo', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });

  await page.getByRole('combobox', { name: campo }).click();
  await page.keyboard.type('PIC-514');
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(/#processo$/);
  // a seção da TAG abre junto, e a TAG entra na tendência
  const tendencia = page.getByRole('region', { name: 'Tendência' });
  await expect(tendencia.getByText('PIC-514').first()).toBeVisible({ timeout: 30_000 });
});

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
