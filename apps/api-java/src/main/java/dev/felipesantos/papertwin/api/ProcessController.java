package dev.felipesantos.papertwin.api;

import dev.felipesantos.papertwin.catalog.ProcessCatalog;
import dev.felipesantos.papertwin.catalog.ProcessVariable;
import dev.felipesantos.papertwin.db.HistorianRepository;
import dev.felipesantos.papertwin.historian.HistorianPoints;
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

  /** Um valor do instante atual. */
  public record TagValue(
      String tag, Double value, String unit, Instant ts, Double setpoint, String zone) {}

  public record Values(Instant ts, int count, List<TagValue> values) {}

  @GetMapping("/process/values")
  public Values values() {
    var report = simulation.ensureCurrent();
    var ts = SimClock.tickTime(report.toTick());

    var out = new ArrayList<TagValue>(report.values().size());
    for (var variable : ProcessCatalog.ALL) {
      var value = report.values().get(variable.tag());
      if (value == null) {
        continue;
      }
      out.add(new TagValue(variable.tag(), value, variable.unit(), ts, null, null));
    }

    return new Values(ts, out.size(), List.copyOf(out));
  }

  /** O detalhe de uma tag: o que ela é, se aceita escrita e quanto vale agora. */
  public record TagDetail(
      ProcessVariable variable,
      boolean writable,
      String notWritableBecause,
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
        new TagValue(tag, value, variable.unit(), ts, null, null));
  }

  /** A tendência de uma tag: as colunas do gráfico e as âncoras. */
  @GetMapping("/process/tags/{tag}/trend")
  public HistorianRepository.Trend trend(
      @PathVariable String tag,
      @RequestParam(required = false) String from,
      @RequestParam(required = false) String to,
      @RequestParam(required = false) Integer buckets) {

    var point = HistorianPoints.byTag(tag);
    if (point == null) {
      throw ApiErrors.notFound("A tag %s não é ponto do historiador".formatted(tag));
    }

    var report = simulation.ensureCurrent();
    var end = to == null ? SimClock.tickTime(report.toTick()) : Instant.parse(to);
    var start = from == null ? end.minusSeconds(4 * 3600) : Instant.parse(from);

    return historian.trend(point.pointId(), start, end, buckets);
  }

  /** Um grupo de vapor, com as tags dele e o que elas valem agora. */
  public record SteamGroupView(
      String id,
      String role,
      String section,
      List<Integer> cylinders,
      Map<String, Double> values,
      String pressureTag,
      String siphonDeltaPTag,
      String condensateLevelTag,
      String condensateNote) {}

  public record SteamGroupsView(Instant ts, List<SteamGroupView> groups) {}

  @GetMapping("/process/steam-groups")
  public SteamGroupsView steamGroups() {
    var report = simulation.ensureCurrent();
    var ts = SimClock.tickTime(report.toTick());

    var groups = new ArrayList<SteamGroupView>();
    for (var range : SteamGroups.RANGES) {
      var tags = SteamGroupTags.of(range.id());

      var values = new java.util.LinkedHashMap<String, Double>();
      for (var tag : new String[] {tags.pressure(), tags.siphonDeltaP(), tags.condensateLevel()}) {
        if (tag != null && report.values().containsKey(tag)) {
          values.put(tag, report.values().get(tag));
        }
      }

      groups.add(
          new SteamGroupView(
              range.id(),
              tags.role(),
              range.section().id(),
              range.cylinders(),
              values,
              tags.pressure(),
              tags.siphonDeltaP(),
              tags.condensateLevel(),
              tags.condensateLevel() == null ? SteamGroupTags.CONDENSATE_TANK_NOTE : null));
    }

    return new SteamGroupsView(ts, List.copyOf(groups));
  }

  /** Onde a simulação está, para o {@code /health} e para quem depura. */
  public CatchUp.Report currentReport() {
    return simulation.ensureCurrent();
  }
}
