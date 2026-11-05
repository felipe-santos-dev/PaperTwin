package dev.felipesantos.papertwin.vibration;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import dev.felipesantos.papertwin.golden.Golden;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.assertj.core.data.Offset;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.TestFactory;

/**
 * A vida útil restante contra o gabarito.
 *
 * <p>Os cinco casos do gabarito são os que decidem o comportamento, e cada um devolve {@code null}
 * por uma razão diferente: poucos pontos, tendência plana, inclinação dentro do próprio ruído do
 * ajuste. Um caso só verificaria que o método não estoura.
 */
class RemainingLifeGoldenTest {

  private static final JsonNode GOLDEN = Golden.read("vibration/remaining-life.json");

  private static Iso20816.Limits limits() {
    var node = GOLDEN.get("isoLimits");
    return new Iso20816.Limits(
        node.get("aToB").asDouble(), node.get("bToC").asDouble(), node.get("cToD").asDouble());
  }

  private static List<Bearings.Bucket> buckets(JsonNode node) {
    var out = new ArrayList<Bearings.Bucket>(node.size());
    for (var bucket : node) {
      out.add(
          new Bearings.Bucket(
              Instant.parse(bucket.get("bucketStart").asText()),
              bucket.get("samples").asInt(),
              bucket.get("rmsAvgMmS").asDouble(),
              bucket.get("rmsMaxMmS").asDouble(),
              bucket.get("tempAvgC").asDouble(),
              bucket.get("envelopeMaxGe").asDouble()));
    }
    return out;
  }

  @TestFactory
  @DisplayName("cada caso do gabarito dá a mesma estimativa")
  List<DynamicTest> cases() {
    double tolerance = GOLDEN.get("tolerance").asDouble();
    var limits = limits();
    var tests = new ArrayList<DynamicTest>();

    for (var entry : GOLDEN.get("cases")) {
      var name = entry.get("name").asText();
      var expected = entry.get("expected");

      tests.add(
          DynamicTest.dynamicTest(
              name,
              () -> {
                var actual = RemainingLife.estimate(buckets(entry.get("buckets")), limits);

                assertThat(actual.samples()).as("%s: pontos no ajuste", name)
                    .isEqualTo(expected.get("samples").asInt());

                assertThat(actual.trendMmSPerDay())
                    .as("%s: inclinação", name)
                    .isCloseTo(
                        expected.get("trendMmSPerDay").asDouble(), Offset.offset(tolerance));

                if (expected.get("daysToZoneD").isNull()) {
                  assertThat(actual.daysToZoneD())
                      .as("%s: sem resposta é null, e não um número gigante", name)
                      .isNull();
                  return;
                }

                assertThat(actual.daysToZoneD())
                    .as("%s: dias até a zona D", name)
                    .isNotNull()
                    .isCloseTo(
                        expected.get("daysToZoneD").asDouble(), Offset.offset(tolerance));
              }));
    }

    return tests;
  }
}
