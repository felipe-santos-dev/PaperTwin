import type { ProcessVariable } from '@mp1/shared';

import type { PlotBucket, TagValue, TrendQuery } from '../process';
import { centered } from './random';
import type { FixedProcess, FixedTrend } from './types';

/**
 * O que ainda é dado fixo no preparo.
 *
 * Eram sete variáveis; desde a Fase 3 são **uma**. O grau Schopper, a carga e a
 * posição do refinador, a cola AKD, o amido e o nível do tanque de mistura
 * entraram no catálogo e passaram a ser simulados — a cola, inclusive, com
 * relação FOPDT até o Cobb do laboratório.
 *
 * Ficou o branqueador óptico, que não tem no modelo nada que o mova nem nada
 * que ele mova: entrou como ilustrativa, de prioridade 2, e continua com o
 * selo.
 */
const base = {
  area: 'preparo',
  compression: { excDev: null, compDev: null },
  source: 'assumed',
  confidence: 'baixa',
  cylinder: null,
  steamGroup: null,
  level: 'autônoma',
} as const;

const NOTE = 'Dado fixo da demonstração: a TAG não está no catálogo da pesquisa.';

export const FIXED_VARIABLES: readonly ProcessVariable[] = [
  {
    ...base,
    tag: 'FIC-110',
    name: 'Branqueador OBA',
    group: 'químicos',
    unit: 'kg/t',
    min: 0,
    max: 6,
    target: 3.2,
    limits: { ll: 1, l: 1.8, h: 4.6, hh: 5.2 },
    controlled: true,
    mv: 'FV-110',
    note: NOTE,
  },
];

/** O setpoint de cada variável controlada; as outras não têm. */
function setpointOf(variable: ProcessVariable): number | null {
  return variable.controlled ? variable.target : null;
}

/** O valor de uma variável fixa num instante. */
function valueAt(variable: ProcessVariable, t: number): number {
  const center = variable.target ?? (variable.min + variable.max) / 2;
  const span = variable.max - variable.min;
  // oscilação lenta e fixa, a 0,6 % da escala: viva, sem cruzar nenhum limite
  const wobble = Math.sin(t / 1_700_000 + variable.tag.length) * span * 0.004;
  const grain = centered(`${variable.tag}:${String(Math.floor(t / 300_000))}`) * span * 0.002;

  return center + wobble + grain;
}

/**
 * Valores e variáveis fixas no instante `now`.
 *
 * Sem alarme: o único alarme que este arquivo produzia era o da cola, e ele
 * agora é do motor de alarmes, como qualquer outro. A lista continua existindo
 * no formato porque a rota tem essa forma, e porque uma fixa pode voltar a
 * precisar dela.
 */
export function fixedProcess(now: string): FixedProcess {
  const t = Date.parse(now);

  const values: TagValue[] = FIXED_VARIABLES.map((variable) => ({
    tag: variable.tag,
    value: round(valueAt(variable, t)),
    unit: variable.unit,
    ts: now,
    setpoint: setpointOf(variable),
  }));

  return { illustrative: true, ts: now, variables: FIXED_VARIABLES, values, alarms: [] };
}

/** A tendência de uma variável fixa, no mesmo formato da rota de tendência. */
export function fixedTrend(tag: string, now: string, query: TrendQuery = {}): FixedTrend | null {
  const variable = FIXED_VARIABLES.find((item) => item.tag === tag);
  if (!variable) return null;

  const to = query.to?.getTime() ?? Date.parse(now);
  const from = query.from?.getTime() ?? to - 4 * 3_600_000;
  const count = Math.max(2, query.buckets ?? 240);
  const step = (to - from) / count;

  const buckets: PlotBucket[] = [];
  for (let i = 0; i < count; i += 1) {
    const start = from + i * step;
    const a = valueAt(variable, start);
    const b = valueAt(variable, start + step);
    buckets.push({
      bucketStart: new Date(start).toISOString(),
      samples: 1,
      min: round(Math.min(a, b)),
      max: round(Math.max(a, b)),
      first: round(a),
      last: round(b),
    });
  }

  return {
    illustrative: true,
    tag,
    unit: variable.unit,
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    bucketS: step / 1000,
    buckets,
    before: null,
    after: null,
    timeWeightedAverage: null,
    limits: variable.limits,
    target: variable.target,
  };
}

const round = (value: number) => Math.round(value * 1000) / 1000;
