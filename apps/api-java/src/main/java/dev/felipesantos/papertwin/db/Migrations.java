package dev.felipesantos.papertwin.db;

import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.output.MigrateResult;

/**
 * As migrations do esquema.
 *
 * <p>Em produção elas <b>não rodam no boot</b>: {@code RUN_MIGRATIONS} vem desligado, e quem as
 * aplica é o checklist de deploy, uma vez. Num host que dorme e acorda, o boot acontece quando o
 * primeiro visitante abre a tela — e migration que roda nessa hora é migration que roda numa hora
 * que ninguém escolheu, contra um banco que ninguém está olhando.
 *
 * <p>Nos testes elas rodam sempre, contra um banco novo por classe. É o mesmo SQL, então o esquema
 * que o teste exercita é o que vai para produção.
 */
public final class Migrations {

  /** Onde o Flyway procura o SQL. */
  public static final String LOCATION = "classpath:db/migration";

  private Migrations() {}

  /** Aplica o que faltar e devolve o resultado. */
  public static MigrateResult run(DataSource dataSource) {
    return Flyway.configure().dataSource(dataSource).locations(LOCATION).load().migrate();
  }
}
