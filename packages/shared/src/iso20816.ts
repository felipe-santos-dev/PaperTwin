/**
 * Classificação de severidade de vibração conforme ISO 20816-3.
 *
 * A norma avalia a velocidade de vibração RMS (mm/s) medida na carcaça do mancal
 * e a enquadra em quatro zonas:
 *
 *   A — máquina recém-comissionada
 *   B — aceitável para operação contínua sem restrição
 *   C — insatisfatória para operação contínua prolongada; programar intervenção
 *   D — severidade suficiente para causar dano
 *
 * Os limites dependem do porte da máquina e da rigidez da fundação, então eles
 * são dados de entrada e não constantes globais: cada ativo do modelo da MP1
 * carrega os seus.
 */

/** Zonas de severidade da ISO 20816-3, da melhor para a pior. */
export const ISO_ZONES = ['A', 'B', 'C', 'D'] as const;

export type IsoZone = (typeof ISO_ZONES)[number];

/**
 * Porte da máquina conforme ISO 20816-3.
 * - `group1`: máquinas grandes, 300 kW a 50 MW.
 * - `group2`: máquinas médias, 15 kW a 300 kW.
 */
export type MachineGroup = 'group1' | 'group2';

/** Rigidez do conjunto máquina/fundação. */
export type SupportClass = 'rigid' | 'flexible';

/**
 * Fronteiras entre zonas, em mm/s RMS. Um valor exatamente igual à fronteira
 * pertence à zona melhor — a norma define as faixas como "até e inclusive".
 */
export interface IsoLimits {
  /** Fronteira A→B. */
  readonly aToB: number;
  /** Fronteira B→C. */
  readonly bToC: number;
  /** Fronteira C→D. */
  readonly cToD: number;
}

/** Tabela de limites da ISO 20816-3 (velocidade RMS em mm/s). */
export const ISO_20816_3_LIMITS: Record<MachineGroup, Record<SupportClass, IsoLimits>> = {
  group1: {
    rigid: { aToB: 2.3, bToC: 4.5, cToD: 7.1 },
    flexible: { aToB: 3.5, bToC: 7.1, cToD: 11.0 },
  },
  group2: {
    rigid: { aToB: 1.4, bToC: 2.8, cToD: 4.5 },
    flexible: { aToB: 2.3, bToC: 4.5, cToD: 7.1 },
  },
};

/** Porte e rigidez de um ativo, como declarado no modelo da máquina. */
export interface IsoClass {
  readonly group: MachineGroup;
  readonly support: SupportClass;
}

/**
 * Classe padrão dos mancais dos cilindros secadores: grupo 2 com apoio rígido
 * (1,4 / 2,8 / 4,5 mm/s).
 *
 * Grupo 2 porque o acionamento de cada grupo de secagem fica na faixa de 15 a
 * 300 kW; apoio rígido porque o quadro dos secadores é chumbado na fundação de
 * concreto. Com esses limites, 7,8 mm/s cai na zona D — o conceito de tela em
 * `reference/prototypes/` rotula a mesma leitura como zona C, e o rótulo do
 * conceito é que está errado.
 */
export const DRYER_BEARING_ISO: IsoClass = { group: 'group2', support: 'rigid' };

/** Limites da ISO 20816-3 para um dado porte e rigidez. */
export function isoLimitsFor(group: MachineGroup, support: SupportClass): IsoLimits {
  return ISO_20816_3_LIMITS[group][support];
}

/** Limites da ISO 20816-3 para uma classe declarada no modelo. */
export function isoLimitsOf({ group, support }: IsoClass): IsoLimits {
  return isoLimitsFor(group, support);
}

/**
 * Enquadra uma leitura de velocidade RMS (mm/s) na zona da ISO 20816-3.
 *
 * @throws {RangeError} se a leitura não for um número finito e não negativo.
 */
export function classifyIsoZone(rmsMmS: number, limits: IsoLimits): IsoZone {
  if (!Number.isFinite(rmsMmS) || rmsMmS < 0) {
    throw new RangeError(`Velocidade RMS inválida: ${rmsMmS}`);
  }
  if (rmsMmS <= limits.aToB) return 'A';
  if (rmsMmS <= limits.bToC) return 'B';
  if (rmsMmS <= limits.cToD) return 'C';
  return 'D';
}

/** Severidade operacional derivada da zona, usada para colorir a cena e a lista de ativos. */
export type AssetHealth = 'normal' | 'attention' | 'critical';

const HEALTH_BY_ZONE: Record<IsoZone, AssetHealth> = {
  A: 'normal',
  B: 'normal',
  C: 'attention',
  D: 'critical',
};

/** Traduz a zona da norma para a severidade mostrada na interface. */
export function healthFromZone(zone: IsoZone): AssetHealth {
  return HEALTH_BY_ZONE[zone];
}
