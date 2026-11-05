package dev.felipesantos.papertwin.process;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import dev.felipesantos.papertwin.catalog.ProcessCatalog;
import dev.felipesantos.papertwin.catalog.VariableSource;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/** As relações causa-efeito, com os números que a implementação TypeScript produz. */
class ProcessRelationsTest {

  private static final String HEADER = String.join(",", RelationsCsv.HEADER);

  private static String csv(String... rows) {
    return HEADER + "\n" + String.join("\n", rows) + "\n";
  }

  @Test
  @DisplayName("são 24 linhas, contando a herdada")
  void counts() {
    assertThat(ProcessRelations.ALL).hasSize(24);
    assertThat(ProcessRelations.ALL.stream().filter(r -> r.derivedFrom() != null)).hasSize(1);
  }

  @Test
  @DisplayName("toda ponta existe no catálogo ou no laboratório")
  void endpointsResolve() {
    for (var relation : ProcessRelations.ALL) {
      assertThat(ProcessCatalog.has(relation.input()))
          .as("entrada %s da relação %s", relation.input(), relation.id())
          .isTrue();

      assertThat(ProcessCatalog.has(relation.output()) || LabVariables.has(relation.output()))
          .as("saída %s da relação %s", relation.output(), relation.id())
          .isTrue();
    }
  }

  @Test
  @DisplayName("tempo morto e constante de tempo ficam nas faixas medidas")
  void coefficients() {
    for (var relation : ProcessRelations.ALL) {
      assertThat(relation.deadTimeS()).as(relation.id()).isBetween(6.0, 270.0);
      assertThat(relation.tauS()).as(relation.id()).isBetween(4.5, 450.0);
      assertThat(relation.kp()).as(relation.id()).isNotZero();
    }
  }

  @Nested
  @DisplayName("a relação herdada")
  class Inherited {

    @Test
    @DisplayName("existe, e faz o vapor do G6 mexer na umidade final")
    void exists() {
      var inherited = ProcessRelations.get("5d");
      var origin = ProcessRelations.get("5");

      assertThat(inherited).isNotNull();
      assertThat(inherited.input()).isEqualTo("PIC-712");
      assertThat(inherited.output()).isEqualTo(origin.output());
      assertThat(inherited.derivedFrom()).isEqualTo("5");
    }

    @Test
    @DisplayName("copia os coeficientes da origem, para não haver dois números para manter")
    void copiesCoefficients() {
      var inherited = ProcessRelations.get("5d");
      var origin = ProcessRelations.get("5");

      assertThat(inherited.kp()).isEqualTo(origin.kp());
      assertThat(inherited.deadTimeS()).isEqualTo(origin.deadTimeS());
      assertThat(inherited.tauS()).isEqualTo(origin.tauS());
    }

    @Test
    @DisplayName("cai para 'assumed': a pesquisa mediu o degrau na PIC-711, não na PIC-712")
    void sourceDrops() {
      assertThat(ProcessRelations.get("5").source()).isEqualTo(VariableSource.B);
      assertThat(ProcessRelations.get("5d").source()).isEqualTo(VariableSource.ASSUMED);
    }
  }

  @Nested
  @DisplayName("a relação por zona")
  class Zoned {

    @Test
    @DisplayName("é a da diluição sobre a gramatura, e tem [k] nas duas pontas")
    void zonedRelation() {
      var zoned = ProcessRelations.zoned();

      assertThat(zoned).isNotEmpty();
      assertThat(zoned).allSatisfy(relation -> assertThat(relation.zoned()).isTrue());
      assertThat(zoned.stream().map(FopdtRelation::input)).contains("ZIC-205");

      // a tag guardada é sem o sufixo: ela precisa casar com o catálogo
      assertThat(ProcessCatalog.has("ZIC-205")).isTrue();
    }

    @Test
    @DisplayName("140 zonas de 57,1 mm numa folha de 8 m")
    void geometry() {
      assertThat(ProcessRelations.CD_ZONE_COUNT).isEqualTo(140);
      assertThat(ProcessRelations.CD_ZONE_WIDTH_MM).isCloseTo(57.142857, within(1e-6));
      assertThat(ProcessRelations.CD_SIGMA_MM).isEqualTo(45.0);
    }

    private static org.assertj.core.data.Offset<Double> within(double tolerance) {
      return org.assertj.core.data.Offset.offset(tolerance);
    }
  }

  @Nested
  @DisplayName("edição torta quebra a carga")
  class Invalid {

    private static final String VALID =
        "1,FIC-105,AIC-902,+10 m³/h,0.0825,g/m² por m³/h,75,23,";

    @Test
    @DisplayName("entrada que não existe no catálogo")
    void unknownInput() {
      assertThatThrownBy(
              () -> RelationsCsv.parse(csv("1,XXX-999,AIC-902,+10 m³/h,0.0825,g/m²,75,23,")))
          .isInstanceOf(IllegalArgumentException.class)
          .hasMessageContaining("não existe no catálogo de processo");
    }

    @Test
    @DisplayName("ensaio de laboratório como entrada: resultado não se manipula")
    void labAsInput() {
      assertThatThrownBy(
              () -> RelationsCsv.parse(csv("1,LAB-1201,AIC-902,+10 g/m²,0.08,x,75,23,")))
          .isInstanceOf(IllegalArgumentException.class)
          .hasMessageContaining("não pode ser entrada");
    }

    @Test
    @DisplayName("[k] em uma ponta só")
    void halfZoned() {
      assertThatThrownBy(
              () -> RelationsCsv.parse(csv("11,ZIC-205[k],AIC-902,+10 %,-0.08,g/m²,62,11,")))
          .isInstanceOf(IllegalArgumentException.class)
          .hasMessageContaining("precisa de '[k]' nas duas pontas");
    }

    @Test
    @DisplayName("ganho zero: uma relação sem ganho não é relação")
    void zeroGain() {
      assertThatThrownBy(
              () -> RelationsCsv.parse(csv("1,FIC-105,AIC-902,+10 m³/h,0,g/m² por m³/h,75,23,")))
          .isInstanceOf(IllegalArgumentException.class)
          .hasMessageContaining("sem ganho não é relação");
    }

    @Test
    @DisplayName("degrau numa unidade que não é a da entrada")
    void unitMismatch() {
      assertThatThrownBy(
              () -> RelationsCsv.parse(csv("1,FIC-105,AIC-902,+10 bar,0.0825,g/m²,75,23,")))
          .isInstanceOf(IllegalArgumentException.class)
          .hasMessageContaining("UNIT_EQUIVALENCES");
    }

    @Test
    @DisplayName("tau zero ou negativo")
    void badTau() {
      assertThatThrownBy(() -> RelationsCsv.parse(csv(VALID.replace(",23,", ",0,"))))
          .isInstanceOf(IllegalArgumentException.class)
          .hasMessageContaining("tau_s precisa ser maior que zero");
    }

    @Test
    @DisplayName("tempo morto negativo")
    void negativeDeadTime() {
      assertThatThrownBy(() -> RelationsCsv.parse(csv(VALID.replace(",75,23,", ",-5,23,"))))
          .isInstanceOf(IllegalArgumentException.class)
          .hasMessageContaining("não negativo");
    }

    @Test
    @DisplayName("id repetido")
    void duplicateId() {
      assertThatThrownBy(() -> RelationsCsv.parse(csv(VALID, VALID)))
          .isInstanceOf(IllegalArgumentException.class)
          .hasMessageContaining("id repetido");
    }

    @Test
    @DisplayName("a linha válida passa — senão os casos acima não provariam nada")
    void controlCase() {
      assertThat(RelationsCsv.parse(csv(VALID))).hasSize(1);
    }
  }

  @Nested
  @DisplayName("as equivalências de unidade são explícitas")
  class Units {

    @Test
    @DisplayName("kPa do degrau é o kPa rel do catálogo")
    void relativePressure() {
      // a pressão de vapor é relativa; o CSV escreve só 'kPa'
      var relations = RelationsCsv.parse(csv("4,PIC-514,AIC-901,+10 kPa,-0.027,g/m² por kPa,20,57,"));

      assertThat(relations.getFirst().step().unit()).isEqualTo("kPa");
      assertThat(ProcessCatalog.get("PIC-514").unit()).isEqualTo("kPa rel");
    }
  }
}
