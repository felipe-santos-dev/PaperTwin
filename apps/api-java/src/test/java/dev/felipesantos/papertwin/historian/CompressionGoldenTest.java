package dev.felipesantos.papertwin.historian;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import dev.felipesantos.papertwin.golden.Golden;
import dev.felipesantos.papertwin.historian.Samples.Sample;
import java.util.ArrayList;
import java.util.List;
import org.assertj.core.data.Offset;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;

/** A compressão do historiador contra o gabarito da implementação TypeScript. */
class CompressionGoldenTest {

  private static final JsonNode GOLDEN = Golden.read("historian/compression.json");
  private static final Offset<Double> TOLERANCE =
      Offset.offset(GOLDEN.get("tolerance").asDouble());

  private static List<Sample> samplesOf(JsonNode node) {
    var out = new ArrayList<Sample>(node.size());
    for (var element : node) {
      out.add(new Sample(element.get("t").asLong(), element.get("v").asDouble()));
    }
    return out;
  }

  @TestFactory
  @DisplayName("as duas etapas batem com o gabarito, e o meio também")
  List<DynamicTest> stages() {
    var tests = new ArrayList<DynamicTest>();

    for (var testCase : GOLDEN.get("cases")) {
      var tag = testCase.get("tag").asText();
      var shape = testCase.get("shape").asText();
      var point = testCase.get("point");
      var input = samplesOf(testCase.get("input"));
      var expected = testCase.get("expected");

      tests.add(
          DynamicTest.dynamicTest(
              "%s (%s)".formatted(tag, shape),
              () -> {
                Double excDev = point.get("excDev").isNull() ? null : point.get("excDev").asDouble();
                Double compDev =
                    point.get("compDev").isNull() ? null : point.get("compDev").asDouble();

                /*
                 * As duas etapas rodadas em separado, e comparadas em separado.
                 *
                 * Guardar o meio é o que faz este caso dizer QUAL das duas
                 * divergiu quando o total não bate. Comparando só o arquivo, um
                 * filtro de exceção errado e uma porta oscilante errada dariam
                 * a mesma mensagem.
                 */
                var exception =
                    Compression.exceptionFilter(
                        excDev == null ? 0 : excDev, Retention.EXCEPTION_MAX_GAP_S);
                var afterException = new ArrayList<Sample>();
                for (var sample : input) {
                  afterException.addAll(exception.feed(sample));
                }
                afterException.addAll(exception.flush());

                assertSamples(afterException, expected.get("afterException"), "depois da exceção");

                var door =
                    Compression.swingingDoor(
                        compDev == null ? 0 : compDev, Retention.ARCHIVE_MAX_GAP_S);
                var archived = new ArrayList<Samples.ArchivedSample>();
                for (var sample : afterException) {
                  archived.addAll(door.feed(sample));
                }
                archived.addAll(door.flush());

                assertArchived(archived, expected.get("archived"));

                var whole = Compression.record(excDev, compDev, input);
                var stats = expected.get("stats");

                assertThat(whole.stats().samples()).as("amostras").isEqualTo(stats.get("samples").asInt());
                assertThat(whole.stats().afterException())
                    .as("passaram a exceção")
                    .isEqualTo(stats.get("afterException").asInt());
                assertThat(whole.stats().archived())
                    .as("arquivadas")
                    .isEqualTo(stats.get("archived").asInt());
                assertThat(whole.stats().ratio())
                    .as("razão de compressão")
                    .isCloseTo(stats.get("ratio").asDouble(), TOLERANCE);
              }));
    }

    return tests;
  }

  private static void assertSamples(List<Sample> actual, JsonNode expected, String what) {
    assertThat(actual).as("%s: quantidade", what).hasSize(expected.size());

    for (int i = 0; i < actual.size(); i++) {
      assertThat(actual.get(i).t()).as("%s[%d].t", what, i).isEqualTo(expected.get(i).get("t").asLong());
      assertThat(actual.get(i).v())
          .as("%s[%d].v", what, i)
          .isCloseTo(expected.get(i).get("v").asDouble(), TOLERANCE);
    }
  }

  private static void assertArchived(List<Samples.ArchivedSample> actual, JsonNode expected) {
    assertThat(actual).as("arquivadas: quantidade").hasSize(expected.size());

    for (int i = 0; i < actual.size(); i++) {
      var node = expected.get(i);
      assertThat(actual.get(i).t()).as("arquivada[%d].t", i).isEqualTo(node.get("t").asLong());
      assertThat(actual.get(i).v())
          .as("arquivada[%d].v", i)
          .isCloseTo(node.get("v").asDouble(), TOLERANCE);
      assertThat(actual.get(i).reason().label())
          .as("arquivada[%d].razão", i)
          .isEqualTo(node.get("reason").asText());
    }
  }

  @Nested
  @DisplayName("o filtro de exceção")
  class ExceptionFilter {

    @Test
    @DisplayName("manda a anterior junto com a novidade, para o degrau não virar rampa")
    void stepKeepsItsEdge() {
      // sem a anterior, o arquivo teria o 100 de dez minutos atrás e o 140 de
      // agora, e a interpolação desenharia uma subida de dez minutos
      var filter = Compression.exceptionFilter(1, 600);
      long t0 = 0;

      var out = new ArrayList<Sample>(filter.feed(new Sample(t0, 100)));
      for (int i = 1; i < 60; i++) {
        out.addAll(filter.feed(new Sample(t0 + i * 1000L, 100)));
      }
      var atStep = filter.feed(new Sample(t0 + 60_000, 140));

      assertThat(atStep).as("duas amostras: a anterior e a nova").hasSize(2);
      assertThat(atStep.get(0).v()).isEqualTo(100);
      assertThat(atStep.get(0).t()).isEqualTo(t0 + 59_000);
      assertThat(atStep.get(1).v()).isEqualTo(140);
      assertThat(out).hasSize(1);
    }

    @Test
    @DisplayName("no teto de tempo manda só a atual — não há degrau para preservar")
    void timeoutSendsOnlyCurrent() {
      var filter = Compression.exceptionFilter(1, 10);
      filter.feed(new Sample(0, 100));

      for (int i = 1; i < 10; i++) {
        assertThat(filter.feed(new Sample(i * 1000L, 100))).isEmpty();
      }

      assertThat(filter.feed(new Sample(10_000, 100)))
          .as("uma linha só: o valor não mudou, só o tempo passou")
          .hasSize(1);
    }

    @Test
    @DisplayName("sem desvio declarado, nada é descartado")
    void zeroDeviationKeepsEverything() {
      var filter = Compression.exceptionFilter(0, 600);
      var out = new ArrayList<Sample>();

      for (int i = 0; i < 10; i++) {
        out.addAll(filter.feed(new Sample(i * 1000L, 100 + i * 0.001)));
      }

      assertThat(out).hasSize(10);
    }
  }

  @Nested
  @DisplayName("a porta oscilante")
  class SwingingDoor {

    @Test
    @DisplayName("uma rampa perfeita vira duas linhas")
    void rampIsTwoLines() {
      var door = Compression.swingingDoor(0.1, 3600);
      var out = new ArrayList<Samples.ArchivedSample>();

      for (int i = 0; i < 100; i++) {
        out.addAll(door.feed(new Sample(i * 1000L, 100 + i * 0.5)));
      }
      out.addAll(door.flush());

      assertThat(out).as("a âncora e o fim; o meio é reta").hasSize(2);
      assertThat(out.get(0).reason()).isEqualTo(ArchiveReason.INICIAL);
      assertThat(out.get(1).reason()).isEqualTo(ArchiveReason.FINAL);
    }

    @Test
    @DisplayName("o erro da corda chega a 2·compDev, que é o que a porta promete")
    void chordErrorIsTwiceCompDev() {
      /*
       * O corredor garante que EXISTE uma reta saindo da faixa âncora ± compDev
       * que passa a menos de compDev de cada amostra descartada. A reta que
       * quem lê desenha é outra: é a corda entre dois valores arquivados. O
       * erro dela chega ao dobro — e vale saber ao escolher o compDev de uma
       * tag.
       */
      double compDev = 0.5;
      var door = Compression.swingingDoor(compDev, 3600);

      var input = new ArrayList<Sample>();
      for (int i = 0; i < 400; i++) {
        input.add(new Sample(i * 1000L, 100 + 8 * Math.sin(i / 40.0)));
      }

      var archived = new ArrayList<Samples.ArchivedSample>();
      for (var sample : input) {
        archived.addAll(door.feed(sample));
      }
      archived.addAll(door.flush());

      double worst = 0;
      for (var sample : input) {
        Sample before = null;
        Sample after = null;
        for (var kept : archived) {
          if (kept.t() <= sample.t()) {
            before = kept.sample();
          } else if (after == null) {
            after = kept.sample();
          }
        }
        var read = Interpolation.readAt(sample.t(), before, after);
        if (read != null) {
          worst = Math.max(worst, Math.abs(read.v() - sample.v()));
        }
      }

      assertThat(worst).as("erro máximo da corda").isLessThanOrEqualTo(2 * compDev);
      assertThat(archived).as("e ainda assim comprime").hasSizeLessThan(input.size() / 4);
    }

    @Test
    @DisplayName("sem desvio declarado, nada que saia da reta é descartado")
    void zeroDeviationKeepsWhatMoves() {
      /*
       * "Com compDev zero nada é descartado" é quase verdade, e a exceção vale
       * saber: numa rampa EXATA o corredor degenera numa inclinação só e nunca
       * fecha, então ela sai comprimida em dois pontos mesmo com desvio zero.
       *
       * Com qualquer dado que não seja colinear — que é todo dado de processo,
       * porque há ruído de instrumento — a porta fecha na primeira amostra fora
       * da reta, e é isso que este caso cobra.
       */
      var door = Compression.swingingDoor(0, 3600);
      var out = new ArrayList<Samples.ArchivedSample>();

      for (int i = 0; i < 20; i++) {
        out.addAll(door.feed(new Sample(i * 1000L, 100 + i * i * 0.1)));
      }
      out.addAll(door.flush());

      assertThat(out).as("uma curva com desvio zero não tem o que descartar").hasSize(20);
    }

    @Test
    @DisplayName("numa rampa exata o corredor degenera e não fecha, mesmo com desvio zero")
    void zeroDeviationStillCompressesAPerfectRamp() {
      var door = Compression.swingingDoor(0, 3600);
      var out = new ArrayList<Samples.ArchivedSample>();

      for (int i = 0; i < 20; i++) {
        out.addAll(door.feed(new Sample(i * 1000L, 100 + i)));
      }
      out.addAll(door.flush());

      assertThat(out).as("a âncora e o fim").hasSize(2);
    }
  }

  @Test
  @DisplayName("as razões de arquivamento têm código de 1 a 5, como a coluna aceita")
  void reasonCodes() {
    // a migration tem `check (reason between 1 and 5)`; os dois têm de concordar
    assertThat(ArchiveReason.values()).hasSize(5);

    for (var reason : ArchiveReason.values()) {
      assertThat(reason.code()).isBetween((short) 1, (short) 5);
      assertThat(ArchiveReason.fromCode(reason.code())).isEqualTo(reason);
      assertThat(ArchiveReason.fromLabel(reason.label())).isEqualTo(reason);
    }

    // exceção NÃO é razão de arquivamento: o filtro decide o que é descartado
    // antes do arquivo
    assertThat(java.util.Arrays.stream(ArchiveReason.values()).map(ArchiveReason::label))
        .doesNotContain("exceção");
  }
}
