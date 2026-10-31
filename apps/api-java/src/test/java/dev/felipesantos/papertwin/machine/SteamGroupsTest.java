package dev.felipesantos.papertwin.machine;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import dev.felipesantos.papertwin.machine.SteamGroups.DryingSection;
import dev.felipesantos.papertwin.machine.SteamGroups.SteamGroupRange;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * As duas invariantes dos grupos de vapor.
 *
 * <p>Elas valem na carga da classe, e os testes aqui as exercitam com faixas inventadas: um grupo é
 * uma válvula de vapor, e tanto um cilindro sem grupo quanto um grupo atravessando a fronteira
 * entre as duas secagens são erros de edição do modelo que não devem chegar a subir um servidor.
 */
class SteamGroupsTest {

  @Test
  @DisplayName("são 36 cilindros em seis grupos, derivados dos pares")
  void counts() {
    assertThat(SteamGroups.DRYER_CYLINDER_COUNT).isEqualTo(36);
    assertThat(SteamGroups.LAST_PRE_DRYER_CYLINDER).isEqualTo(26);
    assertThat(SteamGroups.RANGES).hasSize(6);
    assertThat(SteamGroups.allCylinders()).hasSize(36);
  }

  @Test
  @DisplayName("o CS23 está no G4, que é o único ponto fixo da divisão")
  void cs23() {
    // a tag MP1-SEC-G4-CS23-MLA aparece no conceito de tela de monitoramento
    assertThat(SteamGroups.ofCylinder(23)).isEqualTo("G4");
  }

  @Test
  @DisplayName("a divisão é a que a lista base escreve")
  void division() {
    assertThat(SteamGroups.cylindersOf("G1")).containsExactly(1, 2, 3, 4, 5, 6);
    assertThat(SteamGroups.cylindersOf("G4")).containsExactly(19, 20, 21, 22, 23, 24, 25, 26);
    assertThat(SteamGroups.cylindersOf("G6")).containsExactly(33, 34, 35, 36);
    assertThat(SteamGroups.cylindersOf("G9")).isEmpty();
  }

  @Test
  @DisplayName("a fronteira entre as secagens sai da numeração, não de uma lista")
  void boundary() {
    assertThat(SteamGroups.sectionOfCylinder(26)).isEqualTo(DryingSection.PRE_DRYER);
    assertThat(SteamGroups.sectionOfCylinder(27)).isEqualTo(DryingSection.POST_DRYER);
  }

  @Test
  @DisplayName("todo cilindro tem grupo, e nenhum tem dois")
  void everyCylinderHasOneGroup() {
    for (int cylinder = 1; cylinder <= SteamGroups.DRYER_CYLINDER_COUNT; cylinder++) {
      int finalCylinder = cylinder;
      var matching =
          SteamGroups.RANGES.stream()
              .filter(group -> group.from() <= finalCylinder && finalCylinder <= group.to())
              .toList();

      assertThat(matching).as("cilindro %d", cylinder).hasSize(1);
    }
  }

  @Test
  @DisplayName("cilindro fora da secagem não tem grupo")
  void outOfRange() {
    assertThatThrownBy(() -> SteamGroups.ofCylinder(99))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("fora dos grupos conhecidos");
  }

  @Nested
  @DisplayName("a verificação de cobertura")
  class Coverage {

    @Test
    @DisplayName("recusa um furo entre faixas")
    void gap() {
      assertThatThrownBy(
              () ->
                  SteamGroups.assertCoverage(
                      List.of(
                          new SteamGroupRange("G1", 1, 6, DryingSection.PRE_DRYER),
                          new SteamGroupRange("G2", 8, 36, DryingSection.PRE_DRYER))))
          .isInstanceOf(IllegalStateException.class)
          .hasMessageContaining("furo ou sobreposição");
    }

    @Test
    @DisplayName("recusa faixas que se sobrepõem")
    void overlap() {
      assertThatThrownBy(
              () ->
                  SteamGroups.assertCoverage(
                      List.of(
                          new SteamGroupRange("G1", 1, 10, DryingSection.PRE_DRYER),
                          new SteamGroupRange("G2", 5, 36, DryingSection.PRE_DRYER))))
          .isInstanceOf(IllegalStateException.class)
          .hasMessageContaining("furo ou sobreposição");
    }

    @Test
    @DisplayName("recusa um grupo que atravessa a fronteira entre as secagens")
    void crossesSections() {
      assertThatThrownBy(
              () ->
                  SteamGroups.assertCoverage(
                      List.of(new SteamGroupRange("G1", 1, 36, DryingSection.PRE_DRYER))))
          .isInstanceOf(IllegalStateException.class)
          .hasMessageContaining("atravessa a fronteira");
    }

    @Test
    @DisplayName("recusa faixas que não chegam ao último cilindro")
    void short_() {
      assertThatThrownBy(
              () ->
                  SteamGroups.assertCoverage(
                      List.of(new SteamGroupRange("G1", 1, 26, DryingSection.PRE_DRYER))))
          .isInstanceOf(IllegalStateException.class)
          .hasMessageContaining("Mudar o nº de pares exige refazer as faixas");
    }

    @Test
    @DisplayName("recusa lista vazia")
    void empty() {
      assertThatThrownBy(() -> SteamGroups.assertCoverage(List.of()))
          .isInstanceOf(IllegalStateException.class)
          .hasMessageContaining("Nenhum grupo");
    }

    @Test
    @DisplayName("aceita a divisão de verdade — senão os casos acima não provariam nada")
    void realDivisionPasses() {
      SteamGroups.assertCoverage(SteamGroups.RANGES);
    }
  }
}
