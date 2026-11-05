package dev.felipesantos.papertwin.api;

import dev.felipesantos.papertwin.db.EmbeddedPostgresExtension;
import dev.felipesantos.papertwin.db.Migrations;
import dev.felipesantos.papertwin.golden.Golden;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import javax.sql.DataSource;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

/**
 * O contexto dos testes de rota: relógio parado no instante do gabarito e banco embutido limpo.
 *
 * <p>Está numa classe de primeiro nível, e não aninhada em cada teste, porque o Spring guarda o
 * contexto em cache <b>pela configuração</b>: duas classes de teste que declarem a mesma
 * configuração compartilham um contexto, e subir o contexto é o que custa aqui. Dentro de cada
 * classe de teste, a mesma configuração escrita de novo seria outra chave de cache e outro boot.
 */
@TestConfiguration
public class GoldenInstantConfig {

  /** O instante em que o gabarito foi gravado. */
  public static final Instant NOW =
      Instant.ofEpochMilli(Golden.read("api/routes.json").get("nowMs").asLong());

  /*
   * Os nomes são diferentes dos da aplicação de propósito.
   *
   * O nome do bean sai do nome do método, e `@Primary` resolve ambiguidade de
   * tipo — não colisão de nome. Com dois beans chamados `clock`, o contexto
   * recusa subir antes de chegar à preferência.
   */
  @Bean
  @Primary
  Clock fixedClock() {
    return Clock.fixed(NOW, ZoneOffset.UTC);
  }

  @Bean
  @Primary
  DataSource embeddedDataSource() {
    var dataSource = EmbeddedPostgresExtension.freshDatabase();
    Migrations.run(dataSource);
    return dataSource;
  }
}
