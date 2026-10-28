import { PGlite } from '@electric-sql/pglite';
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
 * Repositório sobre o PGlite — Postgres de verdade, compilado para WebAssembly
 * e rodando dentro do processo.
 *
 * É o caminho de desenvolvimento e de teste: sem Docker, sem porta, sem serviço
 * para subir. E como é o mesmo Postgres, `date_bin()`, índice BRIN e as
 * restrições de integridade se comportam igual ao do servidor gerenciado — que
 * é a razão de não usar SQLite aqui.
 */
export class PgliteRepository implements Database {
  readonly driver = 'pglite' as const;

  private constructor(private readonly db: PGlite) {}

  /** Abre um banco em memória, ou em disco se um diretório for informado. */
  static async open(dataDir?: string): Promise<PgliteRepository> {
    const db = await PGlite.create(dataDir ? { dataDir } : undefined);
    return new PgliteRepository(db);
  }

  async migrate(): Promise<void> {
    await runMigrations({
      exec: async (sql) => {
        await this.db.exec(sql);
      },
      query: async <T>(sql: string, params?: readonly unknown[]) => {
        const result = await this.db.query<T>(sql, params ? [...params] : undefined);
        return result.rows;
      },
    });
  }

  async ping(): Promise<boolean> {
    await this.db.query('select 1');
    return true;
  }

  async close(): Promise<void> {
    await this.db.close();
  }

  async listAssets(filter?: AssetFilter): Promise<MachineAsset[]> {
    const result = await this.db.query<AssetRow>(LIST_ASSETS, [...listAssetsParams(filter)]);
    return result.rows.map(toAsset);
  }

  async findAsset(tag: AssetTag): Promise<MachineAsset | null> {
    const result = await this.db.query<AssetRow>(FIND_ASSET, [tag]);
    const row = result.rows[0];
    return row ? toAsset(row) : null;
  }

  async replaceAssets(assets: readonly MachineAsset[]): Promise<number> {
    return this.db.transaction(async (tx) => {
      await tx.query(DELETE_ASSETS);
      for (const asset of assets) {
        await tx.query(INSERT_ASSET, insertAssetParams(asset));
      }
      return assets.length;
    });
  }

  async insertReadings(readings: readonly VibrationReading[]): Promise<number> {
    if (readings.length === 0) return 0;
    return this.db.transaction(async (tx) => {
      for (const chunk of chunkReadings(readings)) {
        await tx.query(buildInsertReadings(chunk.length), insertReadingsParams(chunk));
      }
      return readings.length;
    });
  }

  async latestReading(tag: AssetTag): Promise<VibrationReading | null> {
    const result = await this.db.query<ReadingRow>(LATEST_READING, [tag]);
    const row = result.rows[0];
    return row ? toReading(row) : null;
  }

  async readingsByBucket(query: VibrationQuery): Promise<VibrationBucket[]> {
    const result = await this.db.query<BucketRow>(READINGS_BY_BUCKET, [
      query.tag,
      query.from.toISOString(),
      query.to.toISOString(),
      query.bucket,
    ]);
    return result.rows.map(toBucket);
  }

  async countReadings(): Promise<number> {
    const result = await this.db.query<{ count: number }>(COUNT_READINGS);
    return result.rows[0]?.count ?? 0;
  }
}
