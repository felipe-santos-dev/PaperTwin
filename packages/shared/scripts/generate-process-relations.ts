import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { format, resolveConfig } from 'prettier';

import { readRelations, relationsCsvPath } from './relations-csv';
import type { FopdtRelation } from '../src/process/relation-types';

/**
 * Gera `src/process/relations.generated.ts` a partir de `relacoes-fopdt.csv`.
 *
 *     npm run generate --workspace @mp1/shared
 *
 * Só os dados do CSV. As relações herdadas, a relação por zona e as consultas
 * ficam em `relations.ts`, escrito à mão — rodar o gerador não passa por cima
 * de lógica.
 */

const OUT = new URL('../src/process/relations.generated.ts', import.meta.url);

function serialize(relation: FopdtRelation) {
  return {
    id: relation.id,
    input: relation.input,
    output: relation.output,
    zoned: relation.zoned,
    step: relation.step,
    kp: relation.kp,
    kpUnit: relation.kpUnit,
    deadTimeS: relation.deadTimeS,
    tauS: relation.tauS,
    note: relation.note,
    derivedFrom: relation.derivedFrom,
    source: relation.source,
  };
}

const relations = await readRelations();
const baseIds = new Set(relations.map((relation) => /^\d+/.exec(relation.id)?.[0] ?? relation.id));

const source = `/**
 * GERADO — não edite à mão.
 *
 * Saída de \`scripts/generate-process-relations.ts\`, lida de
 * \`reference/research/relacoes-fopdt.csv\`. Para mudar uma relação, mude o CSV e rode:
 *
 *     npm run generate --workspace @mp1/shared
 *
 * ${String(relations.length)} linhas, que são ${String(baseIds.size)} relações da pesquisa B contando os desdobramentos
 * b/c sobre a mesma entrada. Toda ponta foi resolvida contra o catálogo de
 * processo ou a lista de laboratório na hora de gerar.
 */

import type { FopdtRelation } from './relation-types';

/** As relações como o CSV as traz, na ordem do arquivo. */
export const CSV_RELATIONS: readonly FopdtRelation[] = ${JSON.stringify(relations.map(serialize))};
`;

const outPath = fileURLToPath(OUT);
const prettierConfig = await resolveConfig(outPath);
const formatted = await format(source, { ...prettierConfig, parser: 'typescript' });

await writeFile(OUT, formatted, 'utf8');

console.log(
  `relations.generated.ts: ${String(relations.length)} linhas / ` +
    `${String(baseIds.size)} relações, de ${relationsCsvPath}`,
);
