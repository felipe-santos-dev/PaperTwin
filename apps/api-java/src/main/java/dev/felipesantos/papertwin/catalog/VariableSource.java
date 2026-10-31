package dev.felipesantos.papertwin.catalog;

import java.util.Arrays;
import java.util.stream.Collectors;

/**
 * De onde vem o valor de uma variável.
 *
 * <p>Vocabulário próprio do catálogo, separado da proveniência do modelo da máquina: aqui {@code B}
 * e {@code ISO 20816-3} dizem em qual documento o número foi lido, enquanto lá {@code validated}
 * significa conferido em campo contra a MP1. Um valor da pesquisa B não é um valor conferido na
 * máquina.
 */
public enum VariableSource {
  B("B"),
  ISO_20816_3("ISO 20816-3"),
  ASSUMED("assumed");

  private final String label;

  VariableSource(String label) {
    this.label = label;
  }

  /** O texto como o CSV escreve. */
  public String label() {
    return label;
  }

  public static VariableSource parse(String raw) {
    for (var source : values()) {
      if (source.label.equals(raw)) {
        return source;
      }
    }
    throw new IllegalArgumentException(
        "fonte desconhecida: %s. Use %s".formatted(raw, labels()));
  }

  static String labels() {
    return Arrays.stream(values()).map(VariableSource::label).collect(Collectors.joining(", "));
  }
}
