import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { allAssets, MP1 } from '@mp1/shared';
import { buildApp } from '../app';
import { openPglite } from '../db/sql-database';
import { seedDatabase } from '../db/seed';
import { loadEnv } from '../env';

/**
 * Gera o espelho estático da API para o modo de demonstração.
 *
 * A web vive no GitHub Pages, que serve arquivo e nada mais. Sem a API no ar,
 * clicar num mancal não mostraria nada — e um portfólio que abre quebrado não
 * serve para o que existe.
 *
 * O ponto importante é **como** estes arquivos são gerados: em vez de
 * reimplementar a agregação em TypeScript, o script sobe a API de verdade
 * contra o PGlite, com as mesmas migrations e a mesma semeadura, e grava as
 * respostas que ela devolve. O `date_bin()` que monta as janelas é o do
 * Postgres, não uma segunda versão escrita à mão que divergiria na primeira
 * mudança de regra.
 *
 * Por isso os arquivos espelham as rotas:
 *
 *   GET /assets                      -> demo/assets.json
 *   GET /assets/:tag                 -> demo/assets/<tag>.json
 *   GET /assets/:tag/vibration       -> demo/assets/<tag>/vibration.json
 *   GET /health                      -> demo/health.json
 *
 * A série é sempre a janela padrão (72 h em janelas de 1 hora): arquivo
 * estático não tem como responder a `?from=`, e gerar todas as combinações
 * seria trocar um problema por outro.
 */

const OUT_DIR = fileURLToPath(new URL('../../../web/public/demo/', import.meta.url));

/** Instante final da simulação, fixo por execução para a série ser coerente. */
const NOW = new Date();

async function writeJson(relativePath: string, body: unknown): Promise<number> {
  const file = OUT_DIR + relativePath;
  await mkdir(dirname(file), { recursive: true });

  const json = JSON.stringify(body);
  await writeFile(file, json, 'utf8');
  return json.length;
}

/** Chama a rota e devolve o corpo, falhando alto se ela não responder 200. */
async function capture(app: FastifyInstance, url: string): Promise<unknown> {
  const response = await app.inject({ method: 'GET', url });

  if (response.statusCode !== 200) {
    throw new Error(`GET ${url} respondeu ${String(response.statusCode)}: ${response.body}`);
  }
  return response.json();
}

async function main(): Promise<void> {
  const db = await openPglite();
  await db.migrate();
  const seeded = await seedDatabase(db, { now: NOW });

  const app = await buildApp(loadEnv({ NODE_ENV: 'test' }), db);

  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });

  let bytes = 0;
  let files = 0;

  bytes += await writeJson('health.json', await capture(app, '/health'));
  bytes += await writeJson('assets.json', await capture(app, '/assets'));
  files += 2;

  for (const asset of allAssets(MP1)) {
    const tag = encodeURIComponent(asset.tag);

    bytes += await writeJson(`assets/${asset.tag}.json`, await capture(app, `/assets/${tag}`));
    files += 1;

    // só os ativos medidos têm série; os demais não têm o que espelhar
    if (!asset.iso) continue;

    bytes += await writeJson(
      `assets/${asset.tag}/vibration.json`,
      await capture(app, `/assets/${tag}/vibration`),
    );
    files += 1;
  }

  await app.close();

  console.log(
    `demo: ${String(files)} arquivos, ${(bytes / 1024).toFixed(0)} kB — ` +
      `${String(seeded.assets)} ativos, ${String(seeded.readings)} leituras até ${NOW.toISOString()}`,
  );
}

await main();
