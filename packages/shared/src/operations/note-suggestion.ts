import type { AssetTag } from '../asset';
import { classifyIsoZone, type IsoLimits, type IsoZone } from '../iso20816';
import { estimateRemainingLife } from '../rul';
import type { RemainingLife, VibrationBucket } from '../vibration';
import type { MaintenanceNote, NoteEvidence, NotePriority } from './maintenance';
import type { ProvenanceNote } from './provenance';

/**
 * A nota sugerida: do sinal até a nota, sem ninguém digitar.
 *
 * O gêmeo já sabia duas coisas separadas — a tendência de vibração de cada
 * mancal (`rul.ts`) e o que é uma nota de manutenção (`maintenance.ts`). Falta
 * a ponte: a regra que, olhando a tendência, escreve a nota que alguém
 * escreveria à mão.
 *
 * ## Por que a sugestão não é uma nota com outra situação
 *
 * A nota tem o número como chave, e **a sugestão não tem número**: ela só ganha
 * um `NM-…` quando alguém confirma. Dispensar é o caso comum — a maior parte
 * das tendências que passam da régua é para ser olhada, não para virar ordem de
 * serviço — e uma sugestão dispensada não pode gastar sequência.
 *
 * Então a sugestão é entidade própria, com chave própria: o mancal e o início
 * da janela da tendência. Ela nasce `sugerida` e morre `confirmada` (virou
 * nota) ou `dispensada` (com motivo). A linha fica nos dois casos — é ela a
 * auditoria, como a alteração de setpoint é a auditoria da escrita.
 *
 * ## O que a regra promete, e o que não promete
 *
 * Promete que a projeção cruza um limite dentro do prazo, pela régua de
 * significância do `rul.ts`: a inclinação tem de ser maior que duas vezes o
 * erro padrão dela mesma. Não promete que o mancal vai falhar — a reta
 * subestima um defeito que acelera, e o próprio `rul.ts` diz isso.
 */

/** Em que situação a sugestão está. */
export const SUGGESTION_STATUSES = ['sugerida', 'confirmada', 'dispensada'] as const;

export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];

/** Qual medição do mancal projeta cruzar o limite. */
export const SUGGESTION_MEASURES = ['vibração', 'temperatura'] as const;

export type SuggestionMeasure = (typeof SUGGESTION_MEASURES)[number];

/** O que a sugestão precisa para levar de volta aos registros de onde saiu. */
export interface SuggestionRefs {
  /** TAG de vibração do mancal no catálogo. */
  readonly vibrationTag: string;
  /** TAG de temperatura do mancal no catálogo. */
  readonly temperatureTag: string;
  /** Alarme do mancal, se houver. */
  readonly alarm: { readonly id: string; readonly tag: string; readonly limit: string } | null;
  /** Última ronda que passou no ponto, com a leitura de campo. */
  readonly round: { readonly id: string; readonly fieldTempC: number | null } | null;
}

export interface NoteSuggestion {
  /** `SG-<segundos do início da tendência>-<mancal>`, derivado da chave. */
  readonly id: string;
  readonly assetTag: AssetTag;
  /** Início da janela que a regressão usou — a outra metade da chave. */
  readonly trendStart: string;
  readonly measure: SuggestionMeasure;
  readonly symptom: string;
  readonly priority: NotePriority;
  readonly requiresShutdown: boolean;
  /** Dias até a projeção cruzar o limite; `0` quando já cruzou. */
  readonly daysToLimit: number;
  /** Inclinação da tendência, na unidade da medição por dia. */
  readonly perDay: number;
  /** Valor atual: a média da última janela da série. */
  readonly level: number;
  /** O limite que a projeção cruza. */
  readonly limit: number;
  /** Quantas janelas entraram no ajuste. */
  readonly samples: number;
  readonly evidence: readonly NoteEvidence[];
  /** Quando a conta foi feita. */
  readonly at: string;
  readonly status: SuggestionStatus;
  readonly decidedAt: string | null;
  readonly decidedBy: string | null;
  /** Motivo da dispensa — obrigatório nela — ou da confirmação, se houver. */
  readonly reason: string | null;
  /** O número da nota, quando confirmada. */
  readonly noteNumber: string | null;
}

/** Os dois números que a regra deixa configuráveis. */
export interface SuggestionRule {
  /**
   * Em quantos dias a projeção precisa cruzar o limite para virar sugestão.
   *
   * **Suposição.** Trinta dias é o horizonte em que uma parada de manutenção se
   * planeja. É ele, e não a régua de significância, que mantém os mancais
   * saudáveis fora da fila: com ruído de 0,02 mm/s, a inclinação que cruzaria
   * 4,5 mm/s em trinta dias é dezenas de vezes maior do que o ruído produz. Sem
   * o horizonte, "duas vezes o erro padrão" num universo de 72 mancais daria
   * uns três falsos por varredura — e uma fila de trabalho com três notas
   * inventadas é pior que nenhuma.
   */
  readonly horizonDays: number;
  /**
   * Quanto a medição precisa piorar para uma sugestão dispensada voltar.
   *
   * **Suposição.** Quem dispensou olhou um número; o degrau é o quanto esse
   * número tem de andar para a pergunta ser outra. 0,3 mm/s é um sexto da faixa
   * entre as fronteiras B→C e C→D do grupo 2 rígido; 2 °C é mais de dez vezes a
   * dispersão da leitura de temperatura do mancal.
   */
  readonly step: Readonly<Record<SuggestionMeasure, number>>;
}

export const SUGGESTION_RULE: SuggestionRule = {
  horizonDays: 30,
  step: { vibração: 0.3, temperatura: 2 },
};

/**
 * A prioridade sai do prazo, e os cortes falam a língua dos rótulos.
 *
 * **Suposição.** `NOTE_PRIORITY_LABELS` diz o que cada nível quer dizer, e os
 * cortes aqui são a leitura dele em dias: três dias não cabem numa parada
 * programada, dez cabem na próxima, vinte na parada de manutenção, e o resto é
 * quando houver oportunidade.
 */
const PRIORITY_BY_DAYS: readonly { readonly days: number; readonly priority: NotePriority }[] = [
  { days: 3, priority: 1 },
  { days: 10, priority: 2 },
  { days: 20, priority: 3 },
];

export function priorityForDays(days: number): NotePriority {
  return PRIORITY_BY_DAYS.find((row) => days <= row.days)?.priority ?? 4;
}

/** O id da sugestão, derivado da chave (mancal + início da tendência). */
export function suggestionId(assetTag: AssetTag, trendStart: string): string {
  return `SG-${String(Math.floor(Date.parse(trendStart) / 1000))}-${assetTag}`;
}

/**
 * A projeção da temperatura, pela mesma régua da vibração.
 *
 * `estimateRemainingLife` recebe a série como se fosse vibração e o limite de
 * temperatura no lugar da fronteira C→D. Assim a temperatura passa pelo mesmo
 * critério de significância — uma reta que não é maior que o espalhamento das
 * leituras não vira prazo — sem uma segunda regressão escrita à mão, que
 * divergiria da primeira na primeira mudança de regra.
 */
export function temperatureLife(
  buckets: readonly VibrationBucket[],
  limitC: number,
): RemainingLife {
  const asVibration = buckets.map((bucket) => ({ ...bucket, rmsAvgMmS: bucket.tempAvgC }));
  return estimateRemainingLife(asVibration, { aToB: limitC, bToC: limitC, cToD: limitC });
}

/** Número com vírgula decimal, como o resto da interface mostra. */
function pt(value: number, digits: number): string {
  return value.toFixed(digits).replace('.', ',');
}

/** A frase do sintoma, gerada dos números — é ela que vai para a nota. */
export function suggestionSymptom(input: {
  readonly measure: SuggestionMeasure;
  readonly level: number;
  readonly perDay: number;
  readonly limit: number;
  readonly daysToLimit: number;
  readonly zone: IsoZone | null;
}): string {
  const { measure, level, perDay, limit, daysToLimit, zone } = input;
  const unit = measure === 'vibração' ? 'mm/s' : '°C';
  const digits = measure === 'vibração' ? 2 : 1;

  const onde =
    measure === 'vibração'
      ? `vibração ${pt(level, digits)} ${unit}${zone === null ? '' : ` (zona ${zone})`}`
      : `temperatura ${pt(level, digits)} ${unit}`;

  const alvo =
    measure === 'vibração'
      ? `a fronteira C→D de ${pt(limit, 1)} ${unit}`
      : `o limite de ${pt(limit, 0)} ${unit}`;

  const prazo =
    daysToLimit <= 0
      ? `a projeção já passou ${alvo}`
      : daysToLimit < 1
        ? `a projeção cruza ${alvo} em menos de um dia`
        : `a projeção cruza ${alvo} em ${pt(daysToLimit, 0)} dias`;

  return `${onde}, subindo ${pt(perDay, digits)} ${unit} por dia: ${prazo}`;
}

/** As evidências da sugestão: o que o gêmeo já tem, por referência. */
export function suggestionEvidence(
  measure: SuggestionMeasure,
  refs: SuggestionRefs,
): NoteEvidence[] {
  const evidence: NoteEvidence[] = [
    {
      kind: 'tendência',
      ref: measure === 'vibração' ? refs.vibrationTag : refs.temperatureTag,
      label: 'janela da tendência com a projeção',
    },
  ];

  if (refs.alarm) {
    evidence.push({
      kind: 'alarme',
      ref: refs.alarm.id,
      label: `alarme ${refs.alarm.limit} de ${refs.alarm.tag}`,
    });
  }

  if (refs.round) {
    evidence.push({
      kind: 'ronda',
      ref: refs.round.id,
      label:
        refs.round.fieldTempC === null
          ? 'último ponto da ronda'
          : `ronda: ${pt(refs.round.fieldTempC, 1)} °C no pirômetro`,
    });
  }

  return evidence;
}

export interface SuggestionInput {
  readonly assetTag: AssetTag;
  /** A série agregada do mancal, na ordem do tempo. */
  readonly buckets: readonly VibrationBucket[];
  readonly limits: IsoLimits;
  /** Limite de temperatura do mancal, do catálogo. */
  readonly tempLimitC: number;
  /** Instante da conta, em ISO 8601. */
  readonly at: string;
  readonly refs: SuggestionRefs;
  readonly rule?: SuggestionRule;
}

/**
 * A regra: a tendência de um mancal vira sugestão, ou não vira nada.
 *
 * Duas projeções entram na disputa — a vibração contra a fronteira C→D e a
 * temperatura contra o limite do catálogo — e vale **a que cruza primeiro**.
 * Sem tendência significativa em nenhuma das duas, ou com as duas cruzando
 * depois do horizonte, a resposta é `null`: a regra prefere não dizer nada a
 * dizer algo que ninguém pode usar.
 */
export function suggestFromTrend(input: SuggestionInput): NoteSuggestion | null {
  const { assetTag, buckets, limits, tempLimitC, at, refs } = input;
  const rule = input.rule ?? SUGGESTION_RULE;

  const first = buckets[0];
  const last = buckets.at(-1);
  if (!first || !last) return null;

  const chosen = [
    {
      measure: 'vibração' as const,
      life: estimateRemainingLife(buckets, limits),
      limit: limits.cToD,
      level: last.rmsAvgMmS,
    },
    {
      measure: 'temperatura' as const,
      life: temperatureLife(buckets, tempLimitC),
      limit: tempLimitC,
      level: last.tempAvgC,
    },
  ]
    .filter(({ life }) => life.daysToZoneD !== null && life.daysToZoneD <= rule.horizonDays)
    .sort((a, b) => (a.life.daysToZoneD ?? 0) - (b.life.daysToZoneD ?? 0))[0];

  if (!chosen) return null;

  const daysToLimit = chosen.life.daysToZoneD ?? 0;
  const zone = classifyIsoZone(last.rmsAvgMmS, limits);

  return {
    id: suggestionId(assetTag, first.bucketStart),
    assetTag,
    trendStart: first.bucketStart,
    measure: chosen.measure,
    symptom: suggestionSymptom({
      measure: chosen.measure,
      level: chosen.level,
      perDay: chosen.life.trendMmSPerDay,
      limit: chosen.limit,
      daysToLimit,
      zone: chosen.measure === 'vibração' ? zone : null,
    }),
    priority: priorityForDays(daysToLimit),
    /**
     * Exige parada quando o mancal já está em C ou D.
     *
     * **Suposição.** Em C ou D a intervenção é troca de mancal, e trocar o
     * mancal de um cilindro secador pede máquina parada. Abaixo disso, o que a
     * tendência pede é inspeção e lubrificação no ponto, que a ronda faz com a
     * máquina rodando.
     */
    requiresShutdown: zone === 'C' || zone === 'D',
    daysToLimit,
    perDay: chosen.life.trendMmSPerDay,
    level: chosen.level,
    limit: chosen.limit,
    samples: chosen.life.samples,
    evidence: suggestionEvidence(chosen.measure, refs),
    at,
    status: 'sugerida',
    decidedAt: null,
    decidedBy: null,
    reason: null,
    noteNumber: null,
  };
}

/**
 * Se uma sugestão dispensada volta.
 *
 * Volta quando a medição piorou além do degrau, ou quando quem projeta cruzar o
 * limite agora é a **outra** medição — nesse caso a pergunta não é a mesma que
 * foi dispensada.
 */
export function reopensAfterDismissal(
  dismissed: Pick<NoteSuggestion, 'measure' | 'level'>,
  fresh: Pick<NoteSuggestion, 'measure' | 'level'>,
  rule: SuggestionRule = SUGGESTION_RULE,
): boolean {
  if (dismissed.measure !== fresh.measure) return true;
  return fresh.level - dismissed.level > rule.step[fresh.measure];
}

/** O que alguém pode mudar antes de confirmar. */
export interface SuggestionEdits {
  readonly symptom?: string;
  readonly priority?: NotePriority;
  readonly requiresShutdown?: boolean;
}

/**
 * A nota que sai de uma sugestão confirmada.
 *
 * Origem `tendência` e `originRef` apontando para a sugestão: é o que faz a
 * nota poder dizer de onde veio e levar de volta à conta que a propôs —
 * `noteOriginIsConsistent` cobra exatamente isso de toda origem que não é a
 * operação.
 */
export function noteFromSuggestion(
  suggestion: NoteSuggestion,
  number: string,
  at: string,
  edits: SuggestionEdits = {},
): MaintenanceNote {
  return {
    number,
    assetTag: suggestion.assetTag,
    symptom: edits.symptom ?? suggestion.symptom,
    priority: edits.priority ?? suggestion.priority,
    origin: 'tendência',
    originRef: suggestion.id,
    status: 'aberta',
    requiresShutdown: edits.requiresShutdown ?? suggestion.requiresShutdown,
    evidence: suggestion.evidence,
    createdAt: at,
    closedAt: null,
  };
}

export const NOTE_SUGGESTION_PROVENANCE: ProvenanceNote = {
  source: 'assumed',
  note:
    'A regressão e o critério de significância são os do `rul.ts`. O horizonte de 30 dias, os ' +
    'cortes de prioridade por prazo, o degrau que faz uma sugestão dispensada voltar e a regra ' +
    'de exigir parada em zona C ou D são suposição nossa.',
};
