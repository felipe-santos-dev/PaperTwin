package dev.felipesantos.papertwin.historian;

/**
 * O orçamento de espaço do historiador.
 *
 * <p>O Neon Free dá cerca de 0,5 GB, e o arquivo é a maior tabela do banco. Estas constantes são o
 * que transforma esse limite numa regra de retenção em vez de numa surpresa: o arquivo fica com
 * 300 MB, sete dias, e o que isso permite por ponto por dia sai da conta e não de um palpite.
 *
 * <p>O bruto é guardado em <b>minutos</b>, e não em dias. A 1 s, os 320 pontos geram ~19 mil linhas
 * por minuto, e uma semana de bruto sozinha passaria de 100 GB. Ele existe para que se possa
 * <i>ver</i> o que o filtro de exceção jogou fora — é material de demonstração, não de operação.
 */
public final class Retention {

  /** Custo estimado de uma linha do arquivo, em bytes, com índice. */
  public static final int ARCHIVE_ROW_BYTES = 88;

  /** Espaço reservado ao arquivo, em MB, dos ~500 do Neon Free. */
  public static final int ARCHIVE_BUDGET_MB = 300;

  /** Retenção do arquivo, em dias. É esta a constante que se ajusta. */
  public static final int ARCHIVE_RETENTION_DAYS = 7;

  /** Retenção do bruto, em minutos. */
  public static final int RAW_RETENTION_MINUTES = 15;

  /**
   * Teto de tempo entre dois valores arquivados, em segundos.
   *
   * <p><b>Suposição</b>, e mais apertada que o {@code CompMax} do PI, que usa oito horas. Com
   * oito, um turno estável teria um ponto só no arquivo, e a consulta de valores de plotagem —
   * que precisa de pelo menos um valor por coluna de pixel — desenharia uma reta onde há uma reta,
   * mas sem nenhuma marca de que o ponto estava vivo. Uma hora custa 24 linhas por ponto por dia,
   * desprezível no orçamento.
   */
  public static final int ARCHIVE_MAX_GAP_S = 3600;

  /**
   * Teto de tempo entre dois valores que passam o filtro de exceção, em segundos.
   *
   * <p><b>Suposição</b>, o {@code ExcMax} do PI. Dez minutos: é o que garante que uma tag parada
   * continue dando sinal de vida à porta oscilante, que é quem decide o arquivamento.
   */
  public static final int EXCEPTION_MAX_GAP_S = 600;

  private Retention() {}

  /** Quantas linhas do arquivo cabem no orçamento. */
  public static long archiveRowBudget() {
    return (long) ARCHIVE_BUDGET_MB * 1_000_000 / ARCHIVE_ROW_BYTES;
  }

  /** Quantas linhas por ponto por dia o orçamento permite. */
  public static long archiveRowsPerPointPerDay(int pointCount) {
    return archiveRowBudget() / pointCount / ARCHIVE_RETENTION_DAYS;
  }

  /** O intervalo médio entre valores arquivados que o orçamento permite, em segundos. */
  public static long archiveTargetIntervalS(int pointCount) {
    return Math.round(86_400.0 / archiveRowsPerPointPerDay(pointCount));
  }

  /** Linhas de bruto por minuto, a uma amostra por segundo por ponto. */
  public static long rawRowsPerMinute(int pointCount) {
    return (long) pointCount * 60;
  }
}
