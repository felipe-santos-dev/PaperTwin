package dev.felipesantos.papertwin.catalog;

import dev.felipesantos.papertwin.api.Nullable;
/**
 * Limites de alarme, no padrão de quatro níveis.
 *
 * <p>{@code null} quando a variável não tem aquele nível. Eles <b>não</b> ficam presos à faixa
 * {@code min}–{@code max}: um {@code LL} abaixo do mínimo de operação é o caso normal, como na
 * vazão de óleo de lubrificação, cujo mínimo operacional é 1,5 L/min e cujo alarme crítico é 1,0.
 */
public record AlarmLimits(
    @Nullable Double ll, @Nullable Double l, @Nullable Double h, @Nullable Double hh) {

  public static final AlarmLimits NONE = new AlarmLimits(null, null, null, null);
}
