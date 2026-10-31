package dev.felipesantos.papertwin.catalog;

/**
 * Ponto de partida da compressão do histórico, no estilo do PI.
 *
 * <p>{@code excDev} é o filtro de exceção (o quanto o valor precisa mudar para ser considerado) e
 * {@code compDev} o desvio da porta oscilante (o quanto a reta pode errar antes de gravar um
 * ponto). Os dois saem da lista base e devem ser reajustados depois de medir a taxa de compressão
 * de verdade.
 */
public record Compression(Double excDev, Double compDev) {

  /** Sem compressão: tudo que chega é arquivado. */
  public boolean none() {
    return excDev == null && compDev == null;
  }
}
