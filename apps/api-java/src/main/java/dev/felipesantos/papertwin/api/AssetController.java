package dev.felipesantos.papertwin.api;

import dev.felipesantos.papertwin.machine.MachineAssets;
import dev.felipesantos.papertwin.runtime.CatchUp;
import dev.felipesantos.papertwin.runtime.SimulationService;
import dev.felipesantos.papertwin.simulation.SimClock;
import dev.felipesantos.papertwin.vibration.Bearings;
import dev.felipesantos.papertwin.vibration.Iso20816;
import dev.felipesantos.papertwin.vibration.RemainingLife;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Os ativos da máquina e o que se mede neles.
 *
 * <p>A lista sai do modelo, e não do banco: o modelo é a fonte da verdade das tags, e a tabela
 * {@code asset} é semeada a partir dele. Ler do banco aqui acrescentaria uma ida e uma chance de
 * os dois discordarem, sem acrescentar informação.
 */
@RestController
public class AssetController {

  private final SimulationService simulation;

  public AssetController(SimulationService simulation) {
    this.simulation = simulation;
  }

  /** Um ativo como a API o publica — com a posição em vetor, que é o que a cena espera. */
  public record AssetView(
      String tag,
      String kind,
      String label,
      String section,
      double[] position,
      @Nullable Double radius,
      @Nullable Double lengthM,
      @Nullable String side,
      @Nullable String parentTag,
      @Nullable String steamGroup,
      @Nullable MachineAssets.IsoClass iso,
      String source) {

    static AssetView of(MachineAssets.Asset asset) {
      return new AssetView(
          asset.tag(),
          asset.kind(),
          asset.label(),
          asset.section(),
          asset.position(),
          asset.radius(),
          asset.lengthM(),
          asset.side(),
          asset.parentTag(),
          asset.steamGroup(),
          asset.iso(),
          asset.source());
    }
  }

  public record Assets(int count, List<AssetView> assets) {}

  /**
   * Os ativos, <b>ordenados por tag</b>.
   *
   * <p>A ordem do modelo é a do processo, que é a certa para montar a cena. A desta lista é
   * alfabética, que é a certa para uma tabela: quem procura `MP1-SEC-G4-CS23-MLA` numa lista de
   * 179 linhas procura em ordem de tag, não em ordem de máquina.
   */
  @GetMapping("/assets")
  public Assets list() {
    var out =
        MachineAssets.ALL.stream()
            .sorted(java.util.Comparator.comparing(MachineAssets.Asset::tag))
            .map(AssetView::of)
            .toList();

    return new Assets(out.size(), out);
  }

  /** Uma leitura de vibração. */
  public record Reading(String assetTag, Instant ts, double rmsMmS, double tempC, double envelopeGe) {}

  /**
   * O estado de um ativo medido, derivado da última leitura e dos limites da norma.
   *
   * <p>A zona e a severidade saem como <b>enumeração</b>, e não texto livre. No contrato isso é a
   * diferença entre {@code string} e {@code "A" | "B" | "C" | "D"} — e do outro lado, entre um
   * mapa de cores que o compilador confere e um que estoura em tempo de execução se a norma
   * ganhar uma zona.
   */
  public record Status(
      String assetTag, Iso20816.Zone zone, Iso20816.Health health, Reading latest) {}

  public record AssetDetail(
      AssetView asset, @Nullable Status status, @Nullable Iso20816.Limits limits) {}

  @GetMapping("/assets/{tag}")
  public AssetDetail detail(@PathVariable String tag) {
    var asset = MachineAssets.byTag(tag);
    if (asset == null) {
      throw ApiErrors.notFound("O ativo %s não existe no modelo da máquina".formatted(tag));
    }

    var report = simulation.ensureCurrent();

    /*
     * Um ativo sem classe ISO não tem estado nem limites, e isso é informação.
     *
     * Um nip não vibra — ele é o ponto de contato entre dois rolos. Devolver
     * zona `A` para ele seria inventar uma medição que não existe; devolver
     * nulo diz que não há o que medir.
     */
    if (!asset.monitored()) {
      return new AssetDetail(AssetView.of(asset), null, null);
    }

    var limits = Iso20816.limitsOf(isoOf(asset));
    var at = SimClock.tickTime(report.toTick());
    var sample =
        Bearings.sampleAt(report.seed(), report.toTick(), tag, CatchUp.scenarioAt(at));
    var zone = Iso20816.classify(sample.rmsMmS(), limits);

    return new AssetDetail(
        AssetView.of(asset),
        new Status(
            tag,
            zone,
            zone.health(),
            new Reading(tag, at, sample.rmsMmS(), sample.tempC(), sample.envelopeGe())),
        limits);
  }

  /**
   * A série de vibração de um mancal, agregada em janelas.
   *
   * <p>Calculada, e não lida do banco. A amostra é função pura de (semente, passo, tag,
   * cenário), então a série e o valor ao vivo saem do mesmo modelo — e uma janela de 72 h a
   * cada 15 min são 289 pontos, que custam menos de gerar do que de buscar. A versão
   * TypeScript agregava com {@code date_bin} no Postgres; o alinhamento à época é o mesmo,
   * para o gráfico não deslocar entre as duas.
   *
   * <p>A vida útil restante só existe com classe ISO: sem fronteira para cruzar não há o que
   * estimar, e um número ali seria invencionice.
   */
  public record Vibration(
      String assetTag,
      Instant from,
      Instant to,
      Bearings.BucketSize bucket,
      @Nullable Iso20816.Limits limits,
      List<Bearings.Bucket> buckets,
      @Nullable RemainingLife.Estimate remainingLife) {}

  @GetMapping("/assets/{tag}/vibration")
  public Vibration vibration(
      @PathVariable String tag,
      @RequestParam(required = false) String from,
      @RequestParam(required = false) String to,
      @RequestParam(required = false) String bucket) {

    var asset = MachineAssets.byTag(tag);
    if (asset == null) {
      throw ApiErrors.notFound("O ativo %s não existe no modelo da máquina".formatted(tag));
    }
    if (!asset.monitored()) {
      throw ApiErrors.unprocessable(
          "O ativo %s não tem medição de vibração: só mancais têm".formatted(tag));
    }

    var size = bucket == null ? Bearings.DEFAULT_BUCKET : Bearings.BucketSize.byLabel(bucket);
    if (size == null) {
      throw ApiErrors.badRequest(
          "Janela %s não existe. As aceitas são: %s"
              .formatted(bucket, Bearings.BucketSize.labels()));
    }

    var report = simulation.ensureCurrent();
    var end = to == null ? SimClock.tickTime(report.toTick()) : Instant.parse(to);
    var begin =
        from == null
            ? end.minusMillis(Bearings.DEFAULT_WINDOW_MS)
            : Instant.parse(from);

    if (!begin.isBefore(end)) {
      throw ApiErrors.badRequest("`from` precisa ser anterior a `to`");
    }

    long step = Bearings.DEFAULT_INTERVAL_MS / SimClock.TICK_MS;
    var scenario = CatchUp.scenarioAt(SimClock.tickTime(report.toTick()));

    var readings = new ArrayList<Bearings.Reading>();
    for (long tick = SimClock.tickAt(begin); tick <= SimClock.tickAt(end); tick += step) {
      var sample = Bearings.sampleAt(report.seed(), tick, tag, scenario);
      readings.add(
          new Bearings.Reading(
              tag,
              SimClock.tickTime(tick),
              sample.rmsMmS(),
              sample.tempC(),
              sample.envelopeGe()));
    }

    var limits = Iso20816.limitsOf(isoOf(asset));
    var buckets = Bearings.bucketize(readings, size.millis());

    return new Vibration(
        tag, begin, end, size, limits, buckets, RemainingLife.estimate(buckets, limits));
  }

  private static Iso20816.IsoClass isoOf(MachineAssets.Asset asset) {
    return new Iso20816.IsoClass(
        Iso20816.MachineGroup.GROUP_2, Iso20816.SupportClass.RIGID);
  }
}
