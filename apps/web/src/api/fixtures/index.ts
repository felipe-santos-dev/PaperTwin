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
}

/** Bobinas suficientes para a matriz do laboratório e para o cenário. */
const REEL_WINDOW = 40;

export function fixtureRoutes(source: Source): FixtureRoutes {
  const context = async (signal?: AbortSignal) => {
    const [reels, values] = await Promise.all([
      source.reels({ limit: REEL_WINDOW }, signal),
      source.processValues({}, signal),
    ]);
    return { reels: reels.reels, now: values.ts };
  };

  return {
    async labResults(filter = {}, signal) {
      const { reels, now } = await context(signal);
      const results = labResults(reels, now).filter(
        (result) => filter.reel === undefined || result.reelNumber === filter.reel,
      );
      return { illustrative: true, specs: LAB_SPECS, results };
    },

    async reelHolds(signal) {
      const { reels, now } = await context(signal);
      // a retenção não pode ser depois da leitura: o ensaio da última ainda está saindo
      const holds = reelHolds(reels).map((hold) =>
        Date.parse(hold.since) > Date.parse(now) ? { ...hold, since: now } : hold,
      );
      return { illustrative: true, holds };
    },

    async fixedProcess(signal) {
      const { reels, now } = await context(signal);
      return fixedProcess(reels, now);
    },

    async cdMap(number, signal) {
      const { reels } = await context(signal);
      const reel = reels.find((item) => item.number === number);
      const map = reel ? cdMap(reel) : null;
      if (!map) throw new Error(`Sem mapa CD para a bobina ${String(number)}`);
      return map;
    },

    async fixedTrend(tag, query = {}, signal) {
      const { reels, now } = await context(signal);
      const trend = fixedTrend(reels, tag, now, query);
      if (!trend) throw new Error(`${tag} não é uma TAG fixa`);
      return trend;
    },
  };
}
