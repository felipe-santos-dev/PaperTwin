package dev.felipesantos.papertwin.api;

import dev.felipesantos.papertwin.catalog.AlarmLimits;
import dev.felipesantos.papertwin.catalog.ProcessCatalog;
import dev.felipesantos.papertwin.catalog.ProcessVariable;
import dev.felipesantos.papertwin.db.HistorianRepository;
import dev.felipesantos.papertwin.historian.HistorianPoints;
import dev.felipesantos.papertwin.historian.Samples;
import dev.felipesantos.papertwin.machine.SteamGroups;
import dev.felipesantos.papertwin.process.SteamGroupTags;
import dev.felipesantos.papertwin.runtime.CatchUp;
import dev.felipesantos.papertwin.runtime.SimulationService;
import dev.felipesantos.papertwin.simulation.ProcessEngine;
import dev.felipesantos.papertwin.simulation.SimClock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * As rotas de processo: o que a máquina está fazendo agora e o que ela fez.
 *
 * <p>Toda rota de leitura começa por {@code ensureCurrent()}. Não é cerimônia: num host que dorme,
 * a leitura é o que dispara a simulação, e sem isso a primeira tela do dia mostraria o estado de
 * ontem sem avisar.
 */
@RestController
public class ProcessController {

  private final SimulationService simulation;
  private final HistorianRepository historian;

  public ProcessController(SimulationService simulation, HistorianRepository historian) {
    this.simulation = simulation;
    this.historian = historian;
  }

  /**
   * Um valor do instante atual.
   *
   * <p>Arredondado a quatro casas. Não é cosmética: a medida carrega ruído de instrumento cujo
   * desvio é da ordem do {@code excDev} da tag, e devolver dezessete dígitos significativos
   * publicaria como informação o que é lixo de ponto flutuante. Quatro casas são mais do que
   * qualquer instrumento desta máquina resolve.
   */
  public record TagValue(
      String tag,
      @Nullable Double value,
      String unit,
      Instant ts,
      @Nullable Double setpoint,
      @Nullable String zone) {

    static TagValue of(String tag, Double value, String unit, Instant ts, Double setpoint) {
      return new TagValue(tag, round(value), unit, ts, round(setpoint), null);
    }

    /** O mesmo arredondamento do {@code toFixed(4)} do outro lado: meio para cima, valor exato. */
    static Double round(Double value) {
      if (value == null || !Double.isFinite(value)) {
        return value;
      }
      return new java.math.BigDecimal(value)
          .setScale(4, java.math.RoundingMode.HALF_UP)
          .doubleValue();
    }
  }

  public record Values(Instant ts, int count, List<TagValue> values) {}

  /**
   * Os valores atuais, opcionalmente de uma área ou grupo.
   *
   * <p>Os filtros existem porque as 320 tags do catálogo não cabem numa tela: a de Processo mostra
   * uma área por vez. Filtrar aqui em vez de no cliente poupa o corpo inteiro na rede a cada
   * troca de aba, num host que dorme.
   */
  @GetMapping("/process/values")
  public Values values(
      @RequestParam(required = false) String area,
      @RequestParam(required = false) String group) {

    var report = simulation.ensureCurrent();
    var ts = SimClock.tickTime(report.toTick());

    var out = new ArrayList<TagValue>(report.values().size());
    for (var variable : ProcessCatalog.ALL) {
      if (area != null && !area.equals(variable.area())) {
        continue;
      }
      if (group != null && !group.equals(variable.group())) {
        continue;
      }

      var value = report.values().get(variable.tag());
      if (value == null) {
        continue;
      }
      out.add(TagValue.of(variable.tag(), value, variable.unit(), ts, null));
    }

    return new Values(ts, out.size(), List.copyOf(out));
  }

  /** O detalhe de uma tag: o que ela é, se aceita escrita e quanto vale agora. */
  public record TagDetail(
      ProcessVariable variable,
      boolean writable,
      @Nullable String notWritableBecause,
      boolean archived,
      TagValue value) {}

  @GetMapping("/process/tags/{tag}")
  public TagDetail tag(@PathVariable String tag) {
    var variable = ProcessCatalog.get(tag);
    if (variable == null) {
      throw ApiErrors.notFound("A tag %s não existe no catálogo de processo".formatted(tag));
    }

    var report = simulation.ensureCurrent();
    var ts = SimClock.tickTime(report.toTick());
    var value = report.values().get(tag);

    /*
     * Por que a tag não aceita escrita é mais útil que o fato de não aceitar.
     *
     * "Escrava de cascata" diz a quem opera onde mexer — no mestre — enquanto
     * um `writable: false` sozinho faria a tela esconder o campo sem explicar,
     * e alguém concluiria que o gêmeo não deixa mexer em nada.
     */
    String because = null;
    if (ProcessEngine.isCascadeSlave(tag)) {
      because = "escrava de cascata: o setpoint pertence ao mestre";
    } else if (!variable.controlled()) {
      because = "não é malha de controle: é só medição";
    }

    return new TagDetail(
        variable,
        because == null,
        because,
        HistorianPoints.isHistorianTag(tag),
        TagValue.of(tag, value, variable.unit(), ts, null));
  }

  /**
   * A tendência de uma tag: as colunas do gráfico, as âncoras e o catálogo dela.
   *
   * <p>Os limites de alarme e o alvo vão junto porque é o gráfico que os desenha — as linhas
   * horizontais que dizem onde o valor deixa de ser normal. Numa requisição separada, a tela
   * desenharia a curva primeiro e as linhas depois, saltando.
   *
   * <p>O {@code pointId} do historiador <b>não</b> sai aqui: é chave interna do arquivo, e
   * publicá-la convidaria alguém a usá-la como identidade de tag. A identidade é a tag.
   */
  public record TagTrend(
      String tag,
      String unit,
      Instant from,
      Instant to,
      long bucketS,
      List<HistorianRepository.PlotBucket> buckets,
      @Nullable Samples.ArchivedSample before,
      @Nullable Samples.ArchivedSample after,
      @Nullable Double timeWeightedAverage,
      @Nullable AlarmLimits limits,
      @Nullable Double target) {}

  /** A janela padrão da tela de tendência. */
  private static final int DEFAULT_TREND_HOURS = 3;

  @GetMapping("/process/tags/{tag}/trend")
  public TagTrend trend(
      @PathVariable String tag,
      @RequestParam(required = false) String from,
      @RequestParam(required = false) String to,
      @RequestParam(required = false) Integer buckets) {

    var point = HistorianPoints.byTag(tag);
    if (point == null) {
      throw ApiErrors.notFound(
          ProcessCatalog.get(tag) == null
              ? "A tag %s não existe no catálogo de processo".formatted(tag)
              : "A tag %s existe no catálogo mas não é arquivada".formatted(tag));
    }

    var report = simulation.ensureCurrent();
    var end = to == null ? SimClock.tickTime(report.toTick()) : Instant.parse(to);
    var start = from == null ? end.minusSeconds(DEFAULT_TREND_HOURS * 3600L) : Instant.parse(from);

    if (!start.isBefore(end)) {
      throw ApiErrors.badRequest("`from` precisa ser anterior a `to`");
    }

    var trend = historian.trend(point.pointId(), start, end, buckets);
    var variable = ProcessCatalog.get(tag);

    return new TagTrend(
        tag,
        variable == null ? point.unit() : variable.unit(),
        trend.from(),
        trend.to(),
        trend.bucketS(),
        trend.buckets(),
        trend.before(),
        trend.after(),
        trend.timeWeightedAverage(),
        variable == null ? null : variable.limits(),
        variable == null ? null : variable.target());
  }

  /** De onde vem um dado do grupo. */
  public record Provenance(String source, String note) {}

  /**
   * Um grupo de vapor.
   *
   * <p>As duas proveniências vêm separadas de propósito: a <b>divisão</b> dos cilindros é
   * suposição do protótipo, enquanto o <b>mapa de tags</b> sai do catálogo da lista base. Juntar
   * as duas num campo só faria a suposição herdar a credibilidade do documento.
   */
  public record SteamGroupView(
      String id,
      String label,
      String section,
      List<Integer> cylinders,
      @Nullable String condensateNote,
      @Nullable String role,
      @Nullable TagValue pressure,
      @Nullable TagValue siphonDeltaP,
      @Nullable TagValue condensateLevel,
      Provenance division,
      Provenance tagMap) {}

  public record SteamGroupsView(Instant ts, List<SteamGroupView> groups) {}

  private static final Provenance DIVISION_PROVENANCE =
      new Provenance(
          "assumed",
          "A divisão em seis grupos e os seus limites são suposição do protótipo, junto com o nº"
              + " de pares de cilindros. O único ponto fixo é o CS23 estar no G4. A divisão real"
              + " sai do mapa de rolos.");

  private static final Provenance TAG_MAP_PROVENANCE =
      new Provenance(
          "B",
          "As tags de pressão, ΔP de sifões e nível de condensado saem do catálogo da lista base,"
              + " que as lê da pesquisa B. O que a pesquisa não dá é o tanque separador da"
              + " pós-secagem.");

  @GetMapping("/process/steam-groups")
  public SteamGroupsView steamGroups() {
    var report = simulation.ensureCurrent();
    var ts = SimClock.tickTime(report.toTick());

    var groups = new ArrayList<SteamGroupView>();
    for (var range : SteamGroups.RANGES) {
      var tags = SteamGroupTags.of(range.id());

      groups.add(
          new SteamGroupView(
              range.id(),
              tags.role() == null
                  ? "Grupo de vapor " + range.id()
                  : "Grupo de vapor %s · %s".formatted(range.id(), tags.role()),
              range.section().id(),
              range.cylinders(),
              tags.condensateLevel() == null ? SteamGroupTags.CONDENSATE_TANK_NOTE : null,
              tags.role(),
              valueOf(tags.pressure(), report, ts),
              valueOf(tags.siphonDeltaP(), report, ts),
              valueOf(tags.condensateLevel(), report, ts),
              DIVISION_PROVENANCE,
              TAG_MAP_PROVENANCE));
    }

    return new SteamGroupsView(ts, List.copyOf(groups));
  }

  private static TagValue valueOf(String tag, CatchUp.Report report, Instant ts) {
    if (tag == null) {
      return null;
    }
    var variable = ProcessCatalog.get(tag);
    return TagValue.of(tag, report.values().get(tag), variable.unit(), ts, null);
  }

  /** Onde a simulação está, para o {@code /health} e para quem depura. */
  public CatchUp.Report currentReport() {
    return simulation.ensureCurrent();
  }
}
