package dev.felipesantos.papertwin.process;

import dev.felipesantos.papertwin.catalog.VariableSource;

/**
 * Uma relação de primeira ordem com tempo morto.
 *
 * <p>A saída é <b>desvio do ponto de operação</b>, não valor absoluto: a relação diz quanto a saída
 * se afasta de onde estava, e várias relações sobre a mesma saída se somam por superposição — a
 * gramatura ({@code AIC-902}) tem quatro.
 *
 * @param id id da pesquisa, ex.: {@code 6c}. Único no conjunto.
 * @param input TAG da entrada, sem o {@code [k]} das relações por zona
 * @param output TAG da saída, sem o {@code [k]}. Pode ser uma variável de laboratório.
 * @param zoned se a relação é zona a zona, como o controle CD de gramatura
 * @param kp ganho estacionário, por unidade de entrada
 * @param kpUnit unidade do ganho como a pesquisa escreve — prosa, não campo de máquina
 * @param deadTimeS tempo morto, em segundos
 * @param tauS constante de tempo, em segundos
 * @param derivedFrom id da relação de origem, quando esta foi herdada; {@code null} nas do CSV
 */
public record FopdtRelation(
    String id,
    String input,
    String output,
    boolean zoned,
    ReferenceStep step,
    double kp,
    String kpUnit,
    double deadTimeS,
    double tauS,
    String note,
    String derivedFrom,
    VariableSource source) {

  /** A mesma relação com outra entrada, como a observação de uma linha do CSV manda herdar. */
  public FopdtRelation inheritedAs(String newId, String newInput) {
    return new FopdtRelation(
        newId,
        newInput,
        output,
        zoned,
        step,
        kp,
        kpUnit,
        deadTimeS,
        tauS,
        "Herdada da relação %s (%s), como manda a observação dela.".formatted(id, input),
        id,
        VariableSource.ASSUMED);
  }
}
