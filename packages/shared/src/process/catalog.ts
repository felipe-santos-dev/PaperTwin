import { MP1 } from '../machine/mp1';
import { dryerCylinders } from '../machine/query';
import { CONCRETE_VARIABLES, PER_CYLINDER_PATTERNS } from './catalog.generated';
import { expandCylinderName, expandCylinderTag } from './per-cylinder';
import type { PerCylinderPattern, ProcessVariable } from './types';

/**
 * Catálogo de variáveis de processo da MP1.
 *
 * Os valores vêm da lista base do simulador (`reference/research/`), lidos pelo
 * gerador para `catalog.generated.ts`. Este arquivo é a parte escrita à mão:
 * expande os padrões por cilindro e responde as consultas.
 *
 * A expansão é feita sobre os cilindros que o **modelo da máquina** declara, e
 * não sobre um número fixo. O CSV diz `nn = 01–36` porque hoje o modelo tem 36
 * cilindros; se o nº de pares mudar em `geometry.ts`, o catálogo acompanha e as
 * duas listas de tags não podem divergir.
 */

/** Uma variável do padrão, para um cilindro. */
export function expandPattern(
  pattern: PerCylinderPattern,
  cylinder: number,
  steamGroup: string | null,
): ProcessVariable {
  const { tagPattern, namePattern, ...rest } = pattern;

  return {
    ...rest,
    tag: expandCylinderTag(tagPattern, cylinder),
    name: expandCylinderName(namePattern, cylinder),
    cylinder,
    steamGroup,
  };
}

/** Os padrões por cilindro, expandidos sobre os cilindros do modelo. */
function expandAll(): ProcessVariable[] {
  const cylinders = dryerCylinders(MP1);

  return PER_CYLINDER_PATTERNS.flatMap((pattern) =>
    cylinders.map(({ number, asset }) => expandPattern(pattern, number, asset.steamGroup)),
  );
}

/**
 * Todas as variáveis do catálogo: as de tag própria e as expandidas.
 *
 * As concretas vêm primeiro, na ordem do CSV, e as por cilindro depois,
 * agrupadas por padrão.
 */
export const PROCESS_CATALOG: readonly ProcessVariable[] = Object.freeze([
  ...CONCRETE_VARIABLES,
  ...expandAll(),
]);

const BY_TAG = new Map(PROCESS_CATALOG.map((variable) => [variable.tag, variable]));

/** Busca uma variável pela tag, ou `null` se não existir no catálogo. */
export function processVariable(tag: string): ProcessVariable | null {
  return BY_TAG.get(tag) ?? null;
}

/** Se a tag existe no catálogo. */
export function isCatalogTag(tag: string): boolean {
  return BY_TAG.has(tag);
}

/** As malhas de controle — as que têm setpoint. */
export function controlledVariables(): ProcessVariable[] {
  return PROCESS_CATALOG.filter((variable) => variable.controlled);
}

/** Variáveis de uma área do processo, ex.: `pré-secagem`. */
export function variablesOfArea(area: string): ProcessVariable[] {
  return PROCESS_CATALOG.filter((variable) => variable.area === area);
}

/** Variáveis de um cilindro secador. */
export function variablesOfCylinder(cylinder: number): ProcessVariable[] {
  return PROCESS_CATALOG.filter((variable) => variable.cylinder === cylinder);
}

/**
 * O que ainda não foi conferido na MP1, para a lista de pendências do README.
 *
 * Junta as duas perguntas que a lista base responde por coluna: de onde veio o
 * número (`fonte`) e quanto ele merece confiança. Uma variável de fonte `B` com
 * confiança baixa é pendência tanto quanto uma `assumed` — é o caso da altura
 * da linha de zero da capota.
 */
export function pendingVariables(): ProcessVariable[] {
  return PROCESS_CATALOG.filter(
    (variable) => variable.source === 'assumed' || variable.confidence === 'baixa',
  );
}
