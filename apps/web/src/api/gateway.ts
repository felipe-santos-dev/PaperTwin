import type {
  Alarm,
  GradeChange,
  MaintenanceNote,
  NoteStatus,
  Round,
  SetpointChange,
  WebBreak,
} from '@mp1/shared';

import {
  ApiError,
  fetchAsset,
  fetchVibration,
  type AssetDetail,
  type VibrationQuery,
  type VibrationSeries,
} from './client';
import {
  acknowledgeAlarm,
  fetchAlarms,
  fetchGradeChanges,
  fetchNotes,
  fetchProcessValues,
  fetchReel,
  fetchReels,
  fetchRounds,
  fetchSetpointChanges,
  fetchShift,
  fetchShifts,
  fetchSteamGroups,
  fetchTag,
  fetchTagTrend,
  fetchWebBreaks,
  writeSetpoint,
  type AlarmList,
  type AlarmQuery,
  type ProcessValues,
  type ReelView,
  type SetpointAccepted,
  type SetpointRejection,
  type ShiftDetail,
  type ShiftView,
  type SteamGroupView,
  type TagDetail,
  type TagTrend,
  type TrendQuery,
} from './process';

/**
 * A porta de entrada dos dados, numa interface só.
 *
 * As telas não importam `fetchX` direto. Elas recebem **esta** interface, e quem
 * decide se ela aponta para a API ou para o instantâneo de demonstração é a
 * aplicação, uma vez, ao abrir.
 *
 * Isso resolve três coisas que a Fase 3 resolvia caso a caso:
 *
 * 1. **O modo de demonstração deixa de ser um `if` em cada tela.** Com sete
 *    telas e quinze buscas, um `if` por chamada seria quinze lugares para
 *    esquecer.
 * 2. **O teste não precisa interceptar o `fetch` global.** Ele passa um portão
 *    de mentira e observa o que a tela faz com cada resposta — inclusive com as
 *    que falham.
 * 3. **As escritas ficam honestas no modo de demonstração.** Um instantâneo
 *    estático não aceita escrita de setpoint, e fingir que aceitou seria pior
 *    que recusar: o número voltaria ao anterior no próximo carregamento sem
 *    nenhuma explicação.
 */
export interface DataGateway {
  readonly kind: 'live' | 'demo';

  /**
   * Ativo e vibração, pelas rotas da Fase 3.
   *
   * Elas continuam aqui porque continuam sendo as rotas certas para a pergunta
   * que a cena 3D faz — "o que este mancal mediu nas últimas 72 h" —, com a
   * agregação por janela e a estimativa de vida útil restante já calculadas pelo
   * servidor. A Fase 5 acrescentou a tendência por ponto do historiador, que
   * responde outra pergunta: a série comprimida de uma tag, com os quatro
   * valores por coluna.
   */
  asset(tag: string, signal?: AbortSignal): Promise<AssetDetail>;
  vibration(tag: string, query?: VibrationQuery, signal?: AbortSignal): Promise<VibrationSeries>;

  processValues(
    filter?: { area?: string; group?: string },
    signal?: AbortSignal,
  ): Promise<ProcessValues>;
  tag(tag: string, signal?: AbortSignal): Promise<TagDetail>;
  tagTrend(tag: string, options?: TrendQuery, signal?: AbortSignal): Promise<TagTrend>;
  steamGroups(signal?: AbortSignal): Promise<{ ts: string; groups: readonly SteamGroupView[] }>;

  alarms(filter?: AlarmQuery, signal?: AbortSignal): Promise<AlarmList>;

  shifts(
    filter?: { limit?: number },
    signal?: AbortSignal,
  ): Promise<{ count: number; shifts: readonly ShiftView[] }>;
  shift(id: string, signal?: AbortSignal): Promise<ShiftDetail>;
  reels(
    filter?: { shiftId?: string; limit?: number },
    signal?: AbortSignal,
  ): Promise<{ count: number; reels: readonly ReelView[] }>;
  reel(number: number, signal?: AbortSignal): Promise<{ reel: ReelView }>;
  webBreaks(
    filter?: { shiftId?: string; limit?: number },
    signal?: AbortSignal,
  ): Promise<{ count: number; webBreaks: readonly WebBreak[] }>;
  gradeChanges(
    filter?: { shiftId?: string; limit?: number },
    signal?: AbortSignal,
  ): Promise<{ count: number; gradeChanges: readonly GradeChange[] }>;
  rounds(
    filter?: { shiftId?: string; limit?: number },
    signal?: AbortSignal,
  ): Promise<{ count: number; rounds: readonly Round[] }>;
  notes(
    filter?: { status?: NoteStatus; assetTag?: string; limit?: number },
    signal?: AbortSignal,
  ): Promise<{ count: number; notes: readonly MaintenanceNote[] }>;
  setpointChanges(
    filter?: { tag?: string; limit?: number },
    signal?: AbortSignal,
  ): Promise<{ count: number; changes: readonly SetpointChange[] }>;

  /** `null` quando a fonte não aceita escrita — é o caso do instantâneo. */
  readonly writeSetpoint:
    | ((
        tag: string,
        body: { value: number; reason: string; changedBy?: string },
        signal?: AbortSignal,
      ) => Promise<
        { ok: true; accepted: SetpointAccepted } | { ok: false; rejected: SetpointRejection }
      >)
    | null;

  /** `null` quando a fonte não aceita reconhecimento. */
  readonly acknowledgeAlarm:
    | ((id: string, acknowledgedBy: string, signal?: AbortSignal) => Promise<{ alarm: Alarm }>)
    | null;
}

/** O portão que fala com a API. */
export const LIVE_GATEWAY: DataGateway = {
  kind: 'live',
  asset: fetchAsset,
  vibration: fetchVibration,
  processValues: fetchProcessValues,
  tag: fetchTag,
  tagTrend: fetchTagTrend,
  steamGroups: fetchSteamGroups,
  alarms: fetchAlarms,
  shifts: fetchShifts,
  shift: fetchShift,
  reels: fetchReels,
  reel: fetchReel,
  webBreaks: fetchWebBreaks,
  gradeChanges: fetchGradeChanges,
  rounds: fetchRounds,
  notes: fetchNotes,
  setpointChanges: fetchSetpointChanges,
  writeSetpoint,
  acknowledgeAlarm,
};

/** Um erro que diz que a fonte é somente leitura, sem fingir outra coisa. */
export function readOnlySource(): ApiError {
  return new ApiError(
    405,
    'O modo de demonstração é um instantâneo: ele não aceita escrita. ' +
      'Suba a API para mexer no processo.',
  );
}
