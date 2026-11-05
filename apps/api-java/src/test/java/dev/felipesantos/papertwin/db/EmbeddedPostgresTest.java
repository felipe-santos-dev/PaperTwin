package dev.felipesantos.papertwin.db;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.SQLException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;

/**
 * O Postgres embarcado sobe, é da versão fixada e fala o dialeto de que o projeto depende.
 *
 * <p>Este teste existe antes de qualquer código de persistência, e de propósito: se o banco de
 * teste não subir nesta máquina ou não tiver {@code date_bin}, é melhor descobrir agora do que
 * depois de escrever o historiador inteiro contra ele.
 */
@ExtendWith(EmbeddedPostgresExtension.class)
class EmbeddedPostgresTest {

  @Test
  @DisplayName("sobe e responde")
  void starts() throws SQLException {
    try (var connection = EmbeddedPostgresExtension.freshDatabase().getConnection();
        var statement = connection.createStatement();
        var rows = statement.executeQuery("select 1")) {

      assertThat(rows.next()).isTrue();
      assertThat(rows.getInt(1)).isEqualTo(1);
    }
  }

  @Test
  @DisplayName("é o Postgres 18, a mesma major do Neon")
  void version() throws SQLException {
    try (var connection = EmbeddedPostgresExtension.shared().getConnection();
        var statement = connection.createStatement();
        var rows = statement.executeQuery("show server_version")) {

      assertThat(rows.next()).isTrue();
      // a major é o que importa: é ela que decide quais funções existem.
      // O Neon do projeto roda 18.6, conferido com `select version()`.
      assertThat(rows.getString(1)).startsWith("18.");
    }
  }

  @Test
  @DisplayName("tem date_bin, jsonb e pg_advisory_lock — o dialeto de que o projeto depende")
  void dialect() throws SQLException {
    try (var connection = EmbeddedPostgresExtension.freshDatabase().getConnection();
        var statement = connection.createStatement()) {

      // date_bin monta as colunas do gráfico de tendência.
      //
      // O instante é lido como OffsetDateTime, e não como texto: o Postgres
      // renderiza timestamptz no fuso da sessão, e comparar a renderização
      // seria comparar o fuso de quem roda o teste.
      try (var rows =
          statement.executeQuery(
              "select date_bin(interval '15 minutes', timestamptz '2026-03-02 09:07:00+00',"
                  + " timestamptz '2026-03-02 09:00:00+00')")) {
        assertThat(rows.next()).isTrue();
        assertThat(rows.getObject(1, java.time.OffsetDateTime.class).toInstant())
            .isEqualTo(java.time.Instant.parse("2026-03-02T09:00:00Z"));
      }

      // jsonb guarda o estado do motor entre uma retomada e a seguinte
      try (var rows = statement.executeQuery("select ('{\"tick\": 42}'::jsonb) -> 'tick'")) {
        assertThat(rows.next()).isTrue();
        assertThat(rows.getString(1)).isEqualTo("42");
      }

      // o lock de aviso é o que faz duas requisições simultâneas não retomarem a mesma janela
      try (var rows = statement.executeQuery("select pg_try_advisory_lock(1)")) {
        assertThat(rows.next()).isTrue();
        assertThat(rows.getBoolean(1)).isTrue();
      }

      // BRIN é o índice do arquivo: a tabela cresce em ordem de tempo
      statement.execute("create table sample (ts timestamptz not null, value double precision)");
      statement.execute("create index on sample using brin (ts)");
    }
  }

  @Test
  @DisplayName("a sessão fala UTC, e não o fuso de quem roda o teste")
  void sessionTimeZone() throws SQLException {
    // esta máquina está em −03:00 e o runner do CI em UTC; sem fixar o fuso da
    // sessão, o mesmo instante sairia escrito de duas formas
    try (var connection = EmbeddedPostgresExtension.freshDatabase().getConnection();
        var statement = connection.createStatement();
        var rows = statement.executeQuery("show timezone")) {

      assertThat(rows.next()).isTrue();
      assertThat(rows.getString(1)).isEqualTo("UTC");
    }
  }

  @Test
  @DisplayName("cada classe de teste recebe um banco limpo")
  void isolation() throws SQLException {
    var first = EmbeddedPostgresExtension.freshDatabase();
    var second = EmbeddedPostgresExtension.freshDatabase();

    try (var connection = first.getConnection();
        var statement = connection.createStatement()) {
      statement.execute("create table only_here (id int)");
    }

    try (var connection = second.getConnection();
        var statement = connection.createStatement();
        var rows =
            statement.executeQuery("select to_regclass('public.only_here') is null as ausente")) {

      assertThat(rows.next()).isTrue();
      assertThat(rows.getBoolean("ausente")).isTrue();
    }
  }
}
