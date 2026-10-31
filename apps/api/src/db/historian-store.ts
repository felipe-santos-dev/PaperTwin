import {
  archiveCutoff,
  rawCutoff,
  readAt,
  timeWeightedAverage,
  type HistorianPoint,
  type PointArchivedSample,
  type PointSample,
  type ReadValue,
} from '@mp1/shared';

import type { SqlExecutor } from './executor';
import {
  ARCHIVE_AFTER,
  FIND_SIM_STATE,
  PLOT_VALUES,
  SAVE_SIM_STATE,
  toPlotBucket,
  type PlotBucket,
  type PlotBucketRow,
  toSimState,
  type SimState,
  type SimStateRow,
  ARCHIVE_BEFORE,
  ARCHIVE_OF_POINT,
  buildInsertArchive,
  buildInsertRaw,
  chunkSamples,
  COUNT_ARCHIVE,
  COUNT_POINTS,
  COUNT_RAW,
  DELETE_ARCHIVE_BEFORE,
  DELETE_POINTS,
  DELETE_RAW_BEFORE,
  FIND_POINT_BY_TAG,
  insertArchiveParams,
  insertRawParams,
  LATEST_ARCHIVE,
  LIST_POINTS,
  RAW_OF_POINT,
  toArchived,
  toPoint,
  toSample,
  UPSERT_POINT,
  upsertPointParams,
  type ArchiveRow,
  type PointRow,
  type SampleRow,
} from './historian-queries';
import type { HistorianQuery, HistorianUsage, PruneResult } from './historian-repository';

/**
 * O historiador sobre um executor.
 *
 * Mesma forma do `operations-store.ts`: funções soltas que recebem o executor,
 * para a mesma função servir ao banco e a uma transação.
 */

/**
 * Teto de amostras por consulta.
 *
 * Um ponto arquivado pode ter dezenas de milhares de linhas numa semana, e
 * nenhum gráfico desenha mais pontos do que tem pixels. A consulta de
 * "plot values" da próxima fase é que resolve isso direito, agregando por
 * coluna; até lá o teto evita que uma janela larga traga o arquivo inteiro.
 */
export const MAX_SAMPLES_PER_QUERY = 20_000;

function limitOf(limit: number | undefined): number {
  if (limit === undefined) return MAX_SAMPLES_PER_QUERY;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_SAMPLES_PER_QUERY);
}

// ------------------------------------------------------------------ ponto

/**
 * Reescreve a lista de pontos a partir de `HISTORIAN_POINTS`.
 *
 * Os pontos que saírem da lista são apagados, e o `on delete cascade` leva as
 * amostras deles junto. É o comportamento certo: uma tag que não está mais no
 * catálogo não tem mais série, e deixar as amostras órfãs encheria o banco com
 * dados de uma tag que a interface não sabe mais desenhar.
 */
export async function replaceHistorianPoints(
  sql: SqlExecutor,
  points: readonly HistorianPoint[],
): Promise<number> {
  await sql.transaction(async (tx) => {
    await tx.rows(DELETE_POINTS);
    for (const point of points) await tx.rows(UPSERT_POINT, upsertPointParams(point));
  });

  return points.length;
}

export async function listHistorianPoints(sql: SqlExecutor): Promise<HistorianPoint[]> {
  const rows = await sql.rows<PointRow>(LIST_POINTS);
  return rows.map(toPoint);
}

export async function findHistorianPoint(
  sql: SqlExecutor,
  tag: string,
): Promise<HistorianPoint | null> {
  const rows = await sql.rows<PointRow>(FIND_POINT_BY_TAG, [tag]);
  const row = rows[0];
  return row ? toPoint(row) : null;
}

// --------------------------------------------------------------- amostras

export async function insertRawSamples(
  sql: SqlExecutor,
  samples: readonly PointSample[],
): Promise<number> {
  if (samples.length === 0) return 0;

  await sql.transaction(async (tx) => {
    for (const chunk of chunkSamples(samples)) {
      await tx.rows(buildInsertRaw(chunk.length), insertRawParams(chunk));
    }
  });

  return samples.length;
}

export async function insertArchiveSamples(
  sql: SqlExecutor,
  samples: readonly PointArchivedSample[],
): Promise<number> {
  if (samples.length === 0) return 0;

  await sql.transaction(async (tx) => {
    for (const chunk of chunkSamples(samples)) {
      await tx.rows(buildInsertArchive(chunk.length), insertArchiveParams(chunk));
    }
  });

  return samples.length;
}

export async function rawSamples(sql: SqlExecutor, query: HistorianQuery): Promise<PointSample[]> {
  const rows = await sql.rows<SampleRow>(RAW_OF_POINT, [
    query.pointId,
    query.from.toISOString(),
    query.to.toISOString(),
    limitOf(query.limit),
  ]);
  return rows.map(toSample);
}

export async function archivedSamples(
  sql: SqlExecutor,
  query: HistorianQuery,
): Promise<PointArchivedSample[]> {
  const rows = await sql.rows<ArchiveRow>(ARCHIVE_OF_POINT, [
    query.pointId,
    query.from.toISOString(),
    query.to.toISOString(),
    limitOf(query.limit),
  ]);
  return rows.map(toArchived);
}

/** O último arquivado antes do instante — a âncora de entrada de uma tendência. */
export async function archivedBefore(
  sql: SqlExecutor,
  pointId: number,
  before: Date,
): Promise<PointArchivedSample | null> {
  const rows = await sql.rows<ArchiveRow>(ARCHIVE_BEFORE, [pointId, before.toISOString()]);
  const row = rows[0];
  return row ? toArchived(row) : null;
}

/** O primeiro arquivado a partir do instante — a âncora de saída. */
export async function archivedAfter(
  sql: SqlExecutor,
  pointId: number,
  from: Date,
): Promise<PointArchivedSample | null> {
  const rows = await sql.rows<ArchiveRow>(ARCHIVE_AFTER, [pointId, from.toISOString()]);
  const row = rows[0];
  return row ? toArchived(row) : null;
}

export async function latestArchived(
  sql: SqlExecutor,
  pointId: number,
): Promise<PointArchivedSample | null> {
  const rows = await sql.rows<ArchiveRow>(LATEST_ARCHIVE, [pointId]);
  const row = rows[0];
  return row ? toArchived(row) : null;
}

// --------------------------------------------------------------- retenção

/**
 * Apaga o que passou da retenção.
 *
 * As duas retenções são muito diferentes — minutos no bruto, dias no arquivo —
 * e isso é o desenho, não um descuido: o bruto é um buffer de demonstração, o
 * arquivo é o registro. A conta que leva a esses números está em
 * `retention.ts`, em `@mp1/shared`.
 *
 * A poda não roda sozinha num laço de fundo: o host gratuito dorme sem tráfego,
 * e um laço que depende do processo estar vivo não poda nada. Quem chama isto é
 * o arranque e a gravação, que é quando o banco está sendo mexido de todo jeito.
 */
export async function pruneHistorian(sql: SqlExecutor, now: Date): Promise<PruneResult> {
  const rawBefore = rawCutoff(now);
  const archiveBefore = archiveCutoff(now);

  await sql.rows(DELETE_RAW_BEFORE, [rawBefore.toISOString()]);
  await sql.rows(DELETE_ARCHIVE_BEFORE, [archiveBefore.toISOString()]);

  return {
    rawCutoff: rawBefore.toISOString(),
    archiveCutoff: archiveBefore.toISOString(),
  };
}

/**
 * Quanto o historiador está ocupando, em linhas.
 *
 * É daqui que sai a taxa de compressão de verdade — a que a conta da retenção
 * só estima — e é o número que decide se `ARCHIVE_RETENTION_DAYS` precisa
 * baixar.
 */
export async function historianUsage(sql: SqlExecutor): Promise<HistorianUsage> {
  const [points, raw, archive] = await Promise.all([
    sql.rows<{ count: number }>(COUNT_POINTS),
    sql.rows<{ count: number }>(COUNT_RAW),
    sql.rows<{ count: number }>(COUNT_ARCHIVE),
  ]);

  return {
    points: points[0]?.count ?? 0,
    rawRows: raw[0]?.count ?? 0,
    archiveRows: archive[0]?.count ?? 0,
  };
}

// ---------------------------------------------------- estado da simulação

export async function findSimState(sql: SqlExecutor): Promise<SimState | null> {
  const rows = await sql.rows<SimStateRow>(FIND_SIM_STATE);
  const row = rows[0];
  return row ? toSimState(row) : null;
}

/**
 * Grava até onde a simulação chegou.
 *
 * Chamado no fim de cada retomada, na mesma transação que gravou as amostras —
 * o marcador não pode avançar sem os dados que ele diz existirem, senão a
 * próxima retomada começaria depois de um buraco sem saber.
 */
export async function saveSimState(
  sql: SqlExecutor,
  state: {
    readonly seed: number;
    readonly lastTick: number;
    readonly state?: unknown;
    readonly updatedAt: Date;
  },
): Promise<void> {
  await sql.rows(SAVE_SIM_STATE, [
    state.seed,
    state.lastTick,
    // `undefined` e `null` gravam estado nulo, que é o que força reancoragem
    state.state === undefined || state.state === null ? null : JSON.stringify(state.state),
    state.updatedAt.toISOString(),
  ]);
}

// ------------------------------------------------- consultas de tendência

/**
 * As colunas de um gráfico, com as âncoras dos dois lados da janela.
 *
 * As âncoras vêm juntas porque sem elas o gráfico começa solto: a primeira
 * coluna não sabe de onde a linha vinha, e a última não sabe para onde ia. É a
 * mesma razão pela qual `archivedBefore` existe.
 */
export interface Trend {
  readonly pointId: number;
  readonly from: string;
  readonly to: string;
  /** Duração de cada coluna, em segundos. */
  readonly bucketS: number;
  readonly buckets: readonly PlotBucket[];
  /** Último valor arquivado antes da janela; `null` nas bordas do arquivo. */
  readonly before: PointArchivedSample | null;
  readonly after: PointArchivedSample | null;
  /** Média no tempo da janela, pela regra do trapézio. */
  readonly timeWeightedAverage: number | null;
}

/**
 * Teto de colunas por consulta.
 *
 * Nenhuma tela tem mais de alguns milhares de pixels de largura, e devolver
 * mais colunas que pixels é tráfego que o navegador joga fora. O teto também
 * protege o banco: `date_bin` com intervalo minúsculo numa janela larga produz
 * uma coluna por amostra, que é o oposto do que esta consulta existe para
 * fazer.
 */
export const MAX_PLOT_BUCKETS = 2000;

export interface TrendQuery {
  readonly pointId: number;
  readonly from: Date;
  readonly to: Date;
  /** Quantas colunas o gráfico tem. O padrão é 600. */
  readonly buckets?: number;
}

export async function trend(sql: SqlExecutor, query: TrendQuery): Promise<Trend> {
  const columns = Math.min(Math.max(Math.trunc(query.buckets ?? 600), 1), MAX_PLOT_BUCKETS);
  const spanMs = query.to.getTime() - query.from.getTime();

  if (spanMs <= 0) {
    throw new RangeError('A janela da tendência precisa terminar depois de começar');
  }

  // pelo menos um segundo por coluna: abaixo disso as colunas ficam mais finas
  // que a própria varredura do historiador e vêm vazias
  const bucketS = Math.max(1, Math.round(spanMs / columns / 1000));

  const [rows, before, after] = await Promise.all([
    sql.rows<PlotBucketRow>(PLOT_VALUES, [
      query.pointId,
      query.from.toISOString(),
      query.to.toISOString(),
      `${String(bucketS)} seconds`,
    ]),
    archivedBefore(sql, query.pointId, query.from),
    archivedAfter(sql, query.pointId, query.to),
  ]);

  const buckets = rows.map(toPlotBucket);

  /**
   * A média no tempo é calculada sobre as amostras, e não sobre as colunas.
   *
   * As colunas já perderam a informação de **quando** cada valor aconteecu
   * dentro delas; usá-las para a média traria de volta o viés que a média no
   * tempo existe para evitar.
   */
  const samples = await archivedSamples(sql, {
    pointId: query.pointId,
    from: query.from,
    to: query.to,
  });

  const path = [...(before ? [before] : []), ...samples, ...(after ? [after] : [])];

  return {
    pointId: query.pointId,
    from: query.from.toISOString(),
    to: query.to.toISOString(),
    bucketS,
    buckets,
    before,
    after,
    timeWeightedAverage: timeWeightedAverage(path, query.from.getTime(), query.to.getTime()),
  };
}

/**
 * O valor de um ponto num instante, interpolado.
 *
 * Duas consultas de uma linha cada, e não uma consulta esperta: achar o ponto
 * anterior e o seguinte é exatamente o que o índice primário faz bem, e uma
 * expressão que resolvesse os dois de uma vez acabaria varrendo.
 */
export async function valueAt(
  sql: SqlExecutor,
  pointId: number,
  at: Date,
): Promise<ReadValue | null> {
  const t = at.getTime();
  const [before, after] = await Promise.all([
    archivedBefore(sql, pointId, new Date(t + 1)),
    archivedAfter(sql, pointId, at),
  ]);

  return readAt(t, before, after);
}
