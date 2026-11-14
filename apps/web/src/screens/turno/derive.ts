import type { Alarm, GradeChange, SetpointChange, WebBreak } from '@mp1/shared';
import { processVariable } from '@mp1/shared';

import type { ReelHold } from '../../api/fixtures';
import { tagScale } from '../../ui/tagScale';
import type { ReelView, ShiftView } from '../../api/process';
import { valueAt, type Point } from '../../ui/chart/series';
import type { EventKind } from '../../ui/EventMarker';

/**
 * As contas da tela de Turno, separadas do desenho para poderem ser testadas.
 *
 * Tudo aqui sai de resposta real da API, menos o que vem marcado `illustrative`
 * — as bobinas paradas e o alarme da cola, que são o cenário fixo.
 */

export { seriesOf, valueAt, type Point } from '../../ui/chart/series';

export const SHIFT_MS = 8 * 3_600_000;
export const PRODUCTION_TAG = 'XI-0001';
export const SPEED_TAG = 'SIC-1104';

/** Meta de refugo do placar, em %. Meta do design, não medição. */
export const SCRAP_TARGET_PCT = 5;
/** Faixa de referência da eficiência de tempo, em %. Meta do design, não medição. */
export const EFFICIENCY_BAND: readonly [number, number] = [91, 95];

export interface Window {
  readonly from: number;
  readonly to: number;
}

/** A janela do turno: do início ao fim previsto, que é o início + 8 h. */
export function shiftWindow(shift: ShiftView): Window {
  const from = Date.parse(shift.startedAt);
  return { from, to: shift.endedAt ? Date.parse(shift.endedAt) : from + SHIFT_MS };
}

/**
 * Integra uma vazão em t/h no tempo: a produção acumulada em toneladas.
 *
 * Trapézios entre os pontos da série, a partir de `from` e até `to`. A curva
 * sai com um ponto por amostra, e por isso anda durante a bobina em curso — não
 * espera a bobina fechar para subir, como a soma dos pesos faria.
 */
export function accumulate(series: readonly Point[], from: number, to: number): Point[] {
  const inside = series.filter((p) => p.t > from && p.t < to);
  const start = valueAt(series, from);
  const end = valueAt(series, to);
  const points: Point[] = [
    ...(start === null ? [] : [{ t: from, v: start }]),
    ...inside,
    ...(end === null ? [] : [{ t: to, v: end }]),
  ];

  const out: Point[] = [];
  let total = 0;
  points.forEach((p, i) => {
    const prev = points[i - 1];
    if (prev) total += ((prev.v + p.v) / 2) * ((p.t - prev.t) / 3_600_000);
    out.push({ t: p.t, v: total });
  });
  return out;
}

export interface Production {
  /** Acumulado do início do turno até a leitura, em t. */
  readonly accumulated: Point[];
  readonly nowT: number;
  /** Meta do turno: o alvo de XI-0001 vezes as 8 h. */
  readonly goalT: number;
  /** Onde a meta estaria agora, se o ritmo fosse o do alvo. */
  readonly paceT: number;
  /** O fim do turno no ritmo da última hora. */
  readonly projectedT: number;
}

export function production(series: readonly Point[], window: Window, now: number): Production {
  const target = processVariable(PRODUCTION_TAG)?.target ?? 0;
  const until = Math.min(now, window.to);
  const accumulated = accumulate(series, window.from, until);
  const nowT = accumulated.at(-1)?.v ?? 0;

  const hourAgo = Math.max(window.from, until - 3_600_000);
  const lastHour = accumulate(series, hourAgo, until).at(-1)?.v ?? 0;
  const rate = until > hourAgo ? lastHour / ((until - hourAgo) / 3_600_000) : target;

  return {
    accumulated,
    nowT,
    goalT: target * ((window.to - window.from) / 3_600_000),
    paceT: target * ((until - window.from) / 3_600_000),
    projectedT: nowT + rate * Math.max(0, (window.to - until) / 3_600_000),
  };
}

/** Duração de uma quebra em ms; quebra em andamento conta até `now`. */
export function breakMs(item: WebBreak, now: number): number {
  return Math.max(0, (item.endedAt ? Date.parse(item.endedAt) : now) - Date.parse(item.startedAt));
}

export interface Scrap {
  readonly pct: number;
  readonly segregatedT: number;
  readonly breakT: number;
  readonly grossT: number;
}

/**
 * Refugo = (bobinas segregadas + papel ao pulper nas quebras) / produção bruta.
 *
 * O papel das quebras é a duração de cada uma vezes a produção instantânea logo
 * antes de ela começar: é o que a máquina estava fazendo e foi para o pulper. A
 * produção bruta é o acumulado de XI-0001 mais esse papel, porque durante a
 * quebra a produção instantânea cai e o integrado não o conta.
 */
export function scrap(
  reels: readonly ReelView[],
  breaks: readonly WebBreak[],
  series: readonly Point[],
  producedT: number,
  now: number,
): Scrap {
  const segregatedT = reels
    .filter((reel) => reel.disposition === 'segregada')
    .reduce((total, reel) => total + (reel.weightT ?? 0), 0);
  const breakT = breaks.reduce((total, item) => {
    const before = valueAt(series, Date.parse(item.startedAt) - 60_000) ?? 0;
    return total + before * (breakMs(item, now) / 3_600_000);
  }, 0);
  const grossT = producedT + breakT;
  return {
    pct: grossT > 0 ? ((segregatedT + breakT) / grossT) * 100 : 0,
    segregatedT,
    breakT,
    grossT,
  };
}

/* ------------------------------------------------------------------ eventos */

export interface TimelineEvent {
  readonly id: string;
  readonly kind: EventKind;
  readonly t: number;
  /** Texto curto ao lado do símbolo. */
  readonly short: string;
  /** Dado fixo do cenário, não leitura da API. */
  readonly illustrative: boolean;
  readonly title: string;
  readonly meta: string;
  /** A TAG que o detalhe mostra numa barra de faixa, quando há. */
  readonly tag: string | null;
  readonly value: number | null;
  readonly reel: number | null;
  /** Fim do evento, para as quebras: a faixa vertical vai do início ao fim. */
  readonly end: number | null;
}

const LIMIT_TEXT: Readonly<Record<string, string>> = {
  LL: 'abaixo de LL',
  L: 'abaixo de L',
  H: 'acima de H',
  HH: 'acima de HH',
};

/** O nome de um alarme como o operador o lê: variável e limite. */
export function alarmText(alarm: Alarm): string {
  const name = tagScale(alarm.tag)?.name ?? alarm.tag;
  return `${name} · ${LIMIT_TEXT[alarm.limit] ?? alarm.limit}`;
}

export interface EventSources {
  readonly window: Window;
  readonly now: number;
  readonly breaks: readonly WebBreak[];
  readonly grades: readonly GradeChange[];
  readonly setpoints: readonly SetpointChange[];
  readonly alarms: readonly Alarm[];
  readonly fixedAlarms: readonly Alarm[];
  readonly holds: readonly ReelHold[];
}

const minutes = (ms: number) => `${String(Math.round(ms / 60_000))} min`;

/**
 * Os eventos da janela, de todas as fontes, em ordem de tempo.
 *
 * Um alarme entra uma vez por TAG e instante — o H e o HH que a mesma leitura
 * dispara são um evento só para quem olha a linha do tempo.
 */
export function timelineEvents(src: EventSources): TimelineEvent[] {
  const inside = (t: number) => t >= src.window.from && t <= Math.min(src.now, src.window.to);
  const out: TimelineEvent[] = [];

  for (const item of src.breaks) {
    const t = Date.parse(item.startedAt);
    if (!inside(t)) continue;
    const ms = breakMs(item, src.now);
    out.push({
      id: `quebra:${item.id}`,
      kind: 'quebra',
      t,
      short: `Quebra ${minutes(ms)}`,
      illustrative: false,
      title: `Quebra de folha · ${item.section}`,
      meta: `${item.endedAt ? minutes(ms) : 'em andamento'} · ${item.probableCause}`,
      tag: null,
      value: null,
      reel: null,
      end: item.endedAt ? Date.parse(item.endedAt) : src.now,
    });
  }

  for (const item of src.grades) {
    const t = Date.parse(item.startedAt);
    if (!inside(t)) continue;
    out.push({
      id: `gramatura:${item.id}`,
      kind: 'gramatura',
      t,
      short: `${String(item.fromGsm)}→${String(item.toGsm)}`,
      illustrative: false,
      title: `Troca de gramatura ${String(item.fromGsm)} → ${String(item.toGsm)} g/m²`,
      meta:
        item.affectedReels.length > 0
          ? `bobinas afetadas: ${item.affectedReels.join(', ')}`
          : 'nenhuma bobina afetada',
      tag: null,
      value: null,
      reel: item.affectedReels[0] ?? null,
      end: null,
    });
  }

  for (const item of src.setpoints) {
    const t = Date.parse(item.changedAt);
    if (!inside(t)) continue;
    out.push({
      id: `setpoint:${item.id}`,
      kind: 'setpoint',
      t,
      short: `${item.tag} SP`,
      illustrative: false,
      title: `${item.tag} · SP ${fmt(item.previousValue)} → ${fmt(item.newValue)} ${item.unit}`,
      meta: `${item.changedBy} · ${item.reason}`,
      tag: item.tag,
      value: item.newValue,
      reel: null,
      end: null,
    });
  }

  const seen = new Set<string>();
  const alarms = [
    ...src.alarms.map((alarm) => ({ alarm, fixed: false })),
    ...src.fixedAlarms.map((alarm) => ({ alarm, fixed: true })),
  ];
  for (const { alarm, fixed } of alarms) {
    const t = Date.parse(alarm.raisedAt);
    const key = `${alarm.tag}@${String(Math.round(t / 60_000))}`;
    if (!inside(t) || seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: `alarme:${alarm.id}`,
      kind: 'alarme',
      t,
      short: alarm.tag,
      illustrative: fixed,
      title: alarmText(alarm),
      meta: `pior valor ${fmt(alarm.peakValue)} · limite ${fmt(alarm.threshold)} · ${alarm.state}`,
      tag: alarm.tag,
      value: alarm.peakValue,
      reel: null,
      end: null,
    });
  }

  for (const hold of src.holds) {
    const t = Date.parse(hold.since);
    if (!inside(t)) continue;
    const held = hold.status === 'retida';
    out.push({
      id: `bobina:${String(hold.reelNumber)}`,
      kind: 'bobina',
      t,
      short: held ? `${String(hold.reelNumber)} retida` : `${String(hold.reelNumber)} Cobb`,
      illustrative: true,
      title: held
        ? `Bobina ${String(hold.reelNumber)} retida para reteste`
        : `Bobina ${String(hold.reelNumber)} em avaliação`,
      meta: hold.reason,
      tag: hold.tag,
      value: hold.value,
      reel: hold.reelNumber,
      end: null,
    });
  }

  return out.sort((a, b) => a.t - b.t);
}

/** Quantos eventos de cada tipo, para a legenda. */
export function eventCounts(events: readonly TimelineEvent[]): Record<EventKind, number> {
  const counts: Record<EventKind, number> = {
    quebra: 0,
    gramatura: 0,
    alarme: 0,
    setpoint: 0,
    bobina: 0,
  };
  for (const event of events) counts[event.kind] += 1;
  return counts;
}

/**
 * A linha de cada marcador, para os rótulos não se sobreporem.
 *
 * Cada evento vai para a primeira linha em que o rótulo cabe depois do anterior
 * daquela linha. `width` é a largura estimada do rótulo em px.
 */
export function lanes(
  items: readonly { readonly x: number; readonly width: number }[],
  count = 3,
): number[] {
  const ends: number[] = Array.from({ length: count }, () => -Infinity);
  return items.map(({ x, width }) => {
    let lane = ends.findIndex((end) => x >= end + 8);
    if (lane === -1) lane = ends.indexOf(Math.min(...ends));
    ends[lane] = x + width;
    return lane;
  });
}

/** Número com vírgula decimal, sem casas sobrando. */
function fmt(value: number): string {
  const digits = Math.abs(value) >= 100 ? 0 : Math.abs(value) >= 10 ? 1 : 2;
  return value.toLocaleString('pt-BR', { maximumFractionDigits: digits });
}
