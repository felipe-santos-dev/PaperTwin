/**
 * A bobina jumbo — o que a máquina entrega.
 *
 * Da seção "Entidades de operação" da LISTA-BASE: número, início, fim, peso,
 * comprimento, diâmetro final, gramatura/umidade/espessura médias, 2σ CD,
 * emendas, destino e motivo.
 *
 * Quase tudo é `null` enquanto a bobina está sendo enrolada, e isso é o modelo
 * e não um descuido: peso, comprimento e médias só existem quando a bobina
 * fecha. Uma bobina em andamento com peso 0 mentiria para a tela de Bobinas,
 * que precisa distinguir "ainda não sei" de "deu zero".
 */

import type { ProvenanceNote } from './provenance';

/** O que foi feito com a bobina depois da inspeção. */
export const REEL_DISPOSITIONS = ['aprovada', 'rebaixada', 'segregada'] as const;

export type ReelDisposition = (typeof REEL_DISPOSITIONS)[number];

/**
 * Diâmetro em que a Pope troca de bobina, em mm.
 *
 * Do catálogo: `ZI-1004` vai de 600 a 3000 mm e "dispara a troca de bobina".
 * O topo da faixa é o diâmetro de troca.
 */
export const REEL_CHANGE_DIAMETER_MM = 3000;

/** Dispersão CD de uma bobina, como o QCS a mede (2σ sobre o perfil). */
export interface CdSpread {
  /** `AI-912`, em g/m². */
  readonly basisWeightGsm: number;
  /** `AI-913`, em %. */
  readonly moisturePct: number;
  /** `AI-915`, em µm. */
  readonly caliperUm: number;
}

/** Uma bobina jumbo. */
export interface JumboReel {
  /** Número sequencial da bobina, contado desde o início da simulação. */
  readonly number: number;
  /** Turno em que a bobina **começou** a ser enrolada. */
  readonly shiftId: string;
  readonly startedAt: string;
  /** `null` enquanto está na Pope. */
  readonly endedAt: string | null;
  readonly weightT: number | null;
  readonly lengthM: number | null;
  readonly finalDiameterMm: number | null;
  /** Média de `AIC-902` ao longo da bobina. */
  readonly basisWeightGsm: number | null;
  /** Média de `AIC-903`. */
  readonly moisturePct: number | null;
  /** Média de `AIC-905`. */
  readonly caliperUm: number | null;
  readonly cdSpread: CdSpread | null;
  /** Emendas na folha dentro desta bobina — cada quebra deixa uma. */
  readonly splices: number;
  /** `null` até a bobina ser fechada e julgada. */
  readonly disposition: ReelDisposition | null;
  /** Por que foi rebaixada ou segregada; `null` quando aprovada. */
  readonly dispositionReason: string | null;
}

/** Se a bobina está fechada — tem fim e destino. */
export function isReelClosed(reel: JumboReel): boolean {
  return reel.endedAt !== null && reel.disposition !== null;
}

/**
 * Uma bobina rebaixada ou segregada precisa dizer por quê.
 *
 * É a regra que impede o relatório de turno de ter uma bobina fora do padrão
 * sem causa anotada — exatamente o dado que a próxima reunião de produção pede.
 */
export function reelDispositionIsConsistent(reel: JumboReel): boolean {
  if (reel.disposition === null) return reel.dispositionReason === null;
  if (reel.disposition === 'aprovada') return true;
  return (reel.dispositionReason ?? '').trim() !== '';
}

/** De onde vem o modelo da bobina. */
export const REEL_PROVENANCE: ProvenanceNote = {
  source: 'B',
  note:
    'Campos da seção "Entidades de operação" da LISTA-BASE. O diâmetro de troca sai de ZI-1004 ' +
    'no catálogo.',
};
