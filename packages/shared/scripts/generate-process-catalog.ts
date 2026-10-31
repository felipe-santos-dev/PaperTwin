import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { format, resolveConfig } from 'prettier';

import { catalogCsvPath, readCatalog } from './catalog-csv';
import type { PerCylinderPattern, ProcessVariable } from '../src/process/types';

/**
 * Gera `src/process/catalog.generated.ts` a partir de `catalogo-base.csv`.
 *
 *     npm run generate --workspace @mp1/shared
 *
 * O arquivo gerado tem só os dados do CSV. A expansão dos padrões por cilindro
 * e as consultas moram em `catalog.ts`, escrito à mão — assim rodar o gerador
 * nunca passa por cima de lógica.
 *
 * Quem esquecer de rodar o gerador depois de mexer no CSV é pego por
 * `catalog.test.ts`, que relê o CSV e compara com o que está no disco.
 */

const OUT = new URL('../src/process/catalog.generated.ts', import.meta.url);

/**
 * Serializa na ordem em que se lê a variável, não na ordem do spread.
 *
 * Vale o trabalho: o arquivo gerado entra em revisão de código como qualquer
 * outro, e um diff de catálogo é mais fácil de ler com a tag na frente.
 */
function serializeVariable(variable: ProcessVariable) {
  return {
    tag: variable.tag,
    name: variable.name,
    area: variable.area,
    group: variable.group,
    unit: variable.unit,
    min: variable.min,
    max: variable.max,
    target: variable.target,
    limits: variable.limits,
    controlled: variable.controlled,
    mv: variable.mv,
    compression: variable.compression,
    source: variable.source,
    confidence: variable.confidence,
    note: variable.note,
    cylinder: variable.cylinder,
    steamGroup: variable.steamGroup,
  };
}

function serializePattern(pattern: PerCylinderPattern) {
  return {
    tagPattern: pattern.tagPattern,
    namePattern: pattern.namePattern,
    area: pattern.area,
    group: pattern.group,
    unit: pattern.unit,
    min: pattern.min,
    max: pattern.max,
    target: pattern.target,
    limits: pattern.limits,
    controlled: pattern.controlled,
    mv: pattern.mv,
    compression: pattern.compression,
    source: pattern.source,
    confidence: pattern.confidence,
    note: pattern.note,
  };
}

const catalog = await readCatalog();

const source = `/**
 * GERADO — não edite à mão.
 *
 * Saída de \`scripts/generate-process-catalog.ts\`, lida de
 * \`reference/research/catalogo-base.csv\`. Para mudar um valor, mude o CSV e rode:
 *
 *     npm run generate --workspace @mp1/shared
 *
 * ${String(catalog.concrete.length)} variáveis com tag própria e ${String(catalog.patterns.length)} padrões por cilindro, que \`catalog.ts\` expande
 * sobre os cilindros secadores do modelo da máquina.
 */

import type { PerCylinderPattern, ProcessVariable } from './types';

/** Variáveis com tag própria, na ordem do CSV. */
export const CONCRETE_VARIABLES: readonly ProcessVariable[] = ${JSON.stringify(
  catalog.concrete.map(serializeVariable),
)};

/** Padrões que existem uma vez por cilindro secador. */
export const PER_CYLINDER_PATTERNS: readonly PerCylinderPattern[] = ${JSON.stringify(
  catalog.patterns.map(serializePattern),
)};
`;

const outPath = fileURLToPath(OUT);
const prettierConfig = await resolveConfig(outPath);
const formatted = await format(source, { ...prettierConfig, parser: 'typescript' });

await writeFile(OUT, formatted, 'utf8');

console.log(
  `catalog.generated.ts: ${String(catalog.concrete.length)} variáveis + ` +
    `${String(catalog.patterns.length)} padrões por cilindro, de ${catalogCsvPath}`,
);
