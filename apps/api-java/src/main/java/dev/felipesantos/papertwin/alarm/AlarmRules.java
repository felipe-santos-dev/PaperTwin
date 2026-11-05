package dev.felipesantos.papertwin.alarm;

import dev.felipesantos.papertwin.catalog.AlarmLimits;
import dev.felipesantos.papertwin.catalog.ProcessCatalog;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * As regras de alarme do modelo ISA-18.2, separadas do motor que as aplica.
 *
 * <p>Os valores são nossos — a norma exige que existam prioridades, banda morta e limite de
 * inundação, e não diz quais. O que não é nosso está marcado: as prioridades que a pesquisa B
 * nomeia em prosa estão numa tabela de exceções, com o motivo ao lado.
 */
public final class AlarmRules {

  /** Janela de inundação, em segundos: dez minutos, como a ISA-18.2 mede. */
  public static final int FLOOD_WINDOW_S = 600;

  /** Mais de dez alarmes em dez minutos é o que a norma considera intratável. */
  public static final int FLOOD_THRESHOLD = 10;

  /**
   * Banda morta: 1 % da faixa de operação.
   *
   * <p>Ela é <b>assimétrica</b> de propósito. O disparo é no limite exato, sem folga — um valor
   * que chegou ao limite estourou o limite. A normalização é que exige voltar uma banda morta para
   * dentro. Sem isso, um valor tremendo em volta do limite dispararia e normalizaria dezenas de
   * vezes por minuto, que é exatamente a inundação que a norma manda evitar.
   */
  public static final double DEADBAND_FRACTION = 0.01;

  /** Teto do engavetamento: um turno. Uma gaveta que sobrevive à troca esconde o alarme de quem assume. */
  public static final int MAX_SHELVE_HOURS = 8;

  private static final Map<AlarmLimitLevel, AlarmPriority> PRIORITY_BY_LIMIT =
      Map.of(
          AlarmLimitLevel.LL, AlarmPriority.ALTA,
          AlarmLimitLevel.L, AlarmPriority.MEDIA,
          AlarmLimitLevel.H, AlarmPriority.MEDIA,
          AlarmLimitLevel.HH, AlarmPriority.ALTA);

  /** Uma prioridade que a pesquisa nomeia, com o motivo que ela dá. */
  private record Override(String tag, AlarmLimitLevel limit, AlarmPriority priority, String why) {}

  /**
   * As prioridades que o próprio catálogo nomeia, na coluna de observação.
   *
   * <p>Fonte {@code B}: estão escritas na pesquisa, em prosa. Ficam numa tabela em vez de serem
   * extraídas por expressão regular da observação — catorze linhas não justificam um analisador, e
   * um analisador erraria quieto quando a prosa mudasse.
   */
  private static final List<Override> OVERRIDES =
      List.of(
          new Override("PDIC-521", AlarmLimitLevel.LL, AlarmPriority.ALTA, "alagamento dos sifões"),
          new Override("PDIC-522", AlarmLimitLevel.LL, AlarmPriority.ALTA, "alagamento dos sifões"),
          new Override("PDIC-523", AlarmLimitLevel.LL, AlarmPriority.ALTA, "alagamento dos sifões"),
          new Override("PDIC-524", AlarmLimitLevel.LL, AlarmPriority.ALTA, "alagamento dos sifões"),
          new Override("PDIC-721", AlarmLimitLevel.LL, AlarmPriority.ALTA, "alagamento dos sifões"),
          new Override("PDIC-722", AlarmLimitLevel.LL, AlarmPriority.ALTA, "alagamento dos sifões"),
          new Override("LIC-531", AlarmLimitLevel.HH, AlarmPriority.ALTA, "tanque separador cheio"),
          new Override("LIC-532", AlarmLimitLevel.HH, AlarmPriority.ALTA, "tanque separador cheio"),
          new Override("LIC-533", AlarmLimitLevel.HH, AlarmPriority.ALTA, "tanque separador cheio"),
          new Override("LIC-534", AlarmLimitLevel.HH, AlarmPriority.ALTA, "tanque separador cheio"),
          new Override(
              "TI-804", AlarmLimitLevel.HH, AlarmPriority.CRITICA, "abertura imediata do nip a 92 °C"),
          new Override(
              "FIC-1105", AlarmLimitLevel.LL, AlarmPriority.CRITICA, "falta de óleo no mancal"),
          new Override(
              "AIC-506", AlarmLimitLevel.HH, AlarmPriority.ALTA, "condensação e gotejamento na capota"),
          new Override(
              "AIC-1102",
              AlarmLimitLevel.HH,
              AlarmPriority.ALTA,
              "troca para água fresca nos chuveiros"));

  private AlarmRules() {}

  /** A prioridade de um par (tag, limite). */
  public static AlarmPriority priority(String tag, AlarmLimitLevel limit) {
    for (var override : OVERRIDES) {
      if (override.tag().equals(tag) && override.limit() == limit) {
        return override.priority();
      }
    }
    return PRIORITY_BY_LIMIT.get(limit);
  }

  /** Se a prioridade deste par está nomeada na pesquisa, o motivo que ela dá; senão {@code null}. */
  public static String priorityReason(String tag, AlarmLimitLevel limit) {
    for (var override : OVERRIDES) {
      if (override.tag().equals(tag) && override.limit() == limit) {
        return override.why();
      }
    }
    return null;
  }

  /** O valor do limite de uma tag no catálogo; {@code null} quando ela não tem esse nível. */
  public static Double threshold(String tag, AlarmLimitLevel limit) {
    var variable = ProcessCatalog.get(tag);
    if (variable == null) {
      return null;
    }
    AlarmLimits limits = variable.limits();
    return switch (limit) {
      case LL -> limits.ll();
      case L -> limits.l();
      case H -> limits.h();
      case HH -> limits.hh();
    };
  }

  /** A banda morta de uma tag, na unidade dela; {@code null} quando a tag não existe. */
  public static Double deadband(String tag) {
    var variable = ProcessCatalog.get(tag);
    if (variable == null) {
      return null;
    }
    return (variable.max() - variable.min()) * DEADBAND_FRACTION;
  }

  /** Se o valor estourou o limite. O disparo é no limite exato, sem banda morta. */
  public static boolean hasCrossed(String tag, AlarmLimitLevel limit, double value) {
    var threshold = threshold(tag, limit);
    if (threshold == null) {
      return false;
    }
    return limit.low() ? value <= threshold : value >= threshold;
  }

  /**
   * Se o valor voltou o suficiente para o alarme normalizar.
   *
   * <p>{@code LL} e {@code L} disparam por baixo, então normalizam quando o valor sobe acima do
   * limite <b>mais</b> a banda morta; {@code H} e {@code HH} ao contrário.
   */
  public static boolean hasReturnedToNormal(String tag, AlarmLimitLevel limit, double value) {
    var threshold = threshold(tag, limit);
    var deadband = deadband(tag);
    if (threshold == null || deadband == null) {
      return false;
    }
    return limit.low() ? value > threshold + deadband : value < threshold - deadband;
  }

  /** O id de um alarme: determinístico, do instante e do par. */
  public static String alarmId(Instant at, String tag, AlarmLimitLevel limit) {
    return "AL-%d-%s-%s".formatted(Math.floorDiv(at.toEpochMilli(), 1000L), tag, limit.name());
  }

  /** Quantos alarmes dispararam na janela de inundação que termina em {@code at}. */
  public static List<Alarm> inFloodWindow(List<Alarm> alarms, Instant at) {
    var from = at.minus(Duration.ofSeconds(FLOOD_WINDOW_S));
    return alarms.stream()
        .filter(alarm -> alarm.raisedAt().isAfter(from) && !alarm.raisedAt().isAfter(at))
        .toList();
  }

  /** Se a taxa de alarmes passou do que a ISA-18.2 considera tratável. */
  public static boolean isFlood(List<Alarm> alarms, Instant at) {
    return inFloodWindow(alarms, at).size() > FLOOD_THRESHOLD;
  }
}
