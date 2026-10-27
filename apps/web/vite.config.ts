/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        /**
         * O three.js e os seus companheiros saem num pedaço próprio.
         *
         * A cena já é importada sob demanda, então o three não entra no
         * carregamento inicial. Separá-lo também do resto do código da cena faz
         * com que uma mudança nos componentes não invalide o cache de 1 MB de
         * biblioteca que não mudou.
         */
        manualChunks: (id) => {
          /**
           * O helper de import dinâmico do Vite precisa de lugar próprio.
           *
           * Ele é um módulo virtual, fora de node_modules, e sem destino
           * explícito o Rollup o acomoda dentro do pedaço do three. Como a
           * entrada o importa para poder carregar a cena, o three vira
           * dependência estática e volta para o carregamento inicial — o import
           * dinâmico deixa de valer de nada.
           */
          if (id.includes('vite/preload-helper')) return 'preload-helper';

          if (!id.includes('node_modules')) return undefined;

          /**
           * O React precisa de um pedaço só dele.
           *
           * Sem isto, o Rollup funde o react-dom no pedaço do three — porque o
           * @react-three/fiber também o importa — e aí a entrada passa a
           * depender estaticamente do three. O Vite então emite um
           * `modulepreload` de 1,2 MB no index.html e o import dinâmico da cena
           * não adianta mais nada.
           */
          if (/[/\\](react|react-dom|scheduler)[/\\]/.test(id)) return 'react';

          if (
            /[/\\](three|three-stdlib|postprocessing|@react-three|maath|its-fine|suspend-react)[/\\]/.test(
              id,
            )
          ) {
            return 'three';
          }

          return undefined;
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
