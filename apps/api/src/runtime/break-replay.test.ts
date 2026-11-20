import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  allAssets,
  BREAK_WATCH_TAGS,
  HISTORIAN_POINTS,
  MP1,
  shiftWindowAt,
  type WebBreak,
} from '@mp1/shared';
import { TICKS_PER_HOUR, tickTime } from '@mp1/shared/simulation';

import { buildApp } from '../app';
import { openPglite } from '../db/sql-database';
import { loadEnv } from '../env';
import { catchUp } from './catchup';
import { shiftPlan } from '../simulation/scenarios';

/**
 * O teste que a Fase 5 existe para passar.
 *
 * O cenário perturba **uma** malha dez minutos antes da quebra, e ninguém conta
 * isso ao diagnóstico: ele lê as séries do arquivo e decide sozinho. Se a malha
 * perturbada não sair em primeiro lugar, ou a conta está errada ou a rede de
 * relações deixou de propagar — e nos dois casos a tela de replay estaria
 * apontando o inocente.
 *
 * O turno é escolhido por ter quebra: `webBreakOf` dá uma por dia de operação,
 * no turno que o ruído por posição escolher, e o de 15/06 é o C. Fixar o turno
 * aqui é o que torna o teste determinístico sem fixar a resposta.
 */

const SEED = 4242;

/** O turno C de 15/06, que neste cenário é o que tem quebra. */
const TURNO = shiftWindowAt(new Date('2026-06-16T02:00:00Z'));
const PLANO = shiftPlan(SEED, TURNO);

/** Seis horas de turno: depois da quebra, que cai entre 25 % e 75 % dele. */
const NOW = tickTime(PLANO.startTick + 6 * TICKS_PER_HOUR);

let app: FastifyInstance;

beforeAll(async () => {
  const db = await openPglite();
  await db.migrate();
  await db.replaceAssets(allAssets(MP1));
  await db.replaceHistorianPoints(HISTORIAN_POINTS);
  await db.saveSimState({
    seed: SEED,
    lastTick: PLANO.startTick,
    updatedAt: tickTime(PLANO.startTick),
  });
  await catchUp(db, { seed: SEED, now: NOW });

  app = await buildApp(loadEnv({ NODE_ENV: 'test' }), db, { seed: SEED, clock: () => NOW });
  await app.simulation.ensureCurrent();
}, 180_000);

afterAll(async () => {
  await app.close();
});

const get = (url: string) => app.inject({ method: 'GET', url });

interface Replay {
  webBreak: WebBreak;
  replay: {
    breakAt: number;
    windowS: number;
    deviations: {
      tag: string;
      leadTimeS: number;
      direction: string;
      sigmas: number;
      consequenceOf: string | null;
    }[];
    quiet: string[];
    unknown: string[];
    first: { tag: string } | null;
  };
  series: { tag: string; baseline: number | null; samples: { t: string; v: number }[] }[];
  events: { alarms: unknown[]; setpointChanges: unknown[]; gradeChanges: unknown[] };
  pattern: { sameSection: number; sameFirst: number; tag: string | null };
}

describe('o replay da quebra', () => {
  it('o turno escolhido tem quebra, senão o resto não prova nada', () => {
    expect(PLANO.webBreak, 'o cenário mudou e este turno não tem mais quebra').not.toBeNull();
  });

  it('a quebra do cenário foi colhida', async () => {
    const body = (await get('/web-breaks')).json<{ count: number; webBreaks: WebBreak[] }>();
    expect(body.count).toBeGreaterThan(0);
  });

  it('aponta a malha que o cenário perturbou', async () => {
    const plano = PLANO.webBreak;
    expect(plano).not.toBeNull();
    if (!plano) return;

    const body = (await get(`/web-breaks/QB-${String(plano.startTick)}/replay`)).json<Replay>();

    expect(body.replay.first, 'nenhum desvio na janela da quebra').not.toBeNull();
    expect(body.replay.first?.tag, 'o primeiro desvio não é a malha perturbada').toBe(
      plano.upsetTag,
    );
    expect(body.replay.deviations[0]?.tag).toBe(plano.upsetTag);
    expect(body.replay.deviations[0]?.consequenceOf).toBeNull();
    expect(body.replay.deviations[0]?.sigmas).toBeGreaterThan(3);
  });

  it('o desvio está dentro da janela de 10 min', async () => {
    const plano = PLANO.webBreak;
    if (!plano) return;

    const body = (await get(`/web-breaks/QB-${String(plano.startTick)}/replay`)).json<Replay>();

    for (const desvio of body.replay.deviations) {
      expect(desvio.leadTimeS, desvio.tag).toBeGreaterThanOrEqual(0);
      expect(desvio.leadTimeS, desvio.tag).toBeLessThanOrEqual(body.replay.windowS);
    }
  });

  it('traz uma série por tag observada, em ordem de tempo', async () => {
    const plano = PLANO.webBreak;
    if (!plano) return;

    const body = (await get(`/web-breaks/QB-${String(plano.startTick)}/replay`)).json<Replay>();

    expect(body.series.map((item) => item.tag).sort()).toEqual([...BREAK_WATCH_TAGS].sort());
    for (const série of body.series) {
      expect(série.samples.length, `${série.tag} sem amostra`).toBeGreaterThan(0);
      const instantes = série.samples.map((amostra) => Date.parse(amostra.t));
      expect(
        [...instantes].sort((a, b) => a - b),
        série.tag,
      ).toEqual(instantes);
    }
  });

  /**
   * A entidade e a tela têm de contar a mesma história.
   *
   * A colheita grava os precursores na retomada; a rota refaz a conta sobre as
   * séries. Como é a mesma `diagnoseBreak`, a ordem tem de bater — se um dia
   * alguém der uma régua própria a um dos dois lados, é aqui que aparece.
   */
  it('a ordem bate com os precursores gravados na entidade', async () => {
    const plano = PLANO.webBreak;
    if (!plano) return;

    const body = (await get(`/web-breaks/QB-${String(plano.startTick)}/replay`)).json<Replay>();

    expect(body.replay.deviations.map((item) => item.tag)).toEqual(
      body.webBreak.precursors.map((item) => item.tag),
    );
  });

  it('traz os eventos do período e o padrão', async () => {
    const plano = PLANO.webBreak;
    if (!plano) return;

    const body = (await get(`/web-breaks/QB-${String(plano.startTick)}/replay`)).json<Replay>();

    expect(body.events).toHaveProperty('alarms');
    expect(body.events).toHaveProperty('setpointChanges');
    expect(body.events).toHaveProperty('gradeChanges');
    expect(body.pattern.tag).toBe(plano.upsetTag);
    expect(body.pattern.sameFirst).toBeLessThanOrEqual(body.pattern.sameSection);
  });

  it('responde 404 para quebra que não existe', async () => {
    expect((await get('/web-breaks/QB-0/replay')).statusCode).toBe(404);
  });
});
