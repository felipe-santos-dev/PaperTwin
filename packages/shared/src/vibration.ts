import type { AssetTag } from './asset';
import type { AssetHealth, IsoZone } from './iso20816';

/**
 * Uma leitura de vibração de um mancal, como gravada em `vibration_reading`.
 * A chave primária no banco é (asset_tag, ts).
 */
export interface VibrationReading {
  readonly assetTag: AssetTag;
  /** Instante da medição, em ISO 8601 com fuso. */
  readonly ts: string;
  /** Velocidade de vibração RMS, mm/s. */
  readonly rmsMmS: number;
  /** Temperatura do mancal, °C. */
  readonly tempC: number;
  /** Envelope de aceleração (detecção de defeito em rolamento), gE. */
  readonly envelopeGe: number;
}

/** Estado atual de um ativo, derivado da última leitura e dos limites da norma. */
export interface AssetStatus {
  readonly assetTag: AssetTag;
  readonly zone: IsoZone;
  readonly health: AssetHealth;
  readonly latest: VibrationReading | null;
}
