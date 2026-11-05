package dev.felipesantos.papertwin.process;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** Os ensaios de laboratório da §12.2 da pesquisa B. */
class LabVariablesTest {

  @Test
  @DisplayName("são doze ensaios medidos mais um derivado")
  void counts() {
    assertThat(LabVariables.ALL).hasSize(13);
    assertThat(LabVariables.measured()).hasSize(12);
  }

  @Test
  @DisplayName("vão de LAB-1201 a LAB-1212, sem furo")
  void numbering() {
    var measured = LabVariables.measured().stream().map(LabVariable::tag).toList();

    assertThat(measured)
        .containsExactly(
            "LAB-1201",
            "LAB-1202",
            "LAB-1203",
            "LAB-1204",
            "LAB-1205",
            "LAB-1206",
            "LAB-1207",
            "LAB-1208",
            "LAB-1209",
            "LAB-1210",
            "LAB-1211",
            "LAB-1212");
  }

  @Test
  @DisplayName("a razão MD/CD é derivada do ensaio de tração, e herda a frequência dele")
  void ratioIsDerived() {
    var ratio = LabVariables.get("LAB-1206R");
    var origin = LabVariables.get("LAB-1206");

    assertThat(ratio).isNotNull();
    assertThat(ratio.derivedFrom()).isEqualTo("LAB-1206");
    assertThat(ratio.measured()).isFalse();

    // não existe medir a razão sozinha: ela sai do mesmo ensaio
    assertThat(ratio.sampling()).isEqualTo(origin.sampling());
    assertThat(ratio.standard()).isEqualTo(origin.standard());
    assertThat(ratio.instrument()).isEqualTo(origin.instrument());
  }

  @Test
  @DisplayName("todo ensaio tem norma, instrumento e frequência preenchidos")
  void complete() {
    for (var variable : LabVariables.ALL) {
      assertThat(variable.name()).as(variable.tag()).isNotBlank();
      assertThat(variable.unit()).as(variable.tag()).isNotBlank();
      assertThat(variable.range()).as(variable.tag()).isNotBlank();
      assertThat(variable.standard()).as(variable.tag()).isNotBlank();
      assertThat(variable.instrument()).as(variable.tag()).isNotBlank();
      assertThat(variable.sampling()).as(variable.tag()).isNotBlank();
      assertThat(variable.correction()).as(variable.tag()).isNotBlank();
    }
  }

  @Test
  @DisplayName("nenhuma tag de laboratório colide com o catálogo de processo")
  void noCollision() {
    for (var variable : LabVariables.ALL) {
      assertThat(dev.felipesantos.papertwin.catalog.ProcessCatalog.has(variable.tag()))
          .as("%s está nas duas listas", variable.tag())
          .isFalse();
    }
  }
}
