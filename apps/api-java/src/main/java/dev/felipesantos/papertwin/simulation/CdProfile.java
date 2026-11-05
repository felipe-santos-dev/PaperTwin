package dev.felipesantos.papertwin.simulation;

import dev.felipesantos.papertwin.process.ProcessRelations;
import java.util.ArrayList;
import java.util.List;

/**
 * O espalhamento lateral do controle CD.
 *
 * <p>A relação 11 da pesquisa B é zona a zona: mexer na válvula de diluição da zona {@code k} muda
 * a gramatura medida na zona {@code k}. Mas a correção não fica contida na zona — o jato se abre e
 * vaza para os lados com forma gaussiana de σ ≈ 45 mm, o que é menos de uma zona de largura.
 *
 * <p><b>O kernel é normalizado pelo pico, não pela soma.</b> O {@code kp} da relação é a resposta
 * <i>medida na zona k</i>: um degrau de +10 % na zona k dá −0,8 g/m² ali. Normalizar pela soma
 * espalharia esses −0,8 entre a zona e as vizinhas e a zona corrigida responderia menos do que a
 * pesquisa mediu. Com pico 1, a zona k recebe {@code kp} cheio e as vizinhas recebem a fração
 * gaussiana — o efeito total sobre a folha é maior que {@code kp}, e é isso que acontece de
 * verdade.
 */
public final class CdProfile {

  private CdProfile() {}

  /**
   * <b>Metade</b> do kernel gaussiano, do centro para fora, com pico 1.
   *
   * <p>O índice é o afastamento em zonas: {@code [0]} é a própria zona e vale sempre 1. Corta em
   * 3σ, onde o peso já caiu a ~1 % — além disso é ruído numérico.
   *
   * <p>Com os valores da lista base — σ 45 mm e zonas de 57,1 mm — 3σ dá 2,36 zonas, então o
   * alcance é ±2: este vetor tem <b>3</b> elementos (1 / 0,447 / 0,040) e o espalhamento inteiro
   * cobre <b>5</b> zonas. Não confundir o tamanho do meio kernel com o nº de zonas afetadas.
   */
  public static List<Double> kernel(double sigmaMm, double zoneWidthMm) {
    if (!(sigmaMm > 0)) {
      throw new IllegalArgumentException("σ precisa ser maior que zero: " + sigmaMm);
    }
    if (!(zoneWidthMm > 0)) {
      throw new IllegalArgumentException(
          "largura de zona precisa ser maior que zero: " + zoneWidthMm);
    }

    int reach = (int) Math.floor(3 * sigmaMm / zoneWidthMm);
    var weights = new ArrayList<Double>(reach + 1);

    for (int offset = 0; offset <= reach; offset++) {
      double distanceMm = offset * zoneWidthMm;
      weights.add(Math.exp(-(distanceMm * distanceMm) / (2 * sigmaMm * sigmaMm)));
    }

    return List.copyOf(weights);
  }

  /** O kernel com os valores da lista base. */
  public static List<Double> kernel() {
    return kernel(ProcessRelations.CD_SIGMA_MM, ProcessRelations.CD_ZONE_WIDTH_MM);
  }

  /**
   * Como um degrau numa zona se distribui pelo perfil.
   *
   * <p>Devolve um peso por zona da folha: 1 na zona corrigida, a fração gaussiana nas vizinhas e 0
   * fora do alcance. As zonas das bordas <b>truncam</b> — o que vazaria para fora da folha
   * simplesmente não existe, e não é redistribuído.
   */
  public static double[] spreadAcrossZones(int zoneIndex, int zoneCount, List<Double> kernel) {
    if (zoneIndex < 0 || zoneIndex >= zoneCount) {
      throw new IllegalArgumentException(
          "zona %d fora da folha, que tem %d zonas (0 a %d)"
              .formatted(zoneIndex, zoneCount, zoneCount - 1));
    }

    var weights = new double[zoneCount];

    for (int offset = 0; offset < kernel.size(); offset++) {
      double weight = kernel.get(offset);
      int[] zones = offset == 0 ? new int[] {zoneIndex} : new int[] {zoneIndex - offset, zoneIndex + offset};

      for (int zone : zones) {
        if (zone >= 0 && zone < zoneCount) {
          weights[zone] = weight;
        }
      }
    }

    return weights;
  }

  /**
   * O desvio estacionário por zona de um degrau numa zona.
   *
   * <p>O ganho da relação multiplica o degrau e o peso de cada zona, então a zona corrigida recebe
   * {@code kp · degrau} e as vizinhas uma fração disso.
   */
  public static double[] steadyState(
      double kp, double stepValue, int zoneIndex, int zoneCount, List<Double> kernel) {

    var weights = spreadAcrossZones(zoneIndex, zoneCount, kernel);
    var out = new double[weights.length];
    for (int i = 0; i < weights.length; i++) {
      out[i] = weights[i] * kp * stepValue;
    }
    return out;
  }

  /** O desvio estacionário com o nº de zonas e o kernel da lista base. */
  public static double[] steadyState(double kp, double stepValue, int zoneIndex) {
    return steadyState(kp, stepValue, zoneIndex, ProcessRelations.CD_ZONE_COUNT, kernel());
  }
}
