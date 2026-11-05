package dev.felipesantos.papertwin.db;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.felipesantos.papertwin.simulation.ProcessEngine;
import java.sql.Timestamp;
import java.time.Instant;
import javax.sql.DataSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.simple.JdbcClient;

/**
 * Onde a simulação parou.
 *
 * <p>Uma linha só, com o passo até onde a simulação já rodou, a semente que produziu aqueles dados
 * e o estado da rede. É o que permite a retomada: a API acorda, lê o passo guardado, calcula o que
 * faltou e reexecuta só isso.
 *
 * <p>A semente fica junto de propósito. Trocá-la muda todas as séries, e se ela viesse só da
 * configuração o arquivo passaria a ter duas máquinas coladas no mesmo eixo de tempo, sem nada
 * indicando onde uma acaba. Guardada aqui, a troca é detectável: quem retoma compara, vê que é
 * outra e reancora em vez de continuar uma série que não é a dele.
 *
 * <p>O estado da rede vai em {@code jsonb} porque nada nele é consultado — é um bloco opaco que só
 * o motor lê, e só por inteiro. São ~1.300 números, cerca de 25 KB, numa linha reescrita a cada
 * retomada.
 */
public class SimStateRepository {

  /** A tabela tem exatamente uma linha, e esta é a chave dela. */
  private static final short ONLY_ROW = 1;

  private final JdbcClient jdbc;
  private final JdbcTemplate template;
  private final ObjectMapper mapper;

  public SimStateRepository(DataSource dataSource, ObjectMapper mapper) {
    this.jdbc = JdbcClient.create(dataSource);
    this.template = new JdbcTemplate(dataSource);
    this.mapper = mapper;
  }

  /** O marcador gravado, ou {@code null} quando a simulação nunca rodou. */
  public record Marker(int seed, long lastTick, ProcessEngine.State state, Instant updatedAt) {}

  public Marker find() {
    return jdbc
        .sql("select seed, last_tick, state, updated_at from sim_state where id = ?")
        .param(ONLY_ROW)
        .query(
            (rs, row) -> {
              var json = rs.getString("state");
              ProcessEngine.State state = null;
              if (json != null) {
                try {
                  state = mapper.readValue(json, ProcessEngine.State.class);
                } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
                  /*
                   * Estado ilegível é o mesmo que estado ausente.
                   *
                   * Acontece quando o formato muda entre versões. Reancorar é
                   * sempre possível e custa uma descontinuidade; tentar
                   * interpretar um bloco de outra versão produziria uma rede
                   * meio retomada, que é pior e silenciosa.
                   */
                  state = null;
                }
              }

              return new Marker(
                  rs.getInt("seed"),
                  rs.getLong("last_tick"),
                  state,
                  rs.getTimestamp("updated_at").toInstant());
            })
        .optional()
        .orElse(null);
  }

  /**
   * Escreve um setpoint no estado gravado.
   *
   * <p>É o que faz uma escrita de setpoint ter <b>efeito</b>. A rede é remontada do estado a
   * cada retomada, e o setpoint faz parte dele: sem isto, a auditoria registraria uma escrita que
   * a simulação nunca viu — o pior dos dois mundos, porque a tela mostraria o registro e o
   * processo não se mexeria.
   *
   * <p>Sem estado gravado não há o que atualizar, e devolve {@code false}: acontece antes da
   * primeira retomada, e aí o ponto de operação do catálogo é que vale.
   */
  public boolean applySetpoint(String tag, double value) {
    var marker = find();
    if (marker == null || marker.state() == null) {
      return false;
    }

    var state = marker.state();
    var setpoints = new java.util.LinkedHashMap<>(state.setpoints());
    setpoints.put(tag, value);

    save(
        marker.seed(),
        marker.lastTick(),
        new ProcessEngine.State(
            state.version(),
            state.tick(),
            state.seed(),
            state.truth(),
            setpoints,
            state.integrals(),
            state.runners()),
        marker.updatedAt());

    return true;
  }

  public void save(int seed, long lastTick, ProcessEngine.State state, Instant updatedAt) {
    String json = null;

    if (state != null) {
      try {
        json = mapper.writeValueAsString(state);
      } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
        throw new IllegalStateException("não foi possível serializar o estado da rede", e);
      }
    }

    /*
     * O JSON vai como texto e é convertido no SQL, e não por um `PGobject`.
     *
     * O driver do Postgres está no escopo de execução e não no de compilação,
     * de propósito: nada no código precisa conhecer a API dele, e um `cast`
     * resolve a conversão sem acoplar a aplicação a um driver específico.
     */
    template.update(
        """
        insert into sim_state (id, seed, last_tick, state, updated_at)
        values (?, ?, ?, cast(? as jsonb), ?)
        on conflict (id) do update set
          seed = excluded.seed,
          last_tick = excluded.last_tick,
          state = excluded.state,
          updated_at = excluded.updated_at
        """,
        ONLY_ROW,
        seed,
        lastTick,
        json,
        Timestamp.from(updatedAt));
  }
}
