import { PGlite, type Transaction as PgliteTransaction } from '@electric-sql/pglite';
import postgres, { type Sql, type TransactionSql } from 'postgres';

/**
 * A fronteira entre o repositório e o driver.
 *
 * Antes, cada driver tinha a sua própria classe de repositório, e as duas
 * repetiam método por método: a mesma consulta, o mesmo mapeamento, só a forma
 * de executar diferente. Com dez métodos isso era suportável. Com as entidades
 * de operação e o historiador passariam de trinta, e duas listas de trinta
 * métodos iguais divergem — alguém corrige um `order by` de um lado e esquece o
 * outro, e o bug só aparece em produção, porque os testes rodam sempre no
 * PGlite.
 *
 * Então o que varia por driver é só isto: três operações. Em cima delas há um
 * repositório só, em `sql-database.ts`.
 *
 * O SQL continua sendo texto com `$1`, `$2`, e os valores continuam indo
 * separados do texto em todas as três — nada aqui interpola dado em string.
 */
export interface SqlExecutor {
  /** Consulta com parâmetros, devolvendo as linhas. */
  rows<T>(sql: string, params?: readonly unknown[]): Promise<T[]>;

  /**
   * SQL solto, possivelmente com vários comandos e sem parâmetros.
   *
   * É o que uma migration precisa, e é o único lugar em que vários comandos
   * viajam juntos.
   */
  exec(sql: string): Promise<void>;

  /**
   * Roda `fn` numa transação, passando um executor que fala com ela.
   *
   * Transação dentro de transação **não** abre ponto de salvamento: `fn` recebe
   * o mesmo executor e corre na transação de fora. É o comportamento que o
   * repositório quer — quem chama `replaceAssets` dentro de uma semeadura não
   * espera que um erro mais adiante preserve os ativos.
   */
  transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>;
}

/** O executor e como fechá-lo. */
export interface OpenExecutor {
  readonly sql: SqlExecutor;
  close(): Promise<void>;
}

/**
 * Executor sobre o PGlite — Postgres compilado para WebAssembly, no processo.
 *
 * É o caminho de desenvolvimento e de teste: sem Docker, sem porta, sem serviço
 * para subir. E como é o mesmo Postgres, `date_bin()`, índice BRIN e as
 * restrições de integridade se comportam igual ao do servidor gerenciado — que
 * é a razão de não usar SQLite aqui.
 */
function pgliteExecutor(db: PGlite | PgliteTransaction, inTransaction: boolean): SqlExecutor {
  return {
    async rows<T>(sql: string, params?: readonly unknown[]): Promise<T[]> {
      const result = await db.query<T>(sql, params ? [...params] : undefined);
      return result.rows;
    },
    async exec(sql: string): Promise<void> {
      await db.exec(sql);
    },
    async transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
      if (inTransaction) return fn(pgliteExecutor(db, true));

      const result = await (db as PGlite).transaction(async (tx) => fn(pgliteExecutor(tx, true)));
      return result as T;
    },
  };
}

/** Abre um PGlite em memória, ou em disco se um diretório for informado. */
export async function openPgliteExecutor(dataDir?: string): Promise<OpenExecutor> {
  const db = await PGlite.create(dataDir ? { dataDir } : undefined);

  return {
    sql: pgliteExecutor(db, false),
    close: () => db.close(),
  };
}

/**
 * Executor sobre o postgres.js, para o Postgres gerenciado de produção.
 *
 * O postgres.js trabalha com template marcado; consultas montadas fora dele
 * passam por `unsafe(texto, params)`, que continua enviando os parâmetros
 * separados do texto. Sem parâmetros, o `unsafe` usa o protocolo simples, que é
 * o que aceita vários comandos no mesmo texto.
 */
function postgresExecutor(sql: Sql | TransactionSql, inTransaction: boolean): SqlExecutor {
  return {
    rows<T>(text: string, params: readonly unknown[] = []): Promise<T[]> {
      return sql.unsafe(text, params as never[]).then((result) => result as unknown as T[]);
    },
    async exec(text: string): Promise<void> {
      await sql.unsafe(text);
    },
    async transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
      if (inTransaction) return fn(postgresExecutor(sql, true));

      const result = await (sql as Sql).begin(async (tx) => fn(postgresExecutor(tx, true)));
      return result as T;
    },
  };
}

export function openPostgresExecutor(connectionString: string): OpenExecutor {
  const sql = postgres(connectionString, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => undefined,
  });

  return {
    sql: postgresExecutor(sql, false),
    close: () => sql.end({ timeout: 5 }),
  };
}
