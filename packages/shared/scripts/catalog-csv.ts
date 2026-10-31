import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { isPerCylinderName, isPerCylinderTag } from '../src/process/per-cylinder';
import type {
  Confidence,
  PerCylinderPattern,
  ProcessVariable,
  VariableSource,
} from '../src/process/types';

/**
 * Leitura de `catalogo-base.csv`.
 *
 * Mora em `scripts/` porque é ferramenta de build, não domínio: quem consome o
 * catálogo em tempo de execução importa `src/process/catalog.ts`, que já vem
 * gerado. O gerador e o teste de conformidade usam este mesmo parser de
 * propósito — o que o teste verifica não é o parser, é se o TS no disco está
 * atrasado em relação ao CSV.
 *
 * O CSV é lido sem suporte a aspas, e `assertNoQuotes` garante que isso
 * continua válido: nenhum campo da lista base tem vírgula dentro, então
 * `split(',')` é exato. Se um dia tiver, o parser falha em vez de truncar o
 * campo em silêncio.
 */

const CATALOG_CSV = new URL('../../../reference/research/catalogo-base.csv', import.meta.url);

/** Caminho do CSV no disco, para mensagens de erro. */
export const catalogCsvPath = fileURLToPath(CATALOG_CSV);

/** Cabeçalho esperado, na ordem exata. Uma coluna nova quebra aqui. */
const HEADER = [
  'tag',
  'nome',
  'area',
  'grupo',
  'unidade',
  'min',
  'max',
  'alvo',
  'LL',
  'L',
  'H',
  'HH',
  'controlada',
  'mv',
  'exc_dev',
  'comp_dev',
  'fonte',
  'confianca',
  'observacao',
] as const;

const SOURCES: readonly VariableSource[] = ['B', 'ISO 20816-3', 'assumed'];
const CONFIDENCES: readonly Confidence[] = ['alta', 'média', 'baixa'];

export interface Catalog {
  /** Variáveis com tag própria, na ordem do CSV. */
  readonly concrete: readonly ProcessVariable[];
  /** Padrões que valem uma vez por cilindro secador. */
  readonly patterns: readonly PerCylinderPattern[];
}

function fail(line: number, message: string): never {
  throw new Error(`${catalogCsvPath}:${String(line)} — ${message}`);
}

/** Campo vazio é ausência, não zero nem string vazia. */
function text(raw: string): string | null {
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
}

function number(raw: string, line: number, column: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) fail(line, `coluna ${column} não é um número: ${trimmed}`);
  return parsed;
}

function required(value: number | null, line: number, column: string): number {
  if (value === null) fail(line, `coluna ${column} é obrigatória`);
  return value;
}

function assertNoQuotes(content: string): void {
  if (content.includes('"')) {
    throw new Error(
      `${catalogCsvPath} tem aspas. O parser divide em vírgulas sem tratar campos entre aspas; ` +
        'use ponto e vírgula dentro do campo ou ensine o parser a tratar aspas.',
    );
  }
}

/** Divide em linhas, tolerando CRLF e a linha vazia do fim do arquivo. */
function rowsOf(content: string): { readonly line: number; readonly fields: string[] }[] {
  return content
    .split('\n')
    .map((row, index) => ({ line: index + 1, text: row.replace(/\r$/, '') }))
    .filter((row) => row.text.trim() !== '')
    .map((row) => ({ line: row.line, fields: row.text.split(',') }));
}

/** Lê um campo pelo nome da coluna. */
function field(fields: readonly string[], column: (typeof HEADER)[number]): string {
  const index = HEADER.indexOf(column);
  return fields[index] ?? '';
}

function parseSource(raw: string, line: number): VariableSource {
  const value = raw.trim();
  const found = SOURCES.find((source) => source === value);
  if (!found) fail(line, `fonte desconhecida: ${value}. Use ${SOURCES.join(', ')}`);
  return found;
}

function parseConfidence(raw: string, line: number): Confidence {
  const value = raw.trim();
  const found = CONFIDENCES.find((confidence) => confidence === value);
  if (!found) fail(line, `confiança desconhecida: ${value}. Use ${CONFIDENCES.join(', ')}`);
  return found;
}

function parseControlled(raw: string, line: number): boolean {
  const value = raw.trim();
  if (value === 'sim') return true;
  if (value === 'não') return false;
  return fail(line, `coluna controlada deve ser 'sim' ou 'não', veio: ${value}`);
}

/**
 * Checagens que valem para qualquer linha.
 *
 * Os limites de alarme podem cair fora de `min`–`max` de propósito, então a
 * única coisa exigida deles é a ordem entre os que existem.
 */
function validate(variable: ProcessVariable, line: number): void {
  const { min, max, target, limits, tag } = variable;

  if (min > max) fail(line, `${tag}: min ${String(min)} acima de max ${String(max)}`);

  if (target !== null && (target < min || target > max)) {
    fail(line, `${tag}: alvo ${String(target)} fora da faixa ${String(min)}–${String(max)}`);
  }

  const ordered = [limits.ll, limits.l, limits.h, limits.hh].filter(
    (value): value is number => value !== null,
  );
  for (let i = 1; i < ordered.length; i += 1) {
    const previous = ordered[i - 1];
    const current = ordered[i];
    if (previous === undefined || current === undefined) continue;
    if (previous > current) {
      fail(line, `${tag}: limites fora de ordem — LL ≤ L ≤ H ≤ HH não se sustenta`);
    }
  }
}

/** Lê o catálogo do disco, já validado. */
export async function readCatalog(): Promise<Catalog> {
  const content = await readFile(CATALOG_CSV, 'utf8');
  assertNoQuotes(content);

  const rows = rowsOf(content);
  const header = rows[0];
  if (!header) throw new Error(`${catalogCsvPath} está vazio`);

  const actual = header.fields.map((column) => column.trim()).join(',');
  if (actual !== HEADER.join(',')) {
    throw new Error(
      `${catalogCsvPath}: cabeçalho inesperado.\n  esperado: ${HEADER.join(',')}\n  veio:     ${actual}`,
    );
  }

  const concrete: ProcessVariable[] = [];
  const patterns: PerCylinderPattern[] = [];
  const seen = new Set<string>();

  for (const { line, fields } of rows.slice(1)) {
    if (fields.length !== HEADER.length) {
      fail(line, `${String(fields.length)} colunas, esperadas ${String(HEADER.length)}`);
    }

    const tag = field(fields, 'tag').trim();
    const name = field(fields, 'nome').trim();
    if (tag === '') fail(line, 'tag vazia');
    if (seen.has(tag)) fail(line, `tag repetida: ${tag}`);
    seen.add(tag);

    const common = {
      area: field(fields, 'area').trim(),
      group: field(fields, 'grupo').trim(),
      unit: field(fields, 'unidade').trim(),
      min: required(number(field(fields, 'min'), line, 'min'), line, 'min'),
      max: required(number(field(fields, 'max'), line, 'max'), line, 'max'),
      target: number(field(fields, 'alvo'), line, 'alvo'),
      limits: {
        ll: number(field(fields, 'LL'), line, 'LL'),
        l: number(field(fields, 'L'), line, 'L'),
        h: number(field(fields, 'H'), line, 'H'),
        hh: number(field(fields, 'HH'), line, 'HH'),
      },
      controlled: parseControlled(field(fields, 'controlada'), line),
      mv: text(field(fields, 'mv')),
      compression: {
        excDev: number(field(fields, 'exc_dev'), line, 'exc_dev'),
        compDev: number(field(fields, 'comp_dev'), line, 'comp_dev'),
      },
      source: parseSource(field(fields, 'fonte'), line),
      confidence: parseConfidence(field(fields, 'confianca'), line),
      note: text(field(fields, 'observacao')),
    };

    const patternTag = isPerCylinderTag(tag);
    const patternName = isPerCylinderName(name);

    if (patternTag !== patternName) {
      fail(
        line,
        `${tag}: o marcador 'nn' precisa aparecer na tag e no nome, ou em nenhum dos dois ` +
          `(tag: ${String(patternTag)}, nome: ${String(patternName)})`,
      );
    }

    if (patternTag) {
      patterns.push({ ...common, tagPattern: tag, namePattern: name });
      validate({ ...common, tag, name, cylinder: null, steamGroup: null }, line);
    } else {
      const variable: ProcessVariable = { ...common, tag, name, cylinder: null, steamGroup: null };
      validate(variable, line);
      concrete.push(variable);
    }
  }

  if (patterns.length === 0) {
    throw new Error(
      `${catalogCsvPath}: nenhum padrão por cilindro encontrado. ` +
        "As linhas por cilindro usam 'nn' na tag, como VI-51nnA.",
    );
  }

  return { concrete, patterns };
}
