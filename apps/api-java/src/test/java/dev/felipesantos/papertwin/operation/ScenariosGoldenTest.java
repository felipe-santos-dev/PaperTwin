package dev.felipesantos.papertwin.operation;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import dev.felipesantos.papertwin.golden.Golden;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import org.assertj.core.data.Offset;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;

/** O plano de turno contra o gabarito da implementação TypeScript. */
class ScenariosGoldenTest {

  private static final JsonNode GOLDEN = Golden.read("operation/shifts.json");
  private static final Offset<Double> TOLERANCE =
      Offset.offset(GOLDEN.get("tolerance").asDouble());
  private static final int SEED = GOLDEN.get("seed").asInt();

  @Test
  @DisplayName("a geometria da bobina bate: ~66,5 km de papel e ~53 min por bobina")
  void reelGeometry() {
    assertThat(Scenarios.reelLengthM())
        .isCloseTo(GOLDEN.get("reelLengthM").asDouble(), TOLERANCE);
    assertThat(Scenarios.reelDurationS())
        .isCloseTo(GOLDEN.get("reelDurationS").asDouble(), TOLERANCE);
    assertThat(Scenarios.REEL_TICKS).isEqualTo(GOLDEN.get("reelTicks").asLong());
  }

  @TestFactory
  @DisplayName("o plano de cada turno bate com o gabarito")
  List<DynamicTest> plans() {
    var tests = new ArrayList<DynamicTest>();

    for (var testCase : GOLDEN.get("cases")) {
      var instant = Instant.ofEpochMilli(testCase.get("atMs").asLong());
      var expected = testCase.get("expected");

      tests.add(
          DynamicTest.dynamicTest(
              testCase.get("instant").asText(),
              () -> {
                var shift = Shifts.at(instant);
                var plan = Scenarios.shiftPlan(SEED, shift);
                var expectedShift = expected.get("shift");

                assertThat(shift.id()).as("id do turno").isEqualTo(expectedShift.get("id").asText());
                assertThat(shift.letter()).as("letra").isEqualTo(expectedShift.get("letter").asText());
                assertThat(shift.operationDate())
                    .as("dia de operação")
                    .isEqualTo(LocalDate.parse(expectedShift.get("operationDate").asText()));
                assertThat(shift.startedAt().toEpochMilli())
                    .as("começo")
                    .isEqualTo(expectedShift.get("startedAtMs").asLong());
                assertThat(shift.endedAt().toEpochMilli())
                    .as("fim")
                    .isEqualTo(expectedShift.get("endedAtMs").asLong());

                assertThat(plan.startTick()).isEqualTo(expected.get("startTick").asLong());
                assertThat(plan.endTick()).isEqualTo(expected.get("endTick").asLong());

                assertReels(plan.reels(), expected.get("reels"));
                assertGradeChange(plan.gradeChange(), expected.get("gradeChange"));
                assertBreak(plan.webBreak(), expected.get("webBreak"));

                assertThat(plan.round().startTick())
                    .as("começo da ronda")
                    .isEqualTo(expected.get("round").get("startTick").asLong());
                assertThat(plan.round().endTick())
                    .as("fim da ronda")
                    .isEqualTo(expected.get("round").get("endTick").asLong());

                assertThat(Scenarios.gradeInEffectAt(plan.startTick()))
                    .as("gramatura em vigor")
                    .isCloseTo(expected.get("gradeInEffect").asDouble(), TOLERANCE);

                assertThat(Scenarios.nominalShiftProductionT(shift))
                    .as("produção nominal")
                    .isCloseTo(expected.get("nominalProductionT").asDouble(), TOLERANCE);
              }));
    }

    return tests;
  }

  private static void assertReels(List<Scenarios.ReelPlan> actual, JsonNode expected) {
    assertThat(actual).as("nº de bobinas no turno").hasSize(expected.size());

    for (int i = 0; i < actual.size(); i++) {
      var reel = actual.get(i);
      var node = expected.get(i);

      assertThat(reel.number()).as("bobina[%d].número", i).isEqualTo(node.get("number").asInt());
      assertThat(reel.startTick()).as("bobina[%d].começo", i).isEqualTo(node.get("startTick").asLong());
      assertThat(reel.endTick()).as("bobina[%d].fim", i).isEqualTo(node.get("endTick").asLong());
    }
  }

  private static void assertGradeChange(Scenarios.GradeChangePlan actual, JsonNode expected) {
    if (expected == null || expected.isNull()) {
      assertThat(actual).as("este turno não tem troca de gramatura").isNull();
      return;
    }

    assertThat(actual).as("troca de gramatura").isNotNull();
    assertThat(actual.startTick()).isEqualTo(expected.get("startTick").asLong());
    assertThat(actual.fromGsm()).isCloseTo(expected.get("fromGsm").asDouble(), TOLERANCE);
    assertThat(actual.toGsm()).isCloseTo(expected.get("toGsm").asDouble(), TOLERANCE);
  }

  private static void assertBreak(Scenarios.BreakPlan actual, JsonNode expected) {
    if (expected == null || expected.isNull()) {
      assertThat(actual).as("este turno não tem quebra").isNull();
      return;
    }

    assertThat(actual).as("quebra de folha").isNotNull();
    assertThat(actual.startTick()).isEqualTo(expected.get("startTick").asLong());
    assertThat(actual.endTick()).isEqualTo(expected.get("endTick").asLong());
    assertThat(actual.upsetTick()).isEqualTo(expected.get("upsetTick").asLong());
    assertThat(actual.cause().section()).isEqualTo(expected.get("section").asText());
    assertThat(actual.cause().probableCause()).isEqualTo(expected.get("probableCause").asText());
    assertThat(actual.cause().upsetTag()).isEqualTo(expected.get("upsetTag").asText());
    assertThat(actual.cause().upsetSetpoint())
        .isCloseTo(expected.get("upsetSetpoint").asDouble(), TOLERANCE);
  }

  @Nested
  @DisplayName("o dia de operação")
  class OperationDay {

    @Test
    @DisplayName("é o dia em que o turno começou, não o do calendário")
    void cShiftBelongsToYesterday() {
      // às 02:00 de 16 de junho quem está na máquina é o turno C de 15 de junho,
      // e é nesse turno que a bobina enrolada às 02:00 entra
      var shift = Shifts.at(Instant.parse("2026-06-16T02:00:00Z"));

      assertThat(shift.letter()).isEqualTo("C");
      assertThat(shift.operationDate()).isEqualTo(LocalDate.of(2026, 6, 15));
    }

    @Test
    @DisplayName("a borda do turno é horário de parede: 06:00 locais, não UTC")
    void wallClockBoundary() {
      // 06:00 em −03:00 é 09:00 UTC
      var justBefore = Shifts.at(Instant.parse("2026-06-15T08:59:59Z"));
      var justAfter = Shifts.at(Instant.parse("2026-06-15T09:00:01Z"));

      assertThat(justBefore.letter()).isEqualTo("C");
      assertThat(justAfter.letter()).isEqualTo("A");
      assertThat(justAfter.operationDate()).isEqualTo(LocalDate.of(2026, 6, 15));
    }

    @Test
    @DisplayName("os três turnos de um dia cobrem 24 h sem furo nem sobreposição")
    void coversTheDay() {
      var a = Shifts.at(Instant.parse("2026-06-15T09:30:00Z"));
      var b = Shifts.at(Instant.parse("2026-06-15T17:30:00Z"));
      var c = Shifts.at(Instant.parse("2026-06-16T01:30:00Z"));

      assertThat(a.endedAt()).isEqualTo(b.startedAt());
      assertThat(b.endedAt()).isEqualTo(c.startedAt());
      assertThat(c.endedAt()).isEqualTo(a.startedAt().plusSeconds(24 * 3600));
    }
  }

  @Nested
  @DisplayName("a troca de gramatura")
  class GradeChange {

    @Test
    @DisplayName("acontece só no turno B")
    void onlyInShiftB() {
      assertThat(Scenarios.gradeChangeOf(Shifts.at(Instant.parse("2026-06-15T09:00:00Z")))).isNull();
      assertThat(Scenarios.gradeChangeOf(Shifts.at(Instant.parse("2026-06-15T18:00:00Z")))).isNotNull();
      assertThat(Scenarios.gradeChangeOf(Shifts.at(Instant.parse("2026-06-16T02:00:00Z")))).isNull();
    }

    @Test
    @DisplayName("alterna de sentido por dia, para a gramatura não subir para sempre")
    void alternates() {
      var first = Scenarios.gradeChangeOf(Shifts.at(Instant.parse("2026-06-15T18:00:00Z")));
      var second = Scenarios.gradeChangeOf(Shifts.at(Instant.parse("2026-06-16T18:00:00Z")));

      assertThat(first.toGsm()).isEqualTo(second.fromGsm());
      assertThat(first.fromGsm()).isEqualTo(second.toGsm());
    }

    @Test
    @DisplayName("a gramatura em vigor é o destino da última troca que já passou")
    void inEffectFollowsLastChange() {
      // sem isto, um motor montado num dia em que a troca é de 80 para 75
      // arrancaria em 75 e a "troca" não moveria nada
      var shift = Shifts.at(Instant.parse("2026-06-15T18:00:00Z"));
      var change = Scenarios.gradeChangeOf(shift);

      assertThat(Scenarios.gradeInEffectAt(change.startTick() - 1))
          .as("um passo antes da troca")
          .isEqualTo(change.fromGsm());
      assertThat(Scenarios.gradeInEffectAt(change.startTick()))
          .as("no passo da troca")
          .isEqualTo(change.toGsm());
    }
  }

  @Test
  @DisplayName("a quebra cai no meio do turno, longe das bordas")
  void breakAvoidsHandover() {
    // uma quebra exatamente na troca de turno deixaria a passagem sem dono
    for (int day = 1; day <= 28; day++) {
      var instant = Instant.parse("2026-06-%02dT18:00:00Z".formatted(day));
      var shift = Shifts.at(instant);
      var plan = Scenarios.webBreakOf(SEED, shift);
      if (plan == null) {
        continue;
      }

      long start = Shifts.at(instant).startedAt().getEpochSecond();
      long end = Shifts.at(instant).endedAt().getEpochSecond();
      long breakAt = dev.felipesantos.papertwin.simulation.SimClock.tickTime(plan.startTick()).getEpochSecond();

      double position = (breakAt - start) / (double) (end - start);
      assertThat(position).as("dia %d", day).isBetween(0.25, 0.75);
    }
  }
}
