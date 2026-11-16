import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { HELP, HELP_KEYS, type BlockHelp } from './help';

/**
 * A regra desta fase, cobrada no teste: **nenhum bloco sem ajuda**.
 *
 * O tipo já obriga `help` em `Panel` — painel sem a prop não compila. O que o
 * tipo não pega é o resto: uma chave que ficou órfã quando um painel saiu, um
 * texto que alguém deixou pela metade, e sobretudo um bloco novo desenhado à
 * mão, com a borda e o fundo do painel, que por não passar por `Panel` escapa
 * da regra inteira. Os três casos caem aqui.
 *
 * O teste lê o código-fonte. É incomum, e é de propósito: o que se quer provar
 * é uma propriedade do repositório, não do que a tela renderizou num teste.
 */

const SRC = join(import.meta.dirname, '..');

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, out);
    else if (entry.name.endsWith('.tsx') && !entry.name.endsWith('.test.tsx')) out.push(path);
  }
  return out;
}

/**
 * As props de cada `<Panel` do arquivo, como texto.
 *
 * Recorta do `<Panel` até o `>` que fecha a abertura da tag, ignorando os `>`
 * que estão dentro de `{...}` — `onClick={() => …}` tem um, e um corte ingênuo
 * pararia ali e acharia que o painel não tem `help`.
 */
function panelProps(source: string): string[] {
  const found: string[] = [];
  const open = /<Panel(?=[\s/>])/g;
  let match = open.exec(source);

  while (match) {
    let depth = 0;
    let end = -1;
    for (let i = match.index + '<Panel'.length; i < source.length; i += 1) {
      const char = source[i];
      if (char === '{') depth += 1;
      else if (char === '}') depth -= 1;
      else if (char === '>' && depth === 0) {
        end = i;
        break;
      }
    }
    expect(
      end,
      `<Panel sem fechamento em ${source.slice(match.index, match.index + 60)}`,
    ).toBeGreaterThan(0);
    found.push(source.slice(match.index, end));
    match = open.exec(source);
  }

  return found;
}

const files = sourceFiles(SRC);
const panels = files.flatMap((file) =>
  panelProps(readFileSync(file, 'utf8')).map((props) => ({ file, props })),
);

describe('ajuda por bloco', () => {
  it('encontra os painéis do código', () => {
    // se este número cair a zero, o recorte quebrou e os outros testes passariam à toa
    expect(panels.length).toBeGreaterThanOrEqual(20);
  });

  it('nenhum painel sem texto de ajuda', () => {
    const semAjuda = panels
      .filter(({ props }) => !/\shelp="[a-z0-9.-]+"/.test(props))
      .map(({ file, props }) => `${file}: ${props.slice(0, 80).replace(/\s+/g, ' ')}`);

    expect(semAjuda).toEqual([]);
  });

  it('toda chave usada existe em help.ts', () => {
    const inventadas = panels
      .map(({ props }) => /\shelp="([a-z0-9.-]+)"/.exec(props)?.[1])
      .filter((key): key is string => key !== undefined)
      .filter((key) => !(key in HELP));

    expect(inventadas).toEqual([]);
  });

  it('nenhum texto sobrando', () => {
    const usadas = new Set(
      panels
        .map(({ props }) => /\shelp="([a-z0-9.-]+)"/.exec(props)?.[1])
        .filter((key): key is string => key !== undefined),
    );

    expect(HELP_KEYS.filter((key) => !usadas.has(key))).toEqual([]);
  });

  /**
   * Um bloco desenhado à mão não escapa da regra.
   *
   * A assinatura de um bloco é a borda e o fundo do painel juntos. Overlays
   * (`bg-panel/90`) e pontinhos de gráfico não contam: a busca exige `bg-panel`
   * inteiro, sem a barra da transparência.
   */
  it('todo bloco passa por Panel', () => {
    const soltos = files
      .filter((file) => !file.endsWith(join('ui', 'Panel.tsx')))
      .filter((file) => {
        const source = readFileSync(file, 'utf8');
        return /className="[^"]*\bborder-line\b[^"]*\bbg-panel(?![/\w-])[^"]*"/.test(source);
      });

    expect(soltos).toEqual([]);
  });
});

describe('os textos', () => {
  const entries = Object.entries(HELP) as [string, BlockHelp][];

  it('têm as três linhas, e nenhuma vazia', () => {
    for (const [key, text] of entries) {
      expect(text.shows.trim(), `${key}.shows`).not.toBe('');
      expect(text.read.trim(), `${key}.read`).not.toBe('');
      expect(text.click.trim(), `${key}.click`).not.toBe('');
    }
  });

  it('são curtos: ninguém lê um parágrafo no meio do turno', () => {
    const longos = entries.flatMap(([key, text]) =>
      (['shows', 'read', 'click'] as const)
        .filter((line) => text[line].length > 260)
        .map((line) => `${key}.${line}: ${String(text[line].length)} caracteres`),
    );

    expect(longos).toEqual([]);
  });

  it('terminam em ponto', () => {
    const semPonto = entries.flatMap(([key, text]) =>
      (['shows', 'read', 'click'] as const)
        .filter((line) => !text[line].trim().endsWith('.'))
        .map((line) => `${key}.${line}`),
    );

    expect(semPonto).toEqual([]);
  });
});
