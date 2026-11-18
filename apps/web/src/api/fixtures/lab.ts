import type { ReelView } from '../process';
import { centered } from './random';
import { closedReels, scenarioOf } from './scenario';
import type { LabResult, LabSpec, ReelHold } from './types';

/**
 * Resultados de laboratório por bobina — dado fixo, ancorado nas bobinas reais.
 *
 * A API não tem laboratório. Os ensaios são os dezenove de `LAB_VARIABLES`
 * que se medem direto — os doze da pesquisa mais os sete da Fase 3; a
 * especificação numérica sai da faixa escrita lá, e onde ela não é uma faixa
 * (tração, rasgo, alvura, curl) os limites abaixo são **suposição** desta
 * demonstração. A frequência segue a amostragem de cada ensaio.
 *
 * Os valores ficam perto do alvo, com ruído fixo por bobina e ensaio, e contam
 * duas histórias:
 *
 * - **Refino:** cinco bobinas, de 7 a 11 fechadas atrás, saíram com Gurley e
 *   tração MD no limite, antes de a energia de refino ser corrigida.
 * - **Cola AKD:** as duas últimas fechadas saíram com Cobb₆₀ acima de 28 g/m²
 *   (ver `scenario.ts`).
 */
export const LAB_SPECS: readonly LabSpec[] = [
  {
    tag: 'LAB-1201',
    label: 'Gramatura',
    unit: 'g/m²',
    lo: 73.5,
    hi: 76.5,
    target: 75,
    everyReels: 1,
  },
  { tag: 'LAB-1202', label: 'Umidade', unit: '%', lo: 4.3, hi: 5.3, target: 4.8, everyReels: 9 },
  { tag: 'LAB-1203', label: 'Espessura', unit: 'µm', lo: 98, hi: 106, target: 102, everyReels: 1 },
  {
    tag: 'LAB-1204',
    label: 'Lisura',
    unit: 'mL/min',
    lo: 120,
    hi: 200,
    target: 160,
    everyReels: 1,
  },
  { tag: 'LAB-1205', label: 'Gurley', unit: 's/100mL', lo: 12, hi: 24, target: 16, everyReels: 1 },
  {
    tag: 'LAB-1206',
    label: 'Tração MD',
    unit: 'kN/m',
    lo: 4.6,
    hi: 6.0,
    target: 5.2,
    everyReels: 2,
  },
  { tag: 'LAB-1207', label: 'Rasgo', unit: 'mN', lo: 420, hi: 560, target: 480, everyReels: 5 },
  { tag: 'LAB-1208', label: 'Cinzas', unit: '%', lo: 19, hi: 23, target: 21, everyReels: 5 },
  {
    tag: 'LAB-1209',
    label: 'Alvura ISO',
    unit: '% ISO',
    lo: 97,
    hi: 101,
    target: 99,
    everyReels: 1,
  },
  { tag: 'LAB-1210', label: 'Opacidade', unit: '%', lo: 90, hi: 93.5, target: 91.5, everyReels: 1 },
  { tag: 'LAB-1211', label: 'Cobb₆₀', unit: 'g/m²', lo: 22, hi: 28, target: 25, everyReels: 1 },
  { tag: 'LAB-1212', label: 'Curl', unit: 'mm', lo: -10, hi: 10, target: 0, everyReels: 2 },

  // os sete da Fase 3: completam a matriz do rolo jumbo, todos `assumed`
  { tag: 'LAB-1213', label: 'Cor L*', unit: 'adim.', lo: 92, hi: 96, target: 94, everyReels: 4 },
  { tag: 'LAB-1214', label: 'Dureza', unit: 'N', lo: 120, hi: 260, target: 190, everyReels: 4 },
  {
    tag: 'LAB-1215',
    label: 'Rigidez',
    unit: 'mN·m',
    lo: 0.8,
    hi: 2.2,
    target: 1.4,
    everyReels: 4,
  },
  {
    tag: 'LAB-1216',
    label: 'Arrebentamento',
    unit: 'kPa',
    lo: 180,
    hi: 320,
    target: 240,
    everyReels: 2,
  },
  {
    tag: 'LAB-1217',
    label: 'Scott Bond',
    unit: 'J/m²',
    lo: 120,
    hi: 280,
    target: 190,
    everyReels: 4,
  },
  { tag: 'LAB-1218', label: 'Pó', unit: 'adim.', lo: 0, hi: 5, target: 1.8, everyReels: 8 },
  { tag: 'LAB-1219', label: 'Sujidade', unit: 'mm²/m²', lo: 0, hi: 8, target: 2, everyReels: 8 },
];

/** Quanto tempo depois do fim da bobina o ensaio sai. */
const ANALYSIS_LAG_MS = 35 * 60 * 1000;

/** O Cobb das duas bobinas do cenário: a retida e a em avaliação. */
export const COBB_HELD = 29.4;
export const COBB_EVALUATED = 28.9;

/** Bobinas fechadas atrás (0 = a última) em que o refino deixou Gurley e tração no limite. */
const REFINING_EDGE = [7, 8, 9, 10, 11];

/**
 * Os ensaios das bobinas fechadas que já tiveram tempo de ir ao laboratório.
 *
 * `now` é o instante da leitura da API: ensaio que sairia depois dele ainda
 * não existe, e é assim que a última bobina fica com ensaio atrasado.
 */
export function labResults(
  reels: readonly ReelView[],
  now: string,
  akdSince: string | null,
): LabResult[] {
  const closed = closedReels(reels);
  const scenario = scenarioOf(reels, akdSince);
  const nowMs = Date.parse(now);
  const out: LabResult[] = [];

  closed.forEach((reel, back) => {
    if (reel.endedAt === null) return;
    const analyzedMs = Date.parse(reel.endedAt) + ANALYSIS_LAG_MS;

    for (const spec of LAB_SPECS) {
      if (reel.number % spec.everyReels !== 0) continue;
      // o último ensaio de 2 em 2 bobinas ainda não saiu: é o atraso da fila
      if (back === 0 && spec.everyReels > 1) continue;
      if (analyzedMs > nowMs && back > 0) continue;

      out.push({
        reelNumber: reel.number,
        tag: spec.tag,
        value: valueOf(spec, reel, back, scenario),
        unit: spec.unit,
        analyzedAt: new Date(Math.min(analyzedMs, nowMs)).toISOString(),
      });
    }
  });

  return out;
}

function valueOf(
  spec: LabSpec,
  reel: ReelView,
  back: number,
  scenario: ReturnType<typeof scenarioOf>,
): number {
  if (spec.tag === 'LAB-1211' && scenario) {
    if (reel.number === scenario.held.number) return COBB_HELD;
    if (reel.number === scenario.evaluated.number) return COBB_EVALUATED;
  }

  const half = (spec.hi - spec.lo) / 2;
  const center = spec.target ?? (spec.lo + spec.hi) / 2;

  if (REFINING_EDGE.includes(back)) {
    // no limite: dentro da faixa, nos últimos 10 % do lado em que o refino empurra
    if (spec.tag === 'LAB-1205')
      return round(spec.hi - half * 0.12 + centered(key(spec, reel)) * half * 0.04);
    if (spec.tag === 'LAB-1206')
      return round(spec.lo + half * 0.12 + centered(key(spec, reel)) * half * 0.04);
  }

  // o QCS vê a mesma folha: a gramatura do laboratório acompanha a média da bobina
  if (spec.tag === 'LAB-1201' && reel.basisWeightGsm !== null) {
    return round(reel.basisWeightGsm + centered(key(spec, reel)) * 0.35);
  }
  if (spec.tag === 'LAB-1202' && reel.moisturePct !== null) {
    return round(reel.moisturePct + centered(key(spec, reel)) * 0.12);
  }

  return round(center + centered(key(spec, reel)) * half * 0.45);
}

const key = (spec: LabSpec, reel: ReelView) => `${spec.tag}:${String(reel.number)}`;
const round = (value: number) => Math.round(value * 100) / 100;

/** As bobinas paradas pela qualidade: as duas do cenário da cola AKD. */
export function reelHolds(reels: readonly ReelView[], akdSince: string | null): ReelHold[] {
  const scenario = scenarioOf(reels, akdSince);
  if (!scenario) return [];
  const cobb = LAB_SPECS.find((spec) => spec.tag === 'LAB-1211');
  const unitOf = cobb?.unit ?? 'g/m²';
  const lag = (reel: ReelView) =>
    new Date(Date.parse(reel.endedAt ?? reel.startedAt) + ANALYSIS_LAG_MS).toISOString();

  return [
    {
      reelNumber: scenario.held.number,
      status: 'retida',
      tag: 'LAB-1211',
      value: COBB_HELD,
      unit: unitOf,
      since: lag(scenario.held),
      reason: 'Cobb₆₀ acima da especificação; retida para reteste',
    },
    {
      reelNumber: scenario.evaluated.number,
      status: 'em avaliação',
      tag: 'LAB-1211',
      value: COBB_EVALUATED,
      unit: unitOf,
      since: lag(scenario.evaluated),
      reason: 'Cobb₆₀ acima da especificação; destino em avaliação pela Qualidade',
    },
  ];
}
