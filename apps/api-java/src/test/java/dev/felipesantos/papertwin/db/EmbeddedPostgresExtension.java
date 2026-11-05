package dev.felipesantos.papertwin.db;

import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.concurrent.atomic.AtomicInteger;
import javax.sql.DataSource;
import org.junit.jupiter.api.extension.BeforeAllCallback;
import org.junit.jupiter.api.extension.ExtensionContext;
import org.postgresql.ds.PGSimpleDataSource;

/**
 * Um Postgres de verdade para os testes, sem Docker.
 *
 * <p>O historiador depende de coisas que só o Postgres tem — {@code date_bin}, BRIN, {@code jsonb},
 * {@code pg_advisory_lock} — e um banco em modo de compatibilidade mentiria justamente onde está o
 * risco. O zonky baixa o binário do Postgres e o sobe como processo filho, o que dá o banco de
 * verdade na máquina de quem desenvolve e no runner do CI, com uma infraestrutura só.
 *
 * <h2>Um servidor, vários bancos</h2>
 *
 * <p>Subir o Postgres custa alguns segundos, e fazer isso por classe de teste somaria minutos numa
 * suíte com dezenas delas. Então o servidor sobe <b>uma vez por JVM</b> e cada classe pede um banco
 * novo dentro dele: {@code CREATE DATABASE} é instantâneo e o isolamento é o mesmo — nenhuma tabela
 * de uma classe é visível para outra.
 *
 * <p>O servidor não é desligado no fim. Ele morre com a JVM, e tentar pará-lo ordenadamente num
 * {@code shutdown hook} só criaria uma corrida com os testes que ainda estão terminando.
 *
 * <h2>O fuso</h2>
 *
 * <p>Não está configurado aqui, e sim no surefire, com {@code -Duser.timezone=UTC}. O driver do
 * Postgres manda o fuso da JVM como parâmetro de conexão e ele vence qualquer {@code options} ou
 * {@code ALTER DATABASE} — então o único lugar onde dá para fixá-lo de verdade é a JVM.
 */
public final class EmbeddedPostgresExtension implements BeforeAllCallback {

  private static final AtomicInteger NEXT = new AtomicInteger();

  private static volatile EmbeddedPostgres server;

  /** O servidor, subido na primeira chamada. */
  private static EmbeddedPostgres server() {
    if (server == null) {
      synchronized (EmbeddedPostgresExtension.class) {
        if (server == null) {
          try {
            server = EmbeddedPostgres.builder().start();
          } catch (IOException e) {
            throw new UncheckedIOException(
                "não foi possível subir o Postgres embarcado. Na primeira execução ele baixa o "
                    + "binário do Maven Central, então isto também falha sem rede.",
                e);
          }
        }
      }
    }
    return server;
  }

  /**
   * Um banco vazio, só desta chamada.
   *
   * <p>O nome vem de um contador, e não do nome da classe de teste: nome de classe pode passar dos
   * 63 caracteres que o Postgres aceita em um identificador, e o corte silencioso faria duas
   * classes compartilharem banco sem ninguém notar.
   */
  public static DataSource freshDatabase() {
    var name = "papertwin_test_%d".formatted(NEXT.incrementAndGet());

    try (var connection = server().getPostgresDatabase().getConnection();
        Statement statement = connection.createStatement()) {
      statement.execute("create database " + name);
    } catch (SQLException e) {
      throw new IllegalStateException("não foi possível criar o banco de teste " + name, e);
    }

    var dataSource = new PGSimpleDataSource();
    dataSource.setServerNames(new String[] {"localhost"});
    dataSource.setPortNumbers(new int[] {server().getPort()});
    dataSource.setDatabaseName(name);
    dataSource.setUser("postgres");
    return dataSource;
  }

  /** A versão do servidor, para o teste que confere se ela é a esperada. */
  public static DataSource shared() {
    return server().getPostgresDatabase();
  }

  @Override
  public void beforeAll(ExtensionContext context) {
    server();
  }
}
