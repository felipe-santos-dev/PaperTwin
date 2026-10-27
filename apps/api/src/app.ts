import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import type { Env } from './env';
import { healthRoutes } from './routes/health';

/**
 * Monta a aplicação sem subir servidor, para os testes poderem usar `app.inject()`
 * sem abrir porta.
 */
export async function buildApp(env: Env): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL },
  });

  await app.register(cors, { origin: true });
  await app.register(healthRoutes);

  return app;
}
