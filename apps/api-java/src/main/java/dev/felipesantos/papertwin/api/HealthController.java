package dev.felipesantos.papertwin.api;

import dev.felipesantos.papertwin.db.SimStateRepository;
import dev.felipesantos.papertwin.runtime.CatchUp;
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
 *
 * <p><b>Esta rota não roda a retomada</b>, e isso é a parte importante. Ela lê o marcador — uma
 * linha indexada — e devolve o atraso que ele revela. Rodar a retomada aqui transformaria a sonda
 * mais barata da API na mais cara, e tem duas consequências concretas:
 *
 * <ul>
 *   <li>um balanceador que chama {@code /health} a cada dez segundos acordaria a simulação sem
 *       ninguém olhando a tela, que é exatamente o laço de fundo que este desenho não tem;
 *   <li>o front sonda a API com prazo de quatro segundos antes de decidir entre dados ao vivo e o
 *       instantâneo de demonstração. Com a retomada no caminho, a primeira sonda do dia estoura o
 *       prazo e a tela cai para o instantâneo — com a API no ar, respondendo.
 * </ul>
 *
 * <p>O segundo caso aconteceu: foi assim que isto apareceu.
 */
@RestController
public class HealthController {

  private final SimStateRepository simState;
  private final JdbcTemplate template;
  private final Clock clock;
  private final String version;
  private final Instant startedAt;

  public HealthController(
      SimStateRepository simState,
      DataSource dataSource,
      Clock clock,
      @Value("${papertwin.version:0.0.1-SNAPSHOT}") String version) {

    this.simState = simState;
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
      @Nullable Simulation simulation) {}

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

    var now = clock.instant();
    var marker = databaseUp ? simState.find() : null;

    /*
     * Sem marcador, a simulação nunca rodou — e é isso que vai na resposta, em
     * vez de zeros. Acontece no primeiro arranque, antes de alguém abrir a
     * primeira tela, e dizê-lo é mais útil que fingir um estado.
     */
    var simulation =
        marker == null
            ? null
            : new Simulation(
                marker.seed(),
                marker.lastTick(),
                SimClock.tickTime(marker.lastTick()),
                Duration.between(SimClock.tickTime(marker.lastTick()), now).toSeconds(),
                CatchUp.MAX_CATCHUP_HOURS);

    return new Health(
        databaseUp ? "ok" : "degraded",
        "mp1-twin-api",
        version,
        Duration.between(startedAt, now).toSeconds(),
        "postgres",
        databaseUp,
        simulation);
  }
}
