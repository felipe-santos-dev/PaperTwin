package dev.felipesantos.papertwin;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * O gêmeo digital da MP1.
 *
 * <p>O catálogo e as relações são carregados estaticamente, na primeira vez que alguém os toca — e
 * por isso um CSV inválido derruba a aplicação ao subir, em vez de virar um catálogo pela metade
 * que só se revela quando alguém abre uma tela.
 */
@SpringBootApplication
public class PaperTwinApplication {

  public static void main(String[] args) {
    SpringApplication.run(PaperTwinApplication.class, args);
  }
}
