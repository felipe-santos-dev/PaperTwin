package dev.felipesantos.papertwin.process;

/**
 * Um degrau de referência, como a pesquisa mediu a relação.
 *
 * <p>O {@code kp} do CSV já é por unidade de entrada, então o degrau não entra na conta — ele fica
 * registrado porque é o degrau em que o ganho foi medido, e um ganho medido com +50 kN/m não vale
 * necessariamente para +500.
 *
 * @param unit unidade do degrau; vazia nas variáveis adimensionais
 */
public record ReferenceStep(double value, String unit) {}
