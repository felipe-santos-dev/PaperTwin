import type { FastifyInstance } from 'fastify';
import type { HealthResponse } from '@mp1/shared';
import { SERVICE_VERSION } from '../env';
import { DEFAULT_SEED, tickTime } from '../simulation/clock';

/**
 * `GET /health` — sonda de liveness usada pelo dev server e pelo deploy.
 *
 * Consulta o banco de verdade: um serviço que responde "ok" sem conseguir ler
 * uma linha é pior do que um que não responde, porque o balanceador continua
 * mandando tráfego para ele.
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/health',
    {
      schema: {
        tags: ['Operação'],
        summary: 'Saúde do serviço e do banco',
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['ok', 'degraded'] },
              service: { type: 'string' },
              version: { type: 'string' },
              uptimeS: { type: 'integer' },
              database: { type: 'string', enum: ['pglite', 'postgres'] },
              databaseUp: { type: 'boolean' },
              simulation: {
                type: 'object',
                description: 'Onde a simulação parou. Lido do marcador, sem rodar a retomada.',
                properties: {
                  seed: { type: 'integer' },
                  lastTick: { type: ['integer', 'null'] },
                  lastRunAt: { type: ['string', 'null'] },
                  behindS: { type: ['number', 'null'] },
                },
                required: ['seed', 'lastTick', 'lastRunAt', 'behindS'],
                additionalProperties: false,
              },
            },
            required: ['status', 'service', 'version', 'uptimeS', 'database', 'databaseUp'],
          },
        },
      },
    },
    async (): Promise<HealthResponse> => {
      const databaseUp = await app.db.ping().catch(() => false);

      /**
       * O marcador é lido, não recalculado.
       *
       * Chamar `ensureCurrent` aqui faria da sonda de liveness o caminho mais
       * caro da API: um balanceador que a chama a cada dez segundos acordaria a
       * simulação sem ninguém estar olhando.
       */
      const state = databaseUp ? await app.db.findSimState().catch(() => null) : null;
      const now = Date.now();

      return {
        status: databaseUp ? 'ok' : 'degraded',
        service: 'mp1-twin-api',
        version: SERVICE_VERSION,
        uptimeS: Math.round(process.uptime()),
        database: app.db.driver,
        databaseUp,
        simulation: {
          seed: state?.seed ?? DEFAULT_SEED,
          lastTick: state?.lastTick ?? null,
          lastRunAt: state?.updatedAt ?? null,
          behindS:
            state === null
              ? null
              : Math.max(0, Math.round((now - tickTime(state.lastTick).getTime()) / 1000)),
        },
      };
    },
  );
}
