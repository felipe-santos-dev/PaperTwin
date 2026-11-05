package dev.felipesantos.papertwin.simulation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import dev.felipesantos.papertwin.golden.Golden;
import java.util.ArrayList;
import java.util.List;
import org.assertj.core.data.Offset;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;

/** O FOPDT e o espalhamento CD contra o gabarito da implementação TypeScript. */
class FopdtGoldenTest {

  @TestFactory
  @DisplayName("resposta ao degrau bate com o gabarito")
  List<DynamicTest> stepResponses() {
    var golden = Golden.read("fopdt/step-responses.json");
    var tolerance = Offset.offset(golden.get("tolerance").asDouble());
    var tests = new ArrayList<DynamicTest>();

    for (var testCase : golden.get("cases")) {
      var id = testCase.get("relationId").asText();
      double dtS = testCase.get("dtS").asDouble();
      int samples = testCase.get("samples").asInt();
      double stepValue = testCase.get("stepValue").asDouble();

      var modelNode = testCase.get("model");
      var model =
          new Fopdt.Model(
              modelNode.get("kp").asDouble(),
              modelNode.get("deadTimeS").asDouble(),
              modelNode.get("tauS").asDouble());

      var expected = testCase.get("expected");

      tests.add(
          DynamicTest.dynamicTest(
              "relação %s, dt %s s".formatted(id, dtS),
              () -> {
                assertThat(Fopdt.decayPerStep(model.tauS(), dtS))
                    .as("fator de decaimento")
                    .isCloseTo(expected.get("decayPerStep").asDouble(), tolerance);

                assertThat(Fopdt.delaySteps(model.deadTimeS(), dtS))
                    .as("passos de atraso")
                    .isEqualTo(expected.get("delaySteps").asInt());

                assertThat(Fopdt.stepResponse(model, stepValue, dtS, samples))
                    .as("resposta ao degrau")
                    .containsExactly(Golden.doubles(expected.get("response")), tolerance);
              }));
    }

    return tests;
  }

  @Test
  @DisplayName("espalhamento CD bate com o gabarito, bordas incluídas")
  void cdSpread() {
    var golden = Golden.read("fopdt/cd-spread.json");
    var tolerance = Offset.offset(golden.get("tolerance").asDouble());
    double kp = golden.get("kp").asDouble();

    assertThat(CdProfile.kernel())
        .as("meio kernel, com pico 1")
        .containsExactlyElementsOf(Golden.doubleList(golden.get("kernel")));

    for (var testCase : golden.get("cases")) {
      int zone = testCase.get("zoneIndex").asInt();
      double stepValue = testCase.get("stepValue").asDouble();

      assertThat(CdProfile.steadyState(kp, stepValue, zone))
          .as("zona %d", zone)
          .containsExactly(Golden.doubles(testCase.get("expected")), tolerance);
    }
  }

  @Nested
  @DisplayName("a discretização é exata, não Euler")
  class ExactDiscretisation {

    @Test
    @DisplayName("com dt maior que τ, o fator fica em (0, 1) em vez de negativo")
    void biggerThanTau() {
      // a relação 14 tem τ = 4,5 s; com passo de 10 s, Euler daria 1 − dt/τ = −1,22
      // e a resposta trocaria de sinal a cada passo
      double euler = 1 - 10 / 4.5;
      double exact = Fopdt.decayPerStep(4.5, 10);

      assertThat(euler).isNegative();
      assertThat(exact).isBetween(0.0, 1.0).isCloseTo(0.10836802, Offset.offset(1e-8));
    }

    @Test
    @DisplayName("a resposta se aproxima de kp monotonicamente, sem oscilar de sinal")
    void monotone() {
      var model = new Fopdt.Model(-0.11, 6, 4.5);
      var response = Fopdt.stepResponse(model, 1, 10, 40);

      // depois do tempo morto, cada ponto está mais perto de kp que o anterior
      for (int i = 3; i < response.length; i++) {
        assertThat(Math.abs(model.kp() - response[i]))
            .as("passo %d", i)
            .isLessThanOrEqualTo(Math.abs(model.kp() - response[i - 1]));
      }

      assertThat(response[response.length - 1]).isCloseTo(model.kp(), Offset.offset(1e-9));
    }
  }

  @Nested
  @DisplayName("a linha de atraso é estado que não se recalcula")
  class DelayLine {

    @Test
    @DisplayName("rodar em dois pedaços, serializando no meio, dá o mesmo que rodar de uma vez")
    void resumeMatches() {
      var model = new Fopdt.Model(0.0825, 75, 23);

      var whole = Fopdt.runner(model, 1);
      for (int i = 0; i < 200; i++) {
        whole.advance(1);
      }

      var first = Fopdt.runner(model, 1);
      for (int i = 0; i < 90; i++) {
        first.advance(1);
      }
      var saved = first.snapshot();

      var resumed = Fopdt.runner(model, 1, saved);
      for (int i = 90; i < 200; i++) {
        resumed.advance(1);
      }

      assertThat(resumed.output()).isEqualTo(whole.output());
    }

    @Test
    @DisplayName("recusa um estado gravado com outro tempo morto")
    void refusesMismatchedState() {
      var saved = Fopdt.runner(new Fopdt.Model(1, 10, 5), 1).snapshot();

      assertThatThrownBy(() -> Fopdt.runner(new Fopdt.Model(1, 30, 5), 1, saved))
          .isInstanceOf(IllegalArgumentException.class)
          .hasMessageContaining("misturaria dois modelos");
    }

    @Test
    @DisplayName("guarda o que entrou nos últimos θ segundos")
    void holdsDeadTime() {
      // 270 s de tempo morto são quatro minutos e meio de processo que já
      // aconteceu e ainda não apareceu na medida
      var state = Fopdt.runner(new Fopdt.Model(1, 270, 10), 1).snapshot();
      assertThat(state.line()).hasSize(271);
    }
  }

  @Test
  @DisplayName("superposição soma as relações que chegam na mesma saída")
  void superposition() {
    var a = Fopdt.stepResponse(new Fopdt.Model(0.0825, 75, 23), 1, 5, 40);
    var b = Fopdt.stepResponse(new Fopdt.Model(-0.027, 20, 57), 1, 5, 40);
    var sum = Fopdt.superpose(List.of(a, b));

    for (int i = 0; i < sum.length; i++) {
      assertThat(sum[i]).isEqualTo(a[i] + b[i]);
    }
  }

  @Test
  @DisplayName("recusa séries de comprimentos diferentes na superposição")
  void superpositionLengths() {
    assertThatThrownBy(() -> Fopdt.superpose(List.of(new double[3], new double[4])))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("mesmo comprimento");
  }
}
