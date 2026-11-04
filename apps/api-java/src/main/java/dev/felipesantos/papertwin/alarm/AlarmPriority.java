package dev.felipesantos.papertwin.alarm;

/**
 * As quatro prioridades.
 *
 * <p>Os nomes são nossos — a ISA-18.2 exige que existam prioridades e não diz como chamá-las.
 */
public enum AlarmPriority {
  BAIXA("baixa"),
  MEDIA("média"),
  ALTA("alta"),
  CRITICA("crítica");

  private final String label;

  AlarmPriority(String label) {
    this.label = label;
  }

  @com.fasterxml.jackson.annotation.JsonValue
  public String label() {
    return label;
  }
}
