import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { allAssets, MP1 } from '../src/machine';

/**
 * Gera a tabela de ativos da máquina para o back-end Java.
 *
 *     npm run generate:java --workspace @mp1/shared
 *
 * ## Por que gerar em vez de portar
 *
 * O modelo da MP1 (`machine/mp1.ts`) é a fonte da verdade das tags, e ele
 * **precisa** continuar em TypeScript: é dele que a cena 3D é montada, e a cena
 * é o front. Mas o back-end Java também precisa dos ativos — ele serve `/assets`
 * e semeia a tabela `asset`.
 *
 * Portar o modelo à mão daria duas fontes para a mesma verdade, e elas
 * divergiriam na primeira tag nova. Gerar resolve: as posições continuam sendo
 * derivadas da geometria em um lugar só, e o Java recebe o resultado já
 * calculado.
 *
 * É o mesmo arranjo que o catálogo de processo já usa — `catalog.generated.ts`
 * sai do CSV — e tem a mesma propriedade: o arquivo gerado é dado, não lógica.
 * As consultas do lado Java ficam escritas à mão, em cima desta tabela.
 */

const OUT = new URL(
  '../../../apps/api-java/src/main/java/dev/felipesantos/papertwin/machine/MachineAssets.java',
  import.meta.url,
);

const assets = allAssets(MP1);

const java = (value: string | null): string => (value === null ? 'null' : JSON.stringify(value));

/**
 * Um número como literal `double` do Java.
 *
 * O sufixo `d` é obrigatório nos campos opcionais: sem ele, `8` é um `int`, e o
 * Java não converte `int` para `Double` implicitamente — só para `Integer`.
 * Nas posições, que são `double` primitivo, o literal inteiro se alarga
 * sozinho; aqui vale para todos, por uniformidade do arquivo gerado.
 */
const number = (value: number | null): string => (value === null ? 'null' : `${String(value)}d`);

const iso = (value: { group: string; support: string } | null): string =>
  value === null ? 'null' : `new IsoClass(${java(value.group)}, ${java(value.support)})`;

const rows = assets
  .map(
    (asset) =>
      `          new Asset(\n` +
      `              ${java(asset.tag)},\n` +
      `              ${java(asset.kind)},\n` +
      `              ${java(asset.label)},\n` +
      `              ${java(asset.section)},\n` +
      `              ${asset.position[0]}, ${asset.position[1]}, ${asset.position[2]},\n` +
      `              ${number(asset.radius)},\n` +
      `              ${number(asset.lengthM)},\n` +
      `              ${java(asset.side)},\n` +
      `              ${java(asset.parentTag)},\n` +
      `              ${java(asset.steamGroup)},\n` +
      `              ${iso(asset.iso)},\n` +
      `              ${java(asset.source)})`,
  )
  .join(',\n');

const sections = MP1.sections
  .map((section) => `          new Section(${java(section.id)}, ${java(section.label)}, ${section.order})`)
  .join(',\n');

const source = `package dev.felipesantos.papertwin.machine;

import dev.felipesantos.papertwin.api.Nullable;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * GERADO — não edite à mão.
 *
 * <p>Saída de {@code packages/shared/scripts/generate-java-assets.ts}, que lê o modelo
 * declarativo da MP1. Para mudar um ativo, mude o modelo e rode:
 *
 * <pre>{@code npm run generate:java --workspace @mp1/shared}</pre>
 *
 * <p>O modelo continua em TypeScript porque é dele que a cena 3D é montada, e as posições
 * continuam sendo derivadas da geometria num lugar só. Portar à mão daria duas fontes para a
 * mesma verdade, e elas divergiriam na primeira tag nova.
 *
 * <p>${String(assets.length)} ativos em ${String(MP1.sections.length)} seções.
 */
public final class MachineAssets {

  /** Classe da ISO 20816-3 de um ativo medido. */
  public record IsoClass(String group, String support) {}

  /**
   * Um ativo da máquina.
   *
   * <p>A posição vai como três campos e sai no JSON como um vetor de três, que é a forma que a
   * cena espera.
   */
  public record Asset(
      String tag,
      String kind,
      String label,
      String section,
      double x,
      double y,
      double z,
      @Nullable Double radius,
      @Nullable Double lengthM,
      @Nullable String side,
      @Nullable String parentTag,
      @Nullable String steamGroup,
      @Nullable IsoClass iso,
      String source) {

    /** A posição no formato que a API publica. */
    public double[] position() {
      return new double[] {x, y, z};
    }

    /** Se o ativo tem medição de vibração — ou seja, se é mancal com classe declarada. */
    public boolean monitored() {
      return iso != null;
    }
  }

  /** Uma seção do processo. */
  public record Section(String id, String label, int order) {}

  public static final List<Section> SECTIONS =
      List.of(
${sections});

  public static final List<Asset> ALL =
      List.of(
${rows});

  private static final Map<String, Asset> BY_TAG = index();

  private MachineAssets() {}

  private static Map<String, Asset> index() {
    var map = new LinkedHashMap<String, Asset>();
    for (var asset : ALL) {
      if (map.put(asset.tag(), asset) != null) {
        throw new IllegalStateException("Tag repetida no modelo: " + asset.tag());
      }
    }
    return Map.copyOf(map);
  }

  public static Asset byTag(String tag) {
    return BY_TAG.get(tag);
  }

  public static boolean has(String tag) {
    return BY_TAG.containsKey(tag);
  }

  /** Os ativos com medição de vibração — os mancais. */
  public static List<Asset> monitored() {
    return ALL.stream().filter(Asset::monitored).toList();
  }

  public static List<Asset> ofSection(String section) {
    return ALL.stream().filter(asset -> asset.section().equals(section)).toList();
  }
}
`;

const outPath = fileURLToPath(OUT);
await writeFile(outPath, source, 'utf8');

console.log(
  `MachineAssets.java: ${String(assets.length)} ativos, ` +
    `${String(MP1.sections.length)} seções, em ${outPath}`,
);
