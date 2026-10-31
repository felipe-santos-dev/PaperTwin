package dev.felipesantos.papertwin.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import dev.felipesantos.papertwin.machine.SteamGroups;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/** O catálogo depois da expansão, com os números que a implementação TypeScript produz. */
class ProcessCatalogTest {

  @Test
  @DisplayName("tem 320 variáveis: 68 de tag própria e 252 expandidas por cilindro")
  void counts() {
    // Os números são explícitos de propósito. Eles são a paridade com a
    // implementação TypeScript, e uma expansão que ganhasse ou perdesse uma
    // variável passaria despercebida numa asserção de "não vazio".
    assertThat(ProcessCatalog.concrete()).hasSize(68);
    assertThat(ProcessCatalog.patterns()).hasSize(7);
    assertThat(ProcessCatalog.ALL).hasSize(320);
    assertThat(ProcessCatalog.ALL)
        .hasSize(
            ProcessCatalog.concrete().size()
                + ProcessCatalog.patterns().size() * SteamGroups.DRYER_CYLINDER_COUNT);
  }

  @Test
  @DisplayName("tem 55 malhas de controle e 183 pendências")
  void loopsAndPending() {
    assertThat(ProcessCatalog.controlled()).hasSize(55);
    assertThat(ProcessCatalog.pending()).hasSize(183);
  }

  @Test
  @DisplayName("não repete tag depois de expandir")
  void uniqueTags() {
    assertThat(ProcessCatalog.ALL.stream().map(ProcessVariable::tag).toList())
        .doesNotHaveDuplicates();
  }

  @Nested
  @DisplayName("expansão por cilindro")
  class Expansion {

    @Test
    @DisplayName("usa dois dígitos na tag e o número falado no nome")
    void digits() {
      var variable = ProcessCatalog.get("VI-5107A");

      assertThat(variable).isNotNull();
      assertThat(variable.cylinder()).isEqualTo(7);
      assertThat(variable.name()).contains("7").doesNotContain("07");
      assertThat(ProcessCatalog.get("VI-517A")).isNull();
    }

    @Test
    @DisplayName("herda o grupo de vapor do cilindro")
    void steamGroup() {
      // o CS23 no G4 é o único ponto fixo da divisão: a tag MP1-SEC-G4-CS23-MLA
      // aparece no conceito de tela de monitoramento
      assertThat(ProcessCatalog.get("VI-5123A").steamGroup()).isEqualTo("G4");
      assertThat(ProcessCatalog.get("VI-5101A").steamGroup()).isEqualTo("G1");
      assertThat(ProcessCatalog.get("VI-5136A").steamGroup()).isEqualTo("G6");
    }

    @Test
    @DisplayName("cobre todos os cilindros que o modelo declara")
    void everyCylinder() {
      for (int cylinder : SteamGroups.allCylinders()) {
        assertThat(ProcessCatalog.ofCylinder(cylinder))
            .as("cilindro %d", cylinder)
            .hasSize(ProcessCatalog.patterns().size());
      }
    }

    @Test
    @DisplayName("deixa cylinder e steamGroup nulos nas de tag própria")
    void concreteHasNoCylinder() {
      for (var variable : ProcessCatalog.concrete()) {
        assertThat(variable.cylinder()).as(variable.tag()).isNull();
        assertThat(variable.steamGroup()).as(variable.tag()).isNull();
      }
    }
  }

  @Nested
  @DisplayName("a gramática do nn")
  class Marker {

    @Test
    @DisplayName("não confunde 'scanner' com um padrão por cilindro")
    void scannerTrap() {
      // "scanner" contém "nn". Um contains() classificaria a AIC-901 como padrão
      // e um replace() escreveria "sca7er" no nome dela.
      assertThat(PerCylinder.isTag("AIC-901")).isFalse();
      assertThat(PerCylinder.isName("Umidade antes da colagem · scanner 1")).isFalse();

      var scanner = ProcessCatalog.get("AIC-901");
      assertThat(scanner).isNotNull();
      assertThat(scanner.cylinder()).isNull();
      assertThat(scanner.name()).contains("scanner");
    }

    @Test
    @DisplayName("reconhece a tag pela posição do nn, com lado opcional")
    void tagShape() {
      assertThat(PerCylinder.isTag("VI-51nnA")).isTrue();
      assertThat(PerCylinder.isTag("TI-52nn")).isTrue();
      assertThat(PerCylinder.isTag("VI-nn51A")).isFalse();
      assertThat(PerCylinder.isTag("nn")).isFalse();
    }

    @Test
    @DisplayName("recusa expandir o que não é padrão")
    void refusesNonPattern() {
      assertThatThrownBy(() -> PerCylinder.expandTag("PIC-514", 7))
          .isInstanceOf(IllegalArgumentException.class);
      assertThatThrownBy(() -> PerCylinder.expandName("Pressão de vapor", 7))
          .isInstanceOf(IllegalArgumentException.class);
    }
  }
}
