import postgres, { type Sql } from 'postgres';
import type { AssetTag, MachineAsset, VibrationBucket, VibrationReading } from '@mp1/shared';
import { runMigrations } from './migrate';
import {
  COUNT_READINGS,
  DELETE_ASSETS,
  FIND_ASSET,
  INSERT_ASSET,
  LATEST_READING,
  LIST_ASSETS,
  READINGS_BY_BUCKET,
  buildInsertReadings,
  chunkReadings,
  insertAssetParams,
  insertReadingsParams,
  listAssetsParams,
  toAsset,
  toBucket,
  toReading,
  type AssetRow,
  type BucketRow,
  type ReadingRow,
} from './queries';
import type { AssetFilter, Database, VibrationQuery } from './repository';

/**
 * Repositório sobre o postgres.js, para o Postgres gerenciado de produção.
 *
 * O SQL e o mapeamento das linhas vêm de `queries.ts`, os mesmos que o PGlite
 * usa. O que muda aqui é só a execução: o postgres.js trabalha com template
 * marcado, e consultas montadas fora dele passam por `unsafe(texto, params)` —
 * que continua enviando os parâmetros separados do texto, sem interpolação.
 */
export class PostgresRepository implements Database {
  readonly driver = 'postgres' as const;

  private constructor(private readonly sql: Sql) {}

  static open(connectionString: string): PostgresRepository {
    return new PostgresRepository(
      postgres(connectionString, {
        max: 10,
        idle_timeout: 20,
        connect_timeout: 10,
        onnotice: () => undefined,
      }),
    );
  }

  private rows<T>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
    return this.sql.unsafe(sql, params as never[]).then((result) => result as unknown as T[]);
  }

  async migrate(): Promise<void> {
    await runMigrations({
      // sem parâmetros o postgres.js usa o protocolo simples, que aceita
      // vários comandos no mesmo texto — é o que uma migration precisa
      exec: async (sql) => {
        await this.sql.unsafe(sql);
      },
      query: (sql, params) => this.rows(sql, params ?? []),
    });
  }

  async ping(): Promise<boolean> {
    await this.sql`select 1`;
    return true;
  }

  async close(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }

  async listAssets(filter?: AssetFilter): Promise<MachineAsset[]> {
    const rows = await this.rows<AssetRow>(LIST_ASSETS, listAssetsParams(filter));
    return rows.map(toAsset);
  }

  async findAsset(tag: AssetTag): Promise<MachineAsset | null> {
    const rows = await this.rows<AssetRow>(FIND_ASSET, [tag]);
    const row = rows[0];
    return row ? toAsset(row) : null;
  }

  async replaceAssets(assets: readonly MachineAsset[]): Promise<number> {
    await this.sql.begin(async (tx) => {
      await tx.unsafe(DELETE_ASSETS);
      for (const asset of assets) {
        await tx.unsafe(INSERT_ASSET, insertAssetParams(asset) as never[]);
      }
    });
    return assets.length;
  }

  async insertReadings(readings: readonly VibrationReading[]): Promise<number> {
    if (readings.length === 0) return 0;
    await this.sql.begin(async (tx) => {
      for (const chunk of chunkReadings(readings)) {
        await tx.unsafe(buildInsertReadings(chunk.length), insertReadingsParams(chunk) as never[]);
      }
    });
    return readings.length;
  }

  async latestReading(tag: AssetTag): Promise<VibrationReading | null> {
    const rows = await this.rows<ReadingRow>(LATEST_READING, [tag]);
    const row = rows[0];
    return row ? toReading(row) : null;
  }

  async readingsByBucket(query: VibrationQuery): Promise<VibrationBucket[]> {
    const rows = await this.rows<BucketRow>(READINGS_BY_BUCKET, [
      query.tag,
      query.from.toISOString(),
      query.to.toISOString(),
      query.bucket,
    ]);
    return rows.map(toBucket);
  }

  async countReadings(): Promise<number> {
    const rows = await this.rows<{ count: number }>(COUNT_READINGS);
    return rows[0]?.count ?? 0;
  }
}
