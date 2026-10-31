import type { MachineAsset, VibrationBucket, VibrationReading } from '@mp1/shared';
import type { AssetFilter } from './repository';

/**
 * O SQL, escrito uma vez só.
 *
 * As duas implementações do repositório diferem apenas em como executam uma
 * consulta e como recebem as linhas — o PGlite usa `query(texto, params)` e o
 * postgres.js usa template marcado. O texto do SQL e o mapeamento das linhas
 * ficam aqui, porque é justamente aí que duas implementações separadas
 * divergiriam com o tempo sem ninguém notar.
 */

/** Uma linha como o Postgres devolve, antes de virar tipo do domínio. */
export interface AssetRow {
  tag: string;
  kind: string;
  label: string;
  section: string;
  position_x: number;
  position_y: number;
  position_z: number;
  radius_m: number | null;
  length_m: number | null;
  side: string | null;
  parent_tag: string | null;
  steam_group: string | null;
  iso_group: string | null;
  iso_support: string | null;
  source: string;
}

export interface ReadingRow {
  asset_tag: string;
  ts: Date | string;
  rms_mm_s: number | string;
  temp_c: number | string;
  envelope_ge: number | string;
}

export interface BucketRow {
  bucket_start: Date | string;
  samples: number | string;
  rms_avg: number | string;
  rms_max: number | string;
  temp_avg: number | string;
  envelope_max: number | string;
}

/** O Postgres devolve `numeric` como string, para não perder precisão. */
const num = (value: number | string): number => (typeof value === 'number' ? value : Number(value));

const iso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

export function toAsset(row: AssetRow): MachineAsset {
  return {
    tag: row.tag,
    kind: row.kind as MachineAsset['kind'],
    label: row.label,
    section: row.section as MachineAsset['section'],
    position: [num(row.position_x), num(row.position_y), num(row.position_z)],
    radius: row.radius_m === null ? null : num(row.radius_m),
    lengthM: row.length_m === null ? null : num(row.length_m),
    side: row.side as MachineAsset['side'],
    parentTag: row.parent_tag,
    steamGroup: row.steam_group,
    iso:
      row.iso_group && row.iso_support
        ? {
            group: row.iso_group as NonNullable<MachineAsset['iso']>['group'],
            support: row.iso_support as NonNullable<MachineAsset['iso']>['support'],
          }
        : null,
    source: row.source as MachineAsset['source'],
  };
}

export function toReading(row: ReadingRow): VibrationReading {
  return {
    assetTag: row.asset_tag,
    ts: iso(row.ts),
    rmsMmS: num(row.rms_mm_s),
    tempC: num(row.temp_c),
    envelopeGe: num(row.envelope_ge),
  };
}

export function toBucket(row: BucketRow): VibrationBucket {
  return {
    bucketStart: iso(row.bucket_start),
    samples: num(row.samples),
    rmsAvgMmS: num(row.rms_avg),
    rmsMaxMmS: num(row.rms_max),
    tempAvgC: num(row.temp_avg),
    envelopeMaxGe: num(row.envelope_max),
  };
}

const ASSET_COLUMNS = `
  tag, kind, label, section,
  position_x, position_y, position_z,
  radius_m, length_m, side, parent_tag, steam_group,
  iso_group, iso_support, source
`;

/**
 * Lista de ativos com filtros opcionais.
 *
 * Os filtros entram como parâmetro, nunca interpolados: `$1 is null or ...`
 * deixa o SQL fixo e resolve os dois casos — com e sem filtro — sem montar
 * texto de consulta em tempo de execução.
 */
export const LIST_ASSETS = `
  select ${ASSET_COLUMNS}
  from asset
  where ($1::text is null or section = $1)
    and ($2::text is null or kind = $2)
  order by tag
`;

export const listAssetsParams = (
  filter: AssetFilter | undefined,
): [string | null, string | null] => [filter?.section ?? null, filter?.kind ?? null];

export const FIND_ASSET = `
  select ${ASSET_COLUMNS}
  from asset
  where tag = $1
`;

export const DELETE_ASSETS = `delete from asset`;

/**
 * Insere um ativo.
 *
 * O `parent_tag` referencia a própria tabela, então a ordem importa: o corpo
 * girante precisa entrar antes do mancal. `allAssets()` já devolve nessa ordem.
 */
export const INSERT_ASSET = `
  insert into asset (${ASSET_COLUMNS})
  values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
  on conflict (tag) do update set
    kind = excluded.kind,
    label = excluded.label,
    section = excluded.section,
    position_x = excluded.position_x,
    position_y = excluded.position_y,
    position_z = excluded.position_z,
    radius_m = excluded.radius_m,
    length_m = excluded.length_m,
    side = excluded.side,
    parent_tag = excluded.parent_tag,
    steam_group = excluded.steam_group,
    iso_group = excluded.iso_group,
    iso_support = excluded.iso_support,
    source = excluded.source
`;

export const insertAssetParams = (asset: MachineAsset): unknown[] => [
  asset.tag,
  asset.kind,
  asset.label,
  asset.section,
  asset.position[0],
  asset.position[1],
  asset.position[2],
  asset.radius,
  asset.lengthM,
  asset.side,
  asset.parentTag,
  asset.steamGroup,
  asset.iso?.group ?? null,
  asset.iso?.support ?? null,
  asset.source,
];

export const COUNT_ASSETS = `select count(*)::int as count from asset`;

const READING_COLUMNS = 5;

/**
 * Quantas leituras cabem num comando.
 *
 * O limite do protocolo é 65535 parâmetros; 500 linhas × 5 colunas = 2500, bem
 * abaixo, e já reduz 25 mil inserções a 50 idas ao banco.
 */
export const READING_BATCH_SIZE = 500;

/**
 * Monta a inserção de `count` leituras num só comando.
 *
 * O texto varia, mas só no número de marcadores: nenhum dado entra na string.
 */
export function buildInsertReadings(count: number): string {
  if (count < 1) throw new RangeError('É preciso ao menos uma leitura');

  const tuples = Array.from({ length: count }, (_, row) => {
    const base = row * READING_COLUMNS;
    return `($${String(base + 1)}, $${String(base + 2)}::timestamptz, $${String(base + 3)}, $${String(base + 4)}, $${String(base + 5)})`;
  }).join(', ');

  return `
    insert into vibration_reading (asset_tag, ts, rms_mm_s, temp_c, envelope_ge)
    values ${tuples}
    on conflict (asset_tag, ts) do nothing
  `;
}

export const insertReadingParams = (reading: VibrationReading): unknown[] => [
  reading.assetTag,
  reading.ts,
  reading.rmsMmS,
  reading.tempC,
  reading.envelopeGe,
];

/** Achata um lote de leituras na ordem que `buildInsertReadings` espera. */
export const insertReadingsParams = (readings: readonly VibrationReading[]): unknown[] =>
  readings.flatMap(insertReadingParams);

/** Divide as leituras em lotes do tamanho do comando. */
export function chunkReadings(
  readings: readonly VibrationReading[],
  size = READING_BATCH_SIZE,
): VibrationReading[][] {
  const chunks: VibrationReading[][] = [];
  for (let i = 0; i < readings.length; i += size) {
    chunks.push(readings.slice(i, i + size));
  }
  return chunks;
}

export const LATEST_READING = `
  select asset_tag, ts, rms_mm_s, temp_c, envelope_ge
  from vibration_reading
  where asset_tag = $1
  order by ts desc
  limit 1
`;

export const COUNT_READINGS = `select count(*)::int as count from vibration_reading`;

/**
 * Agregação por janela de tempo.
 *
 * `date_bin()` alinha as janelas a uma origem fixa em vez de ao primeiro dado,
 * então duas consultas com recortes diferentes devolvem as mesmas bordas — é o
 * que permite comparar dois períodos sem as barras andarem.
 */
export const READINGS_BY_BUCKET = `
  select
    date_bin($4::interval, ts, timestamptz '2000-01-01 00:00:00+00') as bucket_start,
    count(*)::int        as samples,
    avg(rms_mm_s)        as rms_avg,
    max(rms_mm_s)        as rms_max,
    avg(temp_c)          as temp_avg,
    max(envelope_ge)     as envelope_max
  from vibration_reading
  where asset_tag = $1
    and ts >= $2::timestamptz
    and ts <  $3::timestamptz
  group by 1
  order by 1
`;
