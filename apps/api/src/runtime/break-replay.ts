import {
  BASELINE_WINDOW_S,
  BREAK_WATCH_TAGS,
  diagnoseBreak,
  historianPoint,
  originOf,
  PRECURSOR_WINDOW_S,
  processVariable,
  type Alarm,
  type BreakPrecursor,
  type BreakReplay,
  type GradeChange,
  type SetpointChange,
  type TagWindow,
  type WebBreak,
} from '@mp1/shared';

import type { Database } from '../db';

/**
 * O replay de uma quebra, montado do arquivo.
 *
 * A conta é do `@mp1/shared` e não sabe de banco nenhum; o que mora aqui é a
 * leitura: duas janelas por tag — a hora anterior, que é a linha de base, e os
 * 10 min da LISTA-BASE, que é onde a resposta está — e os eventos do período.
 *
 * ## Por que a mesma conta serve a colheita e a tela
 *
 * A entidade `WebBreak` guarda os precursores, colhidos na retomada; a tela de
 * replay refaz a investigação com as séries na mão. Se as duas usassem réguas
 * diferentes, a lista da entidade e a lista da tela discordariam sobre qual tag
 * se mexeu primeiro — e a pergunta "quantas das últimas quebras começaram
 * assim" não teria resposta estável. É uma conta só, chamada de dois lugares.
 */

/** Quantas amostras por tag a tela recebe, no máximo. */
const MAX_SAMPLES = 400;

/** Quantas quebras anteriores entram na comparação de padrão. */
const PATTERN_DEPTH = 12;

export interface ReplaySeries {
  readonly tag: string;
  readonly name: string;
  readonly unit: string;
  /** A média da hora anterior, que o gráfico desenha como linha de base. */
  readonly baseline: number | null;
  readonly samples: readonly { readonly t: string; readonly v: number }[];
}

export interface BreakPattern {
  /** Quebras anteriores na mesma seção da máquina. */
  readonly sameSection: number;
  /** Quantas delas começaram pela mesma variável. */
  readonly sameFirst: number;
  /** A variável em questão; `null` quando esta quebra não tem origem. */
  readonly tag: string | null;
}

export interface ReplayView {
  readonly webBreak: WebBreak;
  readonly replay: BreakReplay;
  readonly series: readonly ReplaySeries[];
  readonly events: {
    readonly alarms: readonly Alarm[];
    readonly setpointChanges: readonly SetpointChange[];
    readonly gradeChanges: readonly GradeChange[];
  };
  readonly pattern: BreakPattern;
}

/** As duas janelas de cada tag observada, lidas do arquivo. */
async function windowsOf(db: Database, breakAt: Date): Promise<TagWindow[]> {
  const janelaInício = new Date(breakAt.getTime() - PRECURSOR_WINDOW_S * 1000);
  const baseInício = new Date(janelaInício.getTime() - BASELINE_WINDOW_S * 1000);

  const janelas = await Promise.all(
    BREAK_WATCH_TAGS.map(async (tag): Promise<TagWindow | null> => {
      const point = historianPoint(tag);
      if (!point) return null;

      const [baseline, window] = await Promise.all([
        db.archivedSamples({ pointId: point.pointId, from: baseInício, to: janelaInício }),
        db.archivedSamples({ pointId: point.pointId, from: janelaInício, to: breakAt }),
      ]);

      /**
       * O valor em vigor no começo de cada janela entra na frente.
       *
       * O historiador só arquiva quando o valor muda: uma tag parada nos 10 min
       * anteriores não tem **nenhuma** amostra na janela, e sem isto ela
       * apareceria como "sem série" em vez de "não se mexeu" — que é a
       * informação que a investigação quer.
       */
      const antesDaBase = await db.valueAt(point.pointId, baseInício);
      const antesDaJanela = await db.valueAt(point.pointId, janelaInício);

      return {
        tag,
        baseline: [
          ...(antesDaBase ? [{ t: baseInício.getTime(), v: antesDaBase.v }] : []),
          ...baseline.map((sample) => ({ t: sample.t, v: sample.v })),
        ],
        window: [
          ...(antesDaJanela ? [{ t: janelaInício.getTime(), v: antesDaJanela.v }] : []),
          ...window.map((sample) => ({ t: sample.t, v: sample.v })),
        ],
      };
    }),
  );

  return janelas.filter((item): item is TagWindow => item !== null);
}

/**
 * Quantas das últimas quebras da mesma seção começaram pela mesma variável.
 *
 * É o "padrão" da fase, e ele é deliberadamente modesto: conta coincidências,
 * não afirma repetição de causa. Três quebras na pós-secagem que começaram pela
 * mesma pressão diferencial é uma informação; dizer que a quarta vai começar
 * assim seria outra coisa.
 */
async function patternOf(
  db: Database,
  webBreak: WebBreak,
  first: string | null,
): Promise<BreakPattern> {
  const anteriores = (await db.listWebBreaks({ limit: PATTERN_DEPTH + 1 })).filter(
    (item) => item.id !== webBreak.id && item.section === webBreak.section,
  );

  const mesmaOrigem = anteriores.filter(
    (item) =>
      first !== null && originOf(item.precursors.map((precursor) => precursor.tag)) === first,
  );

  return { sameSection: anteriores.length, sameFirst: mesmaOrigem.length, tag: first };
}

export async function replayOf(db: Database, webBreak: WebBreak): Promise<ReplayView> {
  const breakAt = new Date(webBreak.startedAt);
  const janelas = await windowsOf(db, breakAt);
  const replay = diagnoseBreak({ breakAt: breakAt.getTime(), series: janelas });

  const janelaInício = new Date(breakAt.getTime() - PRECURSOR_WINDOW_S * 1000);
  const fim = webBreak.endedAt ? new Date(webBreak.endedAt) : breakAt;

  const [alarms, setpoints, gradeChanges] = await Promise.all([
    db.listAlarms({ from: janelaInício, to: fim, limit: 50 }),
    // a consulta de setpoint não tem janela: filtra-se aqui, no período da quebra
    db.listSetpointChanges({ limit: 200 }),
    db.listGradeChanges({ from: janelaInício, to: fim, limit: 50 }),
  ]);

  const noPeríodo = (iso: string): boolean => {
    const t = Date.parse(iso);
    return t >= janelaInício.getTime() && t <= fim.getTime();
  };
  const setpointChanges = setpoints.filter((change) => noPeríodo(change.changedAt));

  const porTag = new Map(replay.deviations.map((item) => [item.tag, item]));

  const series: ReplaySeries[] = janelas.map((janela) => {
    const variable = processVariable(janela.tag);
    const passo = Math.max(1, Math.ceil(janela.window.length / MAX_SAMPLES));
    return {
      tag: janela.tag,
      name: variable?.name ?? janela.tag,
      unit: variable?.unit ?? '',
      baseline: porTag.get(janela.tag)?.baseline ?? médiaDe(janela),
      samples: janela.window
        .filter((_, índice) => índice % passo === 0)
        .map((sample) => ({ t: new Date(sample.t).toISOString(), v: Number(sample.v.toFixed(4)) })),
    };
  });

  return {
    webBreak,
    replay,
    series,
    events: { alarms, setpointChanges, gradeChanges },
    pattern: await patternOf(db, webBreak, replay.first?.tag ?? null),
  };
}

/** A média da base, para a tag que não desviou e por isso não está na lista. */
function médiaDe(janela: TagWindow): number | null {
  if (janela.baseline.length === 0) return null;
  const total = janela.baseline.reduce((soma, item) => soma + item.v, 0);
  return Number((total / janela.baseline.length).toFixed(4));
}

/**
 * Os precursores da entidade, que são o mesmo diagnóstico.
 *
 * A retomada chama isto; a tela de replay chama `replayOf`. As duas passam pela
 * mesma `diagnoseBreak`, então a lista que fica gravada na quebra e a lista que
 * a tela mostra são a mesma lista.
 */
export async function precursorsOf(db: Database, breakAt: Date): Promise<BreakPrecursor[]> {
  const janelas = await windowsOf(db, breakAt);
  const replay = diagnoseBreak({ breakAt: breakAt.getTime(), series: janelas });

  return replay.deviations.map((desvio) => ({
    tag: desvio.tag,
    description:
      `${desvio.direction} ${Math.abs(desvio.size).toFixed(2)} ${desvio.unit} ` +
      `${String(Math.round(desvio.leadTimeS / 60))} min antes da quebra`,
    leadTimeS: desvio.leadTimeS,
    valueBefore: desvio.baseline,
    valueAtSignal: Number((desvio.baseline + desvio.size).toFixed(3)),
  }));
}
