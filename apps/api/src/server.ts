import { buildApp } from './app';
import { loadEnv } from './env';

const env = loadEnv();
const app = await buildApp(env);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, 'encerrando');
    void app.close().then(() => process.exit(0));
  });
}

try {
  await app.listen({ port: env.PORT, host: env.HOST });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
