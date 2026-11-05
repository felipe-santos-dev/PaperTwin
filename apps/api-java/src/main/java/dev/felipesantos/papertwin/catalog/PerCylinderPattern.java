package dev.felipesantos.papertwin.catalog;

/**
 * Um padrão de variável que existe uma vez por cilindro secador.
 *
 * <p>No CSV ele aparece como uma linha só, com {@code nn} no lugar do número — a tag {@code
 * VI-51nnA} vale para os 36 cilindros. A expansão é feita sobre os cilindros que o modelo da
 * máquina declara, para o catálogo não poder divergir da máquina.
 *
 * @param tagPattern tag com {@code nn} no lugar do nº do cilindro, ex.: {@code VI-51nnA}
 * @param namePattern nome com {@code nn} no lugar do nº do cilindro
 */
public record PerCylinderPattern(
    String tagPattern,
    String namePattern,
    String area,
    String group,
    String unit,
    double min,
    double max,
    Double target,
    AlarmLimits limits,
    boolean controlled,
    String mv,
    Compression compression,
    VariableSource source,
    Confidence confidence,
    String note) {

  /** O padrão aplicado a um cilindro, já com o grupo de vapor dele. */
  public ProcessVariable expand(int cylinder, String steamGroup) {
    return new ProcessVariable(
        PerCylinder.expandTag(tagPattern, cylinder),
        PerCylinder.expandName(namePattern, cylinder),
        area,
        group,
        unit,
        min,
        max,
        target,
        limits,
        controlled,
        mv,
        compression,
        source,
        confidence,
        note,
        cylinder,
        steamGroup);
  }
}
