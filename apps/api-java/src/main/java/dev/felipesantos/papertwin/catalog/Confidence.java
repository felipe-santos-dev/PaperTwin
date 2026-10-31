package dev.felipesantos.papertwin.catalog;

import java.util.Arrays;
import java.util.stream.Collectors;

/** Quanta confiança o valor merece enquanto a MP1 não for medida. */
public enum Confidence {
  ALTA("alta"),
  MEDIA("média"),
  BAIXA("baixa");

  private final String label;

  Confidence(String label) {
    this.label = label;
  }

  public String label() {
    return label;
  }

  public static Confidence parse(String raw) {
    for (var confidence : values()) {
      if (confidence.label.equals(raw)) {
        return confidence;
      }
    }
    throw new IllegalArgumentException(
        "confiança desconhecida: %s. Use %s".formatted(raw, labels()));
  }

  static String labels() {
    return Arrays.stream(values()).map(Confidence::label).collect(Collectors.joining(", "));
  }
}
