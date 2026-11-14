import { defineConfig } from 'vite';

export default defineConfig( {
	base: './',
	build: {
		target: 'es2022',
		assetsInlineLimit: 0,
		chunkSizeWarningLimit: 4000,
		rollupOptions: {
			output: {
				entryFileNames: 'assets/app.js',
				chunkFileNames: 'assets/[name].js',
				assetFileNames: 'assets/[name][extname]',
				inlineDynamicImports: true
			}
		}
	}
} );
