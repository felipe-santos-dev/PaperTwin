import type {
  Alarm,
  GradeChange,
  JumboReel,
  MaintenanceNote,
  Round,
  SetpointChange,
  Shift,
  WebBreak,
} from '@mp1/shared';

import type { SqlExecutor } from './executor';
import {
  ACKNOWLEDGE_ALARM,
  COUNT_ALARMS_IN_WINDOW,
  DELETE_GRADE_CHANGE_REELS,
  DELETE_HANDOVER,
  DELETE_NOTE_EVIDENCE,
  DELETE_PRECURSORS,
  DELETE_ROUND_POINTS,
  evidenceOfNotes,
  FIND_ALARM,
  FIND_NOTE,
  FIND_REEL,
  FIND_ROUND,
  FIND_SHIFT,
  handoverOfShifts,
  INSERT_GRADE_CHANGE_REEL,
  INSERT_HANDOVER,
  INSERT_NOTE_EVIDENCE,
  INSERT_PRECURSOR,
  INSERT_ROUND_POINT,
  INSERT_SETPOINT_CHANGE,
  insertRoundPointParams,
  insertSetpointChangeParams,
  LATEST_SETPOINT_OF_TAG,
  LIST_ALARMS,
  LIST_GRADE_CHANGES,
  LIST_NOTES,
  LIST_REELS,
  LIST_ROUNDS,
  LIST_SETPOINT_CHANGES,
  LIST_SHIFTS,
  LIST_WEB_BREAKS,
  pointsOfRounds,
  precursorsOfBreaks,
  reelsOfGradeChanges,
  SHELVE_ALARM,
  toAlarm,
  toGradeChange,
  toNote,
  toReel,
  toRound,
  toSetpointChange,
  toShift,
  toWebBreak,
  UNSHELVE_ALARM,
  UPSERT_ALARM,
  UPSERT_GRADE_CHANGE,
  UPSERT_NOTE,
  UPSERT_REEL,
  UPSERT_ROUND,
  UPSERT_SHIFT,
  UPSERT_WEB_BREAK,
  upsertAlarmParams,
  upsertGradeChangeParams,
  upsertNoteParams,
  upsertReelParams,
  upsertRoundParams,
  upsertShiftParams,
  upsertWebBreakParams,
  type AlarmRow,
  type EvidenceRow,
  type GradeChangeReelRow,
  type GradeChangeRow,
  type HandoverRow,
  type NoteRow,
  type PrecursorRow,
  type ReelRow,
  type RoundPointRow,
  type RoundRow,
  type SetpointChangeRow,
  type ShiftRow,
  type StoredShift,
  type WebBreakRow,
} from './operations-queries';
import type {
  AlarmFilter,
  EventFilter,
  NoteFilter,
  ReelFilter,
  RoundFilter,
  SetpointFilter,
  ShiftFilter,
} from './operations-repository';

/**
 * As entidades de operação, sobre um executor.
 *
 * Funções soltas, e não uma segunda classe de repositório: quem precisa de uma
 * transação recebe o executor dela, e a mesma função serve ao banco e à
 * transação sem herança nem duplicação.
 */

/**
 * Teto padrão e teto absoluto das listas.
 *
 * Nenhuma lista é aberta. Um turno tem dezenas de bobinas e pode ter centenas
 * de alarmes; uma rota sem teto é uma rota que um dia devolve o banco inteiro
 * para o navegador. O teto absoluto existe porque o `limit` vem da rota, e uma
 * rota com `?limit=100000` é a mesma rota sem teto.
 */
export const DEFAULT_LIST_LIMIT = 100;
export const MAX_LIST_LIMIT = 1000;

function limitOf(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_LIST_LIMIT;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIST_LIMIT);
}

const at = (date: Date | undefined): string | null => date?.toISOString() ?? null;

/**
 * Agrupa as linhas filhas pela chave do pai.
 *
 * As filhas voltam em uma consulta só, ordenadas por pai e por sequência, e são
 * distribuídas aqui. Um `join` com o pai devolveria a entidade repetida uma vez
 * por filha, e remontar o objeto a partir disso é onde se erra a ordem.
 */
function groupBy<T, K extends string>(rows: readonly T[], key: (row: T) => K): Map<K, T[]> {
  const grouped = new Map<K, T[]>();

  for (const row of rows) {
    const id = key(row);
    const list = grouped.get(id);
    if (list) list.push(row);
    else grouped.set(id, [row]);
  }

  return grouped;
}

/** Busca as filhas de um conjunto de pais, ou nada quando não há pai nenhum. */
async function children<T>(
  sql: SqlExecutor,
  ids: readonly string[],
  build: (count: number) => string,
): Promise<T[]> {
  if (ids.length === 0) return [];
  return sql.rows<T>(build(ids.length), ids);
}

// ------------------------------------------------------------------ turno

export async function upsertShifts(
  sql: SqlExecutor,
  shifts: readonly (Shift | StoredShift)[],
): Promise<number> {
  if (shifts.length === 0) return 0;

  await sql.transaction(async (tx) => {
    for (const shift of shifts) {
      await tx.rows(UPSERT_SHIFT, upsertShiftParams(shift));
      await tx.rows(DELETE_HANDOVER, [shift.id]);
      for (const [index, line] of shift.handover.entries()) {
        await tx.rows(INSERT_HANDOVER, [shift.id, index, line]);
      }
    }
  });

  return shifts.length;
}

async function withHandover(sql: SqlExecutor, rows: readonly ShiftRow[]): Promise<StoredShift[]> {
  const lines = await children<HandoverRow>(
    sql,
    rows.map((row) => row.id),
    handoverOfShifts,
  );
  const byShift = groupBy(lines, (row) => row.shift_id);

  return rows.map((row) =>
    toShift(
      row,
      (byShift.get(row.id) ?? []).map((line) => line.line),
    ),
  );
}

export async function listShifts(
  sql: SqlExecutor,
  filter: ShiftFilter = {},
): Promise<StoredShift[]> {
  const rows = await sql.rows<ShiftRow>(LIST_SHIFTS, [
    at(filter.from),
    at(filter.to),
    limitOf(filter.limit),
  ]);
  return withHandover(sql, rows);
}

export async function findShift(sql: SqlExecutor, id: string): Promise<StoredShift | null> {
  const rows = await sql.rows<ShiftRow>(FIND_SHIFT, [id]);
  const found = await withHandover(sql, rows);
  return found[0] ?? null;
}

// ----------------------------------------------------------- bobina jumbo

export async function upsertReels(sql: SqlExecutor, reels: readonly JumboReel[]): Promise<number> {
  if (reels.length === 0) return 0;

  await sql.transaction(async (tx) => {
    for (const reel of reels) await tx.rows(UPSERT_REEL, upsertReelParams(reel));
  });

  return reels.length;
}

export async function listReels(sql: SqlExecutor, filter: ReelFilter = {}): Promise<JumboReel[]> {
  const rows = await sql.rows<ReelRow>(LIST_REELS, [filter.shiftId ?? null, limitOf(filter.limit)]);
  return rows.map(toReel);
}

export async function findReel(sql: SqlExecutor, number: number): Promise<JumboReel | null> {
  const rows = await sql.rows<ReelRow>(FIND_REEL, [number]);
  const row = rows[0];
  return row ? toReel(row) : null;
}

// --------------------------------------------------------- quebra de folha

export async function upsertWebBreaks(
  sql: SqlExecutor,
  breaks: readonly WebBreak[],
): Promise<number> {
  if (breaks.length === 0) return 0;

  await sql.transaction(async (tx) => {
    for (const webBreak of breaks) {
      await tx.rows(UPSERT_WEB_BREAK, upsertWebBreakParams(webBreak));
      await tx.rows(DELETE_PRECURSORS, [webBreak.id]);
      for (const precursor of webBreak.precursors) {
        await tx.rows(INSERT_PRECURSOR, [
          webBreak.id,
          precursor.leadTimeS,
          precursor.tag,
          precursor.description,
          precursor.valueBefore,
          precursor.valueAtSignal,
        ]);
      }
    }
  });

  return breaks.length;
}

export async function listWebBreaks(
  sql: SqlExecutor,
  filter: EventFilter = {},
): Promise<WebBreak[]> {
  const rows = await sql.rows<WebBreakRow>(LIST_WEB_BREAKS, [
    filter.shiftId ?? null,
    at(filter.from),
    at(filter.to),
    limitOf(filter.limit),
  ]);

  const precursors = await children<PrecursorRow>(
    sql,
    rows.map((row) => row.id),
    precursorsOfBreaks,
  );
  const byBreak = groupBy(precursors, (row) => row.break_id);

  return rows.map((row) => toWebBreak(row, byBreak.get(row.id) ?? []));
}

// ------------------------------------------------------ troca de gramatura

export async function upsertGradeChanges(
  sql: SqlExecutor,
  changes: readonly GradeChange[],
): Promise<number> {
  if (changes.length === 0) return 0;

  await sql.transaction(async (tx) => {
    for (const change of changes) {
      await tx.rows(UPSERT_GRADE_CHANGE, upsertGradeChangeParams(change));
      await tx.rows(DELETE_GRADE_CHANGE_REELS, [change.id]);
      for (const reel of change.affectedReels) {
        await tx.rows(INSERT_GRADE_CHANGE_REEL, [change.id, reel]);
      }
    }
  });

  return changes.length;
}

export async function listGradeChanges(
  sql: SqlExecutor,
  filter: EventFilter = {},
): Promise<GradeChange[]> {
  const rows = await sql.rows<GradeChangeRow>(LIST_GRADE_CHANGES, [
    filter.shiftId ?? null,
    at(filter.from),
    at(filter.to),
    limitOf(filter.limit),
  ]);

  const reels = await children<GradeChangeReelRow>(
    sql,
    rows.map((row) => row.id),
    reelsOfGradeChanges,
  );
  const byChange = groupBy(reels, (row) => row.change_id);

  return rows.map((row) => toGradeChange(row, byChange.get(row.id) ?? []));
}

// ----------------------------------------------------------------- ronda

export async function upsertRounds(sql: SqlExecutor, rounds: readonly Round[]): Promise<number> {
  if (rounds.length === 0) return 0;

  await sql.transaction(async (tx) => {
    for (const round of rounds) {
      await tx.rows(UPSERT_ROUND, upsertRoundParams(round));
      await tx.rows(DELETE_ROUND_POINTS, [round.id]);
      for (const [index, point] of round.points.entries()) {
        await tx.rows(INSERT_ROUND_POINT, insertRoundPointParams(round.id, index, point));
      }
    }
  });

  return rounds.length;
}

async function withPoints(sql: SqlExecutor, rows: readonly RoundRow[]): Promise<Round[]> {
  const points = await children<RoundPointRow>(
    sql,
    rows.map((row) => row.id),
    pointsOfRounds,
  );
  const byRound = groupBy(points, (row) => row.round_id);

  return rows.map((row) => toRound(row, byRound.get(row.id) ?? []));
}

export async function listRounds(sql: SqlExecutor, filter: RoundFilter = {}): Promise<Round[]> {
  const rows = await sql.rows<RoundRow>(LIST_ROUNDS, [
    filter.shiftId ?? null,
    limitOf(filter.limit),
  ]);
  return withPoints(sql, rows);
}

export async function findRound(sql: SqlExecutor, id: string): Promise<Round | null> {
  const rows = await sql.rows<RoundRow>(FIND_ROUND, [id]);
  const found = await withPoints(sql, rows);
  return found[0] ?? null;
}

// ---------------------------------------------------- nota de manutenção

export async function upsertMaintenanceNotes(
  sql: SqlExecutor,
  notes: readonly MaintenanceNote[],
): Promise<number> {
  if (notes.length === 0) return 0;

  await sql.transaction(async (tx) => {
    for (const note of notes) {
      await tx.rows(UPSERT_NOTE, upsertNoteParams(note));
      await tx.rows(DELETE_NOTE_EVIDENCE, [note.number]);
      for (const [index, evidence] of note.evidence.entries()) {
        await tx.rows(INSERT_NOTE_EVIDENCE, [
          note.number,
          index,
          evidence.kind,
          evidence.ref,
          evidence.label,
        ]);
      }
    }
  });

  return notes.length;
}

async function withEvidence(
  sql: SqlExecutor,
  rows: readonly NoteRow[],
): Promise<MaintenanceNote[]> {
  const evidence = await children<EvidenceRow>(
    sql,
    rows.map((row) => row.number),
    evidenceOfNotes,
  );
  const byNote = groupBy(evidence, (row) => row.note_number);

  return rows.map((row) => toNote(row, byNote.get(row.number) ?? []));
}

export async function listMaintenanceNotes(
  sql: SqlExecutor,
  filter: NoteFilter = {},
): Promise<MaintenanceNote[]> {
  const rows = await sql.rows<NoteRow>(LIST_NOTES, [
    filter.status ?? null,
    filter.assetTag ?? null,
    limitOf(filter.limit),
  ]);
  return withEvidence(sql, rows);
}

export async function findMaintenanceNote(
  sql: SqlExecutor,
  number: string,
): Promise<MaintenanceNote | null> {
  const rows = await sql.rows<NoteRow>(FIND_NOTE, [number]);
  const found = await withEvidence(sql, rows);
  return found[0] ?? null;
}

// ------------------------------------------------ alteração de setpoint

export async function insertSetpointChange(
  sql: SqlExecutor,
  change: SetpointChange,
): Promise<void> {
  await sql.rows(INSERT_SETPOINT_CHANGE, insertSetpointChangeParams(change));
}

export async function listSetpointChanges(
  sql: SqlExecutor,
  filter: SetpointFilter = {},
): Promise<SetpointChange[]> {
  const rows = await sql.rows<SetpointChangeRow>(LIST_SETPOINT_CHANGES, [
    filter.tag ?? null,
    limitOf(filter.limit),
  ]);
  return rows.map(toSetpointChange);
}

export async function latestSetpointChange(
  sql: SqlExecutor,
  tag: string,
): Promise<SetpointChange | null> {
  const rows = await sql.rows<SetpointChangeRow>(LATEST_SETPOINT_OF_TAG, [tag]);
  const row = rows[0];
  return row ? toSetpointChange(row) : null;
}

// --------------------------------------------------------------- alarme

export async function upsertAlarms(sql: SqlExecutor, alarms: readonly Alarm[]): Promise<number> {
  if (alarms.length === 0) return 0;

  await sql.transaction(async (tx) => {
    for (const alarm of alarms) await tx.rows(UPSERT_ALARM, upsertAlarmParams(alarm));
  });

  return alarms.length;
}

export async function listAlarms(sql: SqlExecutor, filter: AlarmFilter = {}): Promise<Alarm[]> {
  const rows = await sql.rows<AlarmRow>(LIST_ALARMS, [
    filter.state ?? null,
    filter.priority ?? null,
    filter.tag ?? null,
    filter.needsAction ?? null,
    at(filter.from),
    at(filter.to),
    limitOf(filter.limit),
  ]);
  return rows.map(toAlarm);
}

export async function findAlarm(sql: SqlExecutor, id: string): Promise<Alarm | null> {
  const rows = await sql.rows<AlarmRow>(FIND_ALARM, [id]);
  const row = rows[0];
  return row ? toAlarm(row) : null;
}

export async function acknowledgeAlarm(
  sql: SqlExecutor,
  id: string,
  by: string,
  when: Date,
): Promise<Alarm | null> {
  const rows = await sql.rows<AlarmRow>(ACKNOWLEDGE_ALARM, [id, when.toISOString(), by]);
  const row = rows[0];
  return row ? toAlarm(row) : null;
}

export async function shelveAlarm(
  sql: SqlExecutor,
  id: string,
  by: string,
  until: Date,
): Promise<Alarm | null> {
  const rows = await sql.rows<AlarmRow>(SHELVE_ALARM, [id, until.toISOString(), by]);
  const row = rows[0];
  return row ? toAlarm(row) : null;
}

export async function unshelveAlarm(sql: SqlExecutor, id: string): Promise<Alarm | null> {
  const rows = await sql.rows<AlarmRow>(UNSHELVE_ALARM, [id]);
  const row = rows[0];
  return row ? toAlarm(row) : null;
}

export async function countAlarmsInWindow(sql: SqlExecutor, from: Date, to: Date): Promise<number> {
  const rows = await sql.rows<{ count: number }>(COUNT_ALARMS_IN_WINDOW, [
    from.toISOString(),
    to.toISOString(),
  ]);
  return rows[0]?.count ?? 0;
}
