package dev.felipesantos.papertwin.db;

import dev.felipesantos.papertwin.historian.ArchiveReason;
import dev.felipesantos.papertwin.historian.HistorianPoints;
import dev.felipesantos.papertwin.historian.Interpolation;
import dev.felipesantos.papertwin.historian.Retention;
import dev.felipesantos.papertwin.historian.Samples.ArchivedSample;
import dev.felipesantos.papertwin.historian.Samples.PointArchivedSample;
import dev.felipesantos.papertwin.historian.Samples.PointSample;
import dev.felipesantos.papertwin.historian.Samples.Sample;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import javax.sql.DataSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.simple.JdbcClient;

/**
 * O historiador no banco.
 *
 * <p>SQL escrito à mão, sem ORM. O que esta classe faz é o que o Postgres faz melhor que qualquer
 * mapeamento — inserção em lote de milhares de linhas, {@code date_bin} para as colunas do
 * gráfico, agregação por janela — e um {@code saveAll} esconderia justamente a parte que decide se
 * uma retomada cabe dentro de uma requisição HTTP.
 */
public class HistorianRepository {

  private final JdbcClient jdbc;
  private final JdbcTemplate template;

  public HistorianRepository(DataSource dataSource) {
    this.jdbc = JdbcClient.create(dataSource);
    this.template = new JdbcTemplate(dataSource);
  }

  // ------------------------------------------------------------------ ponto ----

  /**
   * Repõe a tabela de pontos a partir do catálogo.
   *
   * <p>Apaga e reinsere em vez de reconciliar: a tabela é derivada do catálogo, que é código, e
   * uma reconciliação parcial deixaria pontos órfãos de uma versão anterior apontando para tags
   * que não existem mais.
   */
  public int replacePoints() {
    var points = HistorianPoints.ALL;

    template.update("delete from historian_point");
    template.batchUpdate(
        "insert into historian_point (point_id, tag, unit, exc_dev, comp_dev) values (?, ?, ?, ?, ?)",
        points,
        points.size(),
        (statement, point) -> {
          statement.setShort(1, (short) point.pointId());
          statement.setString(2, point.tag());
          statement.setString(3, point.unit());
          setNullableDouble(statement, 4, point.excDev());
          setNullableDouble(statement, 5, point.compDev());
        });

    return points.size();
  }

  private static void setNullableDouble(java.sql.PreparedStatement statement, int index, Double value)
      throws java.sql.SQLException {
    if (value == null) {
      statement.setNull(index, Types.DOUBLE);
    } else {
      statement.setDouble(index, value);
    }
  }

  public int countPoints() {
    return jdbc.sql("select count(*) from historian_point").query(Integer.class).single();
  }

  // --------------------------------------------------------------- amostras ----

  /**
   * Insere amostras brutas em lote.
   *
   * <p>{@code on conflict do nothing} porque a retomada é idempotente por desenho: reexecutar um
   * trecho produz exatamente os mesmos valores nos mesmos instantes, e a segunda passagem não tem
   * o que acrescentar. Sem isso, uma retomada que se sobrepusesse à anterior quebraria na chave
   * primária em vez de simplesmente não fazer nada.
   */
  public int insertRaw(List<PointSample> samples) {
    if (samples.isEmpty()) {
      return 0;
    }

    var counts =
        template.batchUpdate(
            "insert into historian_raw (ts, value, point_id) values (?, ?, ?) on conflict do nothing",
            samples,
            samples.size(),
            (statement, sample) -> {
              statement.setTimestamp(1, Timestamp.from(Instant.ofEpochMilli(sample.t())));
              statement.setDouble(2, sample.v());
              statement.setShort(3, (short) sample.pointId());
            });

    return sum(counts);
  }

  public int insertArchive(List<PointArchivedSample> samples) {
    if (samples.isEmpty()) {
      return 0;
    }

    var counts =
        template.batchUpdate(
            "insert into historian_archive (ts, value, point_id, reason) values (?, ?, ?, ?)"
                + " on conflict do nothing",
            samples,
            samples.size(),
            (statement, sample) -> {
              statement.setTimestamp(1, Timestamp.from(Instant.ofEpochMilli(sample.t())));
              statement.setDouble(2, sample.v());
              statement.setShort(3, (short) sample.pointId());
              statement.setShort(4, sample.reason().code());
            });

    return sum(counts);
  }

  private static int sum(int[][] counts) {
    int total = 0;
    for (var batch : counts) {
      for (int count : batch) {
        // o driver devolve SUCCESS_NO_INFO (-2) em lote; conta como uma linha
        total += count < 0 ? 1 : count;
      }
    }
    return total;
  }

  public List<Sample> rawSamples(int pointId, Instant from, Instant to) {
    return jdbc
        .sql(
            "select ts, value from historian_raw where point_id = ? and ts >= ? and ts <= ?"
                + " order by ts")
        .param((short) pointId)
        .param(Timestamp.from(from))
        .param(Timestamp.from(to))
        .query((rs, row) -> new Sample(rs.getTimestamp("ts").getTime(), rs.getDouble("value")))
        .list();
  }

  public List<ArchivedSample> archivedSamples(int pointId, Instant from, Instant to) {
    return jdbc
        .sql(
            "select ts, value, reason from historian_archive where point_id = ? and ts >= ? and ts <= ?"
                + " order by ts")
        .param((short) pointId)
        .param(Timestamp.from(from))
        .param(Timestamp.from(to))
        .query(
            (rs, row) ->
                new ArchivedSample(
                    rs.getTimestamp("ts").getTime(),
                    rs.getDouble("value"),
                    ArchiveReason.fromCode(rs.getShort("reason"))))
        .list();
  }

  /** O último arquivado antes do instante — a âncora de entrada de uma tendência. */
  public ArchivedSample archivedBefore(int pointId, Instant at) {
    return jdbc
        .sql(
            "select ts, value, reason from historian_archive where point_id = ? and ts < ?"
                + " order by ts desc limit 1")
        .param((short) pointId)
        .param(Timestamp.from(at))
        .query(
            (rs, row) ->
                new ArchivedSample(
                    rs.getTimestamp("ts").getTime(),
                    rs.getDouble("value"),
                    ArchiveReason.fromCode(rs.getShort("reason"))))
        .optional()
        .orElse(null);
  }

  /** O primeiro arquivado depois do instante — a âncora de saída. */
  public ArchivedSample archivedAfter(int pointId, Instant at) {
    return jdbc
        .sql(
            "select ts, value, reason from historian_archive where point_id = ? and ts > ?"
                + " order by ts limit 1")
        .param((short) pointId)
        .param(Timestamp.from(at))
        .query(
            (rs, row) ->
                new ArchivedSample(
                    rs.getTimestamp("ts").getTime(),
                    rs.getDouble("value"),
                    ArchiveReason.fromCode(rs.getShort("reason"))))
        .optional()
        .orElse(null);
  }

  // -------------------------------------------------- tendência e agregação ----

  /** Uma coluna do gráfico. */
  public record PlotBucket(
      long bucketStart, int samples, double min, double max, double first, double last) {}

  /**
   * Teto de colunas por consulta.
   *
   * <p>Nenhuma tela tem mais de alguns milhares de pixels de largura, e devolver mais colunas que
   * pixels é tráfego que o navegador joga fora. O teto também protege o banco: {@code date_bin}
   * com intervalo minúsculo numa janela larga produz uma coluna por amostra, que é o oposto do que
   * esta consulta existe para fazer.
   */
  public static final int MAX_PLOT_BUCKETS = 2000;

  public static final int DEFAULT_PLOT_BUCKETS = 600;

  /**
   * As colunas de um gráfico, com as âncoras dos dois lados.
   *
   * <p>As âncoras vêm juntas porque sem elas o gráfico começa solto: a primeira coluna não sabe de
   * onde a linha vinha, e a última não sabe para onde ia.
   */
  public record Trend(
      int pointId,
      Instant from,
      Instant to,
      long bucketS,
      List<PlotBucket> buckets,
      ArchivedSample before,
      ArchivedSample after,
      Double timeWeightedAverage) {}

  public Trend trend(int pointId, Instant from, Instant to, Integer requestedBuckets) {
    long spanMs = to.toEpochMilli() - from.toEpochMilli();
    if (spanMs <= 0) {
      throw new IllegalArgumentException("A janela da tendência precisa terminar depois de começar");
    }

    int columns =
        Math.min(
            Math.max(requestedBuckets == null ? DEFAULT_PLOT_BUCKETS : requestedBuckets, 1),
            MAX_PLOT_BUCKETS);

    // pelo menos um segundo por coluna: abaixo disso as colunas ficam mais
    // finas que a própria varredura do historiador e vêm vazias
    long bucketS = Math.max(1, Math.round(spanMs / (double) columns / 1000));

    var buckets =
        jdbc.sql(
                """
                select
                  date_bin(cast(? as interval), ts, timestamptz '2000-01-01 00:00:00+00') as bucket_start,
                  count(*)::int                          as samples,
                  min(value)                             as min_value,
                  max(value)                             as max_value,
                  (array_agg(value order by ts))[1]      as first_value,
                  (array_agg(value order by ts desc))[1] as last_value
                from historian_archive
                where point_id = ? and ts >= ? and ts < ?
                group by 1
                order by 1
                """)
            .param(bucketS + " seconds")
            .param((short) pointId)
            .param(Timestamp.from(from))
            .param(Timestamp.from(to))
            .query(
                (rs, row) ->
                    new PlotBucket(
                        rs.getTimestamp("bucket_start").getTime(),
                        rs.getInt("samples"),
                        rs.getDouble("min_value"),
                        rs.getDouble("max_value"),
                        rs.getDouble("first_value"),
                        rs.getDouble("last_value")))
            .list();

    var before = archivedBefore(pointId, from);
    var after = archivedAfter(pointId, to);

    /*
     * A média no tempo é calculada sobre as amostras, e não sobre as colunas.
     *
     * As colunas já perderam a informação de QUANDO cada valor aconteceu dentro
     * delas; usá-las para a média traria de volta o viés que a média no tempo
     * existe para evitar.
     */
    var path = pathFor(pointId, from, to, before, after);

    return new Trend(
        pointId,
        from,
        to,
        bucketS,
        buckets,
        before,
        after,
        Interpolation.timeWeightedAverage(path, from.toEpochMilli(), to.toEpochMilli()));
  }

  private List<Sample> pathFor(
      int pointId, Instant from, Instant to, ArchivedSample before, ArchivedSample after) {

    var path = new ArrayList<Sample>();
    if (before != null) {
      path.add(before.sample());
    }
    archivedSamples(pointId, from, to).forEach(sample -> path.add(sample.sample()));
    if (after != null) {
      path.add(after.sample());
    }
    return path;
  }

  /**
   * O valor de um ponto num instante, interpolado.
   *
   * <p>Duas consultas de uma linha cada, e não uma consulta esperta: achar o ponto anterior e o
   * seguinte é exatamente o que o índice primário faz bem, e uma expressão que resolvesse os dois
   * de uma vez acabaria varrendo.
   */
  public Interpolation.ReadValue valueAt(int pointId, Instant at) {
    var before = archivedBefore(pointId, at.plusMillis(1));
    var after = archivedAfter(pointId, at);

    return Interpolation.readAt(
        at.toEpochMilli(),
        before == null ? null : before.sample(),
        after == null ? null : after.sample());
  }

  /**
   * A média no tempo de um ponto numa janela.
   *
   * <p>Separada da tendência porque quem quer só a média não quer pagar as colunas do gráfico. É
   * esta que as entidades de operação usam: a gramatura média de uma bobina, a produção de um
   * turno.
   */
  public Double averageOf(int pointId, Instant from, Instant to) {
    if (!to.isAfter(from)) {
      return null;
    }

    var before = archivedBefore(pointId, from);
    var after = archivedAfter(pointId, to);
    var path = pathFor(pointId, from, to, before, after);

    return Interpolation.timeWeightedAverage(path, from.toEpochMilli(), to.toEpochMilli());
  }

  // --------------------------------------------------------------- retenção ----

  public record PruneResult(int rawDeleted, int archiveDeleted) {}

  /**
   * Apaga o que passou da retenção.
   *
   * <p>O bruto vive minutos e o arquivo vive dias, e os dois números saem do orçamento do Neon
   * Free — não de uma preferência. Quem chama é a retomada, depois de gravar: apagar antes
   * deixaria o banco no pico de uso justamente durante a escrita.
   */
  public PruneResult prune(Instant now) {
    int raw =
        template.update(
            "delete from historian_raw where ts < ?",
            Timestamp.from(now.minusSeconds(Retention.RAW_RETENTION_MINUTES * 60L)));

    int archive =
        template.update(
            "delete from historian_archive where ts < ?",
            Timestamp.from(now.minusSeconds(Retention.ARCHIVE_RETENTION_DAYS * 86_400L)));

    return new PruneResult(raw, archive);
  }

  /** Quanto do orçamento o arquivo já ocupa. */
  public record Usage(long rawRows, long archiveRows, long archiveBudgetRows, double usedFraction) {}

  public Usage usage() {
    long raw = jdbc.sql("select count(*) from historian_raw").query(Long.class).single();
    long archive = jdbc.sql("select count(*) from historian_archive").query(Long.class).single();
    long budget = Retention.archiveRowBudget();

    return new Usage(raw, archive, budget, (double) archive / budget);
  }
}
