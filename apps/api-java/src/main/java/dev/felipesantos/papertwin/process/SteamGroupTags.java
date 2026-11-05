package dev.felipesantos.papertwin.process;

import dev.felipesantos.papertwin.catalog.ProcessCatalog;
import dev.felipesantos.papertwin.machine.SteamGroups;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * As tags de processo de cada grupo de vapor.
 *
 * <p>Separado da divisão dos cilindros ({@link SteamGroups}) porque as duas coisas têm
 * proveniência diferente: a divisão é suposição nossa, o mapa de tags sai da pesquisa B. Misturar
 * as duas faria uma suposição herdar a credibilidade de um documento.
 *
 * <p>Numeração da lista base: pré-secagem usa {@code 51x} para vapor, {@code 52x} para ΔP e {@code
 * 53x} para nível; pós-secagem usa {@code 71x} e {@code 72x}, sem nível.
 */
public final class SteamGroupTags {

  /**
   * O nível do tanque separador da pós-secagem não tem tag.
   *
   * <p>A pesquisa B dá só o ΔP dos sifões. O tanque existe na máquina; a medição não está no
   * catálogo — e inventar uma tag para ele daria ao simulador uma medida que ninguém especificou.
   */
  public static final String CONDENSATE_TANK_NOTE =
      "A pesquisa B não dá tag de nível para o tanque separador da pós-secagem, só o ΔP dos "
          + "sifões. O tanque existe na máquina; a medição não está no catálogo.";

  /**
   * As tags de um grupo.
   *
   * @param role o papel do grupo na secagem, como a pesquisa B o nomeia; {@code null} nos que ela
   *     não nomeia
   * @param pressure pressão de vapor do grupo — a válvula
   * @param siphonDeltaP ΔP dos sifões, que diz se o condensado está saindo
   * @param condensateLevel nível do tanque separador; {@code null} quando não há tag
   */
  public record Tags(
      String id, String role, String pressure, String siphonDeltaP, String condensateLevel) {}

  private static final List<Tags> TAGS =
      List.of(
          new Tags("G1", "aquecimento", "PIC-511", "PDIC-521", "LIC-531"),
          new Tags("G2", null, "PIC-512", "PDIC-522", "LIC-532"),
          new Tags("G3", null, "PIC-513", "PDIC-523", "LIC-533"),
          new Tags("G4", "grupo principal", "PIC-514", "PDIC-524", "LIC-534"),
          new Tags("G5", null, "PIC-711", "PDIC-721", null),
          new Tags("G6", null, "PIC-712", "PDIC-722", null));

  private static final Map<String, Tags> BY_ID = index();

  private SteamGroupTags() {}

  /**
   * Resolve cada tag contra o catálogo na carga.
   *
   * <p>Uma tag de grupo que não existe no catálogo é erro de edição, e falhar aqui é melhor do que
   * um grupo que aparece na tela sem pressão.
   */
  private static Map<String, Tags> index() {
    var byId = new LinkedHashMap<String, Tags>();

    for (var tags : TAGS) {
      if (SteamGroups.range(tags.id()) == null) {
        throw new IllegalStateException(
            "Mapa de tags do grupo %s, que não está na divisão dos cilindros.".formatted(tags.id()));
      }

      for (var tag : new String[] {tags.pressure(), tags.siphonDeltaP(), tags.condensateLevel()}) {
        if (tag != null && !ProcessCatalog.has(tag)) {
          throw new IllegalStateException(
              "O grupo %s aponta para %s, que não existe no catálogo de processo."
                  .formatted(tags.id(), tag));
        }
      }

      byId.put(tags.id(), tags);
    }

    if (byId.size() != SteamGroups.RANGES.size()) {
      throw new IllegalStateException(
          "Há %d grupos na divisão e %d no mapa de tags. Todo grupo precisa dos dois."
              .formatted(SteamGroups.RANGES.size(), byId.size()));
    }

    return Map.copyOf(byId);
  }

  /** As tags de um grupo pelo id, ou {@code null}. */
  public static Tags of(String groupId) {
    return BY_ID.get(groupId);
  }

  /** As tags do grupo de um cilindro. */
  public static Tags ofCylinder(int cylinder) {
    return of(SteamGroups.ofCylinder(cylinder));
  }

  /** A tag de pressão do grupo de um cilindro — a que define a temperatura de superfície dele. */
  public static String pressureOfCylinder(int cylinder) {
    return ofCylinder(cylinder).pressure();
  }

  /** Todos os grupos, na ordem. */
  public static List<Tags> all() {
    return TAGS;
  }
}
