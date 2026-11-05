package dev.felipesantos.papertwin.machine;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * A divisão dos cilindros secadores em grupos de vapor.
 *
 * <p>Um grupo é o conjunto de cilindros alimentado pela mesma válvula de vapor, com o seu próprio
 * ΔP de sifões e o seu tanque separador de condensado. É a unidade em que a secagem é operada:
 * ninguém ajusta um cilindro, ajusta um grupo.
 *
 * <p>Aqui mora só a <b>divisão</b> — quais cilindros, em qual seção. As tags de processo de cada
 * grupo ficam em {@code process}, resolvidas contra o catálogo, porque as duas coisas têm
 * proveniência diferente: a divisão é suposição nossa, o mapa de tags sai da pesquisa B.
 */
public final class SteamGroups {

  /** Seção em que um grupo de vapor pode estar. */
  public enum DryingSection {
    PRE_DRYER("pre-dryer"),
    POST_DRYER("post-dryer");

    private final String id;

    DryingSection(String id) {
      this.id = id;
    }

    public String id() {
      return id;
    }
  }

  /** Um grupo de vapor como faixa de cilindros. */
  public record SteamGroupRange(String id, int from, int to, DryingSection section) {

    /** Os nºs de cilindro do grupo, em ordem. */
    public List<Integer> cylinders() {
      var out = new ArrayList<Integer>(to - from + 1);
      for (int cylinder = from; cylinder <= to; cylinder++) {
        out.add(cylinder);
      }
      return List.copyOf(out);
    }
  }

  /**
   * Pares de cilindros, como o modelo da máquina declara.
   *
   * <p>São suposição — o protótipo usou 13 e 5 — e por isso a contagem é derivada deles em vez de
   * escrita como 36: quando o número real chegar, a numeração e as faixas dos grupos têm de
   * acompanhar juntas, e é isso que a verificação de cobertura cobra.
   */
  public static final int PRE_DRYER_PAIRS = 13;

  public static final int POST_DRYER_PAIRS = 5;

  /** Nº de cilindros secadores: dois por par, numerados em sequência contínua. */
  public static final int DRYER_CYLINDER_COUNT = (PRE_DRYER_PAIRS + POST_DRYER_PAIRS) * 2;

  /** Último cilindro da pré-secagem; o seguinte já é da pós. */
  public static final int LAST_PRE_DRYER_CYLINDER = PRE_DRYER_PAIRS * 2;

  /**
   * As faixas dos seis grupos, como a lista base do simulador escreve.
   *
   * <p><b>Suposição</b>, junto com o nº de pares que fixa os limites. O único ponto fixo é o CS23
   * estar no G4, porque a tag {@code MP1-SEC-G4-CS23-MLA} aparece no conceito de tela de
   * monitoramento. A divisão real sai do mapa de rolos.
   */
  public static final List<SteamGroupRange> RANGES =
      List.of(
          new SteamGroupRange("G1", 1, 6, DryingSection.PRE_DRYER),
          new SteamGroupRange("G2", 7, 12, DryingSection.PRE_DRYER),
          new SteamGroupRange("G3", 13, 18, DryingSection.PRE_DRYER),
          new SteamGroupRange("G4", 19, 26, DryingSection.PRE_DRYER),
          new SteamGroupRange("G5", 27, 32, DryingSection.POST_DRYER),
          new SteamGroupRange("G6", 33, 36, DryingSection.POST_DRYER));

  private static final Map<Integer, SteamGroupRange> BY_CYLINDER = new LinkedHashMap<>();
  private static final Map<String, SteamGroupRange> BY_ID = new LinkedHashMap<>();

  static {
    assertCoverage(RANGES);
    for (var group : RANGES) {
      BY_ID.put(group.id(), group);
      for (int cylinder = group.from(); cylinder <= group.to(); cylinder++) {
        BY_CYLINDER.put(cylinder, group);
      }
    }
  }

  private SteamGroups() {}

  /** A seção a que um nº de cilindro pertence, pela numeração. */
  public static DryingSection sectionOfCylinder(int cylinder) {
    return cylinder <= LAST_PRE_DRYER_CYLINDER
        ? DryingSection.PRE_DRYER
        : DryingSection.POST_DRYER;
  }

  /**
   * Duas invariantes que precisam valer para o modelo fazer sentido, verificadas ao carregar a
   * classe.
   *
   * <ol>
   *   <li><b>Cobertura contígua de 1 a {@code DRYER_CYLINDER_COUNT}.</b> Sem isso um cilindro
   *       ficaria sem grupo — e a tag do ativo é montada a partir do grupo, então ele simplesmente
   *       não existiria, ou existiria duplicado se duas faixas se sobrepusessem.
   *   <li><b>Grupo contido numa seção.</b> Um grupo é alimentado por uma válvula de vapor, que fica
   *       numa das duas secagens: {@code PIC-51x} na pré, {@code PIC-71x} na pós. Uma faixa que
   *       atravessasse a fronteira não teria tag de pressão.
   * </ol>
   *
   * <p>Falhar no carregamento é de propósito: estes dois erros são de edição do modelo, não de
   * entrada do usuário, e um modelo incoerente não deve chegar a subir um servidor.
   */
  static void assertCoverage(List<SteamGroupRange> groups) {
    if (groups.isEmpty()) {
      throw new IllegalStateException("Nenhum grupo de vapor declarado.");
    }

    int expected = 1;

    for (var group : groups) {
      if (group.from() != expected) {
        throw new IllegalStateException(
            "Grupos de vapor com furo ou sobreposição: %s começa no cilindro %d, e o esperado era %d. As faixas precisam cobrir 1 a %d sem buraco e sem repetir."
                .formatted(group.id(), group.from(), expected, DRYER_CYLINDER_COUNT));
      }
      if (group.to() < group.from()) {
        throw new IllegalStateException(
            "Grupo de vapor %s termina antes de começar.".formatted(group.id()));
      }
      if (sectionOfCylinder(group.from()) != group.section()
          || sectionOfCylinder(group.to()) != group.section()) {
        throw new IllegalStateException(
            "Grupo de vapor %s (cilindros %d–%d) está declarado na seção %s, mas atravessa a fronteira entre pré-secagem e pós-secagem, que está no cilindro %d. Um grupo é uma válvula de vapor, e a válvula fica numa seção só."
                .formatted(
                    group.id(),
                    group.from(),
                    group.to(),
                    group.section().id(),
                    LAST_PRE_DRYER_CYLINDER));
      }
      expected = group.to() + 1;
    }

    if (expected - 1 != DRYER_CYLINDER_COUNT) {
      throw new IllegalStateException(
          "Os grupos de vapor cobrem até o cilindro %d, mas a secagem tem %d cilindros (%d + %d pares). Mudar o nº de pares exige refazer as faixas."
              .formatted(expected - 1, DRYER_CYLINDER_COUNT, PRE_DRYER_PAIRS, POST_DRYER_PAIRS));
    }
  }

  /** O id do grupo de vapor de um cilindro, ex.: 23 → {@code G4}. */
  public static String ofCylinder(int cylinder) {
    var group = BY_CYLINDER.get(cylinder);
    if (group == null) {
      throw new IllegalArgumentException(
          "Cilindro secador %d fora dos grupos conhecidos".formatted(cylinder));
    }
    return group.id();
  }

  /** A faixa de um grupo pelo id, ou {@code null} se não existir. */
  public static SteamGroupRange range(String id) {
    return BY_ID.get(id);
  }

  /** Os nºs de cilindro de um grupo, em ordem; vazio se o grupo não existir. */
  public static List<Integer> cylindersOf(String id) {
    var group = range(id);
    return group == null ? List.of() : group.cylinders();
  }

  /** Todos os cilindros da secagem, de 1 a {@code DRYER_CYLINDER_COUNT}. */
  public static List<Integer> allCylinders() {
    return List.copyOf(BY_CYLINDER.keySet());
  }
}
