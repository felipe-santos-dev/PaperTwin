import {
  archiveReasonCode,
  archiveReasonFromCode,
  type HistorianPoint,
  type PointArchivedSample,
  type PointSample,
} from '@mp1/shared';

/**
 * O SQL do historiador.
 *
 * As inserções são montadas com um marcador por coluna por linha, como as
 * leituras de vibração: o texto varia só no número de `$n` e nenhum dado entra
 * na string. É o que permite gravar um turno inteiro de amostras em dezenas de
 * idas ao banco em vez de milhares.
 */

const num = (value: number | string): number => (typeof value === 'number' ? value : Number(value));

const nullableNum = (value: number | string | null): number | null =>
  value === null ? null : num(value);

/** Instante em milissegundos, que é como `Sample.t` guarda. */
const ms = (value: Date | string): number =>
  value instanceof Date ? value.getTime() : Date.parse(value);

// ------------------------------------------------------------------ ponto

export interface PointRow {
  point_id: number | string;
  tag: string;
  unit: string;
  exc_dev: number | string | null;
  comp_dev: number | string | null;
}

export function toPoint(row: PointRow): HistorianPoint {
  return {
    pointId: num(row.point_id),
    tag: row.tag,
    unit: row.unit,
    excDev: nullableNum(row.exc_dev),
    compDev: nullableNum(row.comp_dev),
  };
}

const POINT_COLUMNS = `point_id, tag, unit, exc_dev, comp_dev`;

export const DELETE_POINTS = `delete from historian_point`;

export const UPSERT_POINT = `
  insert into historian_point (${POINT_COLUMNS})
  values ($1, $2, $3, $4, $5)
  on conflict (point_id) do update set
    tag = excluded.tag,
    unit = excluded.unit,
    exc_dev = excluded.exc_dev,
    comp_dev = excluded.comp_dev
`;

export const upsertPointParams = (point: HistorianPoint): unknown[] => [
  point.pointId,
  point.tag,
  point.unit,
  point.excDev,
  point.compDev,
];

export const LIST_POINTS = `select ${POINT_COLUMNS} from historian_point order by point_id`;

export const FIND_POINT_BY_TAG = `select ${POINT_COLUMNS} from historian_point where tag = $1`;

export const COUNT_POINTS = `select count(*)::int as count from historian_point`;

// ------------------------------------------------------- amostras (comum)

export interface SampleRow {
  ts: Date | string;
  value: number | string;
  point_id: number | string;
}

export interface ArchiveRow extends SampleRow {
  reason: number | string;
}

export function toSample(row: SampleRow): PointSample {
  return { pointId: num(row.point_id), t: ms(row.ts), v: num(row.value) };
}

export function toArchived(row: ArchiveRow): PointArchivedSample {
  return {
    pointId: num(row.point_id),
    t: ms(row.ts),
    v: num(row.value),
    reason: archiveReasonFromCode(num(row.reason)),
  };
}

/**
 * Quantas amostras cabem num comando.
 *
 * O limite do protocolo é 65.535 parâmetros. 1.000 linhas × 4 colunas = 4.000,
 * bem abaixo, e já reduz um turno de um ponto a dezenas de idas ao banco.
 */
export const SAMPLE_BATCH_SIZE = 1000;

/** Divide as amostras em lotes do tamanho do comando. */
export function chunkSamples<T>(samples: readonly T[], size = SAMPLE_BATCH_SIZE): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < samples.length; i += size) chunks.push(samples.slice(i, i + size));
  return chunks;
}

function tuples(count: number, columns: number): string {
  if (count < 1) throw new RangeError('É preciso ao menos uma amostra');

  return Array.from({ length: count }, (_, row) => {
    const base = row * columns;
    const marks = Array.from({ length: columns }, (_, col) => `$${String(base + col + 1)}`);
    // o primeiro parâmetro de cada linha é o instante, e vai anotado
    return `(${marks[0] ?? ''}::timestamptz, ${marks.slice(1).join(', ')})`;
  }).join(', ');
}

// ------------------------------------------------------------- valor bruto

/**
 * Insere amostras brutas, ignorando repetição do mesmo (ponto, instante).
 *
 * `do nothing` porque o simulador recalcula o intervalo que faltou quando a API
 * acorda: a mesma amostra pode ser gravada de novo, e tem de ser inócuo.
 */
export function buildInsertRaw(count: number): string {
  return `
    insert into historian_raw (ts, value, point_id)
    values ${tuples(count, 3)}
    on conflict (point_id, ts) do nothing
  `;
}

export const insertRawParams = (samples: readonly PointSample[]): unknown[] =>
  samples.flatMap((sample) => [new Date(sample.t).toISOString(), sample.v, sample.pointId]);

export const RAW_OF_POINT = `
  select ts, value, point_id
  from historian_raw
  where point_id = $1
    and ts >= $2::timestamptz
    and ts <  $3::timestamptz
  order by ts
  limit $4
`;

export const COUNT_RAW = `select count(*)::int as count from historian_raw`;

export const DELETE_RAW_BEFORE = `delete from historian_raw where ts < $1::timestamptz`;

// --------------------------------------------------------- valor arquivado

export function buildInsertArchive(count: number): string {
  return `
    insert into historian_archive (ts, value, point_id, reason)
    values ${tuples(count, 4)}
    on conflict (point_id, ts) do nothing
  `;
}

export const insertArchiveParams = (samples: readonly PointArchivedSample[]): unknown[] =>
  samples.flatMap((sample) => [
    new Date(sample.t).toISOString(),
    sample.v,
    sample.pointId,
    archiveReasonCode(sample.reason),
  ]);

export const ARCHIVE_OF_POINT = `
  select ts, value, point_id, reason
  from historian_archive
  where point_id = $1
    and ts >= $2::timestamptz
    and ts <  $3::timestamptz
  order by ts
  limit $4
`;

/**
 * O último valor arquivado antes de um instante.
 *
 * É a âncora de qualquer leitura de intervalo: sem ela, um gráfico que começa
 * às 14h não sabe de onde a linha vinha, e desenha o primeiro ponto solto. O PI
 * chama isso de valor anterior ao intervalo, e nenhuma consulta de tendência
 * funciona sem.
 */
export const ARCHIVE_BEFORE = `
  select ts, value, point_id, reason
  from historian_archive
  where point_id = $1 and ts < $2::timestamptz
  order by ts desc
  limit 1
`;

/** O primeiro valor arquivado a partir de um instante — a âncora do outro lado. */
export const ARCHIVE_AFTER = `
  select ts, value, point_id, reason
  from historian_archive
  where point_id = $1 and ts >= $2::timestamptz
  order by ts
  limit 1
`;

export const LATEST_ARCHIVE = `
  select ts, value, point_id, reason
  from historian_archive
  where point_id = $1
  order by ts desc
  limit 1
`;

export const COUNT_ARCHIVE = `select count(*)::int as count from historian_archive`;

export const DELETE_ARCHIVE_BEFORE = `delete from historian_archive where ts < $1::timestamptz`;

// ---------------------------------------------------- estado da simulação

export interface SimStateRow {
  seed: number | string;
  last_tick: number | string;
  state: unknown;
  updated_at: Date | string;
}

/** Até onde a simulação rodou, com que semente e em que estado. */
export interface SimState {
  readonly seed: number;
  readonly lastTick: number;
  /**
   * O estado da rede no passo gravado, como veio do banco.
   *
   * Opaco de propósito: quem sabe o formato é o motor, e é ele que valida a
   * versão. Tipar aqui como `EngineState` faria a camada de dados depender do
   * simulador para gravar um bloco que ela nunca lê.
   */
  readonly state: unknown;
  readonly updatedAt: string;
}

export function toSimState(row: SimStateRow): SimState {
  return {
    seed: num(row.seed),
    // bigint volta como string no postgres.js, para não perder precisão
    lastTick: num(row.last_tick),
    state: row.state ?? null,
    updatedAt: new Date(ms(row.updated_at)).toISOString(),
  };
}

export const FIND_SIM_STATE = `
  select seed, last_tick, state, updated_at from sim_state where id = 1
`;

export const SAVE_SIM_STATE = `
  insert into sim_state (id, seed, last_tick, state, updated_at)
  values (1, $1, $2, $3::jsonb, $4::timestamptz)
  on conflict (id) do update set
    seed = excluded.seed,
    last_tick = excluded.last_tick,
    state = excluded.state,
    updated_at = excluded.updated_at
`;
