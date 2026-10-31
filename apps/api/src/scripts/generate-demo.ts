import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { allAssets, HISTORIAN_POINTS, MP1, PROCESS_CATALOG, shiftWindowAt } from '@mp1/shared';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../app';
import { openPglite } from '../db/sql-database';
import { seedDatabase } from '../db/seed';
import { loadEnv } from '../env';
import { catchUp } from '../runtime/catchup';
import { DEFAULT_SEED, TICKS_PER_HOUR, tickAt, tickTime } from '../simulation/clock';
import { shiftPlan } from '../simulation/scenarios';

/**
 * Gera o espelho estático da API para o modo de demonstração.
 *
 * A web vive no GitHub Pages, que serve arquivo e nada mais. Sem a API no ar,
 * abrir a tela de Turno não mostraria nada — e um portfólio que abre quebrado
 * não serve para o que existe.
 *
 * O ponto importante é **como** estes arquivos são gerados: em vez de
 * reimplementar a agregação em TypeScript, o script sobe a API de verdade
 * contra o PGlite, com as mesmas migrations, a mesma simulação e a mesma
 * retomada, e grava as respostas que ela devolve. O `date_bin()` que monta as
 * colunas do gráfico é o do Postgres, não uma segunda versão escrita à mão que
 * divergiria na primeira mudança de regra.
 *
 * ## Um arquivo por rota
 *
 * O nome do arquivo é o caminho da rota com `/` virando `~`:
 *
 *   GET /shifts                      -> demo/shifts.json
 *   GET /shifts/T-2026-06-15-B       -> demo/shifts~T-2026-06-15-B.json
 *   GET /process/tags/PIC-514/trend  -> demo/process~tags~PIC-514~trend.json
 *
 * Os parâmetros de consulta **não** entram no nome. O portão de demonstração
 * baixa a lista inteira e filtra no cliente, e a razão está lá: com a consulta
 * no nome, o gerador teria de acertar exatamente as combinações que as sete
 * telas pedem, e um filtro novo em qualquer tela daria 404 sem ninguém notar.
 *
 * As rotas da Fase 3 mantêm o caminho de pasta que já tinham
 * (`assets/<tag>.json`), porque `demo.ts` as lê assim desde então e trocar o
 * nome para ganhar consistência cosmética quebraria um instantâneo publicado.
 *
 * ## O instante é fixo
 *
 * A simulação roda até um instante **escolhido**, e não até `Date.now()`: o
 * instante é o do turno B de um dia com troca de gramatura, quatro horas
 * adentro, o que garante que o instantâneo tenha turno, bobinas fechadas, ronda,
 * troca e alarme. Com o relógio de parede, o instantâneo de uma build noturna
 * cairia num turno sem nada acontecendo.
 */

const OUT_DIR = fileURLToPath(new URL('../../../web/public/demo/', import.meta.url));

/**
 * O instante do instantâneo.
 *
 * Turno B de 15/06/2026, quatro horas adentro. O plano põe a troca de gramatura
 * três horas depois do começo do turno, então a janela de quatro horas contém a
 * transição inteira e o fechamento da bobina que a pegou.
 */
const SHIFT = shiftWindowAt(new Date('2026-06-15T18:00:00Z'));
const PLAN = shiftPlan(DEFAULT_SEED, SHIFT);
const NOW = tickTime(PLAN.startTick + 4 * TICKS_PER_HOUR);

/**
 * As tags que ganham detalhe e tendência no instantâneo.
 *
 * Todas as 320 do catálogo ganham detalhe (um objeto pequeno cada), e todas as
 * que são ponto do historiador ganham tendência. São ~2 MB em disco, carregados
 * um por clique — o que faz o modo de demonstração ser um espelho completo em
 * vez de um recorte que frustra no segundo clique.
 */
const TREND_BUCKETS = 240;

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

/** O nome do arquivo de uma rota: `/a/b` vira `a~b.json`. */
function fileFor(path: string): string {
  return `${path.replace(/^\//, '').replace(/\//g, '~')}.json`;
}

async function main(): Promise<void> {
  const db = await openPglite();
  await db.migrate();
  const seeded = await seedDatabase(db, { now: NOW });

  /**
   * A simulação roda a partir do começo do turno.
   *
   * Sem o marcador, a retomada reancoraria quatro horas antes de `NOW` — o que
   * daria quatro horas de dados mas começando no meio do turno anterior. Com o
   * marcador no começo do turno B, a janela é exatamente o turno.
   */
  await db.saveSimState({
    seed: DEFAULT_SEED,
    lastTick: PLAN.startTick,
    updatedAt: tickTime(PLAN.startTick),
  });

  /**
   * A semente é a padrão, a mesma da API ao vivo.
   *
   * Importa que seja: o instantâneo e a API ao vivo contam a mesma história, e
   * quem compara os dois num mesmo instante vê os mesmos números.
   */
  const report = await catchUp(db, { now: NOW });

  const app = await buildApp(loadEnv({ NODE_ENV: 'test' }), db, { clock: () => NOW });

  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });

  let bytes = 0;
  let files = 0;

  const grab = async (path: string, name = fileFor(path)): Promise<void> => {
    bytes += await writeJson(name, await capture(app, path));
    files += 1;
  };

  // --- Fase 3: mantém os caminhos de pasta que `demo.ts` já lê ---

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

  // --- Fase 5: as listas, uma por rota ---

  for (const path of [
    '/process/values',
    '/process/steam-groups',
    '/alarms',
    '/shifts',
    '/reels',
    '/web-breaks',
    '/grade-changes',
    '/rounds',
    '/notes',
    '/setpoint-changes',
  ]) {
    await grab(path);
  }

  // --- os detalhes que as telas abrem ---

  const shifts = (await capture(app, '/shifts')) as { shifts: { id: string }[] };
  for (const shift of shifts.shifts) {
    await grab(`/shifts/${encodeURIComponent(shift.id)}`);
  }

  const reels = (await capture(app, '/reels')) as { reels: { number: number }[] };
  for (const reel of reels.reels) {
    await grab(`/reels/${String(reel.number)}`);
  }

  const rounds = (await capture(app, '/rounds')) as { rounds: { id: string }[] };
  for (const round of rounds.rounds) {
    await grab(`/rounds/${encodeURIComponent(round.id)}`);
  }

  const notes = (await capture(app, '/notes')) as { notes: { number: string }[] };
  for (const note of notes.notes) {
    await grab(`/notes/${encodeURIComponent(note.number)}`);
  }

  // --- catálogo e tendência de cada tag ---

  const archived = new Set(HISTORIAN_POINTS.map((point) => point.tag));
  const from = new Date(NOW.getTime() - 4 * 3_600_000).toISOString();

  for (const variable of PROCESS_CATALOG) {
    const tag = encodeURIComponent(variable.tag);
    await grab(`/process/tags/${tag}`, fileFor(`/process/tags/${variable.tag}`));

    if (!archived.has(variable.tag)) continue;

    bytes += await writeJson(
      fileFor(`/process/tags/${variable.tag}/trend`),
      await capture(
        app,
        `/process/tags/${tag}/trend?from=${from}&to=${NOW.toISOString()}` +
          `&buckets=${String(TREND_BUCKETS)}`,
      ),
    );
    files += 1;
  }

  await app.close();

  console.log(
    `demo: ${String(files)} arquivos, ${(bytes / 1024).toFixed(0)} kB — ` +
      `${String(seeded.assets)} ativos, ${String(report.scans)} varreduras, ` +
      `${String(report.archived)} linhas arquivadas, ` +
      `${String(report.entities.reels)} bobinas, ${String(report.entities.rounds)} rondas, ` +
      `compressão ${report.compression.ratio.toFixed(0)}:1, até ${NOW.toISOString()}`,
  );
}

await main();

/** O passo do instante do instantâneo, exposto para quem precisa conferir. */
export const SNAPSHOT_TICK = tickAt(NOW);
