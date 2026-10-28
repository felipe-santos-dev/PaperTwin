import type { FastifyInstance } from 'fastify';
import type { HealthResponse } from '@mp1/shared';
import { SERVICE_VERSION } from '../env';

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
            },
            required: ['status', 'service', 'version', 'uptimeS', 'database', 'databaseUp'],
          },
        },
      },
    },
    async (): Promise<HealthResponse> => {
      const databaseUp = await app.db.ping().catch(() => false);

      return {
        status: databaseUp ? 'ok' : 'degraded',
        service: 'mp1-twin-api',
        version: SERVICE_VERSION,
        uptimeS: Math.round(process.uptime()),
        database: app.db.driver,
        databaseUp,
      };
    },
  );
}
