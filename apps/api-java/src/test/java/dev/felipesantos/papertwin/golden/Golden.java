package dev.felipesantos.papertwin.golden;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/**
 * Acesso ao gabarito da implementação TypeScript.
 *
 * <p>Os arquivos em {@code reference/golden/} guardam a entrada e a saída que a implementação
 * TypeScript produziu para casos escolhidos. Os testes daqui leem a entrada, rodam a implementação
 * Java e comparam com a saída.
 *
 * <p>O gabarito <b>não é a especificação</b>: ele é o que a outra implementação faz. Se um caso
 * revelar um erro lá, o certo é corrigir os dois lados e regravar — não ensinar este lado a errar
 * igual.
 *
 * <p>Os arquivos são lidos do disco, e não do classpath. Eles são material de teste e comparação
 * entre duas implementações, não dado que a aplicação precise em produção: pôr 275 kB de JSON
 * dentro do jar que roda num host de 512 MB seria pagar por algo que nunca é lido lá.
 */
public final class Golden {

  private static final ObjectMapper MAPPER = new ObjectMapper();

  private Golden() {}

  /**
   * A raiz de {@code reference/golden/}.
   *
   * <p>Encontrada subindo a partir do diretório de trabalho até achar a pasta, em vez de escrita
   * como {@code ../../reference}: o surefire roda com o diretório do módulo e o IDE às vezes com o
   * da raiz do repositório, e um caminho relativo fixo funcionaria em um e não no outro.
   */
  public static Path root() {
    var current = Path.of("").toAbsolutePath();

    for (var directory = current; directory != null; directory = directory.getParent()) {
      var candidate = directory.resolve("reference").resolve("golden");
      if (Files.isDirectory(candidate)) {
        return candidate;
      }
    }

    throw new IllegalStateException(
        "reference/golden não foi encontrado a partir de %s. Gere o gabarito com `npm run golden --workspace @mp1/api`."
            .formatted(current));
  }

  /** Um arquivo do gabarito, pelo caminho relativo — ex.: {@code fopdt/step-responses.json}. */
  public static JsonNode read(String relativePath) {
    var file = root().resolve(relativePath);
    try {
      return MAPPER.readTree(Files.readString(file));
    } catch (IOException e) {
      throw new UncheckedIOException("falha lendo o gabarito " + file, e);
    }
  }

  /** Um vetor de números do gabarito. */
  public static double[] doubles(JsonNode node) {
    var out = new double[node.size()];
    for (int i = 0; i < out.length; i++) {
      out[i] = node.get(i).asDouble();
    }
    return out;
  }

  /** Uma lista de números do gabarito. */
  public static List<Double> doubleList(JsonNode node) {
    var out = new ArrayList<Double>(node.size());
    for (var element : node) {
      out.add(element.asDouble());
    }
    return List.copyOf(out);
  }
}
