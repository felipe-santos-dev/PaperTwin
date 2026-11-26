import { expect, test } from '@playwright/test';

/**
 * As nove telas, em 1280 e em 1920, para olhar lado a lado.
 *
 * Não é um teste: não há asserção sobre a imagem, e ele nunca falha por causa
 * de um pixel. É o jeito de produzir as capturas sem subir o servidor, montar o
 * build e navegar à mão nove vezes em duas larguras — o Playwright já faz as
 * três coisas para os testes de largura.
 *
 * Fica fora do `npm run test:e2e` de propósito (ver o `grep` no README): uma
 * suíte que grava 18 arquivos de 1 MB a cada execução de CI não é teste, é
 * efeito colateral. Roda-se quando se quer olhar:
 *
 *     npx playwright test capturas.spec.ts
 *
 * As imagens saem em `docs/capturas/` e estão no `.gitignore`: são artefato de
 * revisão, não fonte.
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

const LARGURAS = [
  { nome: '1280', width: 1280, height: 720 },
  { nome: '1920', width: 1920, height: 1080 },
] as const;

const PASTA = '../../docs/capturas';

for (const largura of LARGURAS) {
  for (const tela of TELAS) {
    test(`captura ${tela} em ${largura.nome}`, async ({ page }) => {
      await page.setViewportSize({ width: largura.width, height: largura.height });

      /**
       * O replay mede o instantâneo, e não a API.
       *
       * A retomada tem teto de 4 h e a quebra do cenário é uma por dia: uma API
       * recém-subida quase nunca tem uma, e a tela abriria no estado vazio.
       */
      if (tela === 'quebra') {
        await page.route('**://127.0.0.1:3333/**', (route) => route.abort());
      }

      await page.goto(`/#${tela}`);
      await expect(page.locator('section').first()).toBeVisible({ timeout: 60_000 });
      // os gráficos só existem depois da resposta da API e da primeira medição
      await page.waitForTimeout(3_000);

      await page.screenshot({ path: `${PASTA}/${largura.nome}-${tela}.png` });
    });
  }
}
