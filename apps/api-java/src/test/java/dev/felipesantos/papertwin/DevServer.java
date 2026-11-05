package dev.felipesantos.papertwin;

import dev.felipesantos.papertwin.db.EmbeddedPostgresExtension;
import dev.felipesantos.papertwin.db.Migrations;
import javax.sql.DataSource;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

/**
 * Sobe a API de verdade contra um Postgres embutido, para o front falar com ela.
 *
 * <pre>{@code
 * cd apps/api-java
 * ./mvnw -q test-compile
 * ./mvnw -q exec:java -Dexec.mainClass=dev.felipesantos.papertwin.DevServer -Dexec.classpathScope=test
 * }</pre>
 *
 * <p>Existe porque desenvolver não deveria exigir Docker. O caminho de produção é o Neon, e o do
 * {@code docker-compose} é um Postgres local — mas quem só quer abrir as sete telas contra a API não
 * precisa de nenhum dos dois: o mesmo Postgres embutido que os testes usam serve, e morre com o
 * processo.
 *
 * <p>Fica em {@code src/test} porque o Postgres embutido é dependência de teste, e não deve entrar
 * no jar que vai para o host de 512 MB. É um atalho de desenvolvimento com o alcance de um: não
 * persiste nada entre execuções, e a primeira requisição paga a retomada inteira.
 *
 * <p>A porta é a 3333, que é a que {@code apps/web} procura por padrão.
 */
public final class DevServer {

  /** A porta que o front procura em {@code VITE_API_URL}. */
  private static final String PORT = "3333";

  @TestConfiguration
  static class EmbeddedDatabase {

    @Bean
    @Primary
    DataSource embeddedPostgres() {
      var dataSource = EmbeddedPostgresExtension.freshDatabase();

      /*
       * As migrations rodam aqui, e isso não contradiz o `RUN_MIGRATIONS=false`
       * de produção: o banco acabou de nascer nesta execução e morre com ela.
       * O que a regra protege é um banco que guarda dados de alguém, e este
       * não guarda nada.
       */
      Migrations.run(dataSource);
      return dataSource;
    }
  }

  private DevServer() {}

  public static void main(String[] args) {
    System.setProperty("server.port", PORT);

    var app = new SpringApplication(PaperTwinApplication.class, EmbeddedDatabase.class);
    app.run(args);
  }
}
