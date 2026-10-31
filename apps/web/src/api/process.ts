import type {
  Alarm,
  AlarmLimits,
  AlarmPriority,
  AlarmState,
  ArchiveReason,
  GradeChange,
  MaintenanceNote,
  NoteStatus,
  ProcessVariable,
  Round,
  SetpointChange,
  WebBreak,
} from '@mp1/shared';

import { API_URL, ApiError } from './client';

/**
 * O cliente das rotas da Fase 5.
 *
 * Os tipos de resposta são **escritos aqui** e não importados da API, e isso é
 * de propósito: a web não depende do pacote do servidor. O que as duas
 * compartilham é `@mp1/shared`, onde estão as entidades do domínio — e as
 * respostas de rota são envelopes em volta delas, com `count`, `ts` e afins.
 *
 * Um pacote de tipos de rota gerado do OpenAPI resolveria isso de vez, e é
 * trabalho de outra fase; por ora o que impede as duas pontas de divergirem é o
 * teste de rota do lado do servidor, que valida a resposta contra o mesmo schema
 * que gera o documento.
 */

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, init);

  if (!response.ok) {
    const detail = await response
      .json()
      .then((body: { message?: string }) => body.message)
      .catch(() => undefined);
    throw new ApiError(response.status, detail ?? `A API respondeu ${String(response.status)}`);
  }

  return (await response.json()) as T;
}

const query = (params: Record<string, string | number | boolean | undefined>): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  return search.size > 0 ? `?${search.toString()}` : '';
};

const signalOf = (signal?: AbortSignal): RequestInit | undefined =>
  signal ? { signal } : undefined;

// ------------------------------------------------------------- processo

export interface TagValue {
  readonly tag: string;
  readonly value: number;
  readonly unit: string;
  readonly ts: string;
  readonly setpoint: number | null;
}

export interface ProcessValues {
  readonly ts: string;
  readonly count: number;
  readonly values: readonly TagValue[];
}

export function fetchProcessValues(
  filter: { area?: string; group?: string } = {},
  signal?: AbortSignal,
): Promise<ProcessValues> {
  return request<ProcessValues>(`/process/values${query(filter)}`, signalOf(signal));
}

export interface TagDetail {
  readonly variable: ProcessVariable;
  readonly value: TagValue | null;
  readonly writable: boolean;
  readonly notWritableBecause: string | null;
  readonly archived: boolean;
}

export function fetchTag(tag: string, signal?: AbortSignal): Promise<TagDetail> {
  return request<TagDetail>(`/process/tags/${encodeURIComponent(tag)}`, signalOf(signal));
}

/** Uma coluna do gráfico: quatro valores, para um pico curto não desaparecer. */
export interface PlotBucket {
  readonly bucketStart: string;
  readonly samples: number;
  readonly min: number;
  readonly max: number;
  readonly first: number;
  readonly last: number;
}

export interface ArchivedSample {
  readonly t: number;
  readonly v: number;
  readonly pointId: number;
  readonly reason: ArchiveReason;
}

export interface TagTrend {
  readonly tag: string;
  readonly unit: string;
  readonly from: string;
  readonly to: string;
  readonly bucketS: number;
  readonly buckets: readonly PlotBucket[];
  readonly before: ArchivedSample | null;
  readonly after: ArchivedSample | null;
  readonly timeWeightedAverage: number | null;
  readonly limits: AlarmLimits | null;
  readonly target: number | null;
}

export interface TrendQuery {
  readonly from?: Date;
  readonly to?: Date;
  readonly buckets?: number;
}

export function fetchTagTrend(
  tag: string,
  options: TrendQuery = {},
  signal?: AbortSignal,
): Promise<TagTrend> {
  return request<TagTrend>(
    `/process/tags/${encodeURIComponent(tag)}/trend${query({
      from: options.from?.toISOString(),
      to: options.to?.toISOString(),
      buckets: options.buckets,
    })}`,
    signalOf(signal),
  );
}

export interface SteamGroupView {
  readonly id: string;
  readonly label: string;
  readonly role: string | null;
  readonly section: string;
  readonly cylinders: readonly number[];
  readonly pressure: TagValue | null;
  readonly siphonDeltaP: TagValue | null;
  readonly condensateLevel: TagValue | null;
  readonly condensateNote: string | null;
  readonly division: { readonly source: string; readonly note: string };
  readonly tagMap: { readonly source: string; readonly note: string };
}

export function fetchSteamGroups(
  signal?: AbortSignal,
): Promise<{ ts: string; groups: readonly SteamGroupView[] }> {
  return request(`/process/steam-groups`, signalOf(signal));
}

/** O que a API devolve quando recusa uma escrita de setpoint. */
export interface SetpointRejection {
  readonly statusCode: number;
  readonly error: string;
  readonly message: string;
  readonly rejection: string | null;
  readonly min: number | null;
  readonly max: number | null;
}

export interface SetpointAccepted {
  readonly change: SetpointChange;
  readonly min: number | null;
  readonly max: number | null;
}

/**
 * Escreve um setpoint.
 *
 * A recusa **não** vira exceção: ela é resposta de domínio, com a faixa que a
 * tela precisa para corrigir o campo. Exceção fica para o que é falha — rede
 * caída, 500, tag que não existe.
 */
export async function writeSetpoint(
  tag: string,
  body: { value: number; reason: string; changedBy?: string },
  signal?: AbortSignal,
): Promise<{ ok: true; accepted: SetpointAccepted } | { ok: false; rejected: SetpointRejection }> {
  const response = await fetch(`${API_URL}/process/tags/${encodeURIComponent(tag)}/setpoint`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  });

  if (response.ok) {
    return { ok: true, accepted: (await response.json()) as SetpointAccepted };
  }

  if (response.status === 422) {
    return { ok: false, rejected: (await response.json()) as SetpointRejection };
  }

  const detail = await response
    .json()
    .then((payload: { message?: string }) => payload.message)
    .catch(() => undefined);
  throw new ApiError(response.status, detail ?? `A API respondeu ${String(response.status)}`);
}

// -------------------------------------------------------------- alarmes

export interface AlarmList {
  readonly count: number;
  readonly floodWindowS: number;
  readonly floodThreshold: number;
  readonly inFloodWindow: number;
  readonly flooding: boolean;
  readonly alarms: readonly Alarm[];
}

export interface AlarmQuery {
  readonly state?: AlarmState;
  readonly priority?: AlarmPriority;
  readonly tag?: string;
  readonly needsAction?: boolean;
  readonly limit?: number;
}

export function fetchAlarms(filter: AlarmQuery = {}, signal?: AbortSignal): Promise<AlarmList> {
  return request<AlarmList>(`/alarms${query({ ...filter })}`, signalOf(signal));
}

export function acknowledgeAlarm(
  id: string,
  acknowledgedBy: string,
  signal?: AbortSignal,
): Promise<{ alarm: Alarm }> {
  return request(`/alarms/${encodeURIComponent(id)}/ack`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ acknowledgedBy }),
    ...(signal ? { signal } : {}),
  });
}

// ------------------------------------------------------------- operação

/** O turno como a API devolve: a entidade mais o dia de operação. */
export interface ShiftView {
  readonly id: string;
  readonly letter: string;
  readonly operationDate: string;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly operator: string;
  readonly productionT: number;
  readonly efficiencyPct: number;
  readonly handover: readonly string[];
}

export interface ReelView {
  readonly number: number;
  readonly shiftId: string;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly weightT: number | null;
  readonly lengthM: number | null;
  readonly finalDiameterMm: number | null;
  readonly basisWeightGsm: number | null;
  readonly moisturePct: number | null;
  readonly caliperUm: number | null;
  readonly cdSpread: {
    readonly basisWeightGsm: number;
    readonly moisturePct: number;
    readonly caliperUm: number;
  } | null;
  readonly splices: number;
  readonly disposition: 'aprovada' | 'rebaixada' | 'segregada' | null;
  readonly dispositionReason: string | null;
}

export function fetchShifts(
  filter: { limit?: number } = {},
  signal?: AbortSignal,
): Promise<{ count: number; shifts: readonly ShiftView[] }> {
  return request(`/shifts${query(filter)}`, signalOf(signal));
}

export interface ShiftDetail {
  readonly shift: ShiftView;
  readonly reels: readonly ReelView[];
  readonly webBreaks: readonly WebBreak[];
  readonly gradeChanges: readonly GradeChange[];
  readonly rounds: readonly Round[];
}

export function fetchShift(id: string, signal?: AbortSignal): Promise<ShiftDetail> {
  return request<ShiftDetail>(`/shifts/${encodeURIComponent(id)}`, signalOf(signal));
}

export function fetchReels(
  filter: { shiftId?: string; limit?: number } = {},
  signal?: AbortSignal,
): Promise<{ count: number; reels: readonly ReelView[] }> {
  return request(`/reels${query(filter)}`, signalOf(signal));
}

export function fetchReel(number: number, signal?: AbortSignal): Promise<{ reel: ReelView }> {
  return request(`/reels/${String(number)}`, signalOf(signal));
}

export function fetchWebBreaks(
  filter: { shiftId?: string; limit?: number } = {},
  signal?: AbortSignal,
): Promise<{ count: number; webBreaks: readonly WebBreak[] }> {
  return request(`/web-breaks${query(filter)}`, signalOf(signal));
}

export function fetchGradeChanges(
  filter: { shiftId?: string; limit?: number } = {},
  signal?: AbortSignal,
): Promise<{ count: number; gradeChanges: readonly GradeChange[] }> {
  return request(`/grade-changes${query(filter)}`, signalOf(signal));
}

export function fetchRounds(
  filter: { shiftId?: string; limit?: number } = {},
  signal?: AbortSignal,
): Promise<{ count: number; rounds: readonly Round[] }> {
  return request(`/rounds${query(filter)}`, signalOf(signal));
}

export function fetchNotes(
  filter: { status?: NoteStatus; assetTag?: string; limit?: number } = {},
  signal?: AbortSignal,
): Promise<{ count: number; notes: readonly MaintenanceNote[] }> {
  return request(`/notes${query(filter)}`, signalOf(signal));
}

export function fetchSetpointChanges(
  filter: { tag?: string; limit?: number } = {},
  signal?: AbortSignal,
): Promise<{ count: number; changes: readonly SetpointChange[] }> {
  return request(`/setpoint-changes${query(filter)}`, signalOf(signal));
}
