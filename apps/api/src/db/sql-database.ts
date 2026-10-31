import type {
  Alarm,
  AssetTag,
  HistorianPoint,
  PointArchivedSample,
  PointSample,
  GradeChange,
  JumboReel,
  MachineAsset,
  MaintenanceNote,
  Round,
  SetpointChange,
  Shift,
  VibrationBucket,
  VibrationReading,
  WebBreak,
} from '@mp1/shared';

import {
  openPgliteExecutor,
  openPostgresExecutor,
  type OpenExecutor,
  type SqlExecutor,
} from './executor';
import type { HistorianQuery, HistorianUsage, PruneResult } from './historian-repository';
import * as historian from './historian-store';
import { runMigrations } from './migrate';
import type { StoredShift } from './operations-queries';
import type {
  AlarmFilter,
  EventFilter,
  NoteFilter,
  ReelFilter,
  RoundFilter,
  SetpointFilter,
  ShiftFilter,
} from './operations-repository';
import * as operations from './operations-store';
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

  // --- entidades de operação ---
  //
  // Delegação de uma linha para `operations-store.ts`. A lógica está lá, em
  // funções que recebem o executor, para a mesma função servir ao banco e a uma
  // transação sem herança nem duplicação.

  upsertShifts(shifts: readonly (Shift | StoredShift)[]): Promise<number> {
    return operations.upsertShifts(this.sql, shifts);
  }

  listShifts(filter?: ShiftFilter): Promise<StoredShift[]> {
    return operations.listShifts(this.sql, filter);
  }

  findShift(id: string): Promise<StoredShift | null> {
    return operations.findShift(this.sql, id);
  }

  upsertReels(reels: readonly JumboReel[]): Promise<number> {
    return operations.upsertReels(this.sql, reels);
  }

  listReels(filter?: ReelFilter): Promise<JumboReel[]> {
    return operations.listReels(this.sql, filter);
  }

  findReel(number: number): Promise<JumboReel | null> {
    return operations.findReel(this.sql, number);
  }

  upsertWebBreaks(breaks: readonly WebBreak[]): Promise<number> {
    return operations.upsertWebBreaks(this.sql, breaks);
  }

  listWebBreaks(filter?: EventFilter): Promise<WebBreak[]> {
    return operations.listWebBreaks(this.sql, filter);
  }

  upsertGradeChanges(changes: readonly GradeChange[]): Promise<number> {
    return operations.upsertGradeChanges(this.sql, changes);
  }

  listGradeChanges(filter?: EventFilter): Promise<GradeChange[]> {
    return operations.listGradeChanges(this.sql, filter);
  }

  upsertRounds(rounds: readonly Round[]): Promise<number> {
    return operations.upsertRounds(this.sql, rounds);
  }

  listRounds(filter?: RoundFilter): Promise<Round[]> {
    return operations.listRounds(this.sql, filter);
  }

  findRound(id: string): Promise<Round | null> {
    return operations.findRound(this.sql, id);
  }

  upsertMaintenanceNotes(notes: readonly MaintenanceNote[]): Promise<number> {
    return operations.upsertMaintenanceNotes(this.sql, notes);
  }

  listMaintenanceNotes(filter?: NoteFilter): Promise<MaintenanceNote[]> {
    return operations.listMaintenanceNotes(this.sql, filter);
  }

  findMaintenanceNote(number: string): Promise<MaintenanceNote | null> {
    return operations.findMaintenanceNote(this.sql, number);
  }

  insertSetpointChange(change: SetpointChange): Promise<void> {
    return operations.insertSetpointChange(this.sql, change);
  }

  listSetpointChanges(filter?: SetpointFilter): Promise<SetpointChange[]> {
    return operations.listSetpointChanges(this.sql, filter);
  }

  latestSetpointChange(tag: string): Promise<SetpointChange | null> {
    return operations.latestSetpointChange(this.sql, tag);
  }

  upsertAlarms(alarms: readonly Alarm[]): Promise<number> {
    return operations.upsertAlarms(this.sql, alarms);
  }

  listAlarms(filter?: AlarmFilter): Promise<Alarm[]> {
    return operations.listAlarms(this.sql, filter);
  }

  findAlarm(id: string): Promise<Alarm | null> {
    return operations.findAlarm(this.sql, id);
  }

  acknowledgeAlarm(id: string, by: string, when: Date): Promise<Alarm | null> {
    return operations.acknowledgeAlarm(this.sql, id, by, when);
  }

  shelveAlarm(id: string, by: string, until: Date): Promise<Alarm | null> {
    return operations.shelveAlarm(this.sql, id, by, until);
  }

  unshelveAlarm(id: string): Promise<Alarm | null> {
    return operations.unshelveAlarm(this.sql, id);
  }

  countAlarmsInWindow(from: Date, to: Date): Promise<number> {
    return operations.countAlarmsInWindow(this.sql, from, to);
  }

  // --- historiador ---

  replaceHistorianPoints(points: readonly HistorianPoint[]): Promise<number> {
    return historian.replaceHistorianPoints(this.sql, points);
  }

  listHistorianPoints(): Promise<HistorianPoint[]> {
    return historian.listHistorianPoints(this.sql);
  }

  findHistorianPoint(tag: string): Promise<HistorianPoint | null> {
    return historian.findHistorianPoint(this.sql, tag);
  }

  insertRawSamples(samples: readonly PointSample[]): Promise<number> {
    return historian.insertRawSamples(this.sql, samples);
  }

  insertArchiveSamples(samples: readonly PointArchivedSample[]): Promise<number> {
    return historian.insertArchiveSamples(this.sql, samples);
  }

  rawSamples(query: HistorianQuery): Promise<PointSample[]> {
    return historian.rawSamples(this.sql, query);
  }

  archivedSamples(query: HistorianQuery): Promise<PointArchivedSample[]> {
    return historian.archivedSamples(this.sql, query);
  }

  archivedBefore(pointId: number, before: Date): Promise<PointArchivedSample | null> {
    return historian.archivedBefore(this.sql, pointId, before);
  }

  archivedAfter(pointId: number, from: Date): Promise<PointArchivedSample | null> {
    return historian.archivedAfter(this.sql, pointId, from);
  }

  latestArchived(pointId: number): Promise<PointArchivedSample | null> {
    return historian.latestArchived(this.sql, pointId);
  }

  pruneHistorian(now: Date): Promise<PruneResult> {
    return historian.pruneHistorian(this.sql, now);
  }

  historianUsage(): Promise<HistorianUsage> {
    return historian.historianUsage(this.sql);
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
