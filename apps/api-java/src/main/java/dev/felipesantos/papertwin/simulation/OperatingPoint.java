package dev.felipesantos.papertwin.simulation;

import dev.felipesantos.papertwin.catalog.ProcessCatalog;
import dev.felipesantos.papertwin.catalog.ProcessVariable;
import dev.felipesantos.papertwin.process.LabVariables;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * O ponto de operação: o valor de cada variável quando nada está sendo mexido.
 *
 * <p>A rede de relações trabalha em <b>desvio</b> — cada relação diz quanto a saída se afasta de
 * onde estava — então todo valor absoluto do simulador é {@code ponto de operação + desvio}. Sem um
 * ponto de operação por tag, o simulador saberia como o processo reage e não saberia onde ele está.
 *
 * <p>A fonte é o catálogo: a coluna {@code alvo}. Onde ela está vazia, o ponto é o meio da faixa de
 * operação — não há alvo porque a variável não é operada contra um valor (o diâmetro da bobina
 * cresce e volta, a largura é constante), e o meio da faixa é a escolha neutra.
 */
public final class OperatingPoint {

  /** Um ponto de operação de ensaio de laboratório, com a prosa de onde ele saiu. */
  private record LabPoint(String tag, double value, String quote) {}

  /**
   * Pontos de operação dos ensaios de laboratório que alguma relação move.
   *
   * <p>Três relações terminam numa tag {@code LAB-}, e o ensaio não tem campo numérico de alvo: a
   * faixa dele é a prosa da §12.2 da pesquisa. Os três números abaixo são <b>lidos dessa prosa</b>,
   * e a citação fica ao lado para a conferência ser possível sem abrir a pesquisa.
   *
   * <p>Fonte {@code B}: são os valores que a pesquisa dá. O que é nosso é só tê-los transcrito para
   * número.
   */
  private static final List<LabPoint> LAB_POINTS =
      List.of(
          new LabPoint("LAB-1206", 5.2, "5,2 MD / 2,4 CD — tração MD de uma folha de 75 g/m²"),
          new LabPoint("LAB-1206R", 2.17, "≈ 2,17 (5,2 MD / 2,4 CD)"),
          new LabPoint("LAB-1212", 0, "−10 a +10 (alvo 0) — curl nulo é folha plana"));

  private static final Map<String, Double> POINTS = build();

  private OperatingPoint() {}

  /** O ponto de operação de uma variável do catálogo. */
  public static double of(ProcessVariable variable) {
    return variable.target() != null ? variable.target() : (variable.min() + variable.max()) / 2;
  }

  private static Map<String, Double> build() {
    var points = new LinkedHashMap<String, Double>();

    for (var variable : ProcessCatalog.ALL) {
      points.put(variable.tag(), of(variable));
    }

    for (var lab : LAB_POINTS) {
      if (!LabVariables.has(lab.tag())) {
        throw new IllegalStateException(
            "Ponto de operação declarado para %s, que não é ensaio de laboratório. Ou a tag saiu da §12.2 da pesquisa, ou o ponto está no lugar errado."
                .formatted(lab.tag()));
      }
      points.put(lab.tag(), lab.value());
    }

    return Map.copyOf(points);
  }

  /** O ponto de operação de uma tag, ou {@code null} se ela não tem um. */
  public static Double get(String tag) {
    return POINTS.get(tag);
  }

  /**
   * O ponto de operação, ou falha.
   *
   * <p>A rede é montada na carga, e uma relação apontando para uma tag sem ponto de operação é erro
   * de edição — melhor falhar na importação do que simular um processo em que uma variável não sabe
   * onde está.
   */
  public static double require(String tag) {
    var point = POINTS.get(tag);
    if (point == null) {
      throw new IllegalStateException(
          "A tag %s não tem ponto de operação: não está no catálogo nem na lista dos ensaios que as relações movem."
              .formatted(tag));
    }
    return point;
  }

  /**
   * Amplitude do ruído de instrumento de uma tag, como desvio padrão.
   *
   * <p><b>Sai do {@code excDev} do catálogo</b>, e isto é o fecho de um ciclo. O {@code excDev} é o
   * filtro de exceção do historiador: o quanto o valor precisa mudar para ser considerado
   * novidade. Ele existe porque todo instrumento tremelica, e foi escolhido por tag justamente para
   * separar o tremelique do sinal.
   *
   * <p>Então dimensionar o ruído pelo {@code excDev} — metade dele como desvio, o que põe ~95 % do
   * ruído dentro da banda — faz o simulador e o historiador concordarem por construção: o filtro
   * descarta o ruído e passa o que é movimento de verdade. Com um ruído escolhido à parte, uma das
   * duas coisas estaria errada e a taxa de compressão não significaria nada.
   *
   * <p>Sem {@code excDev} no catálogo, o ruído é 0,1 % da faixa — pequeno o bastante para não
   * inventar alarme.
   */
  public static double instrumentNoiseSd(String tag) {
    var variable = ProcessCatalog.get(tag);
    if (variable == null) {
      return 0;
    }

    var excDev = variable.compression().excDev();
    if (excDev != null && excDev > 0) {
      return excDev / 2;
    }

    return (variable.max() - variable.min()) * 0.001;
  }
}
