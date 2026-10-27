import type { FastifyInstance } from 'fastify';
import type { HealthResponse } from '@mp1/shared';
import { SERVICE_VERSION } from '../env';

/** `GET /health` — sonda de liveness usada pelo dev server e pelo deploy. */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', (): HealthResponse => {
    return {
      status: 'ok',
      service: 'mp1-twin-api',
      version: SERVICE_VERSION,
      uptimeS: Math.round(process.uptime()),
    };
  });
}
