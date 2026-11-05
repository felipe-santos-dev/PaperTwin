import type { AlarmPriority, AlarmState, NoteStatus } from '@mp1/shared';
import type {
  AlarmList,
  AlarmResponse,
  ApiAlarm,
  GradeChangesResponse,
  NotesResponse,
  ProcessValues,
  ReelDetail,
  ReelsResponse,
  RoundsResponse,
  SetpointAccepted,
  SetpointChangesResponse,
  ShiftDetail,
  ShiftsResponse,
  SteamGroupsResponse,
  TagDetail,
  TagTrend,
  WebBreaksResponse,
} from '@mp1/shared/api';
import type {
  ArchivedSampleView,
  GradeChangeView,
  PlotBucket,
  MaintenanceNoteView,
  ReelView,
  RoundView,
  SetpointChangeView,
  ShiftView,
  SteamGroupView,
  WebBreakView,
} from '@mp1/shared/api';

import { API_URL, ApiError } from './client';

/**
 * O cliente das rotas da API.
 *
 * Os tipos de resposta **vêm de `@mp1/shared/api`**, que são gerados do
 * `openapi.json` da aplicação Java. Antes eram escritos aqui, e o servidor
 * tinha de concordar com eles — o que funcionava enquanto os dois lados eram
 * TypeScript e importavam o mesmo arquivo, porque o compilador cobrava. Com o
 * back-end em Java, nada cobrava: uma rota podia mudar de forma e o front
 * continuar compilando, para quebrar na primeira requisição de quem estivesse
 * olhando a tela.
 *
 * Agora quem cobra é o `tsc`. E foi assim que apareceram quatro divergências
 * que nenhum teste pegava — a tendência sem `unit` e sem limites, a escrita de
 * setpoint em `POST` em vez de `PUT`, o corpo de recusa sem a faixa, e o
 * `/reels/:number` devolvendo a bobina crua em vez do envelope.
 */

/*
 * Reexportados para quem consome este cliente.
 *
 * As telas e os gateways importam as formas de resposta daqui, de `./process`,
 * e não de `@mp1/shared/api`: este módulo é a borda da API para o front, e
 * quem chama `fetchReels` quer o tipo ao lado da função. São os mesmos tipos
 * gerados do contrato — reexportar não declara forma nenhuma.
 */
export type {
  AlarmList,
  AlarmResponse,
  ApiAlarm,
  ArchivedSampleView,
  GradeChangesResponse,
  GradeChangeView,
  MaintenanceNoteView,
  NotesResponse,
  PlotBucket,
  ProcessValues,
  ReelDetail,
  ReelsResponse,
  RoundsResponse,
  SetpointAccepted,
  SetpointChangesResponse,
  ReelView,
  RoundView,
  SetpointChangeView,
  ShiftDetail,
  ShiftsResponse,
  ShiftView,
  SteamGroupsResponse,
  SteamGroupView,
  TagDetail,
  TagTrend,
  WebBreaksResponse,
  WebBreakView,
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, init);

  if (!response.ok) {
    const detail = await response
      .json()
      .then((body: { detail?: string }) => body.detail)
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

export function fetchProcessValues(
  filter: { area?: string; group?: string } = {},
  signal?: AbortSignal,
): Promise<ProcessValues> {
  return request<ProcessValues>(`/process/values${query(filter)}`, signalOf(signal));
}

export function fetchTag(tag: string, signal?: AbortSignal): Promise<TagDetail> {
  return request<TagDetail>(`/process/tags/${encodeURIComponent(tag)}`, signalOf(signal));
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

export function fetchSteamGroups(signal?: AbortSignal): Promise<SteamGroupsResponse> {
  return request<SteamGroupsResponse>(`/process/steam-groups`, signalOf(signal));
}

/**
 * O que a API devolve quando recusa uma escrita de setpoint.
 *
 * É Problem Details (RFC 9457) com três membros de extensão: o `rejection`, que
 * o cliente testa sem casar texto em português, e a faixa, que é o que falta
 * para quem errou o valor acertar na segunda tentativa.
 *
 * Não é gerado do contrato porque o springdoc não descreve o corpo de erro das
 * rotas — ele documenta a resposta de sucesso. Está escrito aqui, e o teste de
 * rota do lado Java confere os três campos.
 */
export interface SetpointRejection {
  readonly type: string;
  readonly status: number;
  readonly detail: string;
  readonly rejection: string | null;
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

  /*
   * 404 também é recusa de domínio aqui, e não falha.
   *
   * A API separa os dois de propósito: 404 é "a tag não existe, não tente de
   * novo" e 422 é "existe, mas este pedido não serve". Os dois têm de chegar à
   * tela como texto, e não como exceção — quem digitou a tag errada precisa
   * ler o que houve.
   */
  if (response.status === 422 || response.status === 404) {
    return { ok: false, rejected: (await response.json()) as SetpointRejection };
  }

  const detail = await response
    .json()
    .then((payload: { detail?: string }) => payload.detail)
    .catch(() => undefined);
  throw new ApiError(response.status, detail ?? `A API respondeu ${String(response.status)}`);
}

// -------------------------------------------------------------- alarmes

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
): Promise<AlarmResponse> {
  return request<AlarmResponse>(`/alarms/${encodeURIComponent(id)}/ack`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ acknowledgedBy }),
    ...(signal ? { signal } : {}),
  });
}

// ------------------------------------------------------------- operação

/** O turno como a API devolve: a entidade mais o dia de operação. */
export function fetchShifts(
  filter: { from?: string; to?: string; limit?: number } = {},
  signal?: AbortSignal,
): Promise<ShiftsResponse> {
  return request<ShiftsResponse>(`/shifts${query(filter)}`, signalOf(signal));
}

export function fetchShift(id: string, signal?: AbortSignal): Promise<ShiftDetail> {
  return request<ShiftDetail>(`/shifts/${encodeURIComponent(id)}`, signalOf(signal));
}

export function fetchReels(
  filter: { shiftId?: string; limit?: number } = {},
  signal?: AbortSignal,
): Promise<ReelsResponse> {
  return request<ReelsResponse>(`/reels${query(filter)}`, signalOf(signal));
}

export function fetchReel(number: number, signal?: AbortSignal): Promise<ReelDetail> {
  return request<ReelDetail>(`/reels/${String(number)}`, signalOf(signal));
}

export function fetchWebBreaks(
  filter: { shiftId?: string; limit?: number } = {},
  signal?: AbortSignal,
): Promise<WebBreaksResponse> {
  return request<WebBreaksResponse>(`/web-breaks${query(filter)}`, signalOf(signal));
}

export function fetchGradeChanges(
  filter: { shiftId?: string; limit?: number } = {},
  signal?: AbortSignal,
): Promise<GradeChangesResponse> {
  return request<GradeChangesResponse>(`/grade-changes${query(filter)}`, signalOf(signal));
}

export function fetchRounds(
  filter: { shiftId?: string; limit?: number } = {},
  signal?: AbortSignal,
): Promise<RoundsResponse> {
  return request<RoundsResponse>(`/rounds${query(filter)}`, signalOf(signal));
}

export function fetchNotes(
  filter: { status?: NoteStatus; assetTag?: string; limit?: number } = {},
  signal?: AbortSignal,
): Promise<NotesResponse> {
  return request<NotesResponse>(`/notes${query(filter)}`, signalOf(signal));
}

export function fetchSetpointChanges(
  filter: { tag?: string; limit?: number } = {},
  signal?: AbortSignal,
): Promise<SetpointChangesResponse> {
  return request<SetpointChangesResponse>(`/setpoint-changes${query(filter)}`, signalOf(signal));
}
