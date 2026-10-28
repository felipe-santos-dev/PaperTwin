import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  classifyIsoZone,
  DRYER_BEARING_ISO,
  isoLimitsOf,
  type AssetStatus,
  type HealthResponse,
  type IsoLimits,
  type MachineAsset,
  type RemainingLife,
  type VibrationBucket,
} from '@mp1/shared';
import { buildApp } from '../app';
import { PgliteRepository } from '../db/pglite-repository';
import { DEGRADING_TAG, seedDatabase } from '../db/seed';
import { loadEnv } from '../env';

/**
 * As rotas contra um banco de verdade — PGlite com a semeadura completa, não
 * repositório falso. Um dublê esconde justamente o que costuma quebrar: o SQL.
 */

/** Fim da janela simulada, fixo para as asserções não dependerem do relógio. */
const NOW = new Date('2026-03-04T00:00:00Z');
const WINDOW_MS = 72 * 60 * 60 * 1000;
const FROM = new Date(NOW.getTime() - WINDOW_MS);

let app: FastifyInstance;

beforeAll(async () => {
  const db = await PgliteRepository.open();
  await db.migrate();
  await seedDatabase(db, { now: NOW, windowMs: WINDOW_MS });
  app = await buildApp(loadEnv({ NODE_ENV: 'test' }), db);
}, 120_000);

afterAll(async () => {
  await app.close();
});

const get = (url: string) => app.inject({ method: 'GET', url });

describe('GET /health', () => {
  it('relata o driver e que o banco responde', async () => {
    const response = await get('/health');
    expect(response.statusCode).toBe(200);

    const body = response.json<HealthResponse>();
    expect(body.status).toBe('ok');
    expect(body.database).toBe('pglite');
    expect(body.databaseUp).toBe(true);
  });
});

describe('GET /assets', () => {
  it('lista a máquina inteira', async () => {
    const body = (await get('/assets')).json<{ count: number; assets: MachineAsset[] }>();
    expect(body.count).toBe(body.assets.length);
    expect(body.count).toBeGreaterThan(100);
  });

  it('filtra por seção', async () => {
    const body = (await get('/assets?section=calender')).json<{ assets: MachineAsset[] }>();
    expect(body.assets.length).toBeGreaterThan(0);
    expect(body.assets.every((a) => a.section === 'calender')).toBe(true);
  });

  it('filtra por tipo', async () => {
    const body = (await get('/assets?kind=scanner')).json<{ assets: MachineAsset[] }>();
    expect(body.assets.map((a) => a.tag).sort()).toEqual(['MP1-QCS-SC1', 'MP1-QCS-SC2']);
  });

  it('recusa filtro fora do vocabulário', async () => {
    expect((await get('/assets?section=inventada')).statusCode).toBe(400);
    expect((await get('/assets?inventado=1')).statusCode).toBe(400);
  });
});

describe('GET /assets/:tag', () => {
  it('devolve o mancal em degradação já na zona D', async () => {
    const response = await get(`/assets/${DEGRADING_TAG}`);
    expect(response.statusCode).toBe(200);

    const body = response.json<{
      asset: MachineAsset;
      status: AssetStatus;
      limits: IsoLimits;
    }>();

    expect(body.asset.tag).toBe(DEGRADING_TAG);
    expect(body.asset.kind).toBe('bearing');
    expect(body.limits).toEqual(isoLimitsOf(DRYER_BEARING_ISO));
    expect(body.status.zone).toBe('D');
    expect(body.status.health).toBe('critical');
    expect(body.status.latest?.rmsMmS).toBeGreaterThan(body.limits.cToD);
  });

  it('classifica a zona coerente com a última leitura', async () => {
    const body = (await get(`/assets/${DEGRADING_TAG}`)).json<{
      status: AssetStatus;
      limits: IsoLimits;
    }>();
    const rms = body.status.latest?.rmsMmS ?? 0;
    expect(body.status.zone).toBe(classifyIsoZone(rms, body.limits));
  });

  it('deixa um mancal saudável fora das zonas de alarme', async () => {
    const body = (await get('/assets/MP1-SEC-G1-CS01-MLA')).json<{ status: AssetStatus }>();
    expect(['A', 'B']).toContain(body.status.zone);
    expect(body.status.health).toBe('normal');
  });

  it('não promete zona para ativo sem medição', async () => {
    const body = (await get('/assets/MP1-QCS-SC1')).json<{
      status: AssetStatus;
      limits: IsoLimits | null;
    }>();
    expect(body.limits).toBeNull();
    expect(body.status.zone).toBeNull();
    expect(body.status.latest).toBeNull();
  });

  it('responde 404 para tag desconhecida', async () => {
    const response = await get('/assets/MP1-NAO-EXISTE');
    expect(response.statusCode).toBe(404);
    expect(response.json<{ message: string }>().message).toMatch(/não existe/);
  });
});

describe('GET /assets/:tag/vibration', () => {
  const url = (query: string) => `/assets/${DEGRADING_TAG}/vibration?${query}`;

  it('agrega por hora dentro da janela pedida', async () => {
    const response = await get(
      url(`from=${FROM.toISOString()}&to=${NOW.toISOString()}&bucket=1 hour`),
    );
    expect(response.statusCode).toBe(200);

    const body = response.json<{ buckets: VibrationBucket[]; bucket: string }>();
    expect(body.bucket).toBe('1 hour');
    expect(body.buckets).toHaveLength(72);
    expect(body.buckets[0]?.samples).toBe(4); // amostras de 15 min
  });

  it('muda a granularidade com o bucket', async () => {
    const body = (
      await get(url(`from=${FROM.toISOString()}&to=${NOW.toISOString()}&bucket=6 hours`))
    ).json<{ buckets: VibrationBucket[] }>();
    expect(body.buckets).toHaveLength(12);
  });

  it('mostra a vibração subindo ao longo da janela', async () => {
    const body = (
      await get(url(`from=${FROM.toISOString()}&to=${NOW.toISOString()}&bucket=6 hours`))
    ).json<{ buckets: VibrationBucket[] }>();

    const primeiro = body.buckets[0]?.rmsAvgMmS ?? 0;
    const último = body.buckets.at(-1)?.rmsAvgMmS ?? 0;
    expect(último).toBeGreaterThan(primeiro * 2);
  });

  it('estima a vida útil restante com a tendência', async () => {
    const body = (
      await get(url(`from=${FROM.toISOString()}&to=${NOW.toISOString()}&bucket=1 hour`))
    ).json<{ remainingLife: RemainingLife }>();

    expect(body.remainingLife.trendMmSPerDay).toBeGreaterThan(0);
    expect(body.remainingLife.samples).toBe(72);
    // já passou da fronteira: não resta vida
    expect(body.remainingLife.daysToZoneD).toBe(0);
  });

  it('não estima vida útil para mancal sem tendência', async () => {
    const body = (
      await get(
        `/assets/MP1-SEC-G1-CS01-MLA/vibration?from=${FROM.toISOString()}&to=${NOW.toISOString()}`,
      )
    ).json<{ remainingLife: RemainingLife }>();
    expect(body.remainingLife.daysToZoneD).toBeNull();
  });

  it('usa as últimas 72 h quando a janela não é informada', async () => {
    const body = (await get(`/assets/${DEGRADING_TAG}/vibration`)).json<{
      from: string;
      to: string;
    }>();
    expect(Date.parse(body.to) - Date.parse(body.from)).toBe(WINDOW_MS);
  });

  it('recusa janela invertida', async () => {
    const response = await get(
      url(`from=${NOW.toISOString()}&to=${FROM.toISOString()}&bucket=1 hour`),
    );
    expect(response.statusCode).toBe(400);
  });

  it('recusa bucket fora da lista', async () => {
    expect((await get(url('bucket=37 minutes'))).statusCode).toBe(400);
  });

  it('responde 404 para tag desconhecida', async () => {
    expect((await get('/assets/MP1-NAO-EXISTE/vibration')).statusCode).toBe(404);
  });
});

describe('OpenAPI', () => {
  it('documenta as três rotas e os schemas nomeados', () => {
    const doc = app.swagger() as {
      openapi: string;
      paths: Record<string, unknown>;
      components: { schemas: Record<string, unknown> };
    };

    expect(doc.openapi).toMatch(/^3\.1/);
    expect(Object.keys(doc.paths).sort()).toEqual([
      '/assets',
      '/assets/{tag}',
      '/assets/{tag}/vibration',
      '/health',
    ]);
    expect(Object.keys(doc.components.schemas)).toEqual(
      expect.arrayContaining(['Asset', 'VibrationBucket', 'RemainingLife']),
    );
  });

  it('serve a interface de documentação', async () => {
    const response = await get('/docs/json');
    expect(response.statusCode).toBe(200);
    expect(response.json<{ openapi: string }>().openapi).toMatch(/^3\.1/);
  });
});
