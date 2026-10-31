import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { Database } from './db';
import { corsOrigins, SERVICE_VERSION, type Env } from './env';
import { alarmRoutes } from './routes/alarms';
import { assetRoutes } from './routes/assets';
import { healthRoutes } from './routes/health';
import { operationRoutes } from './routes/operations';
import { processRoutes } from './routes/process';
import { PROCESS_SCHEMAS } from './routes/process-schemas';
import { SHARED_SCHEMAS } from './routes/schemas';
import { streamRoutes } from './routes/stream';
import { simulationService, type SimulationService } from './runtime/service';

declare module 'fastify' {
  interface FastifyInstance {
    db: Database;
    /**
     * O serviço da simulação.
     *
     * Decorado na aplicação, e não criado por rota, porque ele guarda o estado
     * que deduplica a retomada: com um serviço por rota, três requisições
     * simultâneas abririam três retomadas do mesmo intervalo.
     */
    simulation: SimulationService;
  }
}

/**
 * Monta a aplicação sem subir servidor, para os testes poderem usar `app.inject()`
 * sem abrir porta.
 *
 * O banco entra por parâmetro em vez de ser aberto aqui dentro: é o que permite
 * rodar a mesma suíte contra o PGlite e contra um Postgres de verdade.
 */
export interface BuildOptions {
  /** Semente da simulação. O padrão é a de `clock.ts`. */
  readonly seed?: number;
  /**
   * De onde a aplicação lê "agora".
   *
   * O padrão é o relógio do sistema. O gerador do instantâneo do modo de
   * demonstração passa um instante fixo, para o instantâneo não mudar a cada
   * build.
   */
  readonly clock?: () => Date;
}

export async function buildApp(
  env: Env,
  db: Database,
  options: BuildOptions = {},
): Promise<FastifyInstance> {
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
  app.decorate(
    'simulation',
    simulationService(db, {
      ...(options.seed === undefined ? {} : { seed: options.seed }),
      ...(options.clock === undefined ? {} : { clock: options.clock }),
    }),
  );
  app.addHook('onClose', async () => {
    await db.close();
  });

  await app.register(cors, { origin: corsOrigins(env) });

  for (const schema of [...SHARED_SCHEMAS, ...PROCESS_SCHEMAS]) {
    await Promise.resolve(app.addSchema(schema));
  }

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
        {
          name: 'Processo',
          description:
            'Valores das variáveis do catálogo, tendências do historiador, grupos de vapor ' +
            'e escrita de setpoint com auditoria.',
        },
        { name: 'Alarmes', description: 'Lista, reconhecimento e engavetamento (ISA-18.2).' },
        {
          name: 'Operação',
          description:
            'Turno, bobina jumbo, quebra de folha, troca de gramatura, ronda, nota de ' +
            'manutenção e auditoria de setpoint. Mais a saúde do serviço.',
        },
      ],
    },
  });

  await app.register(swaggerUi, { routePrefix: '/docs' });

  await app.register(healthRoutes);
  await app.register(assetRoutes);
  await app.register(processRoutes);
  await app.register(alarmRoutes);
  await app.register(operationRoutes);
  await app.register(streamRoutes);

  return app;
}
