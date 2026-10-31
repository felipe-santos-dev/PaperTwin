import type { AssetTag, MachineAsset, VibrationBucket, VibrationReading } from '@mp1/shared';

import {
  openPgliteExecutor,
  openPostgresExecutor,
  type OpenExecutor,
  type SqlExecutor,
} from './executor';
import { runMigrations } from './migrate';
import {
  buildInsertReadings,
  chunkReadings,
  COUNT_READINGS,
  DELETE_ASSETS,
  FIND_ASSET,
  INSERT_ASSET,
  insertAssetParams,
  insertReadingsParams,
  LATEST_READING,
  LIST_ASSETS,
  listAssetsParams,
  READINGS_BY_BUCKET,
  toAsset,
  toBucket,
  toReading,
  type AssetRow,
  type BucketRow,
  type ReadingRow,
} from './queries';
import type { AssetFilter, Database, DatabaseDriver, VibrationQuery } from './repository';

/**
 * O repositório, uma vez só, sobre os dois drivers.
 *
 * O que muda entre o PGlite e o postgres.js está todo em `executor.ts`. Aqui
 * ficam o SQL e o mapeamento das linhas, que é justamente onde duas
 * implementações separadas divergiriam com o tempo sem ninguém notar — os
 * testes rodam sempre no PGlite, então um erro só do lado do Postgres
 * apareceria em produção.
 */
export class SqlDatabase implements Database {
  constructor(
    readonly driver: DatabaseDriver,
    private readonly sql: SqlExecutor,
    private readonly closeExecutor: () => Promise<void>,
  ) {}

  async migrate(): Promise<void> {
    await runMigrations({
      exec: (sql) => this.sql.exec(sql),
      query: (sql, params) => this.sql.rows(sql, params ?? []),
    });
  }

  async ping(): Promise<boolean> {
    await this.sql.rows('select 1');
    return true;
  }

  close(): Promise<void> {
    return this.closeExecutor();
  }

  // --- ativos ---

  async listAssets(filter?: AssetFilter): Promise<MachineAsset[]> {
    const rows = await this.sql.rows<AssetRow>(LIST_ASSETS, listAssetsParams(filter));
    return rows.map(toAsset);
  }

  async findAsset(tag: AssetTag): Promise<MachineAsset | null> {
    const rows = await this.sql.rows<AssetRow>(FIND_ASSET, [tag]);
    const row = rows[0];
    return row ? toAsset(row) : null;
  }

  async replaceAssets(assets: readonly MachineAsset[]): Promise<number> {
    await this.sql.transaction(async (tx) => {
      await tx.rows(DELETE_ASSETS);
      // o parent_tag referencia a própria tabela, então o corpo girante precisa
      // entrar antes do mancal; allAssets() já devolve nessa ordem
      for (const asset of assets) {
        await tx.rows(INSERT_ASSET, insertAssetParams(asset));
      }
    });
    return assets.length;
  }

  // --- vibração ---

  async insertReadings(readings: readonly VibrationReading[]): Promise<number> {
    if (readings.length === 0) return 0;

    await this.sql.transaction(async (tx) => {
      for (const chunk of chunkReadings(readings)) {
        await tx.rows(buildInsertReadings(chunk.length), insertReadingsParams(chunk));
      }
    });
    return readings.length;
  }

  async latestReading(tag: AssetTag): Promise<VibrationReading | null> {
    const rows = await this.sql.rows<ReadingRow>(LATEST_READING, [tag]);
    const row = rows[0];
    return row ? toReading(row) : null;
  }

  async readingsByBucket(query: VibrationQuery): Promise<VibrationBucket[]> {
    const rows = await this.sql.rows<BucketRow>(READINGS_BY_BUCKET, [
      query.tag,
      query.from.toISOString(),
      query.to.toISOString(),
      query.bucket,
    ]);
    return rows.map(toBucket);
  }

  async countReadings(): Promise<number> {
    const rows = await this.sql.rows<{ count: number }>(COUNT_READINGS);
    return rows[0]?.count ?? 0;
  }
}

function database(driver: DatabaseDriver, open: OpenExecutor): SqlDatabase {
  return new SqlDatabase(driver, open.sql, open.close);
}

/** Abre o repositório sobre o PGlite embutido. */
export async function openPglite(dataDir?: string): Promise<SqlDatabase> {
  return database('pglite', await openPgliteExecutor(dataDir));
}

/** Abre o repositório sobre um Postgres gerenciado. */
export function openPostgres(connectionString: string): SqlDatabase {
  return database('postgres', openPostgresExecutor(connectionString));
}
