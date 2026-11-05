package dev.felipesantos.papertwin.historian;

import dev.felipesantos.papertwin.catalog.ProcessCatalog;
import dev.felipesantos.papertwin.process.LabVariables;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Os pontos do historiador, um por variável do catálogo.
 *
 * <p>A lista sai do catálogo de processo, na ordem dele, e os ids são o índice começando em 1.
 * Dois motivos para derivar em vez de declarar:
 *
 * <ul>
 *   <li><b>o catálogo é a fonte da verdade das tags</b>, e uma segunda lista escrita à mão
 *       divergiria na primeira tag nova;
 *   <li><b>o id tem de ser o mesmo em todo ambiente.</b> Se ele viesse de uma sequência do banco,
 *       a ordem de semeadura decidiria os ids, e o instantâneo do modo de demonstração — gerado
 *       numa máquina, servido de outra — passaria a apontar para os pontos errados.
 * </ul>
 *
 * <p>Os ensaios de laboratório <b>não</b> são pontos. A lista base diz: sem malha, sem compressão.
 * Eles têm valor real e contínuo na simulação, mas o que o laboratório conhece é a amostra do
 * ensaio, não uma série arquivada. Hoje eles nunca estiveram no catálogo, então o filtro abaixo
 * não remove nada — ele fica como guarda, para uma tag {@code LAB-} que entre no CSV não virar
 * ponto por acidente.
 */
public final class HistorianPoints {

  /**
   * Um ponto do historiador.
   *
   * <p>{@code excDev} e {@code compDev} nulos significam <b>sem compressão</b>: tudo que chega é
   * arquivado. É o caso das variáveis que o catálogo deixa sem as duas colunas.
   *
   * @param pointId id numérico, de 1 em diante. O arquivo guarda o id, não a tag: com 320 pontos,
   *     a tag em texto custa ~12 bytes por linha na maior tabela do banco. É a mesma razão pela
   *     qual o PI tem PointID.
   */
  public record Point(int pointId, String tag, String unit, Double excDev, Double compDev) {

    /** Se o ponto não tem compressão declarada no catálogo. */
    public boolean uncompressed() {
      return excDev == null && compDev == null;
    }
  }

  public static final List<Point> ALL = build();

  private static final Map<String, Point> BY_TAG = indexByTag();
  private static final Map<Integer, Point> BY_ID = indexById();

  private HistorianPoints() {}

  private static List<Point> build() {
    var points = new ArrayList<Point>();

    for (var variable : ProcessCatalog.ALL) {
      if (LabVariables.has(variable.tag())) {
        continue;
      }

      points.add(
          new Point(
              points.size() + 1,
              variable.tag(),
              variable.unit(),
              variable.compression().excDev(),
              variable.compression().compDev()));
    }

    /*
     * O id vai para uma coluna smallint, que vai até 32.767.
     *
     * Hoje são 320 pontos e a folga é enorme, mas o id sai do tamanho do
     * catálogo — que cresce com o nº de cilindros. A verificação é de carga
     * porque o estouro seria silencioso: o Postgres recusaria a inserção muito
     * depois, no meio de uma retomada.
     */
    if (points.size() > Short.MAX_VALUE) {
      throw new IllegalStateException(
          "São %d pontos, e o id do arquivo é smallint (teto %d)."
              .formatted(points.size(), Short.MAX_VALUE));
    }

    return List.copyOf(points);
  }

  private static Map<String, Point> indexByTag() {
    var map = new LinkedHashMap<String, Point>();
    for (var point : ALL) {
      map.put(point.tag(), point);
    }
    return Map.copyOf(map);
  }

  private static Map<Integer, Point> indexById() {
    var map = new LinkedHashMap<Integer, Point>();
    for (var point : ALL) {
      map.put(point.pointId(), point);
    }
    return Map.copyOf(map);
  }

  public static Point byTag(String tag) {
    return BY_TAG.get(tag);
  }

  public static Point byId(int pointId) {
    return BY_ID.get(pointId);
  }

  public static boolean isHistorianTag(String tag) {
    return BY_TAG.containsKey(tag);
  }

  /** Os pontos que têm compressão declarada. */
  public static List<Point> compressed() {
    return ALL.stream().filter(point -> !point.uncompressed()).toList();
  }
}
