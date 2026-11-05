package dev.felipesantos.papertwin.process;

import dev.felipesantos.papertwin.catalog.ProcessCatalog;
import dev.felipesantos.papertwin.catalog.VariableSource;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Leitura de {@code relacoes-fopdt.csv}.
 *
 * <p>A validação mais importante aqui é a resolução das pontas: toda entrada e toda saída tem de
 * existir no catálogo de processo ou na lista de laboratório. Uma TAG inexistente quebra a carga em
 * vez de virar uma relação que o simulador nunca consegue ligar a nada.
 */
public final class RelationsCsv {

  static final List<String> HEADER =
      List.of(
          "id",
          "entrada",
          "saida",
          "degrau_entrada",
          "kp_por_unidade",
          "unidade_kp",
          "tempo_morto_s",
          "tau_s",
          "observacao");

  static final String RESOURCE = "/reference/relacoes-fopdt.csv";

  /** Sufixo das relações zona a zona. */
  private static final String ZONE_SUFFIX = "[k]";

  /**
   * Unidades que o CSV e o catálogo escrevem de formas diferentes.
   *
   * <p>Tabela explícita, não regra de prefixo: {@code kPa} e {@code kPa rel} são a mesma coisa
   * porque a pressão de vapor é relativa, e um degrau sem unidade é o de uma variável adimensional.
   * Qualquer outra divergência é erro e quebra a carga — um {@code +10 bar} numa malha em kPa não
   * passa.
   */
  private static final Map<String, String> UNIT_EQUIVALENCES = Map.of("kPa", "kPa rel", "", "adim.");

  /** {@code +10 m³/h} → valor 10, unidade {@code m³/h}; {@code +0.02} → unidade vazia. */
  private static final Pattern STEP = Pattern.compile("^\\+?\\s*(-?[\\d.]+)\\s*(.*)$");

  private RelationsCsv() {}

  /** Lê as relações embarcadas, já validadas e resolvidas. */
  public static List<FopdtRelation> read() {
    try (InputStream in = RelationsCsv.class.getResourceAsStream(RESOURCE)) {
      if (in == null) {
        throw new IllegalStateException(
            "%s não está no classpath. O CSV é copiado de reference/research/ na build."
                .formatted(RESOURCE));
      }
      return parse(new String(in.readAllBytes(), StandardCharsets.UTF_8));
    } catch (IOException e) {
      throw new UncheckedIOException("falha lendo " + RESOURCE, e);
    }
  }

  /** Lê de um texto qualquer — é por aqui que os testes passam CSV inválido de propósito. */
  public static List<FopdtRelation> parse(String content) {
    assertNoQuotes(content);

    var rows = rowsOf(content);
    if (rows.isEmpty()) {
      throw new IllegalArgumentException(RESOURCE + " está vazio");
    }

    var header = rows.getFirst();
    var actual = String.join(",", header.fields().stream().map(String::trim).toList());
    if (!actual.equals(String.join(",", HEADER))) {
      throw new IllegalArgumentException(
          "%s: cabeçalho inesperado.%n  esperado: %s%n  veio:     %s"
              .formatted(RESOURCE, String.join(",", HEADER), actual));
    }

    var relations = new ArrayList<FopdtRelation>();
    var seen = new LinkedHashSet<String>();

    for (var row : rows.subList(1, rows.size())) {
      relations.add(parseRow(row, seen));
    }

    if (relations.isEmpty()) {
      throw new IllegalArgumentException(RESOURCE + ": nenhuma relação encontrada");
    }

    return List.copyOf(relations);
  }

  private static FopdtRelation parseRow(Row row, LinkedHashSet<String> seen) {
    int line = row.line();
    var fields = row.fields();

    if (fields.size() != HEADER.size()) {
      throw fail(line, "%d colunas, esperadas %d".formatted(fields.size(), HEADER.size()));
    }

    var id = field(fields, "id").trim();
    if (id.isEmpty()) {
      throw fail(line, "id vazio");
    }
    if (!seen.add(id)) {
      throw fail(line, "id repetido: " + id);
    }

    var input = splitZone(field(fields, "entrada"));
    var output = splitZone(field(fields, "saida"));

    if (input.zoned() != output.zoned()) {
      throw fail(
          line,
          "%s: relação por zona precisa de '%s' nas duas pontas — uma zona da entrada responde na zona correspondente da saída (entrada: %s, saída: %s)"
              .formatted(id, ZONE_SUFFIX, input.zoned(), output.zoned()));
    }

    resolveInput(input.tag(), line, id);
    resolveOutput(output.tag(), line, id);

    double kp = parseDouble(field(fields, "kp_por_unidade"), line, id, "kp_por_unidade");
    if (kp == 0) {
      throw fail(line, "%s: kp_por_unidade é zero — uma relação sem ganho não é relação".formatted(id));
    }

    var step = parseStep(field(fields, "degrau_entrada"), line);
    var inputVariable = ProcessCatalog.get(input.tag());

    if (inputVariable != null && !unitsMatch(step.unit(), inputVariable.unit())) {
      throw fail(
          line,
          "%s: degrau em '%s' mas %s está em '%s' no catálogo. Se as duas formas são a mesma unidade, declare o par em UNIT_EQUIVALENCES."
              .formatted(
                  id,
                  step.unit().isEmpty() ? "(sem unidade)" : step.unit(),
                  input.tag(),
                  inputVariable.unit()));
    }

    double deadTimeS = parseDouble(field(fields, "tempo_morto_s"), line, id, "tempo_morto_s");
    if (deadTimeS < 0) {
      throw fail(line, "%s: tempo_morto_s precisa ser um número não negativo".formatted(id));
    }

    double tauS = parseDouble(field(fields, "tau_s"), line, id, "tau_s");
    if (tauS <= 0) {
      throw fail(line, "%s: coluna tau_s precisa ser maior que zero: %s".formatted(id, tauS));
    }

    return new FopdtRelation(
        id,
        input.tag(),
        output.tag(),
        input.zoned(),
        step,
        kp,
        field(fields, "unidade_kp").trim(),
        deadTimeS,
        tauS,
        text(field(fields, "observacao")),
        null,
        VariableSource.B);
  }

  /**
   * Resolve a entrada contra o catálogo.
   *
   * <p>Entrada tem de ser variável de processo: um ensaio de laboratório é resultado, não algo que
   * se manipule. Se um dia o CSV apontar um {@code LAB-} como entrada, isso é erro de modelagem e
   * para aqui.
   */
  private static void resolveInput(String tag, int line, String id) {
    if (LabVariables.has(tag)) {
      throw fail(
          line,
          "%s: %s é ensaio de laboratório e não pode ser entrada de uma relação".formatted(id, tag));
    }
    if (!ProcessCatalog.has(tag)) {
      throw fail(line, "%s: entrada %s não existe no catálogo de processo".formatted(id, tag));
    }
  }

  private static void resolveOutput(String tag, int line, String id) {
    if (LabVariables.has(tag) || ProcessCatalog.has(tag)) {
      return;
    }
    throw fail(
        line,
        "%s: saída %s não existe no catálogo de processo nem na lista de laboratório"
            .formatted(id, tag));
  }

  // ------------------------------------------------------------------ leitura ----

  private record Row(int line, List<String> fields) {}

  private record Endpoint(String tag, boolean zoned) {}

  /** A TAG sem o {@code [k]}, e se ela o tinha. */
  private static Endpoint splitZone(String endpoint) {
    var trimmed = endpoint.trim();
    return trimmed.endsWith(ZONE_SUFFIX)
        ? new Endpoint(trimmed.substring(0, trimmed.length() - ZONE_SUFFIX.length()), true)
        : new Endpoint(trimmed, false);
  }

  private static boolean unitsMatch(String stepUnit, String catalogUnit) {
    return stepUnit.equals(catalogUnit) || catalogUnit.equals(UNIT_EQUIVALENCES.get(stepUnit));
  }

  private static ReferenceStep parseStep(String raw, int line) {
    var matcher = STEP.matcher(raw.trim());
    if (!matcher.matches()) {
      throw fail(line, "degrau_entrada fora do formato esperado (ex.: '+10 kPa'): " + raw.trim());
    }

    double value;
    try {
      value = Double.parseDouble(matcher.group(1));
    } catch (NumberFormatException e) {
      throw fail(line, "degrau_entrada fora do formato esperado (ex.: '+10 kPa'): " + raw.trim());
    }

    if (!Double.isFinite(value)) {
      throw fail(line, "degrau_entrada fora do formato esperado (ex.: '+10 kPa'): " + raw.trim());
    }
    if (value <= 0) {
      throw fail(line, "degrau_entrada precisa ser positivo: " + raw.trim());
    }

    return new ReferenceStep(value, matcher.group(2).trim());
  }

  private static List<Row> rowsOf(String content) {
    var rows = new ArrayList<Row>();
    var lines = content.split("\n", -1);

    for (int i = 0; i < lines.length; i++) {
      var text = lines[i].endsWith("\r") ? lines[i].substring(0, lines[i].length() - 1) : lines[i];
      if (text.isBlank()) {
        continue;
      }
      rows.add(new Row(i + 1, List.of(text.split(",", -1))));
    }

    return rows;
  }

  private static void assertNoQuotes(String content) {
    if (content.indexOf('"') >= 0) {
      throw new IllegalArgumentException(
          "%s tem aspas. A leitura divide em vírgulas sem tratar campos entre aspas; use ponto e vírgula dentro do campo ou ensine a leitura a tratar aspas."
              .formatted(RESOURCE));
    }
  }

  private static String field(List<String> fields, String column) {
    int index = HEADER.indexOf(column);
    return index < fields.size() ? fields.get(index) : "";
  }

  private static String text(String raw) {
    var trimmed = raw.trim();
    return trimmed.isEmpty() ? null : trimmed;
  }

  private static double parseDouble(String raw, int line, String id, String column) {
    try {
      double parsed = Double.parseDouble(raw.trim());
      if (!Double.isFinite(parsed)) {
        throw fail(line, "%s: coluna %s não é um número: %s".formatted(id, column, raw.trim()));
      }
      return parsed;
    } catch (NumberFormatException e) {
      throw fail(line, "%s: coluna %s não é um número: %s".formatted(id, column, raw.trim()));
    }
  }

  private static IllegalArgumentException fail(int line, String message) {
    return new IllegalArgumentException("%s:%d — %s".formatted(RESOURCE, line, message));
  }
}
