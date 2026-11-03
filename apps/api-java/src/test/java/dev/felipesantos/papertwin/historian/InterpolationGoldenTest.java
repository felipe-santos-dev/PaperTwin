package dev.felipesantos.papertwin.historian;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import dev.felipesantos.papertwin.golden.Golden;
import dev.felipesantos.papertwin.historian.Samples.Sample;
import java.util.ArrayList;
import java.util.List;
import org.assertj.core.data.Offset;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** A leitura e a média no tempo contra o gabarito da implementação TypeScript. */
class InterpolationGoldenTest {

  private static final JsonNode GOLDEN = Golden.read("historian/interpolation.json");
  private static final Offset<Double> TOLERANCE =
      Offset.offset(GOLDEN.get("tolerance").asDouble());

  private static List<Sample> archived() {
    var out = new ArrayList<Sample>();
    for (var node : GOLDEN.get("archived")) {
      out.add(new Sample(node.get("t").asLong(), node.get("v").asDouble()));
    }
    return out;
  }

  private static Sample before(List<Sample> samples, long t) {
    Sample found = null;
    for (var sample : samples) {
      if (sample.t() <= t) {
        found = sample;
      }
    }
    return found;
  }

  private static Sample after(List<Sample> samples, long t) {
    return samples.stream().filter(s -> s.t() > t).findFirst().orElse(null);
  }

  @Test
  @DisplayName("readAt bate com o gabarito, inclusive no tipo da leitura")
  void reads() {
    var samples = archived();

    for (var node : GOLDEN.get("reads")) {
      long t = node.get("t").asLong();
      var expected = node.get("expected");
      var actual = Interpolation.readAt(t, before(samples, t), after(samples, t));

      if (expected.isNull()) {
        assertThat(actual).as("leitura em %d", t).isNull();
        continue;
      }

      assertThat(actual).as("leitura em %d", t).isNotNull();
      assertThat(actual.v()).as("valor em %d", t).isCloseTo(expected.get("v").asDouble(), TOLERANCE);

      // o tipo da leitura é tão importante quanto o valor: uma extrapolação
      // apresentada como medida é uma invenção com cara de dado
      assertThat(actual.kind().label())
          .as("tipo da leitura em %d", t)
          .isEqualTo(expected.get("kind").asText());
    }
  }

  @Test
  @DisplayName("a interpolação linear bate")
  void interpolates() {
    for (var node : GOLDEN.get("interpolate")) {
      var before = new Sample(node.get("before").get("t").asLong(), node.get("before").get("v").asDouble());
      var after = new Sample(node.get("after").get("t").asLong(), node.get("after").get("v").asDouble());

      assertThat(Interpolation.interpolate(before, after, node.get("t").asLong()))
          .isCloseTo(node.get("expected").asDouble(), TOLERANCE);
    }
  }

  @Test
  @DisplayName("a média no tempo bate, com as pontas interpoladas")
  void timeWeightedAverage() {
    var samples = archived();

    for (var node : GOLDEN.get("timeWeightedAverage")) {
      long from = node.get("from").asLong();
      long to = node.get("to").asLong();

      assertThat(Interpolation.timeWeightedAverage(samples, from, to))
          .as("média de %d a %d", from, to)
          .isCloseTo(node.get("expected").asDouble(), TOLERANCE);
    }
  }

  @Test
  @DisplayName("a média no tempo não é a média dos pontos, e é essa a razão de existir")
  void differsFromPointAverage() {
    /*
     * A série é desigual de propósito: um trecho parado com um ponto só e um
     * trecho agitado com vários. Um avg() do SQL pesaria o trecho agitado
     * dezenas de vezes mais, e a resposta sairia puxada para onde o processo se
     * mexeu — que é exatamente o viés que a média no tempo existe para evitar.
     */
    var samples = archived();
    long from = samples.getFirst().t();
    long to = samples.getLast().t();

    double byTime = Interpolation.timeWeightedAverage(samples, from, to);
    double byPoint = samples.stream().mapToDouble(Sample::v).average().orElseThrow();

    assertThat(byTime).isNotCloseTo(byPoint, Offset.offset(0.5));
    assertThat(byTime)
        .as("a maior parte da janela o ponto esteve perto de 100")
        .isLessThan(byPoint);
  }

  @Test
  @DisplayName("janela invertida ou de duração zero não tem média")
  void emptyWindow() {
    var samples = archived();
    long t = samples.getFirst().t();

    assertThat(Interpolation.timeWeightedAverage(samples, t, t)).isNull();
    assertThat(Interpolation.timeWeightedAverage(samples, t + 1000, t)).isNull();
  }
}
