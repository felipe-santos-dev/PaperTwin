import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // O pacote compartilhado é publicado como TypeScript, então entra no bundle.
  noExternal: ['@mp1/shared'],
});
