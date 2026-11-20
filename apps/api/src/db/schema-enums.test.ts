import {
  ALARM_LIMITS,
  ALARM_PRIORITIES,
  ALARM_STATES,
  EVIDENCE_KINDS,
  LEAK_STATES,
  NOISE_LEVELS,
  NOTE_ORIGINS,
  NOTE_STATUSES,
  REEL_DISPOSITIONS,
  SHIFT_LETTERS,
  SUGGESTION_MEASURES,
  SUGGESTION_STATUSES,
} from '@mp1/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { SqlExecutor } from './executor';
import type { Database } from './repository';
import { DRIVERS } from './test-drivers';

/**
 * As enumerações do SQL e as do `@mp1/shared` são a mesma lista.
 *
 * Este teste existe por causa de um jeito específico de quebrar o gêmeo: a
 * Fase 6 acrescentou a origem `tendência` à nota, e `NOTE_ORIGINS` no `shared`
 * é só metade do trabalho — a outra metade é uma restrição de banco escrita em
 * 2026 numa migration que ninguém vai reler. Sem elas iguais, a API aceita o
 * valor novo no tipo e o banco recusa a linha **em produção**, na primeira nota
 * que nasce de uma tendência.
 *
 * Ele lê as restrições do banco **depois das migrations**, e não o texto dos
 * arquivos: o que vale é o esquema que ficou, com `alter table` e tudo. Uma
 * migration que acrescenta um valor e outra que o remove se cancelam, e é o
 * resultado que precisa bater com o código.
 *
 * A última asserção é a que dá dente ao teste: **nenhuma** restrição de lista
 * pode existir no banco sem estar mapeada aqui. Uma coluna nova com
 * `check (x in (…))` e sem lista no `shared` falha, e falha no lugar certo.
 */

const driver = DRIVERS[0];
if (!driver) throw new Error('nenhum driver de teste disponível');

/**
 * `LA`/`LC` e `validated`/`assumed` não têm lista em tempo de execução no
 * `shared` — são tipos, e nada no código percorre os valores. Ficam escritos
 * aqui, que é o único lugar que os compara com o banco.
 */
const SIDES = ['LA', 'LC'] as const;
const SOURCES = ['validated', 'assumed'] as const;

const ESPERADAS: readonly {
  readonly table: string;
  readonly constraint: string;
  readonly values: readonly string[];
}[] = [
  { table: 'asset', constraint: 'asset_side_valid', values: SIDES },
  { table: 'asset', constraint: 'asset_source_valid', values: SOURCES },
  { table: 'shift', constraint: 'shift_letter_valid', values: SHIFT_LETTERS },
  { table: 'jumbo_reel', constraint: 'reel_disposition_valid', values: REEL_DISPOSITIONS },
  { table: 'round_point', constraint: 'round_point_noise_valid', values: NOISE_LEVELS },
  { table: 'round_point', constraint: 'round_point_leak_valid', values: LEAK_STATES },
  { table: 'maintenance_note', constraint: 'note_origin_valid', values: NOTE_ORIGINS },
  { table: 'maintenance_note', constraint: 'note_status_valid', values: NOTE_STATUSES },
  { table: 'note_evidence', constraint: 'evidence_kind_valid', values: EVIDENCE_KINDS },
  { table: 'note_suggestion', constraint: 'suggestion_measure_valid', values: SUGGESTION_MEASURES },
  { table: 'note_suggestion', constraint: 'suggestion_status_valid', values: SUGGESTION_STATUSES },
  { table: 'alarm', constraint: 'alarm_limit_valid', values: ALARM_LIMITS },
  { table: 'alarm', constraint: 'alarm_state_valid', values: ALARM_STATES },
  { table: 'alarm', constraint: 'alarm_priority_valid', values: ALARM_PRIORITIES },
];

interface ConstraintRow {
  table_name: string;
  constraint_name: string;
  definition: string;
}

/**
 * Todas as restrições de lista do banco.
 *
 * O Postgres normaliza `x in ('a', 'b')` para `x = ANY (ARRAY['a', 'b'])`, e é
 * por essa forma que elas são reconhecidas — não pelo texto que a migration
 * escreveu.
 */
const LIST_CONSTRAINTS = `
  select
    cls.relname  as table_name,
    con.conname  as constraint_name,
    pg_get_constraintdef(con.oid) as definition
  from pg_constraint con
  join pg_class cls on cls.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = cls.relnamespace
  where con.contype = 'c'
    and nsp.nspname = 'public'
    and pg_get_constraintdef(con.oid) like '%= ANY %ARRAY[%'
  order by 1, 2
`;

/** Os literais de uma definição de restrição, na ordem em que aparecem. */
function literais(definition: string): string[] {
  return [...definition.matchAll(/'((?:[^']|'')*)'/g)].map((m) => (m[1] ?? '').replace(/''/g, "'"));
}

describe('as enumerações do SQL e as do shared', () => {
  let db: Database;
  let sql: SqlExecutor;
  let doBanco: ConstraintRow[];

  beforeAll(async () => {
    ({ db, sql } = await driver.openWithSql());
    await db.migrate();
    doBanco = await sql.rows<ConstraintRow>(LIST_CONSTRAINTS);
  }, 60_000);

  afterAll(async () => {
    await db.close();
  });

  it('o banco tem restrições de lista para conferir', () => {
    expect(doBanco.length).toBeGreaterThanOrEqual(ESPERADAS.length);
  });

  for (const esperada of ESPERADAS) {
    it(`${esperada.table}.${esperada.constraint} tem a mesma lista do shared`, () => {
      const row = doBanco.find(
        (item) =>
          item.table_name === esperada.table && item.constraint_name === esperada.constraint,
      );

      expect(row, `${esperada.constraint} não existe no banco`).toBeDefined();
      expect(literais(row?.definition ?? '').sort()).toEqual([...esperada.values].sort());
    });
  }

  /** O dente do teste: nenhuma lista no banco sem lista no código. */
  it('não há restrição de lista fora do mapa', () => {
    const mapeadas = new Set(ESPERADAS.map((item) => `${item.table}.${item.constraint}`));
    const sobrando = doBanco
      .map((row) => `${row.table_name}.${row.constraint_name}`)
      .filter((nome) => !mapeadas.has(nome));

    expect(sobrando).toEqual([]);
  });
});
