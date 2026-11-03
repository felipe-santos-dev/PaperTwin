package dev.felipesantos.papertwin.db;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;

/**
 * As migrations, rodadas contra um Postgres de verdade.
 *
 * <p>O SQL é o mesmo da implementação TypeScript, migration por migration, e isso é deliberado: o
 * esquema que a Java cria tem de ser indistinguível do que a TypeScript criava, porque durante a
 * transição os dois lados leem o mesmo banco e porque é contra esse esquema que o gabarito das
 * rotas foi gravado.
 *
 * <p>Inclusive a V2, que renomeia uma coluna que a V1 acabou de criar. Num banco novo ela parece
 * inútil — e é, menos pelo que importa: manter o histórico idêntico significa que ninguém precisa
 * provar que as duas sequências chegam ao mesmo lugar.
 */
@ExtendWith(EmbeddedPostgresExtension.class)
class MigrationsTest {

  private static DataSource dataSource;

  @BeforeAll
  static void migrate() {
    dataSource = EmbeddedPostgresExtension.freshDatabase();
    Migrations.run(dataSource);
  }

  private static List<String> query(String sql) throws SQLException {
    try (var connection = dataSource.getConnection();
        var statement = connection.createStatement();
        var rows = statement.executeQuery(sql)) {

      var out = new ArrayList<String>();
      while (rows.next()) {
        out.add(rows.getString(1));
      }
      return out;
    }
  }

  @Test
  @DisplayName("cria exatamente as dezenove tabelas do esquema")
  void tables() throws SQLException {
    /*
     * A lista é exata, e não "contém".
     *
     * O esquema da Java tem de ser indistinguível do que a implementação
     * TypeScript criava: é contra ele que o gabarito das rotas foi gravado, e é
     * ele que o banco de produção vai ter. Uma tabela a mais ou a menos é
     * divergência, mesmo que nada quebre hoje.
     *
     * Os filhos entram na conta de propósito — `shift_handover`,
     * `web_break_precursor`, `grade_change_reel`, `round_point`,
     * `note_evidence` são tabelas e não colunas de array, que é o que permite
     * consultar por eles.
     */
    var tables =
        query(
            "select table_name from information_schema.tables"
                + " where table_schema = 'public' and table_name <> 'flyway_schema_history'"
                + " order by 1");

    assertThat(tables)
        .containsExactly(
            "alarm",
            "asset",
            "grade_change",
            "grade_change_reel",
            "historian_archive",
            "historian_point",
            "historian_raw",
            "inspection_round",
            "jumbo_reel",
            "maintenance_note",
            "note_evidence",
            "round_point",
            "setpoint_change",
            "shift",
            "shift_handover",
            "sim_state",
            "vibration_reading",
            "web_break",
            "web_break_precursor");
  }

  @Test
  @DisplayName("a V2 renomeia drive_group para steam_group, como no histórico original")
  void steamGroupRename() throws SQLException {
    var columns =
        query(
            "select column_name from information_schema.columns where table_name = 'asset' order by 1");

    assertThat(columns).contains("steam_group").doesNotContain("drive_group");
  }

  @Test
  @DisplayName("sim_state aceita uma linha só")
  void simStateIsSingleRow() throws SQLException {
    try (var connection = dataSource.getConnection();
        var statement = connection.createStatement()) {

      statement.execute(
          "insert into sim_state (id, seed, last_tick, updated_at) values (1, 1, 0, now())");

      // a restrição é `id = 1`, então a segunda linha não tem onde caber
      assertThat(
              org.assertj.core.api.Assertions.catchThrowable(
                  () ->
                      statement.execute(
                          "insert into sim_state (id, seed, last_tick, updated_at) values (2, 1, 0, now())")))
          .isInstanceOf(SQLException.class);
    }
  }

  @Nested
  @DisplayName("os índices que as consultas pedem")
  class Indexes {

    @Test
    @DisplayName("o arquivo do historiador tem BRIN no tempo")
    void brinOnArchive() throws SQLException {
      // a tabela cresce em ordem de tempo, e um BRIN guarda só mínimo e máximo
      // por faixa de páginas — uma fração do tamanho de um btree equivalente
      var indexes =
          query(
              "select indexdef from pg_indexes where tablename in ('historian_archive', 'vibration_reading')");

      assertThat(indexes).anySatisfy(definition -> assertThat(definition).contains("brin"));
    }
  }

  @Test
  @DisplayName("rodar duas vezes não muda nada")
  void isIdempotent() {
    var again = Flyway.configure().dataSource(dataSource).locations("classpath:db/migration").load();

    assertThat(again.migrate().migrationsExecuted)
        .as("a segunda execução não tem o que aplicar")
        .isZero();
  }

  @Test
  @DisplayName("aplica as cinco migrations, na ordem")
  void appliedInOrder() throws SQLException {
    var versions = query("select version from flyway_schema_history where success order by installed_rank");

    assertThat(versions).containsExactly("1", "2", "3", "4", "5");
  }
}
