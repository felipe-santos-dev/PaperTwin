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
  readonly zone: IsoZone | null;
  readonly health: AssetHealth | null;
  readonly latest: VibrationReading | null;
}

/**
 * Leituras agregadas numa janela de tempo, como `date_bin()` devolve.
 *
 * A média serve à tendência; o máximo é o que não pode ser perdido, porque um
 * pico de vibração de poucos segundos some numa média de dez minutos.
 */
export interface VibrationBucket {
  /** Início da janela, em ISO 8601. */
  readonly bucketStart: string;
  readonly samples: number;
  readonly rmsAvgMmS: number;
  readonly rmsMaxMmS: number;
  readonly tempAvgC: number;
  readonly envelopeMaxGe: number;
}

/** Tamanhos de janela aceitos pela API. */
export const VIBRATION_BUCKETS = [
  '1 minute',
  '5 minutes',
  '15 minutes',
  '1 hour',
  '6 hours',
  '1 day',
] as const;

export type VibrationBucketSize = (typeof VIBRATION_BUCKETS)[number];

/** Vida útil restante estimada a partir da tendência da vibração. */
export interface RemainingLife {
  /** Inclinação da tendência, em mm/s por dia. */
  readonly trendMmSPerDay: number;
  /** Dias até cruzar a fronteira C→D, ou `null` se a tendência não leva lá. */
  readonly daysToZoneD: number | null;
  /** Quantas janelas entraram no ajuste. */
  readonly samples: number;
}
