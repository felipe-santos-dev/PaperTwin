import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],

    /**
     * Um arquivo de cada vez.
     *
     * Três suítes desta pasta sobem um Postgres em WebAssembly e rodam **quatro
     * horas de simulação** cada uma — 14.400 passos, ~3,5 s de CPU no melhor
     * caso. Em paralelo, elas se estrangulam: num arranque dessa suíte completa
     * três testes falharam por tempo, e nenhum deles falha quando o arquivo roda
     * sozinho.
     *
     * Um teste que passa sozinho e falha acompanhado não é um teste, é um
     * sorteio — e com CI a caminho isso viraria uma build vermelha a cada tantas
     * execuções, que é o jeito mais rápido de ensinar alguém a ignorar o CI.
     *
     * O preço é tempo de parede: a suíte leva cerca de dois minutos em série.
     * É o preço certo. A alternativa seria aumentar os tempos limite até
     * esconder o problema, e aí um teste que travasse de verdade levaria dois
     * minutos para dizer isso.
     *
     * Vale a mesma observação do Playwright: sem GPU e sem núcleos de sobra, a
     * capacidade da máquina é o recurso compartilhado, e paralelismo sobre ela
     * não acelera nada.
     */
    fileParallelism: false,

    /**
     * Tempo limite generoso, mas não infinito.
     *
     * Uma retomada de quatro horas com gravação no banco leva segundos; doze
     * dão folga para uma máquina carregada sem deixar um teste travado esperar
     * minutos. Os testes que fazem mais de uma retomada pedem o seu próprio
     * limite, maior, no lugar onde estão.
     */
    testTimeout: 12_000,
    hookTimeout: 60_000,
  },
});
