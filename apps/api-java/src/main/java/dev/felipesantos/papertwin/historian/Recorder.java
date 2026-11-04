package dev.felipesantos.papertwin.historian;

import dev.felipesantos.papertwin.historian.Samples.ArchivedSample;
import dev.felipesantos.papertwin.historian.Samples.PointArchivedSample;
import dev.felipesantos.papertwin.historian.Samples.PointSample;
import dev.felipesantos.papertwin.historian.Samples.Sample;
import dev.felipesantos.papertwin.simulation.SimClock;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * O gravador do historiador: recebe varreduras e entrega o que vai para o banco.
 *
 * <p>Cada retomada monta um gravador novo, então a porta oscilante de cada ponto arranca sem
 * âncora e o primeiro valor da janela entra no arquivo com razão {@code inicial}. É o
 * comportamento certo e é o que um historiador de verdade faz ao reiniciar: o primeiro valor
 * depois de um corte não pode ser descartado por caber numa reta cuja outra ponta está do outro
 * lado do corte.
 */
public final class Recorder {

  /** Passos entre duas varreduras do historiador. */
  public static final int SCAN_TICKS = 5;

  /** Segundos entre duas varreduras. */
  public static final double SCAN_S = SCAN_TICKS * SimClock.TICK_MS / 1000.0;

  /**
   * Os pontos que gravam valor bruto.
   *
   * <p>Escolhidos pelo que eles mostram: uma pressão de vapor e uma umidade (as duas pontas da
   * cascata que mais se move), a gramatura e a velocidade (o par que explica a produção), um ΔP de
   * sifões (de onde saem as quebras), a espessura, e a vibração e a temperatura do mancal que
   * degrada.
   */
  public static final Set<String> RAW_TAGS =
      Set.of(
          "PIC-514", "AIC-903", "AIC-902", "SIC-1104", "PDIC-524", "AIC-905", "VI-5123A",
          "TI-5323A");

  /** O que uma varredura produziu. */
  public record Batch(List<PointArchivedSample> archive, List<PointSample> raw) {}

  /** Quanto a compressão economizou ao longo da retomada. */
  public record Stats(long fed, long afterException, long archived, long raw, double ratio) {}

  private record Stage(
      HistorianPoints.Point point,
      Compression.Stage<Sample> exception,
      Compression.Stage<ArchivedSample> door) {}

  private final List<Stage> stages = new ArrayList<>();
  private final Set<String> rawTags;
  private final long rawFromMs;

  private final List<PointArchivedSample> archive = new ArrayList<>();
  private final List<PointSample> raw = new ArrayList<>();

  private long fed;
  private long afterException;
  private long archived;
  private long rawRows;

  /**
   * @param rawFromMs instante a partir do qual o bruto é coletado. O bruto tem retenção de minutos
   *     e a retomada pode ser de horas: sem este corte, uma retomada de quatro horas coletaria 23
   *     mil linhas para a poda apagar 21 mil delas no mesmo arranque.
   */
  public Recorder(List<HistorianPoints.Point> points, Set<String> rawTags, long rawFromMs) {
    for (var point : points) {
      stages.add(
          new Stage(
              point,
              Compression.exceptionFilter(
                  point.excDev() == null ? 0 : point.excDev(), Retention.EXCEPTION_MAX_GAP_S),
              Compression.swingingDoor(
                  point.compDev() == null ? 0 : point.compDev(), Retention.ARCHIVE_MAX_GAP_S)));
    }
    this.rawTags = new LinkedHashSet<>(rawTags);
    this.rawFromMs = rawFromMs;
  }

  /** Um gravador com o catálogo inteiro e os pontos de bruto padrão. */
  public static Recorder forCatalog(long rawFromMs) {
    return new Recorder(HistorianPoints.ALL, RAW_TAGS, rawFromMs);
  }

  /** Alimenta uma varredura. O passo precisa ser crescente. */
  public void feed(long tick, Map<String, Double> values) {
    long t = SimClock.tickTime(tick).toEpochMilli();

    for (var stage : stages) {
      var value = values.get(stage.point().tag());
      if (value == null || !Double.isFinite(value)) {
        continue;
      }

      fed++;
      var sample = new Sample(t, value);

      if (t >= rawFromMs && rawTags.contains(stage.point().tag())) {
        raw.add(new PointSample(stage.point().pointId(), t, value));
        rawRows++;
      }

      for (var passed : stage.exception().feed(sample)) {
        afterException++;
        for (var kept : stage.door().feed(passed)) {
          archive.add(
              new PointArchivedSample(
                  stage.point().pointId(), kept.t(), kept.v(), kept.reason()));
          archived++;
        }
      }
    }
  }

  /** Entrega o acumulado e esvazia. */
  public Batch drain() {
    var batch = new Batch(List.copyOf(archive), List.copyOf(raw));
    archive.clear();
    raw.clear();
    return batch;
  }

  /** Fecha as janelas de todos os pontos e entrega o que estava retido. */
  public List<PointArchivedSample> flush() {
    var out = new ArrayList<PointArchivedSample>();

    for (var stage : stages) {
      for (var passed : stage.exception().flush()) {
        afterException++;
        for (var kept : stage.door().feed(passed)) {
          out.add(new PointArchivedSample(stage.point().pointId(), kept.t(), kept.v(), kept.reason()));
          archived++;
        }
      }
      for (var kept : stage.door().flush()) {
        out.add(new PointArchivedSample(stage.point().pointId(), kept.t(), kept.v(), kept.reason()));
        archived++;
      }
    }

    return out;
  }

  public Stats stats() {
    return new Stats(fed, afterException, archived, rawRows, archived == 0 ? 0 : (double) fed / archived);
  }
}
