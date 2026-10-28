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
      command: 'npm run dev:api',
      cwd: '../..',
      url: 'http://127.0.0.1:3333/health',
      reuseExistingServer: !process.env['CI'],
      timeout: 120_000,
    },
    {
      command: `npm run preview -- --port ${String(PORT)} --strictPort`,
      url: baseURL,
      reuseExistingServer: !process.env['CI'],
      timeout: 180_000,
    },
  ],
});
