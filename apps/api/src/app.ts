import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { Database } from './db';
import { SERVICE_VERSION, type Env } from './env';
import { assetRoutes } from './routes/assets';
import { healthRoutes } from './routes/health';
import { SHARED_SCHEMAS } from './routes/schemas';

declare module 'fastify' {
  interface FastifyInstance {
    db: Database;
  }
}

/**
 * Monta a aplicação sem subir servidor, para os testes poderem usar `app.inject()`
 * sem abrir porta.
 *
 * O banco entra por parâmetro em vez de ser aberto aqui dentro: é o que permite
 * rodar a mesma suíte contra o PGlite e contra um Postgres de verdade.
 */
export async function buildApp(env: Env, db: Database): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL },
    ajv: {
      customOptions: {
        /**
         * O padrão do Fastify é descartar em silêncio o que não está no schema.
         * Aqui um `?secao=press` em vez de `?section=press` devolveria a máquina
         * inteira sem avisar; é melhor recusar e dizer qual campo sobra.
         */
        removeAdditional: false,
      },
    },
  });

  app.decorate('db', db);
  app.addHook('onClose', async () => {
    await db.close();
  });

  await app.register(cors, { origin: true });

  for (const schema of SHARED_SCHEMAS) await Promise.resolve(app.addSchema(schema));

  await app.register(swagger, {
    /**
     * Sem isto os schemas registrados saem no documento como `def-0`, `def-1` e
     * por aí, o que torna o OpenAPI ilegível para quem for consumir a API.
     */
    refResolver: {
      buildLocalReference: (json, _baseUri, _fragment, i) =>
        typeof json['$id'] === 'string' ? json['$id'] : `def-${String(i)}`,
    },
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Papermill-Twin · API da MP1',
        version: SERVICE_VERSION,
        description: [
          'Ativos e vibração do gêmeo digital da máquina de papel MP1.',
          '',
          'As tags são fictícias e as leituras são simuladas: nenhum dado aqui',
          'corresponde a um ativo real de uma planta.',
        ].join('\n'),
      },
      tags: [
        { name: 'Ativos', description: 'Seções, cilindros, rolos e mancais.' },
        { name: 'Vibração', description: 'Séries e classificação pela ISO 20816-3.' },
        { name: 'Operação', description: 'Saúde do serviço.' },
      ],
    },
  });

  await app.register(swaggerUi, { routePrefix: '/docs' });

  await app.register(healthRoutes);
  await app.register(assetRoutes);

  return app;
}
