import type { WhatIfOptions } from '@mp1/shared/simulation';
import type {
  Alarm,
  GradeChange,
  MaintenanceNote,
  NoteStatus,
  NoteSuggestion,
  Round,
  SetpointChange,
  SuggestionStatus,
  WebBreak,
} from '@mp1/shared';

import {
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
  fetchWhatIf,
  fetchReel,
  fetchReels,
  fetchRounds,
  fetchLabTestResults,
  fetchNoteSuggestions,
  fetchQuality,
  fetchSetpointChanges,
  fetchShift,
  fetchShifts,
  fetchSteamGroups,
  fetchTag,
  fetchTagTrend,
  fetchBreakReplay,
  fetchWebBreaks,
  confirmNoteSuggestion,
  dismissNoteSuggestion,
  writeSetpoint,
  type AlarmList,
  type ConfirmBody,
  type SuggestionQuery,
  type BreakReplayView,
  type AlarmQuery,
  type LabTestResult,
  type ProcessValues,
  type QualityReport,
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
import { fixtureRoutes, type FixtureRoutes } from './fixtures';
import type { WhatIfResponse } from './whatif';

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
export interface DataGateway extends FixtureRoutes {
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

  /**
   * O replay de uma quebra: a ordem dos desvios, as séries e os eventos.
   *
   * Não é `null` no instantâneo. A conta já foi feita quando o instantâneo foi
   * gerado — o replay é leitura de arquivo, como todo o resto da demonstração.
   */
  breakReplay(id: string, signal?: AbortSignal): Promise<BreakReplayView>;
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

  /**
   * Os laudos de laboratório que viraram entidade — hoje só a tração MD.
   *
   * Os outros 18 ensaios continuam vindo de `labResults`, que é dado fixo com
   * selo de ilustrativo. A tela mostra os dois e diz qual é qual.
   */
  labTestResults(
    filter?: { tag?: string; reelNumber?: number; limit?: number },
    signal?: AbortSignal,
  ): Promise<{ count: number; results: readonly LabTestResult[] }>;

  /**
   * A estimativa de um ensaio entre duas análises.
   *
   * Não é `null` no instantâneo: a conta já foi feita quando ele foi gerado, e
   * o que viaja é a resposta pronta — como o replay de quebra.
   */
  quality(
    tag: string,
    options?: { from?: Date; to?: Date; buckets?: number },
    signal?: AbortSignal,
  ): Promise<QualityReport>;

  /**
   * As notas sugeridas pela tendência dos mancais.
   *
   * A **leitura** existe no instantâneo: a sugestão é derivada do arquivo, e o
   * gerador a colhe como colhe as outras listas. O que não existe lá é decidir.
   */
  noteSuggestions(
    filter?: { status?: SuggestionStatus; assetTag?: string; limit?: number },
    signal?: AbortSignal,
  ): Promise<{ count: number; suggestions: readonly NoteSuggestion[] }>;

  /**
   * Confirmar e dispensar são `null` quando a fonte não aceita escrita.
   *
   * Mesma honestidade da escrita de setpoint: um instantâneo que aceitasse a
   * confirmação mostraria a nota criada e a perderia no próximo carregamento,
   * sem nenhuma explicação.
   */
  readonly confirmSuggestion:
    | ((
        id: string,
        body?: ConfirmBody,
        signal?: AbortSignal,
      ) => Promise<{ suggestion: NoteSuggestion; note: MaintenanceNote }>)
    | null;
  readonly dismissSuggestion:
    | ((
        id: string,
        body: { reason: string; dismissedBy?: string },
        signal?: AbortSignal,
      ) => Promise<{ suggestion: NoteSuggestion }>)
    | null;

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

  /**
   * A previsão de uma mudança, antes de aplicar.
   *
   * **Não** é `null` no instantâneo: esta é a primeira coisa que o modo de
   * demonstração faz de verdade em vez de mostrar dado guardado. O estado do
   * motor viaja no instantâneo e a conta roda num Web Worker, com o mesmo
   * núcleo que o servidor usa.
   */
  whatIf(request: WhatIfOptions, signal?: AbortSignal): Promise<WhatIfResponse>;

  /** `null` quando a fonte não aceita reconhecimento. */
  readonly acknowledgeAlarm:
    | ((id: string, acknowledgedBy: string, signal?: AbortSignal) => Promise<{ alarm: Alarm }>)
    | null;
}

/** O portão que fala com a API. */
export const LIVE_GATEWAY: DataGateway = {
  kind: 'live',
  ...fixtureRoutes({
    reels: fetchReels,
    processValues: fetchProcessValues,
    alarms: fetchAlarms,
  }),
  asset: fetchAsset,
  vibration: fetchVibration,
  processValues: fetchProcessValues,
  whatIf: fetchWhatIf,
  tag: fetchTag,
  tagTrend: fetchTagTrend,
  steamGroups: fetchSteamGroups,
  alarms: fetchAlarms,
  shifts: fetchShifts,
  shift: fetchShift,
  reels: fetchReels,
  reel: fetchReel,
  webBreaks: fetchWebBreaks,
  breakReplay: fetchBreakReplay,
  gradeChanges: fetchGradeChanges,
  rounds: fetchRounds,
  notes: fetchNotes,
  labTestResults: fetchLabTestResults,
  quality: fetchQuality,
  noteSuggestions: (filter?: SuggestionQuery, signal?: AbortSignal) =>
    fetchNoteSuggestions(filter, signal),
  confirmSuggestion: confirmNoteSuggestion,
  dismissSuggestion: dismissNoteSuggestion,
  setpointChanges: fetchSetpointChanges,
  writeSetpoint,
  acknowledgeAlarm,
};
