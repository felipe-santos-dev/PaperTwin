import { loadMigrations, MIGRATION_TABLE_SQL } from './migrations';

/**
 * O laço de aplicação das migrations, compartilhado pelos dois drivers.
 *
 * Isto não é repositório: é infraestrutura. O que muda entre PGlite e
 * postgres.js é só como se executa um comando, então os dois passam as suas
 * funções e o algoritmo — que precisa ser idêntico, sob pena de o esquema
 * divergir entre desenvolvimento e produção — fica num lugar só.
 */

export interface MigrationRunner {
  /** Executa SQL solto, possivelmente com vários comandos. */
  exec(sql: string): Promise<void>;
  /** Executa uma consulta com parâmetros e devolve as linhas. */
  query<T>(sql: string, params?: readonly unknown[]): Promise<T[]>;
}

export interface MigrationResult {
  readonly applied: string[];
  readonly alreadyApplied: string[];
}

/** Aplica as migrations pendentes, em ordem. Seguro de chamar mais de uma vez. */
export async function runMigrations(runner: MigrationRunner): Promise<MigrationResult> {
  await runner.exec(MIGRATION_TABLE_SQL);

  const rows = await runner.query<{ version: string }>('select version from schema_migration');
  const done = new Set(rows.map((row) => row.version));

  const applied: string[] = [];
  const alreadyApplied: string[] = [];

  for (const migration of await loadMigrations()) {
    if (done.has(migration.version)) {
      alreadyApplied.push(migration.version);
      continue;
    }

    await runner.exec(migration.sql);
    await runner.query('insert into schema_migration (version, name) values ($1, $2)', [
      migration.version,
      migration.name,
    ]);
    applied.push(migration.version);
  }

  return { applied, alreadyApplied };
}
