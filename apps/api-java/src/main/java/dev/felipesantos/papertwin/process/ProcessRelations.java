package dev.felipesantos.papertwin.process;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * As relações causa-efeito do simulador.
 *
 * <p>Os coeficientes vêm de {@code relacoes-fopdt.csv}. O que este arquivo acrescenta é a herança
 * das relações que a pesquisa deixou implícitas, a geometria do controle CD e as consultas.
 */
public final class ProcessRelations {

  /** Largura da folha, em metros — a mesma do modelo da máquina. */
  public static final double WEB_WIDTH_M = 8;

  /**
   * Nº de zonas do controle CD.
   *
   * <p><b>Suposição.</b> O catálogo diz {@code vetor de 120–160 zonas} para a {@code ZIC-205}, uma
   * faixa e não um número — então este 140 é escolha nossa, e não sai da pesquisa B. Ele importa
   * porque converte o espalhamento lateral de milímetros para zonas: com os 8 m de folha, 140 zonas
   * dão ~57 mm cada, e o σ de 45 mm fica em ~0,79 zona. Um nº de zonas diferente muda o quanto o
   * vizinho sente.
   */
  public static final int CD_ZONE_COUNT = 140;

  /**
   * Espalhamento lateral do jato de diluição, em milímetros.
   *
   * <p>Da observação da relação 11: a correção numa zona não fica contida nela, vaza para os lados
   * com forma gaussiana de σ ≈ 45 mm.
   */
  public static final double CD_SIGMA_MM = 45;

  /** Largura de uma zona CD, em milímetros. */
  public static final double CD_ZONE_WIDTH_MM = WEB_WIDTH_M * 1000 / CD_ZONE_COUNT;

  /**
   * Relações que a pesquisa deixou na observação em vez de numa linha.
   *
   * <p>A relação 5 mede {@code PIC-711 → AIC-903} e a observação manda aplicar o mesmo a {@code
   * PIC-712}. Herdar explicitamente é o que faz o simulador responder ao vapor do G6: se ficasse só
   * na prosa, mexer na PIC-712 não mudaria a umidade final.
   *
   * <p>Os coeficientes são copiados da relação de origem em tempo de carga, e não escritos aqui,
   * para não haver dois números para manter. A fonte cai para {@code assumed}: a pesquisa mediu o
   * degrau na PIC-711, não na PIC-712.
   */
  private record Inherited(String id, String from, String input) {}

  private static final List<Inherited> INHERITED = List.of(new Inherited("5d", "5", "PIC-712"));

  /** As do CSV, na ordem do arquivo, e as herdadas depois. */
  public static final List<FopdtRelation> ALL = build();

  private static final Map<String, FopdtRelation> BY_ID = index(ALL);

  private ProcessRelations() {}

  private static List<FopdtRelation> build() {
    var fromCsv = RelationsCsv.read();
    var out = new ArrayList<>(fromCsv);

    for (var inherited : INHERITED) {
      var origin =
          fromCsv.stream()
              .filter(relation -> relation.id().equals(inherited.from()))
              .findFirst()
              .orElseThrow(
                  () ->
                      new IllegalStateException(
                          "Relação %s herda da %s, que não existe mais em relacoes-fopdt.csv. Ou a linha de origem voltou, ou esta herança sai."
                              .formatted(inherited.id(), inherited.from())));

      out.add(origin.inheritedAs(inherited.id(), inherited.input()));
    }

    return List.copyOf(out);
  }

  private static Map<String, FopdtRelation> index(List<FopdtRelation> relations) {
    var byId = new LinkedHashMap<String, FopdtRelation>();
    for (var relation : relations) {
      if (byId.put(relation.id(), relation) != null) {
        throw new IllegalStateException("Id de relação repetido: " + relation.id());
      }
    }
    return Map.copyOf(byId);
  }

  /** Busca uma relação pelo id, ou {@code null}. */
  public static FopdtRelation get(String id) {
    return BY_ID.get(id);
  }

  /**
   * As relações que respondem numa saída.
   *
   * <p>Mais de uma é o caso normal: a gramatura tem quatro, e o desvio dela é a soma das quatro por
   * superposição.
   */
  public static List<FopdtRelation> forOutput(String tag) {
    return ALL.stream().filter(relation -> relation.output().equals(tag)).toList();
  }

  /** As relações que uma entrada move. */
  public static List<FopdtRelation> forInput(String tag) {
    return ALL.stream().filter(relation -> relation.input().equals(tag)).toList();
  }

  /** As relações zona a zona. */
  public static List<FopdtRelation> zoned() {
    return ALL.stream().filter(FopdtRelation::zoned).toList();
  }

  /** As saídas que alguma relação move, sem repetir, na ordem em que aparecem. */
  public static List<String> drivenOutputs() {
    return ALL.stream().map(FopdtRelation::output).distinct().toList();
  }
}
