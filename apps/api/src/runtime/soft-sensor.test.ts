import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  allAssets,
  HISTORIAN_POINTS,
  LAB_ANALYSIS_MINUTES,
  MD_TENSILE_SPEC,
  MP1,
  shiftWindowAt,
  type LabResult,
} from '@mp1/shared';
import { DEFAULT_SEED, TICKS_PER_HOUR, tickTime } from '@mp1/shared/simulation';

import { buildApp } from '../app';
import { DRIVERS } from '../db/test-drivers';
import { loadEnv } from '../env';
import { shiftPlan } from '../simulation/scenarios';
import { catchUp } from './catchup';
import { LAB_REPEATABILITY_KN_M } from './lab';

/**
 * O laboratório como evento, e o sensor virtual sobre ele.
 *
 * O turno e o instante são os do instantâneo de demonstração: turno B de 15/06,
 * quatro horas adentro, que é onde há bobinas fechadas o bastante para haver
 * laudo, viés e faixa. A semente é a padrão pelo mesmo motivo do gerador — o
 * que este teste vê é o que a tela vai mostrar.
 */

const driver = DRIVERS[0];
if (!driver) throw new Error('nenhum driver de teste disponível');

const TURNO = shiftWindowAt(new Date('2026-06-15T18:00:00Z'));
const PLANO = shiftPlan(DEFAULT_SEED, TURNO);
const NOW = tickTime(PLANO.startTick + 4 * TICKS_PER_HOUR);
const LENTO = 180_000;

let app: FastifyInstance;

beforeAll(async () => {
  const { db } = await driver.openWithSql();
  await db.migrate();
  await db.replaceAssets(allAssets(MP1));
  await db.replaceHistorianPoints(HISTORIAN_POINTS);
  await db.saveSimState({
    seed: DEFAULT_SEED,
    lastTick: PLANO.startTick,
    updatedAt: tickTime(PLANO.startTick),
  });

  app = await buildApp(loadEnv({ NODE_ENV: 'test' }), db, { clock: () => NOW });
  await catchUp(db, { now: NOW });
}, LENTO);

afterAll(async () => {
  await app.close();
});

const get = (url: string) => app.inject({ method: 'GET', url });

interface Quality {
  tag: string;
  unit: string;
  spec: { lo: number; hi: number; target: number };
  model: { base: number; terms: { tag: string; kp: number; at: number }[] };
  calibration: { bias: number; sd: number | null; samples: number; lastAt: string | null };
  now: { t: string; value: number; lo: number | null; hi: number | null } | null;
  points: { t: string; value: number; lo: number | null; hi: number | null }[];
  results: LabResult[];
  lastResult: LabResult | null;
}

describe('o ensaio como evento', () => {
  it(
    'cada bobina fechada deixa um laudo, com amostra e laudo em instantes diferentes',
    async () => {
      const body = (await get('/lab-results')).json<{ count: number; results: LabResult[] }>();

      expect(body.count).toBeGreaterThan(2);

      for (const result of body.results) {
        expect(result.tag).toBe(MD_TENSILE_SPEC.tag);
        expect(result.unit).toBe('kN/m');
        const atraso = (Date.parse(result.reportedAt) - Date.parse(result.sampledAt)) / 60_000;
        expect(atraso).toBe(LAB_ANALYSIS_MINUTES);
      }

      // a ordem é pela amostra, da mais recente para a mais antiga
      const amostras = body.results.map((item) => Date.parse(item.sampledAt));
      expect([...amostras].sort((a, b) => b - a)).toEqual(amostras);
    },
    LENTO,
  );

  it(
    'a amostra sai do fim da bobina',
    async () => {
      const { results } = (await get('/lab-results')).json<{ results: LabResult[] }>();
      const laudo = results.at(-1);
      if (!laudo) throw new Error('nenhum laudo');

      const bobina = (await get(`/reels/${String(laudo.reelNumber)}`)).json<{
        reel: { endedAt: string | null };
      }>();

      expect(bobina.reel.endedAt).toBe(laudo.sampledAt);
    },
    LENTO,
  );

  it(
    'os valores ficam perto do alvo, dentro da faixa do ensaio',
    async () => {
      const { results } = (await get('/lab-results')).json<{ results: LabResult[] }>();

      for (const result of results) {
        expect(result.value).toBeGreaterThan(MD_TENSILE_SPEC.lo);
        expect(result.value).toBeLessThan(MD_TENSILE_SPEC.hi);
        expect(result.withinSpec).toBe(true);
      }
    },
    LENTO,
  );

  it(
    'dois laudos não são o mesmo número: a bancada tem repetibilidade',
    async () => {
      const { results } = (await get('/lab-results')).json<{ results: LabResult[] }>();
      const valores = new Set(results.map((item) => item.value));

      expect(valores.size).toBeGreaterThan(1);
      const espalhamento = Math.max(...valores) - Math.min(...valores);
      expect(espalhamento).toBeLessThan(10 * LAB_REPEATABILITY_KN_M);
    },
    LENTO,
  );
});

describe('o sensor virtual', () => {
  it(
    'o modelo é o ganho medido da relação, e a base é o ponto de operação',
    async () => {
      const body = (await get(`/process/quality/${MD_TENSILE_SPEC.tag}`)).json<Quality>();

      expect(body.model.base).toBeCloseTo(MD_TENSILE_SPEC.target, 6);
      expect(body.model.terms).toHaveLength(1);
      expect(body.model.terms[0]?.tag).toBe('JIC-101');
      expect(body.model.terms[0]?.kp).toBeCloseTo(0.0425, 4);
    },
    LENTO,
  );

  it(
    'a série tem pontos, e o último é a estimativa de agora',
    async () => {
      const body = (await get(`/process/quality/${MD_TENSILE_SPEC.tag}`)).json<Quality>();

      expect(body.points.length).toBeGreaterThan(10);
      expect(body.now).not.toBeNull();
      expect(body.now?.t).toBe(body.points.at(-1)?.t);
      expect(body.now?.value).toBeGreaterThan(MD_TENSILE_SPEC.lo);
      expect(body.now?.value).toBeLessThan(MD_TENSILE_SPEC.hi);
    },
    LENTO,
  );

  it(
    'a calibração vem dos laudos já emitidos, e a faixa aparece com três',
    async () => {
      const body = (await get(`/process/quality/${MD_TENSILE_SPEC.tag}`)).json<Quality>();

      expect(body.calibration.samples).toBeGreaterThanOrEqual(3);
      expect(body.calibration.sd).not.toBeNull();
      expect(body.now?.lo).not.toBeNull();
      expect(body.now?.hi).not.toBeNull();
      // a faixa é pequena perto da especificação: o modelo não está perdido
      const faixa = (body.now?.hi ?? 0) - (body.now?.lo ?? 0);
      expect(faixa).toBeGreaterThan(0);
      expect(faixa).toBeLessThan(MD_TENSILE_SPEC.hi - MD_TENSILE_SPEC.lo);
    },
    LENTO,
  );

  /**
   * O teste que diz se o sensor serve para alguma coisa.
   *
   * A estimativa no instante em que a amostra foi cortada tem de cair dentro da
   * faixa que ela mesma declara em volta do laudo que veio depois. Se não
   * cair, a faixa está mentindo sobre a incerteza — que é pior do que não ter
   * estimativa.
   */
  it(
    'a estimativa acerta o laudo dentro da faixa que ela declara',
    async () => {
      const body = (await get(`/process/quality/${MD_TENSILE_SPEC.tag}`)).json<Quality>();
      const laudo = body.results.at(-1);
      const faixa = (body.now?.hi ?? 0) - (body.now?.value ?? 0);

      expect(laudo).toBeDefined();
      if (!laudo) return;

      // o ponto da série mais próximo do instante da amostra
      const amostra = Date.parse(laudo.sampledAt);
      const perto = [...body.points].sort(
        (a, b) => Math.abs(Date.parse(a.t) - amostra) - Math.abs(Date.parse(b.t) - amostra),
      )[0];

      expect(perto).toBeDefined();
      expect(Math.abs((perto?.value ?? 0) - laudo.value)).toBeLessThanOrEqual(faixa);
    },
    LENTO,
  );

  it(
    'um laudo que ainda não ficou pronto não entra na conta',
    async () => {
      const { results } = (await get('/lab-results')).json<{ results: LabResult[] }>();
      const último = results[0];
      if (!último) throw new Error('nenhum laudo');

      // um instante depois da amostra e antes do laudo
      const entre = new Date(Date.parse(último.sampledAt) + 60_000).toISOString();
      const from = new Date(Date.parse(último.sampledAt) - 3 * 3_600_000).toISOString();
      const body = (
        await get(
          `/process/quality/${MD_TENSILE_SPEC.tag}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(entre)}`,
        )
      ).json<Quality>();

      expect(body.results.some((item) => item.id === último.id)).toBe(false);
      expect(body.lastResult?.id).not.toBe(último.id);
      // e mesmo assim há estimativa: é justamente para esse buraco que ela existe
      expect(body.now).not.toBeNull();
    },
    LENTO,
  );

  it(
    'ensaio sem relação declarada não tem estimativa, e isso é 404',
    async () => {
      const response = await get('/process/quality/LAB-1204');

      expect(response.statusCode).toBe(404);
      expect(response.json<{ message: string }>().message).toContain('relação declarada');
    },
    LENTO,
  );

  it(
    'janela invertida é 400',
    async () => {
      const response = await get(
        `/process/quality/${MD_TENSILE_SPEC.tag}?from=2026-06-15T22:00:00Z&to=2026-06-15T19:00:00Z`,
      );

      expect(response.statusCode).toBe(400);
    },
    LENTO,
  );
});
