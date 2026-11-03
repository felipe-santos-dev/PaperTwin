package dev.felipesantos.papertwin.vibration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.JsonNode;
import dev.felipesantos.papertwin.golden.Golden;
import dev.felipesantos.papertwin.vibration.Bearings.DegradationScenario;
import java.util.ArrayList;
import java.util.List;
import org.assertj.core.data.Offset;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;

/** O simulador de mancal contra o gabarito da implementação TypeScript. */
class BearingsGoldenTest {

  private static final JsonNode GOLDEN = Golden.read("vibration/bearings.json");
  private static final Offset<Double> TOLERANCE =
      Offset.offset(GOLDEN.get("tolerance").asDouble());
  private static final int SEED = GOLDEN.get("seed").asInt();

  private static DegradationScenario scenario() {
    var node = GOLDEN.get("scenario");
    return new DegradationScenario(
        node.get("assetTag").asText(), node.get("fromTick").asLong(), node.get("toTick").asLong());
  }

  @Test
  @DisplayName("a assinatura de cada mancal bate com o gabarito")
  void signatures() {
    for (var entry : GOLDEN.get("signatures")) {
      var tag = entry.get("tag").asText();
      var expected = entry.get("expected");
      var actual = Bearings.signatureOf(tag);

      assertThat(actual.rmsBase()).as("%s: base RMS", tag)
          .isCloseTo(expected.get("rmsBase").asDouble(), TOLERANCE);
      assertThat(actual.tempBase()).as("%s: base de temperatura", tag)
          .isCloseTo(expected.get("tempBase").asDouble(), TOLERANCE);
      assertThat(actual.envelopeBase()).as("%s: base do envelope", tag)
          .isCloseTo(expected.get("envelopeBase").asDouble(), TOLERANCE);
    }
  }

  @Test
  @DisplayName("a linha de base cai nas zonas A e B: um mancal saudável não acusa nada")
  void healthyBaseline() {
    var limits = Iso20816.limitsOf(Iso20816.DRYER_BEARING);

    for (var entry : GOLDEN.get("signatures")) {
      var tag = entry.get("tag").asText();
      var base = Bearings.signatureOf(tag).rmsBase();

      assertThat(base).as("%s", tag).isBetween(0.8, 2.0);
      assertThat(Iso20816.classify(base, limits))
          .as("%s", tag)
          .isIn(Iso20816.Zone.A, Iso20816.Zone.B);
    }
  }

  @TestFactory
  @DisplayName("cada amostra bate com o gabarito, arredondamento incluído")
  List<DynamicTest> samples() {
    var scenario = scenario();
    var limits = Iso20816.limitsOf(Iso20816.DRYER_BEARING);
    var tests = new ArrayList<DynamicTest>();

    for (var entry : GOLDEN.get("samples")) {
      var tag = entry.get("tag").asText();
      long tick = entry.get("tick").asLong();
      var expected = entry.get("expected");

      tests.add(
          DynamicTest.dynamicTest(
              "%s no passo %d".formatted(tag, tick),
              () -> {
                var sample = Bearings.sampleAt(SEED, tick, tag, scenario);

                // igualdade exata, não aproximada: os valores saem arredondados
                // na origem, e é o arredondamento que este caso cobra
                assertThat(sample.rmsMmS()).as("RMS").isEqualTo(expected.get("rmsMmS").asDouble());
                assertThat(sample.tempC()).as("temperatura").isEqualTo(expected.get("tempC").asDouble());
                assertThat(sample.envelopeGe()).as("envelope")
                    .isEqualTo(expected.get("envelopeGe").asDouble());

                // o progresso que vale para esta tag: zero quando o cenário é de
                // outro mancal, que é o caso de dois dos três do gabarito
                double applied =
                    tag.equals(scenario.assetTag()) ? Bearings.progress(scenario, tick) : 0;

                assertThat(applied)
                    .as("progresso aplicado a %s", tag)
                    .isCloseTo(entry.get("progress").asDouble(), TOLERANCE);

                assertThat(Iso20816.classify(sample.rmsMmS(), limits).name())
                    .as("zona")
                    .isEqualTo(expected.get("zone").asText());
              }));
    }

    return tests;
  }

  @Nested
  @DisplayName("como o defeito se manifesta")
  class Progression {

    @Test
    @DisplayName("o envelope sobe na frente da velocidade")
    void envelopeLeads() {
      // é por isso que se mede envelope: ele pega impacto de rolamento semanas
      // antes de a velocidade RMS sair da faixa normal
      var scenario = scenario();
      var tag = scenario.assetTag();
      double span = scenario.toTick() - scenario.fromTick();

      var early = Bearings.sampleAt(SEED, (long) (scenario.fromTick() + span * 0.25), tag, scenario);
      var baseline = Bearings.signatureOf(tag);

      double rmsGrowth = (early.rmsMmS() - baseline.rmsBase()) / (Bearings.DEGRADED_PEAK_MM_S - baseline.rmsBase());
      double envelopeGrowth = (early.envelopeGe() - baseline.envelopeBase()) / 4.2;

      assertThat(envelopeGrowth)
          .as("a um quarto do caminho, o envelope já subiu mais que a velocidade")
          .isGreaterThan(rmsGrowth);
    }

    @Test
    @DisplayName("a degradação acelera: a segunda metade sobe mais que a primeira")
    void accelerates() {
      var scenario = scenario();
      var tag = scenario.assetTag();
      long span = scenario.toTick() - scenario.fromTick();

      double start = Bearings.sampleAt(SEED, scenario.fromTick(), tag, scenario).rmsMmS();
      double middle = Bearings.sampleAt(SEED, scenario.fromTick() + span / 2, tag, scenario).rmsMmS();
      double end = Bearings.sampleAt(SEED, scenario.toTick(), tag, scenario).rmsMmS();

      assertThat(end - middle)
          .as("uma trinca se propaga cada vez mais rápido")
          .isGreaterThan(middle - start);
    }

    @Test
    @DisplayName("termina na zona D, e fora da janela fica no valor da borda")
    void endsInZoneD() {
      var scenario = scenario();
      var tag = scenario.assetTag();
      var limits = Iso20816.limitsOf(Iso20816.DRYER_BEARING);

      assertThat(Bearings.progress(scenario, scenario.fromTick() - 10_000)).isZero();
      assertThat(Bearings.progress(scenario, scenario.toTick() + 10_000)).isEqualTo(1);

      var atEnd = Bearings.sampleAt(SEED, scenario.toTick(), tag, scenario);
      assertThat(Iso20816.classify(atEnd.rmsMmS(), limits)).isEqualTo(Iso20816.Zone.D);
    }

    @Test
    @DisplayName("o ruído não decide zona: 0,02 mm/s contra uma fronteira em 4,5")
    void noiseDoesNotDecideZone() {
      // com ruído maior, a série cruzaria a fronteira para cima e para baixo
      // várias vezes na subida, e a tela piscaria entre duas zonas
      var scenario = scenario();
      var tag = "MP1-SEC-G1-CS01-MLC"; // não degrada neste cenário
      var zones = new java.util.LinkedHashSet<Iso20816.Zone>();
      var limits = Iso20816.limitsOf(Iso20816.DRYER_BEARING);

      for (long tick = 0; tick < 2000; tick += 7) {
        zones.add(Iso20816.classify(Bearings.sampleAt(SEED, tick, tag, scenario).rmsMmS(), limits));
      }

      assertThat(zones).as("um mancal parado fica numa zona só").hasSize(1);
    }
  }

  @Nested
  @DisplayName("as zonas da norma")
  class Zones {

    @Test
    @DisplayName("um valor na fronteira pertence à zona melhor")
    void boundaryBelongsToBetterZone() {
      var limits = Iso20816.limitsOf(Iso20816.DRYER_BEARING);

      assertThat(Iso20816.classify(1.4, limits)).isEqualTo(Iso20816.Zone.A);
      assertThat(Iso20816.classify(2.8, limits)).isEqualTo(Iso20816.Zone.B);
      assertThat(Iso20816.classify(4.5, limits)).isEqualTo(Iso20816.Zone.C);
      assertThat(Iso20816.classify(4.5001, limits)).isEqualTo(Iso20816.Zone.D);
    }

    @Test
    @DisplayName("7,8 mm/s é zona D no grupo 2 rígido — o conceito de tela rotula errado")
    void conceptScreenIsWrong() {
      assertThat(Iso20816.classify(7.8, Iso20816.limitsOf(Iso20816.DRYER_BEARING)))
          .isEqualTo(Iso20816.Zone.D);
    }

    @Test
    @DisplayName("recusa leitura negativa ou não finita")
    void refusesInvalid() {
      var limits = Iso20816.limitsOf(Iso20816.DRYER_BEARING);

      assertThatThrownBy(() -> Iso20816.classify(-1, limits))
          .isInstanceOf(IllegalArgumentException.class);
      assertThatThrownBy(() -> Iso20816.classify(Double.NaN, limits))
          .isInstanceOf(IllegalArgumentException.class);
    }
  }
}
