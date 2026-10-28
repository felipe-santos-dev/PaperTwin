import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/**
 * Carregador das migrations.
 *
 * Os arquivos `.sql` ficam em `migrations/` e são lidos do disco, e não
 * embutidos no bundle: assim o mesmo arquivo roda no `tsx` em desenvolvimento,
 * no Vitest e no `node dist/`, sem um caminho mágico por ambiente. O build
 * copia a pasta para `dist/` (veja `scripts/copy-migrations.mjs`).
 */

const MIGRATIONS_DIR = fileURLToPath(new URL('./migrations/', import.meta.url));

export interface Migration {
  /** Prefixo numérico do arquivo, que define a ordem. Ex.: `001`. */
  readonly version: string;
  readonly name: string;
  readonly sql: string;
}

const FILENAME = /^(\d{3})_([a-z0-9_]+)\.sql$/;

/** Lê as migrations do disco, já em ordem de versão. */
export async function loadMigrations(): Promise<Migration[]> {
  const entries = await readdir(MIGRATIONS_DIR);

  const migrations = await Promise.all(
    entries
      .filter((entry) => entry.endsWith('.sql'))
      .sort()
      .map(async (entry): Promise<Migration> => {
        const parsed = FILENAME.exec(entry);
        if (!parsed?.[1] || !parsed[2]) {
          throw new Error(
            `Migration com nome fora do padrão: ${entry}. Use NNN_nome_em_minusculas.sql`,
          );
        }
        return {
          version: parsed[1],
          name: parsed[2],
          sql: await readFile(MIGRATIONS_DIR + entry, 'utf8'),
        };
      }),
  );

  const versions = new Set(migrations.map((m) => m.version));
  if (versions.size !== migrations.length) {
    throw new Error('Duas migrations com a mesma versão');
  }

  return migrations;
}

/** Tabela de controle, criada antes de qualquer migration. */
export const MIGRATION_TABLE_SQL = `
  create table if not exists schema_migration (
    version    text primary key,
    name       text        not null,
    applied_at timestamptz not null default now()
  )
`;
