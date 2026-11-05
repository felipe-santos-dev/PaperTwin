package dev.felipesantos.papertwin.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * O que este teste cobra não é o parser — é que um CSV inválido quebre a <b>build</b>.
 *
 * <p>A lista base é editada à mão, e uma linha torta ali é o tipo de erro que, se passar, vira um
 * catálogo pela metade que só se revela quando alguém abre uma tela. Cada caso abaixo é uma forma
 * de errar a edição.
 */
class CatalogCsvTest {

  private static final String HEADER = String.join(",", CatalogCsv.HEADER);

  /** Uma linha válida, para os testes mudarem só o campo que lhes interessa. */
  private static String row(String... overrides) {
    var fields =
        new java.util.ArrayList<>(
            List.of(
                "PIC-514", // tag
                "Pressão de vapor G4", // nome
                "pré-secagem", // area
                "vapor", // grupo
                "kPa rel", // unidade
                "150", // min
                "320", // max
                "230", // alvo
                "120", // LL
                "160", // L
                "300", // H
                "340", // HH
                "sim", // controlada
                "PV-514", // mv
                "1.5", // exc_dev
                "3", // comp_dev
                "B", // fonte
                "alta", // confianca
                "")); // observacao

    for (int i = 0; i + 1 < overrides.length; i += 2) {
      fields.set(CatalogCsv.HEADER.indexOf(overrides[i]), overrides[i + 1]);
    }
    return String.join(",", fields);
  }

  /** Um padrão por cilindro válido — o parser exige que exista pelo menos um. */
  private static final String PATTERN_ROW =
      "VI-51nnA,Vibração do mancal LA do cilindro nn,pré-secagem,vibração,mm/s,0,10,,,,2.8,4.5,não,,0.05,0.1,ISO 20816-3,alta,";

  private static String csv(String... rows) {
    return HEADER + "\n" + String.join("\n", rows) + "\n";
  }

  @Nested
  @DisplayName("o arquivo de verdade")
  class RealFile {

    @Test
    @DisplayName("é lido sem erro e traz variáveis e padrões")
    void reads() {
      var catalog = CatalogCsv.read();

      assertThat(catalog.concrete()).isNotEmpty();
      assertThat(catalog.patterns()).isNotEmpty();
    }

    @Test
    @DisplayName("não tem tag repetida")
    void noDuplicateTags() {
      var catalog = CatalogCsv.read();
      var tags = catalog.concrete().stream().map(ProcessVariable::tag).toList();

      assertThat(tags).doesNotHaveDuplicates();
    }

    @Test
    @DisplayName("marca o nn na tag e no nome dos padrões, nunca em um só")
    void patternMarkerOnBothSides() {
      for (var pattern : CatalogCsv.read().patterns()) {
        assertThat(PerCylinder.isTag(pattern.tagPattern())).isTrue();
        assertThat(PerCylinder.isName(pattern.namePattern())).isTrue();
      }
    }
  }

  @Nested
  @DisplayName("edição torta quebra a carga")
  class Invalid {

    @Test
    @DisplayName("cabeçalho com coluna a mais ou a menos")
    void header() {
      assertThatThrownBy(() -> CatalogCsv.parse("tag,nome\nPIC-514,Pressão\n"))
          .isInstanceOf(IllegalArgumentException.class)
          .hasMessageContaining("cabeçalho inesperado");
    }

    @Test
    @DisplayName("linha com nº de colunas diferente do cabeçalho")
    void columnCount() {
      assertThatThrownBy(() -> CatalogCsv.parse(csv("PIC-514,Pressão,pré-secagem")))
          .isInstanceOf(IllegalArgumentException.class)
          .hasMessageContaining("colunas, esperadas");
    }

    @Test
    @DisplayName("tag repetida")
    void duplicateTag() {
      assertThatThrownBy(() -> CatalogCsv.parse(csv(row(), row(), PATTERN_ROW)))
          .isInstanceOf(IllegalArgumentException.class)
          .hasMessageContaining("tag repetida: PIC-514");
    }

    @Test
    @DisplayName("min acima de max")
    void inverted() {
      assertThatThrownBy(
              () -> CatalogCsv.parse(csv(row("min", "400", "max", "100"), PATTERN_ROW)))
          .isInstanceOf(IllegalArgumentException.class)
          .hasMessageContaining("acima de max");
    }

    @Test
    @DisplayName("alvo fora da faixa de operação")
    void targetOutOfRange() {
      assertThatThrownBy(() -> CatalogCsv.parse(csv(row("alvo", "900"), PATTERN_ROW)))
          .isInstanceOf(IllegalArgumentException.class)
          .hasMessageContaining("fora da faixa");
    }

    @Test
    @DisplayName("limites fora de ordem")
    void limitsOutOfOrder() {
      assertThatThrownBy(() -> CatalogCsv.parse(csv(row("H", "350"), PATTERN_ROW)))
          .isInstanceOf(IllegalArgumentException.class)
          .hasMessageContaining("limites fora de ordem");
    }

    @Test
    @DisplayName("fonte que não está no vocabulário")
    void unknownSource() {
      assertThatThrownBy(() -> CatalogCsv.parse(csv(row("fonte", "chute"), PATTERN_ROW)))
          .isInstanceOf(IllegalArgumentException.class)
          .hasMessageContaining("fonte desconhecida");
    }

    @Test
    @DisplayName("confiança que não está no vocabulário")
    void unknownConfidence() {
      assertThatThrownBy(() -> CatalogCsv.parse(csv(row("confianca", "talvez"), PATTERN_ROW)))
          .isInstanceOf(IllegalArgumentException.class)
          .hasMessageContaining("confiança desconhecida");
    }

    @Test
    @DisplayName("controlada fora de sim/não")
    void controlled() {
      assertThatThrownBy(() -> CatalogCsv.parse(csv(row("controlada", "yes"), PATTERN_ROW)))
          .isInstanceOf(IllegalArgumentException.class)
          .hasMessageContaining("deve ser 'sim' ou 'não'");
    }

    @Test
    @DisplayName("número que não é número")
    void notANumber() {
      assertThatThrownBy(() -> CatalogCsv.parse(csv(row("min", "baixo"), PATTERN_ROW)))
          .isInstanceOf(IllegalArgumentException.class)
          .hasMessageContaining("não é um número");
    }

    @Test
    @DisplayName("min ausente, que é coluna obrigatória")
    void missingRequired() {
      assertThatThrownBy(() -> CatalogCsv.parse(csv(row("min", ""), PATTERN_ROW)))
          .isInstanceOf(IllegalArgumentException.class)
          .hasMessageContaining("coluna min é obrigatória");
    }

    @Test
    @DisplayName("aspas, que a leitura não trata")
    void quotes() {
      assertThatThrownBy(() -> CatalogCsv.parse(csv(row("observacao", "diz \"oi\""), PATTERN_ROW)))
          .isInstanceOf(IllegalArgumentException.class)
          .hasMessageContaining("tem aspas");
    }

    @Test
    @DisplayName("nn só na tag, ou só no nome")
    void halfMarker() {
      var tagOnly =
          "VI-51nnA,Vibração do mancal LA,pré-secagem,vibração,mm/s,0,10,,,,2.8,4.5,não,,0.05,0.1,ISO 20816-3,alta,";

      assertThatThrownBy(() -> CatalogCsv.parse(csv(tagOnly)))
          .isInstanceOf(IllegalArgumentException.class)
          .hasMessageContaining("precisa aparecer na tag e no nome");
    }

    @Test
    @DisplayName("nenhum padrão por cilindro")
    void noPatterns() {
      assertThatThrownBy(() -> CatalogCsv.parse(csv(row())))
          .isInstanceOf(IllegalArgumentException.class)
          .hasMessageContaining("nenhum padrão por cilindro");
    }
  }

  @Nested
  @DisplayName("campo vazio é ausência")
  class Absence {

    @Test
    @DisplayName("alvo, mv e observação vazios viram null, não zero nem texto vazio")
    void emptyIsNull() {
      var catalog =
          CatalogCsv.parse(csv(row("alvo", "", "mv", "", "observacao", ""), PATTERN_ROW));
      var variable = catalog.concrete().getFirst();

      assertThat(variable.target()).isNull();
      assertThat(variable.mv()).isNull();
      assertThat(variable.note()).isNull();
    }

    @Test
    @DisplayName("exc_dev e comp_dev vazios significam sem compressão")
    void noCompression() {
      var catalog =
          CatalogCsv.parse(csv(row("exc_dev", "", "comp_dev", ""), PATTERN_ROW));

      assertThat(catalog.concrete().getFirst().compression().none()).isTrue();
    }

    @Test
    @DisplayName("limite de alarme pode cair fora da faixa de operação")
    void limitsMayLeaveRange() {
      // o caso real é a vazão de óleo: mínimo operacional 1,5 L/min, alarme crítico 1,0
      var catalog = CatalogCsv.parse(csv(row("LL", "10", "L", "20"), PATTERN_ROW));
      var variable = catalog.concrete().getFirst();

      assertThat(variable.limits().ll()).isEqualTo(10.0);
      assertThat(variable.min()).isEqualTo(150.0);
    }
  }
}
