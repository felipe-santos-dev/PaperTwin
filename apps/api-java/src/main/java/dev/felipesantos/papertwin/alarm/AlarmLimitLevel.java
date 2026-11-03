package dev.felipesantos.papertwin.alarm;

/**
 * Os quatro níveis de limite, na ordem em que a ISA-18.2 os nomeia.
 *
 * <p>{@code LL} e {@code L} disparam quando o valor <b>cai</b>; {@code H} e {@code HH} quando ele
 * sobe. É essa a única diferença de comportamento entre eles, e ela fica aqui em vez de num campo
 * booleano em cada lugar que precise saber.
 */
public enum AlarmLimitLevel {
  LL,
  L,
  H,
  HH;

  /** {@code true} em {@code LL} e {@code L}: o alarme dispara quando o valor cai. */
  public boolean low() {
    return this == LL || this == L;
  }
}
