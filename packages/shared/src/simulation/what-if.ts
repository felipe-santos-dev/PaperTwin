import { processVariable } from '../process/catalog';
import { derivedVariable, DERIVED_IN_ORDER } from '../process/derived';
import { relationsForInput } from '../process/relations';
import type { AlarmLimits } from '../process/types';
import { TICK_MS } from './clock';
import {
  processEngine,
  type EngineState,
  type LoopMode,
  type ProcessEngine,
} from './process-engine';

/**
 * O "e se": a resposta prevista antes de aplicar.
 *
 * Alguém propõe mover uma ou mais malhas e vê, em cima do estado de agora, o
 * que a máquina faria. Não é um gráfico novo com os mesmos números: é o mesmo
 * motor, a partir do mesmo estado, rodado duas vezes — uma sem a mudança e
 * outra com ela. A diferença entre as duas curvas é a mudança, e nada mais.
 *
 * ## Três coisas que ele não faz, e que são o ponto
 *
 * - **Não grava.** Nenhuma amostra vai para o historiador, nenhum alarme é
 *   levantado, nenhuma entidade é colhida. A previsão é um cálculo, não um
 *   acontecimento.
 * - **Não toca no processo.** Os dois motores saem de uma **cópia** do estado;
 *   o motor que serve a API continua onde estava. O teste `cópia do estado não
 *   vaza` existe só para isso.
 * - **Não treme.** O ruído de instrumento fica desligado nas duas corridas. Com
 *   ruído, a diferença entre as curvas teria um pedaço que não é da mudança.
 *
 * ## Por que duas trajetórias, e não uma conta analítica
 *
 * Porque a rede tem cascata, saturação de válvula e várias relações chegando na
 * mesma saída. A resposta analítica de uma FOPDT é fácil; a de quatro relações
 * somadas, com um PI no meio e a válvula no fim de curso, não é — e seria uma
 * segunda implementação da física, que divergiria da primeira.
 */

/** Teto de horizonte: meia hora de previsão. */
export const WHAT_IF_MAX_HORIZON_S = 1800;

/** Quantos pontos cada série traz, no máximo. */
export const WHAT_IF_MAX_POINTS = 240;

export interface WhatIfChange {
  readonly tag: string;
  readonly value: number;
}

export interface WhatIfOptions {
  readonly changes: readonly WhatIfChange[];
  readonly horizonS: number;
  readonly mode: LoopMode;
  readonly seed?: number;
  readonly points?: number;
}

export interface WhatIfVariable {
  readonly tag: string;
  readonly name: string;
  readonly unit: string;
  /** A trajetória sem a mudança. */
  readonly base: readonly number[];
  /** A trajetória com a mudança. */
  readonly proposed: readonly number[];
  /** Quanto a variável terminou acima ou abaixo da linha de base. */
  readonly finalDelta: number;
  /**
   * O maior desvio em relação à linha de base, com sinal, e quando ele foi.
   *
   * Em automático o desvio final costuma ser quase zero — a malha traz a
   * variável de volta —, e só o pico conta o que aconteceu no meio. Sem ele, a
   * tela diria "não muda nada" sobre uma perturbação que levou a umidade para
   * fora da faixa por três minutos.
   */
  readonly peakDelta: number;
  readonly peakAtS: number | null;
  /** Quando a resposta começou a aparecer; `null` se não apareceu. */
  readonly deadTimeS: number | null;
  /** Quando chegou a 63 % da variação final; `null` se não chegou. */
  readonly t63S: number | null;
  /** Quando a previsão cruza cada limite de alarme, se cruzar. */
  readonly crossings: readonly WhatIfCrossing[];
  /** A válvula encostou no fim de curso em algum momento. */
  readonly saturated: boolean;
  readonly limits: AlarmLimits;
  readonly target: number | null;
  /** Se esta é uma das variáveis que a pessoa mexeu. */
  readonly manipulated: boolean;
}

export interface WhatIfCrossing {
  readonly limit: 'LL' | 'L' | 'H' | 'HH';
  readonly atS: number;
  readonly value: number;
}

export interface WhatIfResult {
  readonly fromTick: number;
  readonly horizonS: number;
  /** Segundos entre dois pontos das séries. */
  readonly stepS: number;
  readonly mode: LoopMode;
  readonly changes: readonly WhatIfChange[];
  readonly variables: readonly WhatIfVariable[];
}

/**
 * Quem a mudança alcança, pelo grafo de relações.
 *
 * Começa nas tags mexidas e anda pelas relações — a saída de uma é a entrada da
 * próxima — e depois pelas calculadas, que leem essas saídas. É o mesmo grafo
 * que o motor usa para integrar, então a lista não pode discordar do que
 * realmente se move.
 */
export function affectedBy(tags: readonly string[]): string[] {
  const alcançadas = new Set(tags);
  const fila = [...tags];

  while (fila.length > 0) {
    const tag = fila.shift();
    if (tag === undefined) break;
    for (const relation of relationsForInput(tag)) {
      if (alcançadas.has(relation.output)) continue;
      alcançadas.add(relation.output);
      fila.push(relation.output);
    }
  }

  // as calculadas que leem alguma das alcançadas entram junto
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (const derived of DERIVED_IN_ORDER) {
      if (alcançadas.has(derived.tag)) continue;
      if (!derived.inputs.some((input) => alcançadas.has(input))) continue;
      alcançadas.add(derived.tag);
      mudou = true;
    }
  }

  // só o que a interface sabe desenhar: TAG do catálogo, não ensaio de bancada
  return [...alcançadas].filter((tag) => processVariable(tag) !== null);
}

/** Aplica as mudanças a um motor, do jeito que o modo das malhas pede. */
function apply(engine: ProcessEngine, changes: readonly WhatIfChange[], mode: LoopMode): void {
  for (const change of changes) {
    if (mode === 'manual') engine.force(change.tag, change.value);
    else engine.setSetpoint(change.tag, change.value);
  }
}

/** Roda um motor e colhe a medida das tags pedidas a cada `everyTicks`. */
function trajectory(
  state: EngineState,
  tags: readonly string[],
  options: WhatIfOptions,
  changes: readonly WhatIfChange[],
): { readonly series: Map<string, number[]>; readonly saturated: Set<string> } {
  const engine = processEngine(state.tick, {
    state,
    seed: options.seed ?? state.seed,
    noise: false,
    loops: options.mode,
  });

  apply(engine, changes, options.mode);

  const ticks = Math.round((options.horizonS * 1000) / TICK_MS);
  const points = Math.min(options.points ?? WHAT_IF_MAX_POINTS, WHAT_IF_MAX_POINTS);
  const everyTicks = Math.max(1, Math.round(ticks / points));

  const series = new Map<string, number[]>(tags.map((tag) => [tag, []]));
  const saturated = new Set<string>();

  const colher = (): void => {
    for (const tag of tags) {
      const value = engine.measured(tag);
      if (value !== null) series.get(tag)?.push(value);
      const variable = processVariable(tag);
      const truth = engine.truth(tag);
      if (!variable || truth === null) continue;
      const folga = (variable.max - variable.min) * 1e-6;
      if (truth <= variable.min + folga || truth >= variable.max - folga) saturated.add(tag);
    }
  };

  colher();
  for (let k = 0; k < ticks; k += everyTicks) {
    engine.runTo(Math.min(state.tick + k + everyTicks, state.tick + ticks));
    colher();
  }

  return { series, saturated };
}

/** A cópia profunda do estado: as duas corridas saem do mesmo ponto, intocado. */
function copy(state: EngineState): EngineState {
  return structuredClone(state);
}

export function runWhatIf(state: EngineState, options: WhatIfOptions): WhatIfResult {
  if (options.changes.length === 0) {
    throw new Error('O "e se" precisa de pelo menos uma variável para mexer.');
  }
  if (options.horizonS <= 0 || options.horizonS > WHAT_IF_MAX_HORIZON_S) {
    throw new Error(
      `Horizonte de ${String(options.horizonS)} s fora do teto de ${String(WHAT_IF_MAX_HORIZON_S)} s.`,
    );
  }

  for (const change of options.changes) {
    const variable = processVariable(change.tag);
    if (!variable) throw new Error(`${change.tag} não está no catálogo de processo.`);
    if (change.value < variable.min || change.value > variable.max) {
      throw new Error(
        `${change.tag} = ${String(change.value)} ${variable.unit} está fora da faixa da válvula ` +
          `(${String(variable.min)}–${String(variable.max)}).`,
      );
    }
  }

  const mexidas = options.changes.map((change) => change.tag);
  const tags = affectedBy(mexidas);

  const semMudança = trajectory(copy(state), tags, options, []);
  const comMudança = trajectory(copy(state), tags, options, options.changes);

  const ticks = Math.round((options.horizonS * 1000) / TICK_MS);
  const points = Math.min(options.points ?? WHAT_IF_MAX_POINTS, WHAT_IF_MAX_POINTS);
  const everyTicks = Math.max(1, Math.round(ticks / points));
  const stepS = (everyTicks * TICK_MS) / 1000;

  const variables = tags
    .map((tag) =>
      describe(
        tag,
        semMudança.series.get(tag) ?? [],
        comMudança.series.get(tag) ?? [],
        stepS,
        comMudança.saturated.has(tag),
        mexidas.includes(tag),
      ),
    )
    // quem não se mexeu não interessa: a lista é o que a mudança alcançou.
    // o critério é o pico, e não o fim: em automático a malha devolve a
    // variável ao setpoint, e olhar só o fim esconderia a perturbação inteira
    .filter((variable) => variable.manipulated || Math.abs(variable.peakDelta) > 1e-9)
    .sort((a, b) => Number(b.manipulated) - Number(a.manipulated));

  return {
    fromTick: state.tick,
    horizonS: options.horizonS,
    stepS,
    mode: options.mode,
    changes: options.changes,
    variables,
  };
}

/**
 * As medidas que a tela mostra, tiradas das duas séries.
 *
 * O tempo morto e o t63 saem da **diferença** entre as curvas, e não da curva
 * proposta: numa máquina que já estava se movendo, a curva sozinha mistura o
 * que a mudança fez com o que ia acontecer de todo jeito.
 */
function describe(
  tag: string,
  base: readonly number[],
  proposed: readonly number[],
  stepS: number,
  saturated: boolean,
  manipulated: boolean,
): WhatIfVariable {
  const variable = processVariable(tag);
  const finalDelta = (proposed.at(-1) ?? 0) - (base.at(-1) ?? 0);
  const magnitude = Math.abs(finalDelta);

  let peakDelta = 0;
  let peakAtS: number | null = null;
  for (let i = 0; i < proposed.length; i += 1) {
    const diff = (proposed[i] ?? 0) - (base[i] ?? 0);
    if (Math.abs(diff) > Math.abs(peakDelta)) {
      peakDelta = diff;
      peakAtS = i * stepS;
    }
  }

  /** Quanto da variação final já conta como "começou a responder". */
  const ARRANQUE = 0.02;

  let deadTimeS: number | null = null;
  let t63S: number | null = null;

  if (magnitude > 1e-9) {
    for (let i = 0; i < proposed.length; i += 1) {
      const diff = Math.abs((proposed[i] ?? 0) - (base[i] ?? 0));
      if (deadTimeS === null && diff >= magnitude * ARRANQUE) deadTimeS = i * stepS;
      if (t63S === null && diff >= magnitude * 0.63) {
        t63S = i * stepS;
        break;
      }
    }
  }

  const crossings: WhatIfCrossing[] = [];
  const limits = variable?.limits ?? { ll: null, l: null, h: null, hh: null };
  const níveis: readonly {
    limit: WhatIfCrossing['limit'];
    value: number | null;
    acima: boolean;
  }[] = [
    { limit: 'LL', value: limits.ll, acima: false },
    { limit: 'L', value: limits.l, acima: false },
    { limit: 'H', value: limits.h, acima: true },
    { limit: 'HH', value: limits.hh, acima: true },
  ];

  for (const nível of níveis) {
    if (nível.value === null) continue;
    const fora = (value: number) => (nível.acima ? value > nível.value! : value < nível.value!);
    // já estava fora antes da mudança não é cruzamento: é o estado de agora
    if (fora(proposed[0] ?? 0)) continue;
    const índice = proposed.findIndex((value) => fora(value));
    if (índice > 0) {
      crossings.push({
        limit: nível.limit,
        atS: índice * stepS,
        value: proposed[índice] ?? 0,
      });
    }
  }

  return {
    tag,
    name: variable?.name ?? tag,
    unit: variable?.unit ?? '',
    base,
    proposed,
    finalDelta,
    peakDelta,
    peakAtS,
    deadTimeS,
    t63S,
    crossings,
    saturated,
    limits,
    target: variable?.target ?? null,
    manipulated,
  };
}

/** Se a tag é calculada — a tela mostra isso ao lado do nome. */
export function isDerivedTag(tag: string): boolean {
  return derivedVariable(tag) !== null;
}
