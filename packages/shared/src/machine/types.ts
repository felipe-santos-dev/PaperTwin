import type { AssetKind, AssetTag, MachineSide, SectionId } from '../asset';
import type { IsoClass } from '../iso20816';
import type { Source } from './provenance';

/** Posição no referencial da cena, em metros. */
export type Point3 = readonly [x: number, y: number, z: number];

/**
 * Um ativo da máquina.
 *
 * Campos que não se aplicam a um tipo de ativo são `null` em vez de ausentes:
 * o modelo é serializado para o banco e consumido pela cena, e um campo sempre
 * presente evita um ramo a mais em cada consumidor.
 */
export interface MachineAsset {
  /** Tag da planta, ex.: `MP1-SEC-G4-CS23-MLA`. Única em toda a máquina. */
  readonly tag: AssetTag;
  readonly kind: AssetKind;
  /** Nome legível, para a interface. */
  readonly label: string;
  readonly section: SectionId;
  /** Centro do ativo, em metros. */
  readonly position: Point3;
  /** Raio em metros, para corpos de revolução; `null` para os demais. */
  readonly radius: number | null;
  /** Comprimento da face, em metros; `null` para os que não têm. */
  readonly lengthM: number | null;
  /** Lado da máquina, só para mancais. */
  readonly side: MachineSide | null;
  /** Ativo ao qual este pertence — o mancal aponta para o seu cilindro. */
  readonly parentTag: AssetTag | null;
  /** Grupo de acionamento, ex.: `G4`. */
  readonly driveGroup: string | null;
  /** Classe da ISO 20816-3; só os ativos com medição de vibração têm. */
  readonly iso: IsoClass | null;
  /**
   * Se a **existência** deste ativo está confirmada: ele existe com esta tag,
   * neste ponto do processo.
   *
   * Não diz nada sobre a posição — um ativo pode existir de verdade e estar
   * desenhado num X suposto. A origem das medidas fica em `MEASUREMENTS`.
   */
  readonly source: Source;
}

/** Uma seção do processo, com os ativos que moram nela. */
export interface MachineSection {
  readonly id: SectionId;
  readonly label: string;
  /** Posição na ordem do processo, começando em 1. */
  readonly order: number;
  readonly assets: readonly MachineAsset[];
}

/** A máquina inteira. É daqui que a cena 3D e a tabela `asset` são geradas. */
export interface MachineModel {
  readonly id: 'MP1';
  readonly label: string;
  /** Largura da folha/face dos rolos, em metros. */
  readonly webWidthM: number;
  readonly sections: readonly MachineSection[];
}
