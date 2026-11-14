import type { Alarm, ProcessVariable } from '@mp1/shared';

import type { PlotBucket, ReelView, TagValue, TrendQuery } from '../process';
import { centered } from './random';
import { scenarioOf } from './scenario';
import type { FixedProcess, FixedTrend } from './types';

/**
 * As variáveis do preparo que o catálogo não tem — dado fixo.
 *
 * O desenho da tela de Processo mostra o preparo com doze variáveis; o
 * catálogo da pesquisa tem cinco. As que faltam entram aqui com o formato de
 * uma variável de catálogo, para a tela tratá-las igual às reais e só pôr o
 * selo. Faixas e alvos são **suposição** desta demonstração.
 *
 * A única que se mexe é a `FIC-107`: a cola AKD cai abaixo do SP no instante do
 * cenário e fica lá — é o começo da história que termina na bobina retida.
 */
const base = {
  area: 'preparo',
  compression: { excDev: null, compDev: null },
  source: 'assumed',
  confidence: 'baixa',
  cylinder: null,
  steamGroup: null,
} as const;

const NOTE = 'Dado fixo da demonstração: a TAG não está no catálogo da pesquisa.';

export const FIXED_VARIABLES: readonly ProcessVariable[] = [
  {
    ...base,
    tag: 'AIC-102',
    name: 'Grau Schopper',
    group: 'refino',
    unit: '°SR',
    min: 20,
    max: 36,
    target: 28,
    limits: { ll: 23, l: 25, h: 31, hh: 33 },
    controlled: true,
    mv: 'JIC-101',
    note: NOTE,
  },
  {
    ...base,
    tag: 'JI-111',
    name: 'Carga do refinador',
    group: 'refino',
    unit: 'kW',
    min: 1500,
    max: 2400,
    target: null,
    limits: { ll: 1600, l: 1700, h: 2200, hh: 2300 },
    controlled: false,
    mv: null,
    note: NOTE,
  },
  {
    ...base,
    tag: 'ZIC-112',
    name: 'Posição dos discos',
    group: 'refino',
    unit: 'mm',
    min: 0.2,
    max: 0.6,
    target: null,
    limits: { ll: 0.25, l: 0.3, h: 0.5, hh: 0.55 },
    controlled: false,
    mv: null,
    note: NOTE,
  },
  {
    ...base,
    tag: 'FIC-107',
    name: 'Cola AKD',
    group: 'químicos',
    unit: 'kg/t',
    min: 0,
    max: 2.4,
    target: 1.4,
    limits: { ll: 0.6, l: 1.2, h: 2.0, hh: 2.2 },
    controlled: true,
    mv: 'FV-107',
    note: NOTE,
  },
  {
    ...base,
    tag: 'FIC-108',
    name: 'Amido',
    group: 'químicos',
    unit: 'kg/t',
    min: 4,
    max: 12,
    target: 8,
    limits: { ll: 5, l: 6, h: 10, hh: 11 },
    controlled: true,
    mv: 'FV-108',
    note: NOTE,
  },
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
  {
    ...base,
    tag: 'LIC-103',
    name: 'Nível tanque de mistura',
    group: 'tanques',
    unit: '%',
    min: 0,
    max: 100,
    target: 70,
    limits: { ll: 20, l: 35, h: 85, hh: 92 },
    controlled: true,
    mv: 'FV-103',
    note: NOTE,
  },
];

/** O valor da cola depois da queda: abaixo de L, que é o que dispara o alarme. */
const AKD_LOW = 1.1;

/** O setpoint de cada variável controlada; as outras não têm. */
function setpointOf(variable: ProcessVariable): number | null {
  return variable.controlled ? variable.target : null;
}

/** O valor de uma variável fixa num instante. */
function valueAt(variable: ProcessVariable, t: number, akdSince: number | null): number {
  const center = variable.target ?? (variable.min + variable.max) / 2;
  const span = variable.max - variable.min;
  // oscilação lenta e fixa, a 0,6 % da escala: viva, sem cruzar nenhum limite
  const wobble = Math.sin(t / 1_700_000 + variable.tag.length) * span * 0.004;
  const grain = centered(`${variable.tag}:${String(Math.floor(t / 300_000))}`) * span * 0.002;

  if (variable.tag === 'FIC-107' && akdSince !== null && t >= akdSince) {
    // a queda leva uns dez minutos e depois fica, com o ruído da malha
    const fall = Math.min(1, (t - akdSince) / 600_000);
    return center - (center - AKD_LOW) * fall + grain;
  }
  if (variable.tag === 'JI-111') return 1960 + wobble * 2 + grain;
  if (variable.tag === 'ZIC-112') return 0.38 + grain * 0.2;
  return center + wobble + grain;
}

function akdSinceOf(reels: readonly ReelView[]): number | null {
  const scenario = scenarioOf(reels);
  return scenario ? Date.parse(scenario.akdSince) : null;
}

/** Valores, variáveis e o alarme da cola, no instante `now`. */
export function fixedProcess(reels: readonly ReelView[], now: string): FixedProcess {
  const t = Date.parse(now);
  const akdSince = akdSinceOf(reels);

  const values: TagValue[] = FIXED_VARIABLES.map((variable) => ({
    tag: variable.tag,
    value: round(valueAt(variable, t, akdSince)),
    unit: variable.unit,
    ts: now,
    setpoint: setpointOf(variable),
  }));

  const alarms: Alarm[] =
    akdSince !== null && akdSince <= t
      ? [
          {
            id: 'AL-FIXO-FIC-107-L',
            tag: 'FIC-107',
            limit: 'L',
            threshold: 1.2,
            priority: 'média',
            state: 'ativo',
            raisedAt: new Date(akdSince + 300_000).toISOString(),
            peakValue: AKD_LOW,
            acknowledgedAt: null,
            acknowledgedBy: null,
            clearedAt: null,
            shelvedUntil: null,
            shelvedBy: null,
          },
        ]
      : [];

  return { illustrative: true, ts: now, variables: FIXED_VARIABLES, values, alarms };
}

/** A tendência de uma variável fixa, no mesmo formato da rota de tendência. */
export function fixedTrend(
  reels: readonly ReelView[],
  tag: string,
  now: string,
  query: TrendQuery = {},
): FixedTrend | null {
  const variable = FIXED_VARIABLES.find((item) => item.tag === tag);
  if (!variable) return null;

  const to = query.to?.getTime() ?? Date.parse(now);
  const from = query.from?.getTime() ?? to - 4 * 3_600_000;
  const count = Math.max(2, query.buckets ?? 240);
  const step = (to - from) / count;
  const akdSince = akdSinceOf(reels);

  const buckets: PlotBucket[] = [];
  for (let i = 0; i < count; i += 1) {
    const start = from + i * step;
    const a = valueAt(variable, start, akdSince);
    const b = valueAt(variable, start + step, akdSince);
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
