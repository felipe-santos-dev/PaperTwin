package dev.felipesantos.papertwin;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * O contexto sobe.
 *
 * <p>Parece pouco, e não é: o catálogo e as relações são carregados estaticamente, então um CSV
 * inválido, uma tag que não resolve ou um grupo de vapor com furo derrubam este teste. É a mesma
 * falha que aconteceria no boot em produção, só que na build.
 */
@SpringBootTest
class PaperTwinApplicationTest {

  @Test
  @DisplayName("sobe com o catálogo e as relações carregados")
  void contextLoads() {
    // o corpo vazio é o teste: se o contexto não subir, o método nem chega a rodar
  }
}
