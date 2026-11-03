package dev.felipesantos.papertwin.alarm;

/**
 * Os três estados de um alarme.
 *
 * <p>O estado sozinho nunca basta para saber se o alarme saiu da lista de ação: um alarme
 * normalizado e não reconhecido ainda precisa de alguém. Por isso {@code acknowledgedAt} é campo
 * próprio e não um quarto estado.
 */
public enum AlarmState {
  ATIVO("ativo"),
  RECONHECIDO("reconhecido"),
  NORMALIZADO("normalizado");

  private final String label;

  AlarmState(String label) {
    this.label = label;
  }

  public String label() {
    return label;
  }

  /** Reconhecer um alarme ativo o leva a reconhecido; nos demais estados não muda nada. */
  public AlarmState acknowledged() {
    return this == ATIVO ? RECONHECIDO : this;
  }
}
