package dev.felipesantos.papertwin.catalog;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;

/**
 * Leitura de {@code catalogo-base.csv}, a lista base do simulador.
 *
 * <p>O CSV é lido sem suporte a aspas, e isso é verificado em vez de suposto: nenhum campo da lista
 * base tem vírgula dentro, então dividir por vírgula é exato. Se um dia tiver, a leitura falha em
 * vez de truncar o campo em silêncio.
 *
 * <p>Todas as checagens são de <b>carga</b>, não de runtime: um CSV inválido não pode virar um
 * catálogo pela metade que só se revela quando alguém abre uma tela. O teste de leitura é o que
 * transforma isso em falha de build.
 */
public final class CatalogCsv {

  /** Cabeçalho esperado, na ordem exata. Uma coluna nova quebra aqui. */
  static final List<String> HEADER =
      List.of(
          "tag",
          "nome",
          "area",
          "grupo",
          "unidade",
          "min",
          "max",
          "alvo",
          "LL",
          "L",
          "H",
          "HH",
          "controlada",
          "mv",
          "exc_dev",
          "comp_dev",
          "fonte",
          "confianca",
          "observacao");

  /** O CSV, embarcado no jar. */
  static final String RESOURCE = "/reference/catalogo-base.csv";

  /** O que a leitura devolve: as de tag própria e os padrões por cilindro. */
  public record Catalog(List<ProcessVariable> concrete, List<PerCylinderPattern> patterns) {}

  private CatalogCsv() {}

  /** Lê o catálogo embarcado, já validado. */
  public static Catalog read() {
    try (InputStream in = CatalogCsv.class.getResourceAsStream(RESOURCE)) {
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
  public static Catalog parse(String content) {
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

    var concrete = new ArrayList<ProcessVariable>();
    var patterns = new ArrayList<PerCylinderPattern>();
    var seen = new LinkedHashSet<String>();

    for (var row : rows.subList(1, rows.size())) {
      parseRow(row, concrete, patterns, seen);
    }

    if (patterns.isEmpty()) {
      throw new IllegalArgumentException(
          "%s: nenhum padrão por cilindro encontrado. As linhas por cilindro usam 'nn' na tag, como VI-51nnA."
              .formatted(RESOURCE));
    }

    return new Catalog(List.copyOf(concrete), List.copyOf(patterns));
  }

  private static void parseRow(
      Row row,
      List<ProcessVariable> concrete,
      List<PerCylinderPattern> patterns,
      LinkedHashSet<String> seen) {

    int line = row.line();
    var fields = row.fields();

    if (fields.size() != HEADER.size()) {
      throw fail(line, "%d colunas, esperadas %d".formatted(fields.size(), HEADER.size()));
    }

    var tag = field(fields, "tag").trim();
    var name = field(fields, "nome").trim();
    if (tag.isEmpty()) {
      throw fail(line, "tag vazia");
    }
    if (!seen.add(tag)) {
      throw fail(line, "tag repetida: " + tag);
    }

    var area = field(fields, "area").trim();
    var group = field(fields, "grupo").trim();
    var unit = field(fields, "unidade").trim();
    double min = required(number(field(fields, "min"), line, "min"), line, "min");
    double max = required(number(field(fields, "max"), line, "max"), line, "max");
    var target = number(field(fields, "alvo"), line, "alvo");
    var limits =
        new AlarmLimits(
            number(field(fields, "LL"), line, "LL"),
            number(field(fields, "L"), line, "L"),
            number(field(fields, "H"), line, "H"),
            number(field(fields, "HH"), line, "HH"));
    boolean controlled = parseControlled(field(fields, "controlada"), line);
    var mv = text(field(fields, "mv"));
    var compression =
        new Compression(
            number(field(fields, "exc_dev"), line, "exc_dev"),
            number(field(fields, "comp_dev"), line, "comp_dev"));
    var source = parseSource(field(fields, "fonte"), line);
    var confidence = parseConfidence(field(fields, "confianca"), line);
    var note = text(field(fields, "observacao"));

    boolean patternTag = PerCylinder.isTag(tag);
    boolean patternName = PerCylinder.isName(name);

    if (patternTag != patternName) {
      throw fail(
          line,
          "%s: o marcador 'nn' precisa aparecer na tag e no nome, ou em nenhum dos dois (tag: %s, nome: %s)"
              .formatted(tag, patternTag, patternName));
    }

    validate(tag, min, max, target, limits, line);

    if (patternTag) {
      patterns.add(
          new PerCylinderPattern(
              tag,
              name,
              area,
              group,
              unit,
              min,
              max,
              target,
              limits,
              controlled,
              mv,
              compression,
              source,
              confidence,
              note));
    } else {
      concrete.add(
          new ProcessVariable(
              tag,
              name,
              area,
              group,
              unit,
              min,
              max,
              target,
              limits,
              controlled,
              mv,
              compression,
              source,
              confidence,
              note,
              null,
              null));
    }
  }

  /**
   * Checagens que valem para qualquer linha.
   *
   * <p>Os limites de alarme podem cair fora de {@code min}–{@code max} de propósito, então a única
   * coisa exigida deles é a ordem entre os que existem.
   */
  private static void validate(
      String tag, double min, double max, Double target, AlarmLimits limits, int line) {

    if (min > max) {
      throw fail(line, "%s: min %s acima de max %s".formatted(tag, min, max));
    }

    if (target != null && (target < min || target > max)) {
      throw fail(line, "%s: alvo %s fora da faixa %s–%s".formatted(tag, target, min, max));
    }

    var ordered =
        java.util.stream.Stream.of(limits.ll(), limits.l(), limits.h(), limits.hh())
            .filter(java.util.Objects::nonNull)
            .toList();

    for (int i = 1; i < ordered.size(); i++) {
      if (ordered.get(i - 1) > ordered.get(i)) {
        throw fail(line, "%s: limites fora de ordem — LL ≤ L ≤ H ≤ HH não se sustenta".formatted(tag));
      }
    }
  }

  // ------------------------------------------------------------------ leitura ----

  private record Row(int line, List<String> fields) {}

  /** Divide em linhas, tolerando CRLF e a linha vazia do fim do arquivo. */
  private static List<Row> rowsOf(String content) {
    var rows = new ArrayList<Row>();
    var lines = content.split("\n", -1);

    for (int i = 0; i < lines.length; i++) {
      var text = lines[i].endsWith("\r") ? lines[i].substring(0, lines[i].length() - 1) : lines[i];
      if (text.isBlank()) {
        continue;
      }
      // -1 para o split não descartar campos vazios no fim da linha
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

  /** Campo vazio é ausência, não zero nem texto vazio. */
  private static String text(String raw) {
    var trimmed = raw.trim();
    return trimmed.isEmpty() ? null : trimmed;
  }

  private static Double number(String raw, int line, String column) {
    var trimmed = raw.trim();
    if (trimmed.isEmpty()) {
      return null;
    }
    try {
      double parsed = Double.parseDouble(trimmed);
      if (!Double.isFinite(parsed)) {
        throw fail(line, "coluna %s não é um número: %s".formatted(column, trimmed));
      }
      return parsed;
    } catch (NumberFormatException e) {
      throw fail(line, "coluna %s não é um número: %s".formatted(column, trimmed));
    }
  }

  private static double required(Double value, int line, String column) {
    if (value == null) {
      throw fail(line, "coluna %s é obrigatória".formatted(column));
    }
    return value;
  }

  private static VariableSource parseSource(String raw, int line) {
    try {
      return VariableSource.parse(raw.trim());
    } catch (IllegalArgumentException e) {
      throw fail(line, e.getMessage());
    }
  }

  private static Confidence parseConfidence(String raw, int line) {
    try {
      return Confidence.parse(raw.trim());
    } catch (IllegalArgumentException e) {
      throw fail(line, e.getMessage());
    }
  }

  private static boolean parseControlled(String raw, int line) {
    var value = raw.trim();
    if ("sim".equals(value)) {
      return true;
    }
    if ("não".equals(value)) {
      return false;
    }
    throw fail(line, "coluna controlada deve ser 'sim' ou 'não', veio: " + value);
  }

  private static IllegalArgumentException fail(int line, String message) {
    return new IllegalArgumentException("%s:%d — %s".formatted(RESOURCE, line, message));
  }
}
