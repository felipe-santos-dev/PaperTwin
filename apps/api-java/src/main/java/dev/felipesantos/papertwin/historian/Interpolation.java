package dev.felipesantos.papertwin.historian;

import dev.felipesantos.papertwin.historian.Samples.Sample;
import java.util.ArrayList;
import java.util.List;

/** Leitura de um ponto entre dois valores arquivados. */
public final class Interpolation {

  /** De onde o valor lido veio. */
  public enum Kind {
    EXATA("exata"),
    INTERPOLADA("interpolada"),
    EXTRAPOLADA("extrapolada");

    private final String label;

    Kind(String label) {
      this.label = label;
    }

    public String label() {
      return label;
    }
  }

  public record ReadValue(long t, double v, Kind kind) {}

  private Interpolation() {}

  /**
   * Interpola linearmente entre dois pontos.
   *
   * <p>Com {@code before} e {@code after} no mesmo instante, devolve o {@code after}: dois valores
   * no mesmo instante não definem reta, e o mais recente é o que vale.
   */
  public static double interpolate(Sample before, Sample after, long t) {
    long span = after.t() - before.t();
    if (span <= 0) {
      return after.v();
    }

    double fraction = (double) (t - before.t()) / span;
    return before.v() + (after.v() - before.v()) * fraction;
  }

  /**
   * O valor num instante, dadas as âncoras de cada lado.
   *
   * <p>{@code before} é o último arquivado em {@code t} ou antes; {@code after} é o primeiro
   * depois. Qualquer um pode faltar — nas bordas do arquivo — e aí a leitura é extrapolada.
   */
  public static ReadValue readAt(long t, Sample before, Sample after) {
    if (before != null && before.t() == t) {
      return new ReadValue(t, before.v(), Kind.EXATA);
    }
    if (after != null && after.t() == t) {
      return new ReadValue(t, after.v(), Kind.EXATA);
    }
    if (before != null && after != null) {
      return new ReadValue(t, interpolate(before, after, t), Kind.INTERPOLADA);
    }
    if (before != null) {
      return new ReadValue(t, before.v(), Kind.EXTRAPOLADA);
    }
    if (after != null) {
      return new ReadValue(t, after.v(), Kind.EXTRAPOLADA);
    }
    return null;
  }

  /**
   * A média no tempo de uma série arquivada, pela regra do trapézio.
   *
   * <p>Esta é a diferença que separa uma média certa de uma errada num historiador comprimido. Um
   * {@code avg(valor)} do SQL dá a média <b>dos pontos</b>, e os pontos não estão igualmente
   * espaçados: um trecho agitado tem dezenas de pontos e um trecho parado tem um. A média dos
   * pontos pesaria o trecho agitado dezenas de vezes mais, e a resposta sairia puxada para onde o
   * processo se mexeu.
   *
   * <p>A média no tempo pesa cada trecho pela duração dele, e usa o trapézio porque a leitura
   * entre dois pontos é linear — a mesma regra da interpolação. Com degrau, a média de uma rampa
   * sairia deslocada meio passo.
   *
   * <p>O intervalo é recortado em {@code [from, to]}: as pontas são interpoladas, para a média de
   * 14h às 15h não depender de onde caiu o ponto arquivado mais próximo.
   */
  public static Double timeWeightedAverage(List<Sample> samples, long from, long to) {
    if (to <= from) {
      return null;
    }

    var inside = samples.stream().filter(s -> s.t() >= from && s.t() <= to).toList();

    Sample before = null;
    for (var sample : samples) {
      if (sample.t() < from) {
        before = sample;
      }
    }

    Sample after = samples.stream().filter(s -> s.t() > to).findFirst().orElse(null);

    var atFrom = readAt(from, before, inside.isEmpty() ? after : inside.getFirst());
    var atTo = readAt(to, inside.isEmpty() ? before : inside.getLast(), after);
    if (atFrom == null || atTo == null) {
      return null;
    }

    var path = new ArrayList<Sample>();
    path.add(new Sample(from, atFrom.v()));
    inside.stream().filter(s -> s.t() > from && s.t() < to).forEach(path::add);
    path.add(new Sample(to, atTo.v()));

    double area = 0;
    for (int i = 1; i < path.size(); i++) {
      var a = path.get(i - 1);
      var b = path.get(i);
      area += (a.v() + b.v()) / 2 * (b.t() - a.t());
    }

    return area / (to - from);
  }
}
