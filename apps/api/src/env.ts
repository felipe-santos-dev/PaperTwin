import { z } from 'zod';

/** Versão do serviço, injetada pelo npm ao rodar via script. */
export const SERVICE_VERSION = process.env['npm_package_version'] ?? '0.0.0';

const isUrl = (value: string): boolean => URL.canParse(value);

/** String vazia no `.env` conta como "não definido". */
const blankAsUndefined = (value: unknown): unknown => (value === '' ? undefined : value);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(3333),
  HOST: z.string().min(1).default('127.0.0.1'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Vazio em dev: a camada de dados cai para o PGlite embutido. */
  DATABASE_URL: z.preprocess(
    blankAsUndefined,
    z.string().refine(isUrl, 'DATABASE_URL precisa ser uma URL de conexão válida').optional(),
  ),
  /** Diretório do PGlite. Vazio mantém o banco em memória. */
  PGLITE_DIR: z.preprocess(blankAsUndefined, z.string().min(1).optional()),
  /** Semeia os ativos e gera a série simulada ao subir. */
  SEED_ON_BOOT: z
    .preprocess((v) => (v === undefined ? undefined : v === 'true' || v === '1'), z.boolean())
    .default(true),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Lê e valida a configuração do processo.
 *
 * @throws {Error} com todos os problemas encontrados, para o processo falhar
 *   na largada em vez de quebrar no primeiro uso de uma variável errada.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (parsed.success) return parsed.data;

  const problems = parsed.error.issues
    .map((issue) => `  ${issue.path.join('.') || '(raiz)'}: ${issue.message}`)
    .join('\n');
  throw new Error(`Configuração inválida:\n${problems}`);
}
