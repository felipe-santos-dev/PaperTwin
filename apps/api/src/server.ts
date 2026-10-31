import { buildApp } from './app';
import { openDatabase } from './db';
import { seedDatabase } from './db/seed';
import { loadEnv } from './env';

const env = loadEnv();
const db = await openDatabase(env);
await db.migrate();

const app = await buildApp(env, db);

if (env.SEED_ON_BOOT) {
  const seeded = await seedDatabase(db);
  app.log.info(
    seeded,
    seeded.skippedReadings
      ? 'ativos e pontos do historiador semeados; série de vibração já existia'
      : 'ativos e pontos do historiador semeados, série de vibração gerada',
  );
}

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
