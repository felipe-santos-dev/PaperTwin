import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

/**
 * `localhost` e não `127.0.0.1`: o `vite preview` escuta no nome, que em máquina
 * com IPv6 resolve para ::1. Fixar o endereço v4 faz o Playwright esperar para
 * sempre por um servidor que está no ar.
 */
const baseURL = `http://localhost:${String(PORT)}`;

/**
 * Os testes de ponta a ponta rodam contra o build de produção, e não contra o
 * dev server: é o build que tem o code splitting e o minificador, justamente o
 * que pode quebrar a cena sem quebrar teste nenhum.
 */
export default defineConfig({
  testDir: './e2e',

  /**
   * Acorda a simulação antes do primeiro teste.
   *
   * Sem isto, a retomada cai sobre o teste que calhar de ser o primeiro, que
   * passa a falhar por capacidade e não por defeito — e muda a cada
   * reordenação da suíte.
   */
  globalSetup: './e2e/global-setup.ts',
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 2 : 0,
  reporter: process.env['CI'] ? [['github'], ['list']] : [['list']],

  /**
   * Um processo de cada vez.
   *
   * Sem GPU o Chromium desenha a cena por software, no mesmo processador que
   * roda o teste. Em paralelo, as instâncias se estrangulam e o clique num
   * botão comum chega a estourar trinta segundos — a falha parece do teste,
   * mas é de capacidade.
   */
  workers: 1,
  fullyParallel: false,

  /** Carregar a cena por software é lento mesmo em série. */
  timeout: 90_000,

  use: {
    baseURL,
    trace: 'on-first-retry',
    launchOptions: {
      // WebGL por software: sem isto o Chromium sem cabeça não tem contexto 3D
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  /**
   * A API sobe junto. Sem ela a web registra ERR_CONNECTION_REFUSED no console,
   * e o teste de console limpo passaria a conviver com um erro de verdade — que
   * é exatamente o que ele existe para pegar.
   */
  webServer: [
    {
      /**
       * A API Java, contra o Postgres embutido dos testes.
       *
       * É a aplicação de verdade — mesmas rotas, mesma simulação, mesmo
       * historiador — só que sem exigir Docker nem um banco gerenciado para
       * rodar o e2e. O `DevServer` vive em `src/test` justamente porque o
       * Postgres embutido é dependência de teste e não entra no jar.
       *
       * O prazo é largo: a primeira requisição paga a retomada inteira, e numa
       * máquina de CI sem cache do Maven a compilação vem antes dela.
       */
      command: 'node scripts/start-api.mjs',
      url: 'http://127.0.0.1:3333/health',
      reuseExistingServer: !process.env['CI'],
      timeout: 300_000,
    },
    {
      /**
       * Constrói em modo `test` e serve o resultado.
       *
       * Continua sendo um build de produção — minificado, com o mesmo code
       * splitting — e é isso que os testes de carregamento verificam. O que o
       * modo muda é só `import.meta.env.MODE`, que libera o gancho de projeção
       * usado para clicar num ativo pela posição real dele na tela.
       */
      command: `npm run build:test && npm run preview -- --port ${String(PORT)} --strictPort`,
      url: baseURL,
      reuseExistingServer: !process.env['CI'],
      timeout: 180_000,
    },
  ],
});
