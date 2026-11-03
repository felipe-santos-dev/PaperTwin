package dev.felipesantos.papertwin.historian;

/** Os tipos de amostra do historiador. */
public final class Samples {

  /**
   * Uma amostra: instante e valor.
   *
   * @param t instante em milissegundos do epoch — a mesma base que o resto do simulador usa
   */
  public record Sample(long t, double v) {}

  /** Uma amostra arquivada, com o porquê. */
  public record ArchivedSample(long t, double v, ArchiveReason reason) {

    public Sample sample() {
      return new Sample(t, v);
    }
  }

  /** Uma amostra com o ponto a que pertence — o que vai para as tabelas. */
  public record PointSample(int pointId, long t, double v) {}

  /** Uma amostra arquivada com o ponto a que pertence. */
  public record PointArchivedSample(int pointId, long t, double v, ArchiveReason reason) {}

  private Samples() {}
}
