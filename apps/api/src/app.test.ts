import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { HealthResponse } from '@mp1/shared';
import { buildApp } from './app';
import { loadEnv } from './env';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp(loadEnv({ NODE_ENV: 'test' }));
});

afterAll(async () => {
  await app.close();
});

describe('GET /health', () => {
  it('responde 200 com o contrato de HealthResponse', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    const body = response.json<HealthResponse>();
    expect(body.status).toBe('ok');
    expect(body.service).toBe('mp1-twin-api');
    expect(typeof body.version).toBe('string');
    expect(body.uptimeS).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(body.uptimeS)).toBe(true);
  });

  it('responde 404 em rota desconhecida', async () => {
    const response = await app.inject({ method: 'GET', url: '/nao-existe' });
    expect(response.statusCode).toBe(404);
  });
});
