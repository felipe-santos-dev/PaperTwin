import { allAssets, HISTORIAN_POINTS, MP1, type AssetTag } from '@mp1/shared';
import {
  bearingsOf,
  DEFAULT_INTERVAL_MS,
  DEFAULT_WINDOW_MS,
  DEGRADATION_PLANS,
  degradationScenariosAt,
  simulateVibration,
} from '../simulation/vibration';
import type { Database } from './repository';

/**
 * Semeadura do banco a partir do modelo.
 *
 * Os ativos vêm de `MP1` e são reescritos a cada arranque: o modelo é a fonte
 * da verdade das tags, então o banco segue o código e nunca o contrário.
 *
 * A série de vibração só é gerada se a tabela estiver vazia. Assim um banco
 * gerenciado mantém o histórico entre reinícios, enquanto o PGlite em memória,
 * que começa vazio sempre, é repovoado.
 *
 * Os pontos do historiador são reescritos junto com os ativos, e pelo mesmo
 * motivo: eles saem do catálogo de processo, que é código. Reescrever é seguro
 * porque o `point_id` é determinístico — o índice da variável no catálogo — e
 * não uma sequência do banco.
 */

/**
 * O mancal que degrada e já chegou ao fim: o CS23 do lado comando.
 *
 * É o mesmo do design das telas, para quem comparar os dois encontrar o mesmo
 * ativo em alarme. O segundo mancal do cenário — o que ainda está no meio da
 * curva — é `DEGRADATION_PLANS[1]`, e quem precisa dele pega de lá.
 */
export const DEGRADING_TAG: AssetTag = DEGRADATION_PLANS[0]?.assetTag ?? 'MP1-SEC-G4-CS23-MLC';

export interface SeedResult {
  readonly assets: number;
  readonly historianPoints: number;
  readonly readings: number;
  readonly skippedReadings: boolean;
}

export interface SeedOptions {
  /** Fim da janela simulada. O padrão é agora. */
  readonly now?: Date;
  readonly windowMs?: number;
  readonly intervalMs?: number;
}

export async function seedDatabase(db: Database, options: SeedOptions = {}): Promise<SeedResult> {
  const assets = allAssets(MP1);
  const assetCount = await db.replaceAssets(assets);
  const pointCount = await db.replaceHistorianPoints(HISTORIAN_POINTS);

  const existing = await db.countReadings();
  if (existing > 0) {
    return {
      assets: assetCount,
      historianPoints: pointCount,
      readings: existing,
      skippedReadings: true,
    };
  }

  const to = options.now ?? new Date();
  const from = new Date(to.getTime() - (options.windowMs ?? DEFAULT_WINDOW_MS));

  /**
   * As janelas vêm da mesma função que a retomada usa.
   *
   * A série semeada e os valores que a retomada grava no historiador têm de
   * contar a mesma história do mesmo mancal; duas declarações do cenário, uma
   * aqui e outra lá, discordariam no dia em que uma das duas mudasse.
   */
  const readings = simulateVibration({
    bearings: bearingsOf(assets),
    from,
    to,
    intervalMs: options.intervalMs ?? DEFAULT_INTERVAL_MS,
    scenarios: degradationScenariosAt(to),
  });

  const written = await db.insertReadings(readings);
  return {
    assets: assetCount,
    historianPoints: pointCount,
    readings: written,
    skippedReadings: false,
  };
}
