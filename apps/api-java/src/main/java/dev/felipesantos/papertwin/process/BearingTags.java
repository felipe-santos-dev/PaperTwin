package dev.felipesantos.papertwin.process;

import dev.felipesantos.papertwin.catalog.PerCylinder;
import dev.felipesantos.papertwin.catalog.ProcessCatalog;
import dev.felipesantos.papertwin.machine.SteamGroups;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * A ponte entre o mancal do modelo da máquina e as tags de processo dele.
 *
 * <p>O modelo chama o mancal de {@code MP1-SEC-G4-CS23-MLA}; o catálogo de processo chama as
 * medições dele de {@code VI-5123A}, {@code VE-5123A} e {@code TI-5323A}. São dois vocabulários
 * legítimos — um é de ativo, o outro é de instrumento — e esta classe é o único lugar onde eles se
 * encontram.
 *
 * <p>O lado acionamento é o sufixo {@code A} e o lado comando é o {@code B}. Não é intuitivo, e é
 * o que a lista base usa.
 */
public final class BearingTags {

  private static final Map<String, String> SIDE_SUFFIX = Map.of("LA", "A", "LC", "B");

  private static final String VIBRATION_PATTERN = "VI-51nn";
  private static final String ENVELOPE_PATTERN = "VE-51nn";
  private static final String TEMPERATURE_PATTERN = "TI-53nn";

  /** Um mancal de cilindro secador e as suas quatro identidades. */
  public record Tags(
      String assetTag,
      int cylinder,
      String side,
      String vibration,
      String envelope,
      String temperature) {}

  public static final List<Tags> ALL = build();

  private static final Map<String, Tags> BY_ASSET = indexByAsset();

  private BearingTags() {}

  private static List<Tags> build() {
    var bearings = new ArrayList<Tags>();

    for (int cylinder : SteamGroups.allCylinders()) {
      var group = SteamGroups.ofCylinder(cylinder);
      var cylinderTag = "MP1-SEC-%s-CS%02d".formatted(group, cylinder);

      for (var side : List.of("LA", "LC")) {
        bearings.add(tagsOf(cylinder, side, cylinderTag + "-M" + side));
      }
    }

    return List.copyOf(bearings);
  }

  private static Tags tagsOf(int cylinder, String side, String assetTag) {
    var suffix = SIDE_SUFFIX.get(side);

    return new Tags(
        assetTag,
        cylinder,
        side,
        resolve(VIBRATION_PATTERN + suffix, cylinder, assetTag),
        resolve(ENVELOPE_PATTERN + suffix, cylinder, assetTag),
        resolve(TEMPERATURE_PATTERN + suffix, cylinder, assetTag));
  }

  /**
   * Expande o padrão e confere contra o catálogo.
   *
   * <p>Na carga, e não no uso: uma tag que não existe é erro de modelo, e descobrir isso quando
   * alguém abre a tela de Mancais é tarde.
   */
  private static String resolve(String pattern, int cylinder, String assetTag) {
    var tag = PerCylinder.expandTag(pattern, cylinder);

    if (!ProcessCatalog.has(tag)) {
      throw new IllegalStateException(
          "O mancal %s aponta para %s, que não existe no catálogo. Ou o padrão por cilindro mudou, ou o nº de cilindros do modelo passou do que o CSV cobre."
              .formatted(assetTag, tag));
    }
    return tag;
  }

  private static Map<String, Tags> indexByAsset() {
    var map = new LinkedHashMap<String, Tags>();
    for (var tags : ALL) {
      map.put(tags.assetTag(), tags);
    }
    return Map.copyOf(map);
  }

  /** As tags de processo de um mancal, ou {@code null} se ele não tem. */
  public static Tags of(String assetTag) {
    return BY_ASSET.get(assetTag);
  }
}
