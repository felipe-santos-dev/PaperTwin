import type { Alarm } from '@mp1/shared';

import type { ProcessValues, ReelView, TrendQuery } from '../process';
import { cdMap } from './cdmap';
import { LAB_SPECS, labResults, reelHolds } from './lab';
import { fixedProcess, fixedTrend } from './process';
import type { CdMap, FixedProcess, FixedTrend, LabResults, ReelHolds } from './types';

export { FIXED_VARIABLES } from './process';
export { LAB_SPECS } from './lab';
export { CD_MAP_TAG } from './cdmap';
export type * from './types';

/**
 * As rotas que a API ainda não tem, respondidas por dado fixo.
 *
 * Cada portão (ao vivo e demonstração) as ganha montadas sobre as **suas**
 * bobinas e o **seu** instante de leitura — é isso que faz um ensaio apontar
 * para uma bobina que existe naquela fonte, e a cola cair no instante certo
 * daquela linha do tempo. Quando a rota real existir, o portão troca a função
 * daqui pela chamada, e as telas não mudam.
 */
export interface FixtureRoutes {
  labResults(filter?: { readonly reel?: number }, signal?: AbortSignal): Promise<LabResults>;
  reelHolds(signal?: AbortSignal): Promise<ReelHolds>;
  fixedProcess(signal?: AbortSignal): Promise<FixedProcess>;
  fixedTrend(tag: string, query?: TrendQuery, signal?: AbortSignal): Promise<FixedTrend>;
  cdMap(reel: number, signal?: AbortSignal): Promise<CdMap>;
}

interface Source {
  reels(
    filter?: { limit?: number },
    signal?: AbortSignal,
  ): Promise<{ readonly reels: readonly ReelView[] }>;
  processValues(filter?: object, signal?: AbortSignal): Promise<ProcessValues>;
  /** Os alarmes da fonte: é deles que sai o instante da queda da cola. */
  alarms(
    filter?: { limit?: number },
    signal?: AbortSignal,
  ): Promise<{ readonly alarms: readonly Alarm[] }>;
}

/** A TAG da cola, cujo alarme de `L` ancora o cenário da bobina retida. */
const AKD_TAG = 'FIC-107';

/** Bobinas suficientes para a matriz do laboratório e para o cenário. */
const REEL_WINDOW = 40;

export function fixtureRoutes(source: Source): FixtureRoutes {
  const context = async (signal?: AbortSignal) => {
    const [reels, values, alarms] = await Promise.all([
      source.reels({ limit: REEL_WINDOW }, signal),
      source.processValues({}, signal),
      source.alarms({ limit: 200 }, signal),
    ]);

    /**
     * O instante em que a cola caiu, tirado do alarme de verdade.
     *
     * Era um número inventado aqui dentro; agora é o `raisedAt` do alarme de
     * `L` da `FIC-107`, que o motor de alarmes levantou porque a malha caiu no
     * simulador. Sem alarme, não há cenário — e é assim que ele some sozinho
     * numa janela em que a queda não aconteceu.
     */
    const akd = alarms.alarms
      .filter((alarm) => alarm.tag === AKD_TAG && alarm.limit === 'L')
      .sort((a, b) => Date.parse(b.raisedAt) - Date.parse(a.raisedAt))[0];

    return { reels: reels.reels, now: values.ts, akdSince: akd?.raisedAt ?? null };
  };

  return {
    async labResults(filter = {}, signal) {
      const { reels, now, akdSince } = await context(signal);
      const results = labResults(reels, now, akdSince).filter(
        (result) => filter.reel === undefined || result.reelNumber === filter.reel,
      );
      return { illustrative: true, specs: LAB_SPECS, results };
    },

    async reelHolds(signal) {
      const { reels, now, akdSince } = await context(signal);
      // a retenção não pode ser depois da leitura: o ensaio da última ainda está saindo
      const holds = reelHolds(reels, akdSince).map((hold) =>
        Date.parse(hold.since) > Date.parse(now) ? { ...hold, since: now } : hold,
      );
      return { illustrative: true, holds };
    },

    async fixedProcess(signal) {
      const { now } = await context(signal);
      return fixedProcess(now);
    },

    async cdMap(number, signal) {
      const { reels } = await context(signal);
      const reel = reels.find((item) => item.number === number);
      const map = reel ? cdMap(reel) : null;
      if (!map) throw new Error(`Sem mapa CD para a bobina ${String(number)}`);
      return map;
    },

    async fixedTrend(tag, query = {}, signal) {
      const { now } = await context(signal);
      const trend = fixedTrend(tag, now, query);
      if (!trend) throw new Error(`${tag} não é uma TAG fixa`);
      return trend;
    },
  };
}
