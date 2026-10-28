import type { Env } from '../env';
import { PgliteRepository } from './pglite-repository';
import { PostgresRepository } from './postgres-repository';
import type { Database } from './repository';

export type { AssetFilter, Database, DatabaseDriver, VibrationQuery } from './repository';
export { PgliteRepository } from './pglite-repository';
export { PostgresRepository } from './postgres-repository';

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
    return PostgresRepository.open(env.DATABASE_URL);
  }
  return PgliteRepository.open(env.PGLITE_DIR);
}
