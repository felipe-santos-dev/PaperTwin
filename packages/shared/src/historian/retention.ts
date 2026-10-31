import { HISTORIAN_POINTS } from './points';

/**
 * Quanto o historiador guarda, e a conta que decide isso.
 *
 * O banco é o plano gratuito do Neon: **cerca de 0,5 GB**. Não é um detalhe de
 * hospedagem, é a restrição que desenha o historiador — num banco sem teto, a
 * resposta seria guardar tudo e nunca apagar.
 *
 * ## A conta
 *
 * São {@link HISTORIAN_POINT_COUNT} pontos (68 tags próprias do catálogo mais 7
 * padrões por cilindro vezes os 36 cilindros do modelo, menos os ensaios de
 * laboratório, que não são arquivados).
 *
 * Uma linha do arquivo custa cerca de **{@link ARCHIVE_ROW_BYTES} bytes**:
 * ~24 B de cabeçalho de tupla, 8 do instante, 8 do valor, 2+2 do ponto e da
 * razão com o alinhamento, mais ~31 B da entrada no índice primário. As colunas
 * são declaradas na ordem 8-8-2-2 de propósito: declaradas 2-8-8-2, o
 * alinhamento do `timestamptz` custaria 6 bytes de enchimento por linha, 13 %
 * da tabela maior do banco.
 *
 * Com {@link ARCHIVE_BUDGET_MB} MB reservados ao arquivo, cabem cerca de
 * {@link ARCHIVE_ROW_BUDGET} linhas. Divididas por {@link HISTORIAN_POINT_COUNT}
 * pontos e por {@link ARCHIVE_RETENTION_DAYS} dias, dão
 * {@link ARCHIVE_ROWS_PER_POINT_PER_DAY} linhas por ponto por dia — cerca de uma
 * a cada {@link ARCHIVE_TARGET_INTERVAL_S} segundos.
 *
 * **É um orçamento, não uma previsão.** A taxa de verdade depende do ruído da
 * simulação contra o `compDev` de cada tag, e só se sabe medindo. Se a taxa
 * medida ficar acima disso, o botão é `ARCHIVE_RETENTION_DAYS` — e não o
 * `compDev`, que vem da lista base.
 *
 * ## Por que o bruto é um buffer rolante
 *
 * Um PI de verdade **não guarda valor bruto**: o filtro de exceção roda na
 * coleta e o que ele descarta não existe em lugar nenhum. A tabela de bruto
 * existe aqui para que se possa *ver* o que o filtro jogou fora — é material de
 * demonstração, não de operação. Por isso são
 * {@link RAW_RETENTION_MINUTES} minutos e não dias: a 1 s, os
 * {@link HISTORIAN_POINT_COUNT} pontos geram ~{@link RAW_ROWS_PER_MINUTE} mil
 * linhas por minuto, e uma semana de bruto sozinha passaria de 100 GB.
 */

/** Nº de pontos arquivados. */
export const HISTORIAN_POINT_COUNT = HISTORIAN_POINTS.length;

/** Custo estimado de uma linha do arquivo, em bytes, com índice. */
export const ARCHIVE_ROW_BYTES = 88;

/** Espaço reservado ao arquivo, em MB, dos ~500 do Neon Free. */
export const ARCHIVE_BUDGET_MB = 300;

/** Retenção do arquivo, em dias. É esta a constante que se ajusta. */
export const ARCHIVE_RETENTION_DAYS = 7;

/** Retenção do bruto, em minutos. */
export const RAW_RETENTION_MINUTES = 15;

/**
 * Teto de tempo entre dois valores arquivados do mesmo ponto, em segundos.
 *
 * **Suposição.** O PI chama isso de `CompMax` e usa oito horas por padrão. Uma
 * hora é mais apertado de propósito: com oito, um turno estável teria um ponto
 * só no arquivo, e a consulta de "plot values" — que precisa de pelo menos um
 * valor por coluna de pixel — desenharia uma reta onde há uma reta, mas sem
 * nenhuma marca de que o ponto estava vivo. Uma hora custa 24 linhas por ponto
 * por dia, o que é desprezível no orçamento.
 */
export const ARCHIVE_MAX_GAP_S = 3600;

/**
 * Teto de tempo entre dois valores que passam o filtro de exceção, em segundos.
 *
 * **Suposição**, o `ExcMax` do PI. Dez minutos: é o que garante que uma tag
 * parada continue dando sinal de vida à porta oscilante, que é quem decide o
 * arquivamento.
 */
export const EXCEPTION_MAX_GAP_S = 600;

/** Quantas linhas do arquivo cabem no orçamento. */
export const ARCHIVE_ROW_BUDGET = Math.floor((ARCHIVE_BUDGET_MB * 1_000_000) / ARCHIVE_ROW_BYTES);

/** Quantas linhas por ponto por dia o orçamento permite. */
export const ARCHIVE_ROWS_PER_POINT_PER_DAY = Math.floor(
  ARCHIVE_ROW_BUDGET / HISTORIAN_POINT_COUNT / ARCHIVE_RETENTION_DAYS,
);

/** O intervalo médio entre valores arquivados que o orçamento permite, em segundos. */
export const ARCHIVE_TARGET_INTERVAL_S = Math.round(86_400 / ARCHIVE_ROWS_PER_POINT_PER_DAY);

/** Linhas de bruto por minuto, a uma amostra por segundo por ponto. */
export const RAW_ROWS_PER_MINUTE = HISTORIAN_POINT_COUNT * 60;

/** Até quando o bruto é guardado, a partir de um instante. */
export function rawCutoff(now: Date): Date {
  return new Date(now.getTime() - RAW_RETENTION_MINUTES * 60_000);
}

/** Até quando o arquivo é guardado, a partir de um instante. */
export function archiveCutoff(now: Date): Date {
  return new Date(now.getTime() - ARCHIVE_RETENTION_DAYS * 86_400_000);
}

/** Quanto o arquivo ocupa, estimado a partir do nº de linhas. */
export function estimatedArchiveMb(rows: number): number {
  return (rows * ARCHIVE_ROW_BYTES) / 1_000_000;
}

/** Quanto do orçamento do arquivo está usado, em %. */
export function archiveBudgetUsedPct(rows: number): number {
  return (rows / ARCHIVE_ROW_BUDGET) * 100;
}
