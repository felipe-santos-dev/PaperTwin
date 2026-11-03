package dev.felipesantos.papertwin.simulation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.JsonNode;
import dev.felipesantos.papertwin.golden.Golden;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.TreeMap;
import org.assertj.core.data.Offset;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;

/**
 * A rede de processo contra o gabarito da implementação TypeScript.
 *
 * <p>Este é o teste que vale mais de todos os de J2. Ele não compara uma fórmula isolada: compara
 * o resultado de milhares de passos de uma rede com vinte e quatro relações, seis cascatas com
 * trava de integral, ruído correlacionado por tag e trinta e seis cilindros seguindo a saturação
 * do vapor do seu grupo. Se qualquer peça divergir — um bit no hash do ruído, a ordem de duas
 * etapas do passo, um arredondamento no tempo morto — o número na ponta não bate.
 */
class ProcessEngineGoldenTest {

  private static final JsonNode GOLDEN = Golden.read("simulation/tags.json");
  private static final Offset<Double> TOLERANCE =
      Offset.offset(GOLDEN.get("tolerance").asDouble());
  private static final int SEED = GOLDEN.get("seed").asInt();

  private static List<String> tags() {
    var tags = new ArrayList<String>();
    for (var tag : GOLDEN.get("tags")) {
      tags.add(tag.asText());
    }
    return tags;
  }

  @TestFactory
  @DisplayName("as vinte tags batem com o gabarito em cada instante")
  List<DynamicTest> snapshots() {
    var tags = tags();
    var tests = new ArrayList<DynamicTest>();

    for (var snapshot : GOLDEN.get("snapshots")) {
      long tick = snapshot.get("tick").asLong();
      var expected = snapshot.get("expected");

      tests.add(
          DynamicTest.dynamicTest(
              "passo %d".formatted(tick),
              () -> {
                var engine = ProcessEngine.at(0, SEED);
                engine.runTo(tick);

                var divergent = new TreeMap<String, String>();

                for (var tag : tags) {
                  checkTag(divergent, tag, "medida", engine.measured(tag), expected.get("measured"));
                  checkTag(divergent, tag, "verdade", engine.truth(tag), expected.get("truth"));
                }

                assertThat(divergent).as("tags divergentes no passo %d", tick).isEmpty();
              }));
    }

    return tests;
  }

  private static void checkTag(
      TreeMap<String, String> divergent, String tag, String kind, Double actual, JsonNode expected) {

    var node = expected.get(tag);

    /*
     * Uma tag sem valor no gabarito é defeito do gabarito, não caso a tratar.
     *
     * A primeira versão desta lista tinha quatro tags inventadas, que não
     * existem no catálogo: as duas implementações devolviam "sem valor" e o
     * caso passava sem comparar nada — um teste verde que não testava.
     */
    if (node == null || node.isNull()) {
      divergent.put(
          "%s (%s)".formatted(tag, kind),
          "o gabarito não tem valor para esta tag; ela existe no catálogo?");
      return;
    }

    if (actual == null) {
      divergent.put("%s (%s)".formatted(tag, kind), "sem valor; o gabarito tem " + node.asDouble());
      return;
    }

    double wanted = node.asDouble();
    if (Math.abs(actual - wanted) > Math.max(TOLERANCE.value, Math.abs(wanted) * TOLERANCE.value)) {
      divergent.put("%s (%s)".formatted(tag, kind), "%s, esperado %s".formatted(actual, wanted));
    }
  }

  @Nested
  @DisplayName("dormir e acordar")
  class Resume {

    @Test
    @DisplayName("rodar em dois pedaços dá o mesmo que rodar de uma vez")
    void matchesGolden() {
      var resume = GOLDEN.get("resume");
      long splitAt = resume.get("splitAtTick").asLong();
      long toTick = resume.get("toTick").asLong();
      var tags = tags();

      var whole = ProcessEngine.at(0, SEED);
      whole.runTo(toTick);

      var first = ProcessEngine.at(0, SEED);
      first.runTo(splitAt);
      var saved = first.snapshotState();

      var resumed = ProcessEngine.resume(splitAt, SEED, saved);
      resumed.runTo(toTick);

      var expected = resume.get("expected");
      var divergent = new TreeMap<String, String>();

      for (var tag : tags) {
        // os dois caminhos têm de concordar entre si...
        assertThat(resumed.measured(tag))
            .as("%s: retomado contra inteiro", tag)
            .isCloseTo(whole.measured(tag), TOLERANCE);

        // ...e com o que a implementação TypeScript produziu
        checkTag(divergent, tag, "retomado", resumed.measured(tag), expected.get("resumed"));
        checkTag(divergent, tag, "inteiro", whole.measured(tag), expected.get("whole"));
      }

      assertThat(divergent).isEmpty();
    }

    @Test
    @DisplayName("o estado gravado tem a linha de atraso de cada relação e o integral de cada malha")
    void stateIsComplete() {
      var engine = ProcessEngine.at(0, SEED);
      engine.runTo(100);
      var state = engine.snapshotState();

      assertThat(state.version()).isEqualTo(ProcessEngine.STATE_VERSION);
      assertThat(state.tick()).isEqualTo(100);
      assertThat(state.seed()).isEqualTo(SEED);
      assertThat(state.runners()).hasSize(ProcessEngine.mdRelations().size());
      assertThat(state.integrals()).hasSize(6);
      assertThat(state.truth()).isNotEmpty();
    }

    @Test
    @DisplayName("recusa retomar de outra semente, de outro passo ou de outra versão")
    void refusesMismatch() {
      var saved = ProcessEngine.at(0, SEED).snapshotState();

      assertThatThrownBy(() -> ProcessEngine.resume(0, SEED + 1, saved))
          .isInstanceOf(IllegalArgumentException.class)
          .hasMessageContaining("outra máquina");

      assertThatThrownBy(() -> ProcessEngine.resume(50, SEED, saved))
          .isInstanceOf(IllegalArgumentException.class)
          .hasMessageContaining("salta ou repete processo");

      var wrongVersion =
          new ProcessEngine.State(
              99, saved.tick(), saved.seed(), saved.truth(), saved.setpoints(),
              saved.integrals(), saved.runners());

      assertThatThrownBy(() -> ProcessEngine.resume(0, SEED, wrongVersion))
          .isInstanceOf(IllegalArgumentException.class)
          .hasMessageContaining("Reancore");
    }
  }

  @Nested
  @DisplayName("as cascatas")
  class Cascades {

    @Test
    @DisplayName("a escrava não aceita setpoint: numa cascata ele pertence ao mestre")
    void slaveRefusesSetpoint() {
      var engine = ProcessEngine.at(0, SEED);

      assertThat(ProcessEngine.isCascadeSlave("FIC-105")).isTrue();
      assertThat(engine.settableTags()).doesNotContain("FIC-105").contains("AIC-902");

      assertThatThrownBy(() -> engine.setSetpoint("FIC-105", 100))
          .isInstanceOf(IllegalArgumentException.class)
          .hasMessageContaining("pertence ao mestre");
    }

    @Test
    @DisplayName("mover o setpoint da gramatura move a válvula de massa")
    void masterMovesSlave() {
      var engine = ProcessEngine.at(0, SEED);
      engine.runTo(60);

      double before = engine.truth("FIC-105");

      engine.setSetpoint("AIC-902", engine.setpoint("AIC-902") + 5);
      engine.runTo(600);

      assertThat(engine.truth("FIC-105"))
          .as("a válvula se mexeu para perseguir a gramatura nova")
          .isNotEqualTo(before);
    }

    @Test
    @DisplayName("devolver o setpoint ao ponto de operação é o que fecha uma perturbação")
    void resetReturns() {
      var engine = ProcessEngine.at(0, SEED);
      double original = engine.setpoint("AIC-902");

      engine.setSetpoint("AIC-902", original + 5);
      assertThat(engine.setpoint("AIC-902")).isEqualTo(original + 5);

      engine.resetSetpoint("AIC-902");
      assertThat(engine.setpoint("AIC-902")).isEqualTo(original);
    }
  }

  @Nested
  @DisplayName("verdade e medida")
  class TruthAndMeasurement {

    @Test
    @DisplayName("a medida difere da verdade pelo ruído do instrumento")
    void noiseSeparatesThem() {
      var engine = ProcessEngine.at(0, SEED);
      engine.runTo(300);

      // a pressão do G4 tem excDev no catálogo, então tem ruído
      assertThat(OperatingPoint.instrumentNoiseSd("PIC-514")).isPositive();
      assertThat(engine.measured("PIC-514")).isNotEqualTo(engine.truth("PIC-514"));
    }

    @Test
    @DisplayName("a medida não é presa à faixa do catálogo: é fora dela que o alarme vive")
    void measurementIsNotClamped() {
      var engine = ProcessEngine.at(0, SEED);
      var variable = dev.felipesantos.papertwin.catalog.ProcessCatalog.get("AIC-903");

      // empurra a umidade final para fora da faixa pela cascata
      engine.setSetpoint("AIC-903", variable.max() + 3);
      engine.runTo(4000);

      assertThat(engine.measured("AIC-903"))
          .as("a umidade passou do máximo de operação sem ser cortada")
          .isGreaterThan(variable.max());
    }

    @Test
    @DisplayName("a superfície do cilindro segue a pressão do seu grupo, não o alvo do catálogo")
    void shellFollowsItsGroup() {
      var engine = ProcessEngine.at(0, SEED);
      engine.runTo(10);

      // o G4 opera a 230 kPa rel e o G1 a 15: as superfícies não podem ser iguais
      double g4 = engine.truth("TI-5223");
      double g1 = engine.truth("TI-5201");

      assertThat(g4).isGreaterThan(g1 + 20);
      assertThat(g4).isCloseTo(Pi.cylinderSurfaceTempC(engine.truth("PIC-514")), Offset.offset(1e-9));
    }
  }

  @Test
  @DisplayName("o ruído é função da posição: perguntar fora de ordem dá a mesma resposta")
  void noiseIsPositional() {
    int stream = Noise.streamOf("PIC-514");

    var forward = new LinkedHashMap<Integer, Double>();
    for (int tick = 0; tick < 50; tick++) {
      forward.put(tick, Noise.gaussian(SEED, tick, stream, 0));
    }

    for (int tick = 49; tick >= 0; tick--) {
      assertThat(Noise.gaussian(SEED, tick, stream, 0)).isEqualTo(forward.get(tick));
    }
  }
}
