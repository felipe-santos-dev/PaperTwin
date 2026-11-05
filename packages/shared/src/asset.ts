/**
 * Vocabulário dos ativos da MP1.
 *
 * O modelo declarativo da máquina (`machine/mp1.ts`, Fase 1) é a fonte da verdade
 * das tags: a cena 3D e a tabela `asset` do banco são geradas a partir dele.
 */

/** Seções da máquina, na ordem do processo. */
export const SECTION_IDS = [
  'headbox',
  'forming',
  'press',
  'pre-dryer',
  'scanner-1',
  'speed-sizer',
  'post-dryer',
  'calender',
  'scanner-2',
  'pope-reel',
] as const;

export type SectionId = (typeof SECTION_IDS)[number];

/** Tipos de ativo que a cena desenha e que o monitoramento acompanha. */
export const ASSET_KINDS = [
  'dryer-cylinder',
  'roll',
  'bearing',
  'scanner',
  'nip',
  'reel-drum',
  'headbox',
] as const;

export type AssetKind = (typeof ASSET_KINDS)[number];

/** Lado da máquina. LA = lado acionamento, LC = lado comando (operação). */
export type MachineSide = 'LA' | 'LC';

/**
 * Tag do ativo no padrão da planta, ex.: `MP1-SEC-G4-CS23-MLA`.
 * É a chave que liga a cena 3D, a API e as leituras de vibração.
 */
export type AssetTag = string;
