package dev.felipesantos.papertwin.alarm;

import dev.felipesantos.papertwin.catalog.ProcessCatalog;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * O motor de alarmes.
 *
 * <p>Ele guarda <b>um alarme aberto por par (tag, limite)</b>, e isso é o que impede a lista de
 * encher: um valor oscilando em volta do limite abre um alarme, não cem. O que a varredura devolve
 * é só o que mudou — quem grava no banco precisa saber o que escrever, e numa máquina em regime a
 * resposta é "nada".
 *
 * <p>O pico guardado é o <b>pior</b> valor desde o disparo, e o sentido de "pior" depende do
 * limite: o máximo num {@code H}/{@code HH}, o mínimo num {@code L}/{@code LL}. Guardar sempre o
 * máximo faria um alarme de falta de óleo registrar como pior momento o instante em que a vazão
 * estava mais alta.
 */
public final class AlarmEngine {

  /** Um par monitorado: a tag, o limite e o valor dele no catálogo. */
  public record MonitoredLimit(String tag, AlarmLimitLevel limit, double threshold) {

    /** {@code true} em {@code LL} e {@code L}: o alarme dispara quando o valor cai. */
    public boolean low() {
      return limit.low();
    }
  }

  /**
   * Todos os pares (tag, limite) que o catálogo declara.
   *
   * <p>Montado uma vez na carga, porque é percorrido a cada varredura: com as tags por cilindro
   * expandidas são centenas de pares, e recalcular a lista por passo seria o gasto dominante de
   * uma retomada de um dia.
   */
  public static final List<MonitoredLimit> MONITORED = build();

  private static List<MonitoredLimit> build() {
    var monitored = new ArrayList<MonitoredLimit>();

    for (var variable : ProcessCatalog.ALL) {
      for (var limit : AlarmLimitLevel.values()) {
        var threshold = AlarmRules.threshold(variable.tag(), limit);
        if (threshold == null) {
          continue;
        }
        monitored.add(new MonitoredLimit(variable.tag(), limit, threshold));
      }
    }

    return List.copyOf(monitored);
  }

  /** O que mudou numa varredura. */
  public record Scan(List<Alarm> raised, List<Alarm> cleared, List<Alarm> updated) {}

  private final Map<String, Alarm> byId = new LinkedHashMap<>();

  /** O alarme aberto de cada par — o que ainda não normalizou. */
  private final Map<String, String> open = new LinkedHashMap<>();

  public AlarmEngine() {
    this(List.of());
  }

  public AlarmEngine(List<Alarm> initial) {
    for (var alarm : initial) {
      byId.put(alarm.id(), alarm);
      if (alarm.state() != AlarmState.NORMALIZADO) {
        open.put(keyOf(alarm.tag(), alarm.limit()), alarm.id());
      }
    }
  }

  private static String keyOf(String tag, AlarmLimitLevel limit) {
    return tag + "|" + limit.name();
  }

  private static double worse(MonitoredLimit limit, double current, double candidate) {
    return limit.low() ? Math.min(current, candidate) : Math.max(current, candidate);
  }

  /** Varre os valores e atualiza os alarmes, devolvendo só o que mudou. */
  public Scan scan(Map<String, Double> values, Instant at) {
    var raised = new ArrayList<Alarm>();
    var cleared = new ArrayList<Alarm>();
    var updated = new ArrayList<Alarm>();

    for (var limit : MONITORED) {
      var value = values.get(limit.tag());
      if (value == null || !Double.isFinite(value)) {
        continue;
      }

      var key = keyOf(limit.tag(), limit.limit());
      var openId = open.get(key);

      if (openId == null) {
        if (!AlarmRules.hasCrossed(limit.tag(), limit.limit(), value)) {
          continue;
        }

        var alarm =
            new Alarm(
                AlarmRules.alarmId(at, limit.tag(), limit.limit()),
                limit.tag(),
                limit.limit(),
                limit.threshold(),
                AlarmRules.priority(limit.tag(), limit.limit()),
                AlarmState.ATIVO,
                at,
                value,
                null,
                null,
                null,
                null,
                null);

        byId.put(alarm.id(), alarm);
        open.put(key, alarm.id());
        raised.add(alarm);
        continue;
      }

      var current = byId.get(openId);
      if (current == null) {
        // o alarme aberto sumiu do mapa: estado inconsistente, melhor soltar o
        // par do que arrastar um id morto
        open.remove(key);
        continue;
      }

      if (AlarmRules.hasReturnedToNormal(limit.tag(), limit.limit(), value)) {
        var next = current.cleared(at);
        byId.put(next.id(), next);
        open.remove(key);
        cleared.add(next);
        continue;
      }

      double peak = worse(limit, current.peakValue(), value);
      if (peak != current.peakValue()) {
        var next = current.withPeak(peak);
        byId.put(next.id(), next);
        updated.add(next);
      }
    }

    return new Scan(List.copyOf(raised), List.copyOf(cleared), List.copyOf(updated));
  }

  /** Todos os alarmes, do mais recente para o mais antigo. */
  public List<Alarm> all() {
    return byId.values().stream()
        .sorted(Comparator.comparing(Alarm::raisedAt).reversed())
        .toList();
  }

  /**
   * Os que ainda pedem alguém: não engavetados, e não reconhecidos — ou reconhecidos mas ainda
   * ativos.
   */
  public List<Alarm> annunciated(Instant at) {
    return all().stream()
        .filter(alarm -> !alarm.shelvedAt(at))
        .filter(alarm -> alarm.acknowledgedAt() == null || alarm.state() == AlarmState.ATIVO)
        .toList();
  }

  public Alarm find(String id) {
    return byId.get(id);
  }

  /**
   * Reconhecer.
   *
   * <p>Devolve {@code null} tanto quando o alarme não existe quanto quando ele já havia sido
   * reconhecido, e é isso que impede dois cliques simultâneos de gravarem dois reconhecimentos.
   */
  public Alarm acknowledge(String id, String by, Instant at) {
    var alarm = byId.get(id);
    if (alarm == null || alarm.acknowledgedAt() != null) {
      return null;
    }

    var next = alarm.acknowledged(by, at);
    byId.put(id, next);
    return next;
  }

  public Alarm shelve(String id, String by, Instant until) {
    var alarm = byId.get(id);
    if (alarm == null) {
      return null;
    }

    var next = alarm.shelved(by, until);
    byId.put(id, next);
    return next;
  }

  public Alarm unshelve(String id) {
    var alarm = byId.get(id);
    if (alarm == null) {
      return null;
    }

    var next = alarm.unshelved();
    byId.put(id, next);
    return next;
  }

  /** Quantos alarmes dispararam na janela de inundação que termina em {@code at}. */
  public int floodCount(Instant at) {
    return AlarmRules.inFloodWindow(all(), at).size();
  }
}
