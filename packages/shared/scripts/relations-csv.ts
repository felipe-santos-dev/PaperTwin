import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { isCatalogTag, processVariable } from '../src/process/catalog';
import { LAB_VARIABLES } from '../src/process/lab';
import type { FopdtRelation, ReferenceStep } from '../src/process/relation-types';

/**
 * Leitura de `relacoes-fopdt.csv`.
 *
 * Mesmo arranjo de `catalog-csv.ts`: ferramenta de build, com o parser
 * compartilhado com o teste de conformidade. O que o teste verifica não é o
 * parser — é se o TS no disco ficou atrasado em relação ao CSV.
 *
 * A validação mais importante aqui é a resolução das pontas: toda entrada e
 * toda saída tem de existir no catálogo de processo ou na lista de laboratório.
 * Uma TAG inexistente quebra o gerador em vez de virar uma relação que o
 * simulador nunca consegue ligar a nada.
 */

const RELATIONS_CSV = new URL('../../../reference/research/relacoes-fopdt.csv', import.meta.url);

export const relationsCsvPath = fileURLToPath(RELATIONS_CSV);

const HEADER = [
  'id',
  'entrada',
  'saida',
  'degrau_entrada',
  'kp_por_unidade',
  'unidade_kp',
  'tempo_morto_s',
  'tau_s',
  'observacao',
] as const;

/** Sufixo das relações zona a zona. */
const ZONE_SUFFIX = '[k]';

/**
 * Unidades que o CSV e o catálogo escrevem de formas diferentes.
 *
 * Tabela explícita, não regra de prefixo: `kPa` e `kPa rel` são a mesma coisa
 * porque a pressão de vapor é relativa, e um degrau sem unidade é o de uma
 * variável adimensional. Qualquer outra divergência é erro e quebra o gerador —
 * um `+10 bar` numa malha em kPa não passa.
 */
const UNIT_EQUIVALENCES: readonly (readonly [step: string, catalog: string])[] = [
  ['kPa', 'kPa rel'],
  ['', 'adim.'],
];

const LAB_TAGS = new Set(LAB_VARIABLES.map((variable) => variable.tag));

function fail(line: number, message: string): never {
  throw new Error(`${relationsCsvPath}:${String(line)} — ${message}`);
}

function text(raw: string): string | null {
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
}

function assertNoQuotes(content: string): void {
  if (content.includes('"')) {
    throw new Error(
      `${relationsCsvPath} tem aspas. O parser divide em vírgulas sem tratar campos entre ` +
        'aspas; use ponto e vírgula dentro do campo ou ensine o parser a tratar aspas.',
    );
  }
}

function rowsOf(content: string): { readonly line: number; readonly fields: string[] }[] {
  return content
    .split('\n')
    .map((row, index) => ({ line: index + 1, text: row.replace(/\r$/, '') }))
    .filter((row) => row.text.trim() !== '')
    .map((row) => ({ line: row.line, fields: row.text.split(',') }));
}

function field(fields: readonly string[], column: (typeof HEADER)[number]): string {
  return fields[HEADER.indexOf(column)] ?? '';
}

function positiveNumber(raw: string, line: number, column: string): number {
  const parsed = Number(raw.trim());
  if (!Number.isFinite(parsed)) fail(line, `coluna ${column} não é um número: ${raw.trim()}`);
  if (parsed <= 0) fail(line, `coluna ${column} precisa ser maior que zero: ${String(parsed)}`);
  return parsed;
}

/** `+10 m³/h` → `{ value: 10, unit: 'm³/h' }`; `+0.02` → unidade vazia. */
function parseStep(raw: string, line: number): ReferenceStep {
  const parsed = /^\+?\s*(-?[\d.]+)\s*(.*)$/.exec(raw.trim());
  const value = Number(parsed?.[1]);

  if (!parsed || !Number.isFinite(value)) {
    fail(line, `degrau_entrada fora do formato esperado (ex.: '+10 kPa'): ${raw.trim()}`);
  }
  if (value <= 0) {
    fail(line, `degrau_entrada precisa ser positivo: ${raw.trim()}`);
  }

  return { value, unit: (parsed[2] ?? '').trim() };
}

/** A TAG sem o `[k]`, e se ela o tinha. */
function splitZone(endpoint: string): { readonly tag: string; readonly zoned: boolean } {
  const trimmed = endpoint.trim();
  return trimmed.endsWith(ZONE_SUFFIX)
    ? { tag: trimmed.slice(0, -ZONE_SUFFIX.length), zoned: true }
    : { tag: trimmed, zoned: false };
}

function unitsMatch(stepUnit: string, catalogUnit: string): boolean {
  if (stepUnit === catalogUnit) return true;
  return UNIT_EQUIVALENCES.some(([step, catalog]) => step === stepUnit && catalog === catalogUnit);
}

/**
 * Resolve a entrada contra o catálogo.
 *
 * Entrada tem de ser variável de processo: um ensaio de laboratório é resultado,
 * não algo que se manipule. Se um dia o CSV apontar um `LAB-` como entrada, isso
 * é erro de modelagem e para aqui.
 */
function resolveInput(tag: string, line: number, id: string): void {
  if (LAB_TAGS.has(tag)) {
    fail(line, `${id}: ${tag} é ensaio de laboratório e não pode ser entrada de uma relação`);
  }
  if (!isCatalogTag(tag)) {
    fail(line, `${id}: entrada ${tag} não existe no catálogo de processo`);
  }
}

function resolveOutput(tag: string, line: number, id: string): void {
  if (LAB_TAGS.has(tag) || isCatalogTag(tag)) return;
  fail(line, `${id}: saída ${tag} não existe no catálogo de processo nem na lista de laboratório`);
}

/** Lê as relações do disco, já validadas e resolvidas. */
export async function readRelations(): Promise<FopdtRelation[]> {
  const content = await readFile(RELATIONS_CSV, 'utf8');
  assertNoQuotes(content);

  const rows = rowsOf(content);
  const header = rows[0];
  if (!header) throw new Error(`${relationsCsvPath} está vazio`);

  const actual = header.fields.map((column) => column.trim()).join(',');
  if (actual !== HEADER.join(',')) {
    throw new Error(
      `${relationsCsvPath}: cabeçalho inesperado.\n  esperado: ${HEADER.join(',')}\n  veio:     ${actual}`,
    );
  }

  const relations: FopdtRelation[] = [];
  const seen = new Set<string>();

  for (const { line, fields } of rows.slice(1)) {
    if (fields.length !== HEADER.length) {
      fail(line, `${String(fields.length)} colunas, esperadas ${String(HEADER.length)}`);
    }

    const id = field(fields, 'id').trim();
    if (id === '') fail(line, 'id vazio');
    if (seen.has(id)) fail(line, `id repetido: ${id}`);
    seen.add(id);

    const input = splitZone(field(fields, 'entrada'));
    const output = splitZone(field(fields, 'saida'));

    if (input.zoned !== output.zoned) {
      fail(
        line,
        `${id}: relação por zona precisa de '${ZONE_SUFFIX}' nas duas pontas — ` +
          `uma zona da entrada responde na zona correspondente da saída ` +
          `(entrada: ${String(input.zoned)}, saída: ${String(output.zoned)})`,
      );
    }

    resolveInput(input.tag, line, id);
    resolveOutput(output.tag, line, id);

    const kp = Number(field(fields, 'kp_por_unidade').trim());
    if (!Number.isFinite(kp)) {
      fail(line, `${id}: kp_por_unidade não é um número: ${field(fields, 'kp_por_unidade')}`);
    }
    if (kp === 0) {
      fail(line, `${id}: kp_por_unidade é zero — uma relação sem ganho não é relação`);
    }

    const step = parseStep(field(fields, 'degrau_entrada'), line);
    const inputVariable = processVariable(input.tag);

    if (inputVariable && !unitsMatch(step.unit, inputVariable.unit)) {
      fail(
        line,
        `${id}: degrau em '${step.unit || '(sem unidade)'}' mas ${input.tag} está em ` +
          `'${inputVariable.unit}' no catálogo. Se as duas formas são a mesma unidade, ` +
          'declare o par em UNIT_EQUIVALENCES.',
      );
    }

    const deadTimeS = Number(field(fields, 'tempo_morto_s').trim());
    if (!Number.isFinite(deadTimeS) || deadTimeS < 0) {
      fail(line, `${id}: tempo_morto_s precisa ser um número não negativo`);
    }

    relations.push({
      id,
      input: input.tag,
      output: output.tag,
      zoned: input.zoned,
      step,
      kp,
      kpUnit: field(fields, 'unidade_kp').trim(),
      deadTimeS,
      tauS: positiveNumber(field(fields, 'tau_s'), line, 'tau_s'),
      note: text(field(fields, 'observacao')),
      derivedFrom: null,
      source: 'B',
    });
  }

  if (relations.length === 0) throw new Error(`${relationsCsvPath}: nenhuma relação encontrada`);

  return relations;
}
