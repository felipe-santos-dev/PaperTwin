import type {
  Alarm,
  AlarmLimitLevel,
  AlarmPriority,
  AlarmState,
  EvidenceKind,
  GradeChange,
  JumboReel,
  LeakState,
  MaintenanceNote,
  NoiseLevel,
  NoteOrigin,
  NotePriority,
  NoteStatus,
  ReelDisposition,
  Round,
  RoundPoint,
  SetpointChange,
  Shift,
  ShiftLetter,
  WebBreak,
} from '@mp1/shared';

import type { SectionId } from '@mp1/shared';

/**
 * O SQL das entidades de operação, escrito uma vez só.
 *
 * Mesma divisão de `queries.ts`: aqui ficam o texto das consultas e o
 * mapeamento das linhas; em `sql-database.ts` fica a sequência de chamadas.
 *
 * Três decisões se repetem em todas as entidades:
 *
 * 1. **Escrita é upsert.** A semeadura roda a cada arranque e precisa ser
 *    idempotente: um turno gravado duas vezes é um turno.
 * 2. **As listas filhas são apagadas e reescritas** junto com a entidade pai,
 *    na mesma transação. Casar linha por linha daria o mesmo resultado com mais
 *    código, porque a lista é sempre curta e sempre vem inteira.
 * 3. **As listas voltam numa segunda consulta**, por `in (...)`, e não por
 *    `join` com a entidade pai. Um join devolveria a entidade repetida uma vez
 *    por filho, e montar o objeto de volta a partir disso é onde se erra a
 *    ordem.
 */

/** O Postgres devolve `numeric` como string, para não perder precisão. */
const num = (value: number | string): number => (typeof value === 'number' ? value : Number(value));

const nullableNum = (value: number | string | null): number | null =>
  value === null ? null : num(value);

const iso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const nullableIso = (value: Date | string | null): string | null =>
  value === null ? null : iso(value);

/**
 * `($1, $2, …)` para uma lista de `count` valores.
 *
 * Usado nas consultas das listas filhas. Nenhum dado entra na string: o que
 * varia no texto é só a quantidade de marcadores.
 */
function placeholders(count: number): string {
  if (count < 1) throw new RangeError('É preciso ao menos um valor na lista');
  return `(${Array.from({ length: count }, (_, i) => `$${String(i + 1)}`).join(', ')})`;
}

/** `date` volta como `Date` no postgres.js e como string no PGlite. */
const day = (value: Date | string): string =>
  value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);

// ------------------------------------------------------------------ turno

export interface ShiftRow {
  id: string;
  letter: string;
  operation_date: Date | string;
  started_at: Date | string;
  ended_at: Date | string | null;
  operator: string;
  production_t: number | string;
  efficiency_pct: number | string;
}

export interface HandoverRow {
  shift_id: string;
  sequence: number | string;
  line: string;
}

/** O dia de operação sai da linha, mas não entra em `Shift`: ele está no id. */
export interface StoredShift extends Shift {
  readonly operationDate: string;
}

export function toShift(row: ShiftRow, handover: readonly string[]): StoredShift {
  return {
    id: row.id,
    letter: row.letter as ShiftLetter,
    operationDate: day(row.operation_date),
    startedAt: iso(row.started_at),
    endedAt: nullableIso(row.ended_at),
    operator: row.operator,
    productionT: num(row.production_t),
    efficiencyPct: num(row.efficiency_pct),
    handover,
  };
}

const SHIFT_COLUMNS = `
  id, letter, operation_date, started_at, ended_at, operator, production_t, efficiency_pct
`;

export const UPSERT_SHIFT = `
  insert into shift (${SHIFT_COLUMNS})
  values ($1, $2, $3::date, $4::timestamptz, $5::timestamptz, $6, $7, $8)
  on conflict (id) do update set
    letter = excluded.letter,
    operation_date = excluded.operation_date,
    started_at = excluded.started_at,
    ended_at = excluded.ended_at,
    operator = excluded.operator,
    production_t = excluded.production_t,
    efficiency_pct = excluded.efficiency_pct
`;

/**
 * O dia de operação é derivado do id quando não vem explícito.
 *
 * O id é `T-2026-10-31-A`, montado por `shiftId()` em `@mp1/shared`: os dez
 * caracteres do meio são o dia. Derivar daí, em vez de pedir o campo duas
 * vezes, impede que o id e a coluna discordem.
 */
export function shiftOperationDate(shift: Shift | StoredShift): string {
  if ('operationDate' in shift) return shift.operationDate;

  const parsed = /^T-(\d{4}-\d{2}-\d{2})-[A-Z]$/.exec(shift.id);
  if (!parsed?.[1]) {
    throw new Error(
      `Id de turno fora do padrão: ${shift.id}. Esperado T-AAAA-MM-DD-L, como shiftId() monta.`,
    );
  }
  return parsed[1];
}

export const upsertShiftParams = (shift: Shift | StoredShift): unknown[] => [
  shift.id,
  shift.letter,
  shiftOperationDate(shift),
  shift.startedAt,
  shift.endedAt,
  shift.operator,
  shift.productionT,
  shift.efficiencyPct,
];

export const DELETE_HANDOVER = `delete from shift_handover where shift_id = $1`;

export const INSERT_HANDOVER = `
  insert into shift_handover (shift_id, sequence, line) values ($1, $2, $3)
`;

export const LIST_SHIFTS = `
  select ${SHIFT_COLUMNS}
  from shift
  where ($1::timestamptz is null or started_at >= $1)
    and ($2::timestamptz is null or started_at < $2)
  order by started_at desc
  limit $3
`;

export const FIND_SHIFT = `select ${SHIFT_COLUMNS} from shift where id = $1`;

/**
 * As linhas de passagem de vários turnos, em uma consulta.
 *
 * A lista de ids entra como marcadores montados — `in ($1, $2, …)` — e não como
 * um único parâmetro de array. Um array viaja diferente nos dois drivers: o
 * postgres.js serializa o array JavaScript nativamente, o PGlite depende do
 * tipo inferido para o parâmetro, e `= any($1)` sem anotação de tipo é
 * justamente o caso em que a inferência falha. Marcador por id funciona igual
 * nos dois, e nenhum dado entra na string: o que varia no texto é só o número
 * de `$n`.
 */
export const handoverOfShifts = (count: number): string => `
  select shift_id, sequence, line
  from shift_handover
  where shift_id in ${placeholders(count)}
  order by shift_id, sequence
`;

// ----------------------------------------------------------- bobina jumbo

export interface ReelRow {
  number: number | string;
  shift_id: string;
  started_at: Date | string;
  ended_at: Date | string | null;
  weight_t: number | string | null;
  length_m: number | string | null;
  final_diameter_mm: number | string | null;
  basis_weight_gsm: number | string | null;
  moisture_pct: number | string | null;
  caliper_um: number | string | null;
  cd_basis_weight_gsm: number | string | null;
  cd_moisture_pct: number | string | null;
  cd_caliper_um: number | string | null;
  splices: number | string;
  disposition: string | null;
  disposition_reason: string | null;
}

export function toReel(row: ReelRow): JumboReel {
  const cdBasis = nullableNum(row.cd_basis_weight_gsm);
  const cdMoisture = nullableNum(row.cd_moisture_pct);
  const cdCaliper = nullableNum(row.cd_caliper_um);

  return {
    number: num(row.number),
    shiftId: row.shift_id,
    startedAt: iso(row.started_at),
    endedAt: nullableIso(row.ended_at),
    weightT: nullableNum(row.weight_t),
    lengthM: nullableNum(row.length_m),
    finalDiameterMm: nullableNum(row.final_diameter_mm),
    basisWeightGsm: nullableNum(row.basis_weight_gsm),
    moisturePct: nullableNum(row.moisture_pct),
    caliperUm: nullableNum(row.caliper_um),
    // a restrição reel_cd_spread_complete garante que são os três ou nenhum
    cdSpread:
      cdBasis === null || cdMoisture === null || cdCaliper === null
        ? null
        : { basisWeightGsm: cdBasis, moisturePct: cdMoisture, caliperUm: cdCaliper },
    splices: num(row.splices),
    disposition: row.disposition as ReelDisposition | null,
    dispositionReason: row.disposition_reason,
  };
}

const REEL_COLUMNS = `
  number, shift_id, started_at, ended_at,
  weight_t, length_m, final_diameter_mm,
  basis_weight_gsm, moisture_pct, caliper_um,
  cd_basis_weight_gsm, cd_moisture_pct, cd_caliper_um,
  splices, disposition, disposition_reason
`;

export const UPSERT_REEL = `
  insert into jumbo_reel (${REEL_COLUMNS})
  values ($1, $2, $3::timestamptz, $4::timestamptz, $5, $6, $7, $8, $9, $10, $11, $12, $13,
          $14, $15, $16)
  on conflict (number) do update set
    shift_id = excluded.shift_id,
    started_at = excluded.started_at,
    ended_at = excluded.ended_at,
    weight_t = excluded.weight_t,
    length_m = excluded.length_m,
    final_diameter_mm = excluded.final_diameter_mm,
    basis_weight_gsm = excluded.basis_weight_gsm,
    moisture_pct = excluded.moisture_pct,
    caliper_um = excluded.caliper_um,
    cd_basis_weight_gsm = excluded.cd_basis_weight_gsm,
    cd_moisture_pct = excluded.cd_moisture_pct,
    cd_caliper_um = excluded.cd_caliper_um,
    splices = excluded.splices,
    disposition = excluded.disposition,
    disposition_reason = excluded.disposition_reason
`;

export const upsertReelParams = (reel: JumboReel): unknown[] => [
  reel.number,
  reel.shiftId,
  reel.startedAt,
  reel.endedAt,
  reel.weightT,
  reel.lengthM,
  reel.finalDiameterMm,
  reel.basisWeightGsm,
  reel.moisturePct,
  reel.caliperUm,
  reel.cdSpread?.basisWeightGsm ?? null,
  reel.cdSpread?.moisturePct ?? null,
  reel.cdSpread?.caliperUm ?? null,
  reel.splices,
  reel.disposition,
  reel.dispositionReason,
];

export const LIST_REELS = `
  select ${REEL_COLUMNS}
  from jumbo_reel
  where ($1::text is null or shift_id = $1)
  order by number desc
  limit $2
`;

export const FIND_REEL = `select ${REEL_COLUMNS} from jumbo_reel where number = $1`;

// --------------------------------------------------------- quebra de folha

export interface WebBreakRow {
  id: string;
  shift_id: string;
  started_at: Date | string;
  ended_at: Date | string | null;
  section: string;
  probable_cause: string;
}

export interface PrecursorRow {
  break_id: string;
  lead_time_s: number | string;
  tag: string;
  description: string;
  value_before: number | string;
  value_at_signal: number | string;
}

export function toWebBreak(row: WebBreakRow, precursors: readonly PrecursorRow[]): WebBreak {
  return {
    id: row.id,
    shiftId: row.shift_id,
    startedAt: iso(row.started_at),
    endedAt: nullableIso(row.ended_at),
    section: row.section as SectionId,
    probableCause: row.probable_cause,
    precursors: precursors.map((item) => ({
      tag: item.tag,
      description: item.description,
      leadTimeS: num(item.lead_time_s),
      valueBefore: num(item.value_before),
      valueAtSignal: num(item.value_at_signal),
    })),
  };
}

const BREAK_COLUMNS = `id, shift_id, started_at, ended_at, section, probable_cause`;

export const UPSERT_WEB_BREAK = `
  insert into web_break (${BREAK_COLUMNS})
  values ($1, $2, $3::timestamptz, $4::timestamptz, $5, $6)
  on conflict (id) do update set
    shift_id = excluded.shift_id,
    started_at = excluded.started_at,
    ended_at = excluded.ended_at,
    section = excluded.section,
    probable_cause = excluded.probable_cause
`;

export const upsertWebBreakParams = (webBreak: WebBreak): unknown[] => [
  webBreak.id,
  webBreak.shiftId,
  webBreak.startedAt,
  webBreak.endedAt,
  webBreak.section,
  webBreak.probableCause,
];

export const DELETE_PRECURSORS = `delete from web_break_precursor where break_id = $1`;

export const INSERT_PRECURSOR = `
  insert into web_break_precursor
    (break_id, lead_time_s, tag, description, value_before, value_at_signal)
  values ($1, $2, $3, $4, $5, $6)
`;

export const LIST_WEB_BREAKS = `
  select ${BREAK_COLUMNS}
  from web_break
  where ($1::text is null or shift_id = $1)
    and ($2::timestamptz is null or started_at >= $2)
    and ($3::timestamptz is null or started_at < $3)
  order by started_at desc
  limit $4
`;

/** Do mais antigo para o mais recente — é como a tela desenha a linha do tempo. */
export const precursorsOfBreaks = (count: number): string => `
  select break_id, lead_time_s, tag, description, value_before, value_at_signal
  from web_break_precursor
  where break_id in ${placeholders(count)}
  order by break_id, lead_time_s desc
`;

// ------------------------------------------------------ troca de gramatura

export interface GradeChangeRow {
  id: string;
  shift_id: string;
  from_gsm: number | string;
  to_gsm: number | string;
  started_at: Date | string;
  stabilized_at: Date | string | null;
}

export interface GradeChangeReelRow {
  change_id: string;
  reel_number: number | string;
}

export function toGradeChange(
  row: GradeChangeRow,
  reels: readonly GradeChangeReelRow[],
): GradeChange {
  return {
    id: row.id,
    shiftId: row.shift_id,
    fromGsm: num(row.from_gsm),
    toGsm: num(row.to_gsm),
    startedAt: iso(row.started_at),
    stabilizedAt: nullableIso(row.stabilized_at),
    affectedReels: reels.map((item) => num(item.reel_number)),
  };
}

const GRADE_COLUMNS = `id, shift_id, from_gsm, to_gsm, started_at, stabilized_at`;

export const UPSERT_GRADE_CHANGE = `
  insert into grade_change (${GRADE_COLUMNS})
  values ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz)
  on conflict (id) do update set
    shift_id = excluded.shift_id,
    from_gsm = excluded.from_gsm,
    to_gsm = excluded.to_gsm,
    started_at = excluded.started_at,
    stabilized_at = excluded.stabilized_at
`;

export const upsertGradeChangeParams = (change: GradeChange): unknown[] => [
  change.id,
  change.shiftId,
  change.fromGsm,
  change.toGsm,
  change.startedAt,
  change.stabilizedAt,
];

export const DELETE_GRADE_CHANGE_REELS = `delete from grade_change_reel where change_id = $1`;

export const INSERT_GRADE_CHANGE_REEL = `
  insert into grade_change_reel (change_id, reel_number) values ($1, $2)
`;

export const LIST_GRADE_CHANGES = `
  select ${GRADE_COLUMNS}
  from grade_change
  where ($1::text is null or shift_id = $1)
    and ($2::timestamptz is null or started_at >= $2)
    and ($3::timestamptz is null or started_at < $3)
  order by started_at desc
  limit $4
`;

export const reelsOfGradeChanges = (count: number): string => `
  select change_id, reel_number
  from grade_change_reel
  where change_id in ${placeholders(count)}
  order by change_id, reel_number
`;

// ----------------------------------------------------------------- ronda

export interface RoundRow {
  id: string;
  shift_id: string;
  started_at: Date | string;
  finished_at: Date | string | null;
  inspector: string;
}

export interface RoundPointRow {
  round_id: string;
  sequence: number | string;
  asset_tag: string;
  field_temp_c: number | string | null;
  noise: string;
  leak: string;
  note: string | null;
  online_tag: string | null;
  online_value: number | string | null;
}

export function toRoundPoint(row: RoundPointRow): RoundPoint {
  return {
    assetTag: row.asset_tag,
    fieldTempC: nullableNum(row.field_temp_c),
    noise: row.noise as NoiseLevel,
    leak: row.leak as LeakState,
    note: row.note,
    onlineTag: row.online_tag,
    onlineValue: nullableNum(row.online_value),
  };
}

export function toRound(row: RoundRow, points: readonly RoundPointRow[]): Round {
  return {
    id: row.id,
    shiftId: row.shift_id,
    startedAt: iso(row.started_at),
    finishedAt: nullableIso(row.finished_at),
    inspector: row.inspector,
    points: points.map(toRoundPoint),
  };
}

const ROUND_COLUMNS = `id, shift_id, started_at, finished_at, inspector`;

export const UPSERT_ROUND = `
  insert into inspection_round (${ROUND_COLUMNS})
  values ($1, $2, $3::timestamptz, $4::timestamptz, $5)
  on conflict (id) do update set
    shift_id = excluded.shift_id,
    started_at = excluded.started_at,
    finished_at = excluded.finished_at,
    inspector = excluded.inspector
`;

export const upsertRoundParams = (round: Round): unknown[] => [
  round.id,
  round.shiftId,
  round.startedAt,
  round.finishedAt,
  round.inspector,
];

export const DELETE_ROUND_POINTS = `delete from round_point where round_id = $1`;

export const INSERT_ROUND_POINT = `
  insert into round_point
    (round_id, sequence, asset_tag, field_temp_c, noise, leak, note, online_tag, online_value)
  values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
`;

export const insertRoundPointParams = (
  roundId: string,
  sequence: number,
  point: RoundPoint,
): unknown[] => [
  roundId,
  sequence,
  point.assetTag,
  point.fieldTempC,
  point.noise,
  point.leak,
  point.note,
  point.onlineTag,
  point.onlineValue,
];

export const LIST_ROUNDS = `
  select ${ROUND_COLUMNS}
  from inspection_round
  where ($1::text is null or shift_id = $1)
  order by started_at desc
  limit $2
`;

export const FIND_ROUND = `select ${ROUND_COLUMNS} from inspection_round where id = $1`;

/** Na ordem em que os pontos foram percorridos. */
export const pointsOfRounds = (count: number): string => `
  select round_id, sequence, asset_tag, field_temp_c, noise, leak, note, online_tag, online_value
  from round_point
  where round_id in ${placeholders(count)}
  order by round_id, sequence
`;

// ---------------------------------------------------- nota de manutenção

export interface NoteRow {
  number: string;
  asset_tag: string;
  symptom: string;
  priority: number | string;
  origin: string;
  origin_ref: string | null;
  status: string;
  requires_shutdown: boolean;
  created_at: Date | string;
  closed_at: Date | string | null;
}

export interface EvidenceRow {
  note_number: string;
  sequence: number | string;
  kind: string;
  ref: string;
  label: string;
}

export function toNote(row: NoteRow, evidence: readonly EvidenceRow[]): MaintenanceNote {
  return {
    number: row.number,
    assetTag: row.asset_tag,
    symptom: row.symptom,
    priority: num(row.priority) as NotePriority,
    origin: row.origin as NoteOrigin,
    originRef: row.origin_ref,
    status: row.status as NoteStatus,
    requiresShutdown: row.requires_shutdown,
    evidence: evidence.map((item) => ({
      kind: item.kind as EvidenceKind,
      ref: item.ref,
      label: item.label,
    })),
    createdAt: iso(row.created_at),
    closedAt: nullableIso(row.closed_at),
  };
}

const NOTE_COLUMNS = `
  number, asset_tag, symptom, priority, origin, origin_ref,
  status, requires_shutdown, created_at, closed_at
`;

export const UPSERT_NOTE = `
  insert into maintenance_note (${NOTE_COLUMNS})
  values ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, $10::timestamptz)
  on conflict (number) do update set
    asset_tag = excluded.asset_tag,
    symptom = excluded.symptom,
    priority = excluded.priority,
    origin = excluded.origin,
    origin_ref = excluded.origin_ref,
    status = excluded.status,
    requires_shutdown = excluded.requires_shutdown,
    created_at = excluded.created_at,
    closed_at = excluded.closed_at
`;

export const upsertNoteParams = (note: MaintenanceNote): unknown[] => [
  note.number,
  note.assetTag,
  note.symptom,
  note.priority,
  note.origin,
  note.originRef,
  note.status,
  note.requiresShutdown,
  note.createdAt,
  note.closedAt,
];

export const DELETE_NOTE_EVIDENCE = `delete from note_evidence where note_number = $1`;

export const INSERT_NOTE_EVIDENCE = `
  insert into note_evidence (note_number, sequence, kind, ref, label) values ($1, $2, $3, $4, $5)
`;

/**
 * Notas filtradas por situação e por ativo.
 *
 * A ordem é por prioridade e depois por data: a tela de Notas é uma fila de
 * trabalho, e nela a nota de prioridade 1 de ontem vem antes da de prioridade 4
 * de hoje.
 */
export const LIST_NOTES = `
  select ${NOTE_COLUMNS}
  from maintenance_note
  where ($1::text is null or status = $1)
    and ($2::text is null or asset_tag = $2)
  order by priority, created_at desc
  limit $3
`;

export const FIND_NOTE = `select ${NOTE_COLUMNS} from maintenance_note where number = $1`;

export const evidenceOfNotes = (count: number): string => `
  select note_number, sequence, kind, ref, label
  from note_evidence
  where note_number in ${placeholders(count)}
  order by note_number, sequence
`;

// ------------------------------------------------ alteração de setpoint

export interface SetpointChangeRow {
  id: string;
  tag: string;
  previous_value: number | string;
  new_value: number | string;
  unit: string;
  changed_by: string;
  changed_at: Date | string;
  reason: string;
}

export function toSetpointChange(row: SetpointChangeRow): SetpointChange {
  return {
    id: row.id,
    tag: row.tag,
    previousValue: num(row.previous_value),
    newValue: num(row.new_value),
    unit: row.unit,
    changedBy: row.changed_by,
    changedAt: iso(row.changed_at),
    reason: row.reason,
  };
}

const SETPOINT_COLUMNS = `
  id, tag, previous_value, new_value, unit, changed_by, changed_at, reason
`;

/**
 * A auditoria é append-only: `do nothing` em vez de `do update`.
 *
 * Reenviar a mesma alteração não reescreve o registro. Um histórico de
 * auditoria que aceita ser editado não é auditoria.
 */
export const INSERT_SETPOINT_CHANGE = `
  insert into setpoint_change (${SETPOINT_COLUMNS})
  values ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8)
  on conflict (id) do nothing
`;

export const insertSetpointChangeParams = (change: SetpointChange): unknown[] => [
  change.id,
  change.tag,
  change.previousValue,
  change.newValue,
  change.unit,
  change.changedBy,
  change.changedAt,
  change.reason,
];

export const LIST_SETPOINT_CHANGES = `
  select ${SETPOINT_COLUMNS}
  from setpoint_change
  where ($1::text is null or tag = $1)
  order by changed_at desc
  limit $2
`;

/** O último valor escrito numa malha, para o próximo `previousValue`. */
export const LATEST_SETPOINT_OF_TAG = `
  select ${SETPOINT_COLUMNS}
  from setpoint_change
  where tag = $1
  order by changed_at desc
  limit 1
`;

// --------------------------------------------------------------- alarme

export interface AlarmRow {
  id: string;
  tag: string;
  limit_level: string;
  threshold: number | string;
  priority: string;
  state: string;
  raised_at: Date | string;
  peak_value: number | string;
  acknowledged_at: Date | string | null;
  acknowledged_by: string | null;
  cleared_at: Date | string | null;
  shelved_until: Date | string | null;
  shelved_by: string | null;
}

export function toAlarm(row: AlarmRow): Alarm {
  return {
    id: row.id,
    tag: row.tag,
    limit: row.limit_level as AlarmLimitLevel,
    threshold: num(row.threshold),
    priority: row.priority as AlarmPriority,
    state: row.state as AlarmState,
    raisedAt: iso(row.raised_at),
    peakValue: num(row.peak_value),
    acknowledgedAt: nullableIso(row.acknowledged_at),
    acknowledgedBy: row.acknowledged_by,
    clearedAt: nullableIso(row.cleared_at),
    shelvedUntil: nullableIso(row.shelved_until),
    shelvedBy: row.shelved_by,
  };
}

const ALARM_COLUMNS = `
  id, tag, limit_level, threshold, priority, state, raised_at, peak_value,
  acknowledged_at, acknowledged_by, cleared_at, shelved_until, shelved_by
`;

export const UPSERT_ALARM = `
  insert into alarm (${ALARM_COLUMNS})
  values ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8,
          $9::timestamptz, $10, $11::timestamptz, $12::timestamptz, $13)
  on conflict (id) do update set
    tag = excluded.tag,
    limit_level = excluded.limit_level,
    threshold = excluded.threshold,
    priority = excluded.priority,
    state = excluded.state,
    raised_at = excluded.raised_at,
    peak_value = excluded.peak_value,
    acknowledged_at = excluded.acknowledged_at,
    acknowledged_by = excluded.acknowledged_by,
    cleared_at = excluded.cleared_at,
    shelved_until = excluded.shelved_until,
    shelved_by = excluded.shelved_by
`;

export const upsertAlarmParams = (alarm: Alarm): unknown[] => [
  alarm.id,
  alarm.tag,
  alarm.limit,
  alarm.threshold,
  alarm.priority,
  alarm.state,
  alarm.raisedAt,
  alarm.peakValue,
  alarm.acknowledgedAt,
  alarm.acknowledgedBy,
  alarm.clearedAt,
  alarm.shelvedUntil,
  alarm.shelvedBy,
];

/**
 * Alarmes filtrados, do mais recente para o mais antigo.
 *
 * `$4` é `needsOperatorAction` em SQL: ou ninguém reconheceu, ou ainda está
 * ativo. É a regra que mantém na lista o alarme que normalizou sozinho sem
 * ninguém ficar sabendo — e por isso vive aqui e em `@mp1/shared`, com um teste
 * comparando as duas.
 */
export const LIST_ALARMS = `
  select ${ALARM_COLUMNS}
  from alarm
  where ($1::text is null or state = $1)
    and ($2::text is null or priority = $2)
    and ($3::text is null or tag = $3)
    and ($4::boolean is not true or acknowledged_at is null or state = 'ativo')
    and ($5::timestamptz is null or raised_at >= $5)
    and ($6::timestamptz is null or raised_at < $6)
  order by raised_at desc
  limit $7
`;

export const FIND_ALARM = `select ${ALARM_COLUMNS} from alarm where id = $1`;

/**
 * Reconhece um alarme que ainda não foi reconhecido.
 *
 * O estado só cai para `reconhecido` se estava `ativo` — um alarme já
 * normalizado continua normalizado, e o que muda é só a hora do
 * reconhecimento. É a mesma regra de `nextAlarmState`, escrita aqui porque
 * quem reconhece precisa que leitura e escrita aconteçam no mesmo comando: dois
 * cliques simultâneos não podem gravar dois reconhecimentos diferentes.
 *
 * `acknowledged_at is null` no `where` faz o segundo clique não devolver linha,
 * e quem chamou sabe que não foi ele que reconheceu.
 */
export const ACKNOWLEDGE_ALARM = `
  update alarm set
    acknowledged_at = $2::timestamptz,
    acknowledged_by = $3,
    state = case when state = 'ativo' then 'reconhecido' else state end
  where id = $1 and acknowledged_at is null
  returning ${ALARM_COLUMNS}
`;

/** Engaveta um alarme até um instante. Reengavetar estende a gaveta. */
export const SHELVE_ALARM = `
  update alarm set shelved_until = $2::timestamptz, shelved_by = $3
  where id = $1
  returning ${ALARM_COLUMNS}
`;

export const UNSHELVE_ALARM = `
  update alarm set shelved_until = null, shelved_by = null
  where id = $1
  returning ${ALARM_COLUMNS}
`;

/** Quantos alarmes dispararam numa janela — a contagem de inundação. */
export const COUNT_ALARMS_IN_WINDOW = `
  select count(*)::int as count
  from alarm
  where raised_at > $1::timestamptz and raised_at <= $2::timestamptz
`;
