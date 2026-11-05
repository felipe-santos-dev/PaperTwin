package dev.felipesantos.papertwin.db;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import dev.felipesantos.papertwin.historian.ArchiveReason;
import dev.felipesantos.papertwin.historian.HistorianPoints;
import dev.felipesantos.papertwin.historian.Interpolation;
import dev.felipesantos.papertwin.historian.Retention;
import dev.felipesantos.papertwin.historian.Samples.PointArchivedSample;
import dev.felipesantos.papertwin.historian.Samples.PointSample;
import dev.felipesantos.papertwin.historian.Samples.Sample;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import javax.sql.DataSource;
import org.assertj.core.data.Offset;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.jdbc.core.JdbcTemplate;

/** O historiador contra um Postgres de verdade. */
@ExtendWith(EmbeddedPostgresExtension.class)
class HistorianRepositoryTest {

  private static final Offset<Double> EPS = Offset.offset(1e-9);
  private static final Instant T0 = Instant.parse("2026-03-02T09:00:00Z");

  private static DataSource dataSource;
  private static HistorianRepository repository;
  private static JdbcTemplate template;

  @BeforeAll
  static void migrate() {
    dataSource = EmbeddedPostgresExtension.freshDatabase();
    Migrations.run(dataSource);
    repository = new HistorianRepository(dataSource);
    template = new JdbcTemplate(dataSource);
    repository.replacePoints();
  }

  @BeforeEach
  void clean() {
    template.update("delete from historian_archive");
    template.update("delete from historian_raw");
  }

  private static int pointId(String tag) {
    return HistorianPoints.byTag(tag).pointId();
  }

  private static void archive(int pointId, long offsetS, double value, ArchiveReason reason) {
    repository.insertArchive(
        List.of(
            new PointArchivedSample(
                pointId, T0.plusSeconds(offsetS).toEpochMilli(), value, reason)));
  }

  @Test
  @DisplayName("semeia os 320 pontos do catálogo, com os ids que o catálogo decide")
  void seedsPoints() {
    assertThat(repository.countPoints()).isEqualTo(HistorianPoints.ALL.size()).isEqualTo(320);

    // o id é o índice no catálogo, e não uma sequência do banco: com sequência,
    // a ordem de semeadura decidiria os ids e o instantâneo publicado apontaria
    // para os pontos errados
    var first = HistorianPoints.ALL.getFirst();
    assertThat(first.pointId()).isEqualTo(1);

    var stored =
        template.queryForObject(
            "select tag from historian_point where point_id = 1", String.class);
    assertThat(stored).isEqualTo(first.tag());
  }

  @Test
  @DisplayName("repor os pontos duas vezes não duplica nada")
  void replaceIsIdempotent() {
    repository.replacePoints();
    repository.replacePoints();

    assertThat(repository.countPoints()).isEqualTo(HistorianPoints.ALL.size());
  }

  @Nested
  @DisplayName("gravação")
  class Writing {

    @Test
    @DisplayName("grava milhares de linhas em lote")
    void batchInsert() {
      int point = pointId("PIC-514");
      var samples = new ArrayList<PointSample>();
      for (int i = 0; i < 5000; i++) {
        samples.add(new PointSample(point, T0.plusSeconds(i).toEpochMilli(), 230 + i * 0.001));
      }

      assertThat(repository.insertRaw(samples)).isEqualTo(5000);
      assertThat(repository.rawSamples(point, T0, T0.plusSeconds(5000))).hasSize(5000);
    }

    @Test
    @DisplayName("reexecutar um trecho não quebra na chave primária")
    void reinsertIsIdempotent() {
      // a retomada é idempotente por desenho: reexecutar produz os mesmos
      // valores nos mesmos instantes, e a segunda passagem não acrescenta nada
      int point = pointId("PIC-514");
      var samples =
          List.of(new PointArchivedSample(point, T0.toEpochMilli(), 230, ArchiveReason.INICIAL));

      assertThat(repository.insertArchive(samples)).isEqualTo(1);
      assertThat(repository.insertArchive(samples)).isZero();
      assertThat(repository.archivedSamples(point, T0, T0.plusSeconds(1))).hasSize(1);
    }

    @Test
    @DisplayName("a razão vai como código e volta como razão")
    void reasonRoundTrips() {
      int point = pointId("PIC-514");

      for (var reason : ArchiveReason.values()) {
        archive(point, reason.ordinal() * 10L, 230 + reason.ordinal(), reason);
      }

      var stored = repository.archivedSamples(point, T0, T0.plusSeconds(100));

      assertThat(stored).hasSize(ArchiveReason.values().length);
      assertThat(stored.stream().map(s -> s.reason()))
          .containsExactly(ArchiveReason.values());
    }
  }

  @Nested
  @DisplayName("leitura")
  class Reading {

    @BeforeEach
    void series() {
      int point = pointId("PIC-514");
      archive(point, 0, 230, ArchiveReason.INICIAL);
      archive(point, 600, 230.4, ArchiveReason.INTERVALO);
      archive(point, 1200, 248, ArchiveReason.PORTA);
      archive(point, 1800, 233, ArchiveReason.PORTA);
      archive(point, 3600, 232.5, ArchiveReason.FINAL);
    }

    @Test
    @DisplayName("as âncoras de cada lado da janela")
    void anchors() {
      int point = pointId("PIC-514");

      assertThat(repository.archivedBefore(point, T0.plusSeconds(700)).t())
          .isEqualTo(T0.plusSeconds(600).toEpochMilli());
      assertThat(repository.archivedAfter(point, T0.plusSeconds(700)).t())
          .isEqualTo(T0.plusSeconds(1200).toEpochMilli());

      assertThat(repository.archivedBefore(point, T0)).as("nada antes do começo").isNull();
      assertThat(repository.archivedAfter(point, T0.plusSeconds(99_999))).isNull();
    }

    @Test
    @DisplayName("o valor num instante é interpolado, e diz que foi")
    void interpolatedValue() {
      int point = pointId("PIC-514");

      var exact = repository.valueAt(point, T0.plusSeconds(600));
      assertThat(exact.kind()).isEqualTo(Interpolation.Kind.EXATA);
      assertThat(exact.v()).isCloseTo(230.4, EPS);

      var between = repository.valueAt(point, T0.plusSeconds(900));
      assertThat(between.kind()).isEqualTo(Interpolation.Kind.INTERPOLADA);
      assertThat(between.v()).isCloseTo((230.4 + 248) / 2, EPS);

      var past = repository.valueAt(point, T0.plusSeconds(99_999));
      assertThat(past.kind()).isEqualTo(Interpolation.Kind.EXTRAPOLADA);
      assertThat(past.v()).isCloseTo(232.5, EPS);
    }

    @Test
    @DisplayName("a média no tempo do banco bate com a calculada em memória")
    void averageMatchesInMemory() {
      int point = pointId("PIC-514");
      var from = T0;
      var to = T0.plusSeconds(3600);

      var inMemory =
          Interpolation.timeWeightedAverage(
              List.of(
                  new Sample(T0.toEpochMilli(), 230),
                  new Sample(T0.plusSeconds(600).toEpochMilli(), 230.4),
                  new Sample(T0.plusSeconds(1200).toEpochMilli(), 248),
                  new Sample(T0.plusSeconds(1800).toEpochMilli(), 233),
                  new Sample(T0.plusSeconds(3600).toEpochMilli(), 232.5)),
              from.toEpochMilli(),
              to.toEpochMilli());

      assertThat(repository.averageOf(point, from, to)).isCloseTo(inMemory, EPS);
    }

    @Test
    @DisplayName("janela invertida não tem média")
    void invertedWindow() {
      assertThat(repository.averageOf(pointId("PIC-514"), T0.plusSeconds(10), T0)).isNull();
    }
  }

  @Nested
  @DisplayName("as colunas do gráfico")
  class Plot {

    @Test
    @DisplayName("date_bin agrupa, e cada coluna traz mínimo, máximo, primeiro e último")
    void plotValues() {
      int point = pointId("PIC-514");

      // dez minutos de amostras a cada minuto, com um pico no minuto 3
      for (int minute = 0; minute < 10; minute++) {
        archive(point, minute * 60L, minute == 3 ? 260 : 230, ArchiveReason.PORTA);
      }

      var trend = repository.trend(point, T0, T0.plusSeconds(600), 2);

      assertThat(trend.bucketS()).isEqualTo(300);
      assertThat(trend.buckets()).hasSize(2);

      var first = trend.buckets().getFirst();
      assertThat(first.samples()).isEqualTo(5);
      assertThat(first.max()).isCloseTo(260, EPS);
      assertThat(first.min()).isCloseTo(230, EPS);
      assertThat(first.first()).isCloseTo(230, EPS);
      assertThat(first.last()).isCloseTo(230, EPS);

      // o pico sobrevive à coluna: é exatamente o que uma média perderia
      assertThat(trend.buckets().getLast().max()).isCloseTo(230, EPS);
    }

    @Test
    @DisplayName("o nº de colunas tem teto, para o gráfico não pedir mais que pixels")
    void bucketCeiling() {
      int point = pointId("PIC-514");
      archive(point, 0, 230, ArchiveReason.INICIAL);

      var trend = repository.trend(point, T0, T0.plusSeconds(86_400), 1_000_000);

      // 86.400 s em 2.000 colunas dão ~43 s por coluna
      assertThat(trend.bucketS()).isEqualTo(43);
    }

    @Test
    @DisplayName("nenhuma coluna fica mais fina que a varredura do historiador")
    void bucketFloor() {
      int point = pointId("PIC-514");
      archive(point, 0, 230, ArchiveReason.INICIAL);

      var trend = repository.trend(point, T0, T0.plusSeconds(10), 600);

      assertThat(trend.bucketS()).as("pelo menos um segundo").isEqualTo(1);
    }

    @Test
    @DisplayName("a tendência traz as âncoras, para a linha não começar solta")
    void anchorsComeAlong() {
      int point = pointId("PIC-514");
      archive(point, 0, 230, ArchiveReason.INICIAL);
      archive(point, 1800, 240, ArchiveReason.PORTA);
      archive(point, 3600, 250, ArchiveReason.FINAL);

      var trend = repository.trend(point, T0.plusSeconds(600), T0.plusSeconds(1200), 10);

      assertThat(trend.buckets()).as("nada arquivado dentro da janela").isEmpty();
      assertThat(trend.before()).as("de onde a linha vinha").isNotNull();
      assertThat(trend.after()).as("para onde ela ia").isNotNull();
      assertThat(trend.timeWeightedAverage()).as("e a média ainda sai").isNotNull();
    }

    @Test
    @DisplayName("janela invertida é erro, não resposta vazia")
    void invertedWindow() {
      assertThatThrownBy(() -> repository.trend(pointId("PIC-514"), T0, T0, 10))
          .isInstanceOf(IllegalArgumentException.class)
          .hasMessageContaining("terminar depois de começar");
    }
  }

  @Nested
  @DisplayName("retenção")
  class Pruning {

    @Test
    @DisplayName("o bruto vive minutos e o arquivo vive dias")
    void pruneRespectsEachWindow() {
      int point = pointId("PIC-514");
      var now = T0.plus(Duration.ofDays(30));

      // bruto: um dentro da janela de 15 min, um fora
      repository.insertRaw(
          List.of(
              new PointSample(point, now.minusSeconds(60).toEpochMilli(), 230),
              new PointSample(point, now.minusSeconds(3600).toEpochMilli(), 230)));

      // arquivo: um dentro dos 7 dias, um fora
      repository.insertArchive(
          List.of(
              new PointArchivedSample(
                  point, now.minus(Duration.ofDays(1)).toEpochMilli(), 230, ArchiveReason.PORTA),
              new PointArchivedSample(
                  point, now.minus(Duration.ofDays(30)).toEpochMilli(), 230, ArchiveReason.PORTA)));

      var result = repository.prune(now);

      assertThat(result.rawDeleted()).isEqualTo(1);
      assertThat(result.archiveDeleted()).isEqualTo(1);
      assertThat(repository.usage().rawRows()).isEqualTo(1);
      assertThat(repository.usage().archiveRows()).isEqualTo(1);
    }

    @Test
    @DisplayName("o orçamento do arquivo sai da conta, não de um palpite")
    void budget() {
      // 300 MB a 88 bytes por linha
      assertThat(Retention.archiveRowBudget()).isEqualTo(300_000_000L / 88);

      var usage = repository.usage();
      assertThat(usage.archiveBudgetRows()).isEqualTo(Retention.archiveRowBudget());
      assertThat(usage.usedFraction()).isBetween(0.0, 1.0);
    }
  }
}
