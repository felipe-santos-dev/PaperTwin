import { defineConfig } from '@playwright/test';

import base from './playwright.config';

/**
 * As capturas das nove telas, fora da suíte de testes.
 *
 * `playwright.config.ts` ignora `capturas.spec.ts`, porque o `test:e2e` do CI
 * roda a pasta inteira e uma rotina que grava 18 arquivos de imagem a cada
 * execução não é teste — é efeito colateral. Esta configuração reaproveita
 * tudo do base (os dois servidores, o WebGL por software, o build de produção)
 * e aponta só para ela:
 *
 *     npm run capturas --workspace @mp1/web
 */
export default defineConfig({
  ...base,
  // o `testIgnore` do base é o que mantém as capturas fora do CI; aqui ele sai
  testIgnore: [],
  testMatch: /capturas\.spec\.ts/,
});
