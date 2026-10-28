import { cp, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/**
 * Copia as migrations para o bundle.
 *
 * O tsup empacota só JavaScript, e as migrations são lidas do disco em tempo de
 * execução de propósito — assim o mesmo arquivo `.sql` roda no tsx, no Vitest e
 * no `node dist/`, sem um caminho diferente por ambiente. O preço é esta cópia.
 */

const from = fileURLToPath(new URL('../src/db/migrations/', import.meta.url));
const to = fileURLToPath(new URL('../dist/migrations/', import.meta.url));

await cp(from, to, { recursive: true });

const copied = (await readdir(to)).filter((file) => file.endsWith('.sql'));
if (copied.length === 0) {
  throw new Error('Nenhuma migration copiada para dist/ — o build sairia sem esquema.');
}

console.log(`migrations copiadas: ${copied.join(', ')}`);
