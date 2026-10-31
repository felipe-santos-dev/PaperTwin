import { openPgliteExecutor, openPostgresExecutor, type SqlExecutor } from './executor';
import type { Database, DatabaseDriver } from './repository';
import { SqlDatabase } from './sql-database';

/**
 * Os dois drivers, para a mesma suíte rodar contra os dois.
 *
 * É o único jeito de garantir que o SQL é mesmo o mesmo. O PGlite roda sempre;
 * o Postgres só quando `DATABASE_URL` está definido, e fica **pulado** em vez de
 * falhar — o teste não pode exigir um banco que a máquina não tem.
 *
 * Quem roda contra um Postgres de verdade precisa saber: as suítes **apagam** as
 * tabelas do banco apontado. Use um banco de teste.
 *
 * O executor vai junto com o banco porque a limpeza entre testes precisa de SQL
 * solto. Apagar tabela não é operação de repositório — nenhuma rota faz isso —
 * e inventar um `truncate()` no contrato só para o teste poder chamar colocaria
 * em produção um método cuja única razão de existir é o teste.
 */

const DATABASE_URL = process.env['DATABASE_URL'];

export interface OpenTestDatabase {
  readonly db: Database;
  readonly sql: SqlExecutor;
}

export interface TestDriver {
  readonly name: string;
  readonly enabled: boolean;
  openWithSql(): Promise<OpenTestDatabase>;
  /** Só o banco, para as suítes que não precisam limpar na mão. */
  open(): Promise<Database>;
}

function driver(
  name: string,
  enabled: boolean,
  kind: DatabaseDriver,
  openExecutor: () => Promise<{ sql: SqlExecutor; close: () => Promise<void> }>,
): TestDriver {
  const openWithSql = async (): Promise<OpenTestDatabase> => {
    const open = await openExecutor();
    return { db: new SqlDatabase(kind, open.sql, open.close), sql: open.sql };
  };

  return {
    name,
    enabled,
    openWithSql,
    open: async () => (await openWithSql()).db,
  };
}

export const DRIVERS: readonly TestDriver[] = [
  driver('PGlite', true, 'pglite', () => openPgliteExecutor()),
  driver('Postgres', Boolean(DATABASE_URL), 'postgres', () =>
    Promise.resolve(openPostgresExecutor(DATABASE_URL ?? '')),
  ),
];

/**
 * Apaga tudo que as entidades de operação gravaram.
 *
 * `shift` cascateia em passagem, bobinas, quebras, trocas e rondas, então as
 * três linhas abaixo bastam. Alarme e alteração de setpoint não pertencem a
 * turno nenhum — um alarme dispara quando dispara — e por isso vão à parte.
 */
export async function clearOperations(sql: SqlExecutor): Promise<void> {
  await sql.exec('delete from alarm');
  await sql.exec('delete from setpoint_change');
  await sql.exec('delete from shift');
}
