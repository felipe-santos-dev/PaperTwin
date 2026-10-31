import type { Env } from '../env';
import type { Database } from './repository';
import { openPglite, openPostgres } from './sql-database';

export type { AssetFilter, Database, DatabaseDriver, VibrationQuery } from './repository';
export type { SqlExecutor } from './executor';
export { openPglite, openPostgres, SqlDatabase } from './sql-database';

/**
 * Escolhe o banco pela configuração: `DATABASE_URL` definido leva ao Postgres
 * gerenciado, vazio leva ao PGlite embutido.
 *
 * Não há modo de desenvolvimento especial — é a mesma decisão em qualquer
 * ambiente, e um deploy sem `DATABASE_URL` sobe funcionando com um banco
 * efêmero em vez de falhar, o que é o comportamento que uma demonstração quer.
 */
export async function openDatabase(env: Env): Promise<Database> {
  if (env.DATABASE_URL) {
    return openPostgres(env.DATABASE_URL);
  }
  return openPglite(env.PGLITE_DIR);
}
