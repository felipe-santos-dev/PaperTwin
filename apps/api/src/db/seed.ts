import { allAssets, HISTORIAN_POINTS, MP1, type AssetTag } from '@mp1/shared';
import {
  bearingsOf,
  DEFAULT_INTERVAL_MS,
  DEFAULT_WINDOW_MS,
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
 * O mancal que degrada na simulação.
 *
 * É o mesmo do conceito de tela de monitoramento, para quem comparar os dois
 * encontrar o mesmo ativo em alarme.
 */
export const DEGRADING_TAG: AssetTag = 'MP1-SEC-G4-CS23-MLA';

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

  const readings = simulateVibration({
    bearings: bearingsOf(assets),
    from,
    to,
    intervalMs: options.intervalMs ?? DEFAULT_INTERVAL_MS,
    degradingTag: DEGRADING_TAG,
  });

  const written = await db.insertReadings(readings);
  return {
    assets: assetCount,
    historianPoints: pointCount,
    readings: written,
    skippedReadings: false,
  };
}
