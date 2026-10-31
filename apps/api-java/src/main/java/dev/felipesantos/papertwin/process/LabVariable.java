package dev.felipesantos.papertwin.process;

/**
 * Um ensaio de laboratório.
 *
 * <p>Não é malha nem tem compressão de histórico — é bancada, com norma, instrumento e frequência.
 *
 * @param range faixa como a pesquisa escreve, em prosa: as células da §12.2 vêm em LaTeX e extrair
 *     número de lá seria regex frágil para doze linhas que não mudam
 * @param derivedFrom tag do ensaio que origina este, quando ele é derivado e não medido
 */
public record LabVariable(
    String tag,
    String name,
    String unit,
    String range,
    String standard,
    String instrument,
    String sampling,
    String correction,
    String derivedFrom) {

  /** Se o ensaio é medido direto, e não calculado a partir de outro. */
  public boolean measured() {
    return derivedFrom == null;
  }
}
