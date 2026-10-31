package dev.felipesantos.papertwin.catalog;

import dev.felipesantos.papertwin.machine.SteamGroups;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Catálogo de variáveis de processo da MP1.
 *
 * <p>Os valores vêm da lista base do simulador, lidos de {@code catalogo-base.csv} na carga da
 * classe. O que este arquivo acrescenta é a expansão dos padrões por cilindro e as consultas.
 *
 * <p>A expansão é feita sobre os cilindros que o <b>modelo da máquina</b> declara, e não sobre um
 * número fixo. O CSV diz {@code nn = 01–36} porque hoje o modelo tem 36 cilindros; se o nº de pares
 * mudar, o catálogo acompanha e as duas listas de tags não podem divergir.
 *
 * <p>Tudo acontece uma vez, na carga: um CSV inválido derruba a aplicação ao subir, em vez de virar
 * um catálogo pela metade que só se revela quando alguém abre uma tela.
 */
public final class ProcessCatalog {

  private static final CatalogCsv.Catalog SOURCE = CatalogCsv.read();

  /** As de tag própria, na ordem do CSV; as por cilindro depois, agrupadas por padrão. */
  public static final List<ProcessVariable> ALL = build();

  private static final Map<String, ProcessVariable> BY_TAG = index(ALL);

  private ProcessCatalog() {}

  private static List<ProcessVariable> build() {
    var out = new ArrayList<>(SOURCE.concrete());

    for (var pattern : SOURCE.patterns()) {
      for (int cylinder : SteamGroups.allCylinders()) {
        out.add(pattern.expand(cylinder, SteamGroups.ofCylinder(cylinder)));
      }
    }

    return List.copyOf(out);
  }

  private static Map<String, ProcessVariable> index(List<ProcessVariable> variables) {
    var byTag = new LinkedHashMap<String, ProcessVariable>(variables.size() * 2);
    for (var variable : variables) {
      var previous = byTag.put(variable.tag(), variable);
      if (previous != null) {
        throw new IllegalStateException(
            "Tag repetida no catálogo depois da expansão: %s. Um padrão por cilindro colidiu com uma tag própria."
                .formatted(variable.tag()));
      }
    }
    return Map.copyOf(byTag);
  }

  /** Os padrões por cilindro, como o CSV os traz. */
  public static List<PerCylinderPattern> patterns() {
    return SOURCE.patterns();
  }

  /** As variáveis de tag própria, sem as expandidas. */
  public static List<ProcessVariable> concrete() {
    return SOURCE.concrete();
  }

  /** Busca uma variável pela tag, ou {@code null} se não existir no catálogo. */
  public static ProcessVariable get(String tag) {
    return BY_TAG.get(tag);
  }

  /** Se a tag existe no catálogo. */
  public static boolean has(String tag) {
    return BY_TAG.containsKey(tag);
  }

  /** As malhas de controle — as que têm setpoint. */
  public static List<ProcessVariable> controlled() {
    return ALL.stream().filter(ProcessVariable::controlled).toList();
  }

  /** Variáveis de uma área do processo, ex.: {@code pré-secagem}. */
  public static List<ProcessVariable> ofArea(String area) {
    return ALL.stream().filter(variable -> area.equals(variable.area())).toList();
  }

  /** Variáveis de um cilindro secador. */
  public static List<ProcessVariable> ofCylinder(int cylinder) {
    return ALL.stream()
        .filter(variable -> variable.cylinder() != null && variable.cylinder() == cylinder)
        .toList();
  }

  /**
   * O que ainda não foi conferido na MP1, para a lista de pendências do README.
   *
   * <p>Junta as duas perguntas que a lista base responde por coluna: de onde veio o número e quanto
   * ele merece confiança. Uma variável de fonte {@code B} com confiança baixa é pendência tanto
   * quanto uma {@code assumed}.
   */
  public static List<ProcessVariable> pending() {
    return ALL.stream().filter(ProcessVariable::pending).toList();
  }
}
