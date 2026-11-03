package dev.felipesantos.papertwin.alarm;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import dev.felipesantos.papertwin.golden.Golden;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.assertj.core.data.Offset;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/** O motor de alarmes contra o gabarito da implementação TypeScript. */
class AlarmEngineGoldenTest {

  private static final JsonNode GOLDEN = Golden.read("alarms/sequence.json");
  private static final Offset<Double> TOLERANCE =
      Offset.offset(GOLDEN.get("tolerance").asDouble());

  @Test
  @DisplayName("o cenário inteiro, varredura a varredura, bate com o gabarito")
  void replaysScenario() {
    var tag = GOLDEN.get("tag").asText();
    var epoch = Instant.ofEpochMilli(GOLDEN.get("epochMs").asLong());
    var engine = new AlarmEngine();

    String raisedHighId = null;
    String raisedHighHighId = null;

    for (var step : GOLDEN.get("steps")) {
      var at = epoch.plus(Duration.ofMinutes(step.get("minutes").asLong()));
      var action = step.get("action").asText();

      switch (action) {
        case "scan" -> {
          var result = engine.scan(Map.of(tag, step.get("value").asDouble()), at);

          assertSame(result.raised(), step.get("raised"), "disparados no minuto %s".formatted(step.get("minutes")));
          assertSame(result.cleared(), step.get("cleared"), "normalizados no minuto %s".formatted(step.get("minutes")));
          assertSame(result.updated(), step.get("updated"), "atualizados no minuto %s".formatted(step.get("minutes")));

          assertThat(engine.floodCount(at))
              .as("contagem de inundação no minuto %s", step.get("minutes"))
              .isEqualTo(step.get("floodCount").asInt());

          for (var alarm : result.raised()) {
            if (alarm.limit() == AlarmLimitLevel.H && raisedHighId == null) {
              raisedHighId = alarm.id();
            }
            if (alarm.limit() == AlarmLimitLevel.HH && raisedHighHighId == null) {
              raisedHighHighId = alarm.id();
            }
          }
        }
        case "acknowledge" -> {
          var alarm = engine.acknowledge(raisedHighId, step.get("by").asText(), at);
          assertAlarm(alarm, step.get("alarm"), "reconhecimento");
        }
        case "shelve" -> {
          var until = epoch.plus(Duration.ofMinutes(step.get("untilMinutes").asLong()));
          var alarm = engine.shelve(raisedHighHighId, step.get("by").asText(), until);
          assertAlarm(alarm, step.get("alarm"), "engavetamento");
        }
        case "unshelve" -> {
          var alarm = engine.unshelve(raisedHighHighId);
          assertAlarm(alarm, step.get("alarm"), "desengavetamento");
        }
        default -> throw new IllegalStateException("ação desconhecida no gabarito: " + action);
      }
    }

    assertSame(engine.all(), GOLDEN.get("finalState"), "estado final");
  }

  private static void assertSame(List<Alarm> actual, JsonNode expected, String what) {
    assertThat(actual).as("%s: quantidade", what).hasSize(expected.size());

    var mismatches = new ArrayList<String>();
    for (int i = 0; i < actual.size(); i++) {
      compare(actual.get(i), expected.get(i), "%s[%d]".formatted(what, i), mismatches);
    }
    assertThat(mismatches).as(what).isEmpty();
  }

  private static void assertAlarm(Alarm actual, JsonNode expected, String what) {
    var mismatches = new ArrayList<String>();
    compare(actual, expected, what, mismatches);
    assertThat(mismatches).as(what).isEmpty();
  }

  private static void compare(Alarm actual, JsonNode expected, String where, List<String> into) {
    if (actual == null) {
      into.add(where + ": sem alarme, o gabarito tem um");
      return;
    }

    check(into, where, "id", actual.id(), expected.get("id").asText());
    check(into, where, "tag", actual.tag(), expected.get("tag").asText());
    check(into, where, "limite", actual.limit().name(), expected.get("limit").asText());
    check(into, where, "estado", actual.state().label(), expected.get("state").asText());
    check(into, where, "prioridade", actual.priority().label(), expected.get("priority").asText());
    check(into, where, "reconhecido por", actual.acknowledgedBy(), text(expected.get("acknowledgedBy")));
    check(into, where, "engavetado por", actual.shelvedBy(), text(expected.get("shelvedBy")));

    check(into, where, "disparado em", actual.raisedAt(), instant(expected.get("raisedAt")));
    check(into, where, "reconhecido em", actual.acknowledgedAt(), instant(expected.get("acknowledgedAt")));
    check(into, where, "normalizado em", actual.clearedAt(), instant(expected.get("clearedAt")));
    check(into, where, "engavetado até", actual.shelvedUntil(), instant(expected.get("shelvedUntil")));

    if (Math.abs(actual.threshold() - expected.get("threshold").asDouble()) > TOLERANCE.value) {
      into.add("%s: limite %s, esperado %s".formatted(where, actual.threshold(), expected.get("threshold")));
    }
    if (Math.abs(actual.peakValue() - expected.get("peakValue").asDouble()) > TOLERANCE.value) {
      into.add("%s: pico %s, esperado %s".formatted(where, actual.peakValue(), expected.get("peakValue")));
    }
  }

  private static void check(List<String> into, String where, String field, Object actual, Object expected) {
    if (actual == null ? expected != null : !actual.equals(expected)) {
      into.add("%s: %s é %s, esperado %s".formatted(where, field, actual, expected));
    }
  }

  private static String text(JsonNode node) {
    return node == null || node.isNull() ? null : node.asText();
  }

  private static Instant instant(JsonNode node) {
    return node == null || node.isNull() ? null : Instant.parse(node.asText());
  }

  @Nested
  @DisplayName("as regras")
  class Rules {

    @Test
    @DisplayName("o disparo é no limite exato e a volta exige uma banda morta")
    void asymmetricDeadband() {
      // sem a assimetria, um valor tremendo em volta do limite dispararia e
      // normalizaria dezenas de vezes por minuto — a inundação que a norma
      // manda evitar
      double high = AlarmRules.threshold("VI-5123A", AlarmLimitLevel.H);
      double deadband = AlarmRules.deadband("VI-5123A");

      assertThat(AlarmRules.hasCrossed("VI-5123A", AlarmLimitLevel.H, high)).isTrue();
      assertThat(AlarmRules.hasReturnedToNormal("VI-5123A", AlarmLimitLevel.H, high)).isFalse();
      assertThat(AlarmRules.hasReturnedToNormal("VI-5123A", AlarmLimitLevel.H, high - deadband))
          .isFalse();
      assertThat(
              AlarmRules.hasReturnedToNormal(
                  "VI-5123A", AlarmLimitLevel.H, high - deadband - 0.0001))
          .isTrue();
    }

    @Test
    @DisplayName("LL e L disparam por baixo")
    void lowLimits() {
      double low = AlarmRules.threshold("FIC-1105", AlarmLimitLevel.LL);

      assertThat(AlarmRules.hasCrossed("FIC-1105", AlarmLimitLevel.LL, low)).isTrue();
      assertThat(AlarmRules.hasCrossed("FIC-1105", AlarmLimitLevel.LL, low + 0.5)).isFalse();
    }

    @Test
    @DisplayName("as prioridades que a pesquisa nomeia vencem a regra padrão")
    void namedPriorities() {
      // a regra padrão daria 'alta' num HH; a pesquisa diz que este é crítico
      assertThat(AlarmRules.priority("TI-804", AlarmLimitLevel.HH)).isEqualTo(AlarmPriority.CRITICA);
      assertThat(AlarmRules.priorityReason("TI-804", AlarmLimitLevel.HH))
          .isEqualTo("abertura imediata do nip a 92 °C");

      assertThat(AlarmRules.priority("PIC-514", AlarmLimitLevel.HH)).isEqualTo(AlarmPriority.ALTA);
      assertThat(AlarmRules.priorityReason("PIC-514", AlarmLimitLevel.HH)).isNull();
    }

    @Test
    @DisplayName("o id é determinístico: dois cliques no mesmo instante dão o mesmo alarme")
    void deterministicId() {
      var at = Instant.parse("2026-01-01T12:00:00Z");

      assertThat(AlarmRules.alarmId(at, "PIC-514", AlarmLimitLevel.H))
          .isEqualTo(AlarmRules.alarmId(at, "PIC-514", AlarmLimitLevel.H))
          .isEqualTo("AL-1767268800-PIC-514-H");
    }
  }

  @Nested
  @DisplayName("o pico")
  class Peak {

    @Test
    @DisplayName("num limite alto é o maior valor; num baixo é o menor")
    void worstNotLast() {
      var at = Instant.parse("2026-01-01T12:00:00Z");
      var engine = new AlarmEngine();

      double high = AlarmRules.threshold("VI-5123A", AlarmLimitLevel.H);
      engine.scan(Map.of("VI-5123A", high + 0.1), at);
      engine.scan(Map.of("VI-5123A", high + 1.0), at.plusSeconds(60));
      engine.scan(Map.of("VI-5123A", high + 0.2), at.plusSeconds(120));

      var alarm =
          engine.all().stream().filter(a -> a.limit() == AlarmLimitLevel.H).findFirst().orElseThrow();

      assertThat(alarm.peakValue()).isCloseTo(high + 1.0, Offset.offset(1e-9));
    }
  }

  @Test
  @DisplayName("um par aberto não vira dois alarmes")
  void onePerPair() {
    var at = Instant.parse("2026-01-01T12:00:00Z");
    var engine = new AlarmEngine();
    double high = AlarmRules.threshold("VI-5123A", AlarmLimitLevel.H);

    for (int i = 0; i < 20; i++) {
      engine.scan(Map.of("VI-5123A", high + 0.1), at.plusSeconds(i * 10L));
    }

    assertThat(engine.all().stream().filter(a -> a.limit() == AlarmLimitLevel.H)).hasSize(1);
  }
}
