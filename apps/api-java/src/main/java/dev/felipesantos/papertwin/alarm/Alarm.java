package dev.felipesantos.papertwin.alarm;

import java.time.Instant;

/**
 * Um alarme, com a sua história.
 *
 * @param id determinístico: {@code AL-<instante em segundos>-<tag>-<limite>}
 * @param threshold valor do limite no momento do disparo, copiado do catálogo
 * @param peakValue pior valor atingido desde o disparo — não o último
 * @param acknowledgedAt {@code null} enquanto ninguém reconheceu
 * @param clearedAt {@code null} enquanto o valor não voltou
 * @param shelvedUntil até quando está engavetado; {@code null} quando não está
 */
public record Alarm(
    String id,
    String tag,
    AlarmLimitLevel limit,
    double threshold,
    AlarmPriority priority,
    AlarmState state,
    Instant raisedAt,
    double peakValue,
    Instant acknowledgedAt,
    String acknowledgedBy,
    Instant clearedAt,
    Instant shelvedUntil,
    String shelvedBy) {

  /** Se o alarme está engavetado num instante. */
  public boolean shelvedAt(Instant at) {
    return shelvedUntil != null && shelvedUntil.isAfter(at);
  }

  public Alarm withPeak(double peak) {
    return new Alarm(id, tag, limit, threshold, priority, state, raisedAt, peak,
        acknowledgedAt, acknowledgedBy, clearedAt, shelvedUntil, shelvedBy);
  }

  public Alarm acknowledged(String by, Instant at) {
    return new Alarm(id, tag, limit, threshold, priority, state.acknowledged(), raisedAt,
        peakValue, at, by, clearedAt, shelvedUntil, shelvedBy);
  }

  public Alarm cleared(Instant at) {
    return new Alarm(id, tag, limit, threshold, priority, AlarmState.NORMALIZADO, raisedAt,
        peakValue, acknowledgedAt, acknowledgedBy, at, shelvedUntil, shelvedBy);
  }

  public Alarm shelved(String by, Instant until) {
    return new Alarm(id, tag, limit, threshold, priority, state, raisedAt, peakValue,
        acknowledgedAt, acknowledgedBy, clearedAt, until, by);
  }

  public Alarm unshelved() {
    return new Alarm(id, tag, limit, threshold, priority, state, raisedAt, peakValue,
        acknowledgedAt, acknowledgedBy, clearedAt, null, null);
  }
}
