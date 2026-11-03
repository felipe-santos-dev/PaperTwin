package dev.felipesantos.papertwin.vibration;

import java.util.Map;

/**
 * Classificação de severidade de vibração conforme ISO 20816-3.
 *
 * <p>A norma avalia a velocidade de vibração RMS (mm/s) medida na carcaça do mancal e a enquadra
 * em quatro zonas:
 *
 * <ul>
 *   <li><b>A</b> — máquina recém-comissionada
 *   <li><b>B</b> — aceitável para operação contínua sem restrição
 *   <li><b>C</b> — insatisfatória para operação contínua prolongada; programar intervenção
 *   <li><b>D</b> — severidade suficiente para causar dano
 * </ul>
 *
 * <p>Os limites dependem do porte da máquina e da rigidez da fundação, então eles são dados de
 * entrada e não constantes globais: cada ativo do modelo carrega os seus.
 */
public final class Iso20816 {

  /** Zonas de severidade, da melhor para a pior. */
  public enum Zone {
    A,
    B,
    C,
    D;

    /** Severidade operacional derivada da zona, para colorir a cena e a lista de ativos. */
    public Health health() {
      return switch (this) {
        case A, B -> Health.NORMAL;
        case C -> Health.ATTENTION;
        case D -> Health.CRITICAL;
      };
    }
  }

  /** Severidade mostrada na interface. */
  public enum Health {
    NORMAL("normal"),
    ATTENTION("attention"),
    CRITICAL("critical");

    private final String label;

    Health(String label) {
      this.label = label;
    }

    public String label() {
      return label;
    }
  }

  /**
   * Porte da máquina.
   *
   * <p>{@code GROUP_1}: máquinas grandes, 300 kW a 50 MW. {@code GROUP_2}: médias, 15 a 300 kW.
   */
  public enum MachineGroup {
    GROUP_1("group1"),
    GROUP_2("group2");

    private final String label;

    MachineGroup(String label) {
      this.label = label;
    }

    public String label() {
      return label;
    }
  }

  /** Rigidez do conjunto máquina/fundação. */
  public enum SupportClass {
    RIGID("rigid"),
    FLEXIBLE("flexible");

    private final String label;

    SupportClass(String label) {
      this.label = label;
    }

    public String label() {
      return label;
    }
  }

  /**
   * Fronteiras entre zonas, em mm/s RMS.
   *
   * <p>Um valor exatamente igual à fronteira pertence à zona <b>melhor</b> — a norma define as
   * faixas como "até e inclusive".
   */
  public record Limits(double aToB, double bToC, double cToD) {}

  /** Porte e rigidez de um ativo, como declarado no modelo da máquina. */
  public record IsoClass(MachineGroup group, SupportClass support) {}

  private static final Map<MachineGroup, Map<SupportClass, Limits>> TABLE =
      Map.of(
          MachineGroup.GROUP_1,
              Map.of(
                  SupportClass.RIGID, new Limits(2.3, 4.5, 7.1),
                  SupportClass.FLEXIBLE, new Limits(3.5, 7.1, 11.0)),
          MachineGroup.GROUP_2,
              Map.of(
                  SupportClass.RIGID, new Limits(1.4, 2.8, 4.5),
                  SupportClass.FLEXIBLE, new Limits(2.3, 4.5, 7.1)));

  /**
   * Classe padrão dos mancais dos cilindros secadores: grupo 2 com apoio rígido.
   *
   * <p>Grupo 2 porque o acionamento de cada grupo de secagem fica na faixa de 15 a 300 kW; apoio
   * rígido porque o quadro dos secadores é chumbado na fundação de concreto.
   */
  public static final IsoClass DRYER_BEARING =
      new IsoClass(MachineGroup.GROUP_2, SupportClass.RIGID);

  private Iso20816() {}

  public static Limits limitsFor(MachineGroup group, SupportClass support) {
    return TABLE.get(group).get(support);
  }

  public static Limits limitsOf(IsoClass isoClass) {
    return limitsFor(isoClass.group(), isoClass.support());
  }

  /** Enquadra uma leitura de velocidade RMS (mm/s) na zona da norma. */
  public static Zone classify(double rmsMmS, Limits limits) {
    if (!Double.isFinite(rmsMmS) || rmsMmS < 0) {
      throw new IllegalArgumentException("Velocidade RMS inválida: " + rmsMmS);
    }
    if (rmsMmS <= limits.aToB()) {
      return Zone.A;
    }
    if (rmsMmS <= limits.bToC()) {
      return Zone.B;
    }
    if (rmsMmS <= limits.cToD()) {
      return Zone.C;
    }
    return Zone.D;
  }
}
