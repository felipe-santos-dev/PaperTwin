import type {
  Alarm,
  AlarmPriority,
  AlarmState,
  AssetTag,
  GradeChange,
  JumboReel,
  LabResult,
  MaintenanceNote,
  NoteStatus,
  NoteSuggestion,
  Round,
  SetpointChange,
  Shift,
  SuggestionMeasure,
  SuggestionStatus,
  WebBreak,
} from '@mp1/shared';

import type { StoredShift } from './operations-queries';

/**
 * O contrato das entidades de operação.
 *
 * Separado de `repository.ts` só por tamanho: `Database` continua sendo a soma
 * de tudo, e as rotas continuam enxergando uma interface só.
 *
 * Duas formas se repetem:
 *
 * - **Escrita em lote, por `upsert`.** A semeadura roda a cada arranque e o
 *   simulador recalcula o intervalo que faltou quando a API acorda; nos dois
 *   casos a mesma entidade pode ser gravada de novo com o mesmo id, e isso tem
 *   de ser inócuo.
 * - **Leitura com `limit` obrigatório.** Nenhuma lista é aberta: o turno tem
 *   dezenas de bobinas e centenas de alarmes, e uma rota sem teto é uma rota
 *   que um dia devolve o banco inteiro para o navegador.
 */

/** Janela de tempo, nas listas que filtram por data. */
export interface TimeRange {
  readonly from?: Date;
  readonly to?: Date;
}

export interface ShiftFilter extends TimeRange {
  readonly limit?: number;
}

export interface ReelFilter {
  readonly shiftId?: string;
  readonly limit?: number;
}

export interface EventFilter extends TimeRange {
  readonly shiftId?: string;
  readonly limit?: number;
}

export interface RoundFilter {
  readonly shiftId?: string;
  readonly limit?: number;
}

export interface NoteFilter {
  readonly status?: NoteStatus;
  readonly assetTag?: AssetTag;
  readonly limit?: number;
}

export interface SetpointFilter {
  readonly tag?: string;
  readonly limit?: number;
}

export interface LabResultFilter extends TimeRange {
  readonly tag?: string;
  readonly reelNumber?: number;
  readonly limit?: number;
}

export interface SuggestionFilter {
  readonly status?: SuggestionStatus;
  readonly assetTag?: AssetTag;
  readonly limit?: number;
}

export interface AlarmFilter extends TimeRange {
  readonly state?: AlarmState;
  readonly priority?: AlarmPriority;
  readonly tag?: string;
  /**
   * Só os que ainda pedem ação de alguém.
   *
   * É `needsOperatorAction` de `@mp1/shared` em SQL: ou ninguém reconheceu, ou
   * ainda está ativo. Mantém na lista o alarme que normalizou sozinho sem
   * ninguém ficar sabendo, que é o caso que a ISA-18.2 quer que apareça.
   */
  readonly needsAction?: boolean;
  readonly limit?: number;
}

export interface OperationsRepository {
  // --- turno ---
  upsertShifts(shifts: readonly (Shift | StoredShift)[]): Promise<number>;
  listShifts(filter?: ShiftFilter): Promise<StoredShift[]>;
  findShift(id: string): Promise<StoredShift | null>;

  // --- bobina jumbo ---
  upsertReels(reels: readonly JumboReel[]): Promise<number>;
  listReels(filter?: ReelFilter): Promise<JumboReel[]>;
  findReel(number: number): Promise<JumboReel | null>;

  // --- quebra de folha ---
  upsertWebBreaks(breaks: readonly WebBreak[]): Promise<number>;
  listWebBreaks(filter?: EventFilter): Promise<WebBreak[]>;
  findWebBreak(id: string): Promise<WebBreak | null>;

  // --- troca de gramatura ---
  upsertGradeChanges(changes: readonly GradeChange[]): Promise<number>;
  listGradeChanges(filter?: EventFilter): Promise<GradeChange[]>;

  // --- ronda ---
  upsertRounds(rounds: readonly Round[]): Promise<number>;
  listRounds(filter?: RoundFilter): Promise<Round[]>;
  findRound(id: string): Promise<Round | null>;

  // --- nota de manutenção ---
  upsertMaintenanceNotes(notes: readonly MaintenanceNote[]): Promise<number>;
  listMaintenanceNotes(filter?: NoteFilter): Promise<MaintenanceNote[]>;
  findMaintenanceNote(number: string): Promise<MaintenanceNote | null>;

  // --- ensaio de laboratório ---
  /** Grava os laudos. A chave é derivada da bobina, então reescrever é inócuo. */
  upsertLabResults(results: readonly LabResult[]): Promise<number>;
  /** Os laudos, do mais recente para o mais antigo **pela amostra**. */
  listLabResults(filter?: LabResultFilter): Promise<LabResult[]>;

  // --- nota sugerida ---
  /**
   * Troca as sugestões em pé pelas que a conta de agora produziu.
   *
   * A sugestão em pé é projeção do arquivo, e o que vale é a última conta; as
   * decididas ficam, porque são a auditoria da decisão de alguém.
   */
  replaceStandingSuggestions(suggestions: readonly NoteSuggestion[]): Promise<number>;
  listNoteSuggestions(filter?: SuggestionFilter): Promise<NoteSuggestion[]>;
  findNoteSuggestion(id: string): Promise<NoteSuggestion | null>;
  /**
   * Confirma a sugestão e grava a nota, na mesma transação.
   *
   * Devolve `null` quando a sugestão não existe **ou** já foi decidida — a
   * mesma convenção de `acknowledgeAlarm`, pelo mesmo motivo: dois cliques
   * simultâneos não podem gravar duas decisões.
   */
  confirmNoteSuggestion(args: {
    readonly id: string;
    readonly note: MaintenanceNote;
    readonly by: string;
    readonly at: Date;
    readonly reason: string | null;
  }): Promise<{ suggestion: NoteSuggestion; note: MaintenanceNote } | null>;
  /** Dispensa com motivo obrigatório. */
  dismissNoteSuggestion(args: {
    readonly id: string;
    readonly by: string;
    readonly at: Date;
    readonly reason: string;
  }): Promise<NoteSuggestion | null>;
  /** Os mancais que já têm nota aberta, de qualquer origem. */
  assetsWithOpenNote(): Promise<string[]>;
  /** A última dispensa de cada mancal, para a regra do degrau. */
  lastDismissedSuggestions(): Promise<Map<string, { measure: SuggestionMeasure; level: number }>>;

  // --- alteração de setpoint ---
  /** Grava a alteração. A auditoria não é reescrita: reenviar o mesmo id é inócuo. */
  insertSetpointChange(change: SetpointChange): Promise<void>;
  listSetpointChanges(filter?: SetpointFilter): Promise<SetpointChange[]>;
  /** A última alteração de uma malha, de onde sai o próximo `previousValue`. */
  latestSetpointChange(tag: string): Promise<SetpointChange | null>;

  // --- alarme ---
  upsertAlarms(alarms: readonly Alarm[]): Promise<number>;
  listAlarms(filter?: AlarmFilter): Promise<Alarm[]>;
  findAlarm(id: string): Promise<Alarm | null>;
  /**
   * Reconhece um alarme ainda não reconhecido.
   *
   * Devolve `null` quando o alarme não existe **ou** já havia sido reconhecido
   * — e quem chama precisa distinguir os dois casos com `findAlarm`. A leitura
   * e a escrita acontecem no mesmo comando de propósito: dois cliques
   * simultâneos não podem gravar dois reconhecimentos diferentes.
   */
  acknowledgeAlarm(id: string, by: string, at: Date): Promise<Alarm | null>;
  /** Engaveta até um instante; reengavetar estende a gaveta. */
  shelveAlarm(id: string, by: string, until: Date): Promise<Alarm | null>;
  unshelveAlarm(id: string): Promise<Alarm | null>;
  /** Quantos alarmes dispararam na janela — a contagem de inundação. */
  countAlarmsInWindow(from: Date, to: Date): Promise<number>;
}
