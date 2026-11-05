package dev.felipesantos.papertwin.api;

import dev.felipesantos.papertwin.runtime.SimulationService;
import dev.felipesantos.papertwin.simulation.SimClock;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import javax.sql.DataSource;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * O {@code /health}, que diz mais que "ok".
 *
 * <p>Num host que dorme, a pergunta útil não é se o processo está vivo — ele acabou de nascer
 * para responder esta requisição. É <b>quão atrasada</b> a simulação está, porque é isso que
 * decide se o que a tela mostra é de agora ou de ontem.
 */
@RestController
public class HealthController {

  private final SimulationService simulation;
  private final JdbcTemplate template;
  private final Clock clock;
  private final String version;
  private final Instant startedAt;

  public HealthController(
      SimulationService simulation,
      DataSource dataSource,
      Clock clock,
      @Value("${papertwin.version:0.0.1-SNAPSHOT}") String version) {

    this.simulation = simulation;
    this.template = new JdbcTemplate(dataSource);
    this.clock = clock;
    this.version = version;
    this.startedAt = clock.instant();
  }

  public record Simulation(int seed, long lastTick, Instant lastRunAt, long behindS, long maxHours) {}

  /**
   * O estado do serviço.
   *
   * <p>O {@code status} é {@code "ok"} ou {@code "degraded"} — em inglês, contra a regra do resto
   * do projeto, porque é <b>valor de contrato</b> e não texto de tela: o front compara com ele, e
   * o gabarito da implementação TypeScript já publicava assim. Traduzir aqui quebraria a
   * comparação sem dar nada em troca; o que a pessoa lê é escrito na tela.
   */
  public record Health(
      String status,
      String service,
      String version,
      long uptimeS,
      String database,
      boolean databaseUp,
      Simulation simulation) {}

  @GetMapping("/health")
  public Health health() {
    boolean databaseUp;
    try {
      template.queryForObject("select 1", Integer.class);
      databaseUp = true;
    } catch (RuntimeException e) {
      // o /health não pode falhar junto com o que ele monitora
      databaseUp = false;
    }

    var report = simulation.ensureCurrent();
    var lastRunAt = SimClock.tickTime(report.toTick());
    var now = clock.instant();

    return new Health(
        databaseUp ? "ok" : "degraded",
        "mp1-twin-api",
        version,
        Duration.between(startedAt, now).toSeconds(),
        "postgres",
        databaseUp,
        new Simulation(
            report.seed(),
            report.toTick(),
            lastRunAt,
            Duration.between(lastRunAt, now).toSeconds(),
            SimClock.MAX_CATCHUP_TICKS / SimClock.TICKS_PER_HOUR));
  }
}
