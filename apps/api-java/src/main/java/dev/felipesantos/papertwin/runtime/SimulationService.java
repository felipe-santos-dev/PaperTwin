package dev.felipesantos.papertwin.runtime;

import java.time.Clock;
import java.time.Duration;
import dev.felipesantos.papertwin.simulation.SimClock;
import java.time.Instant;
import javax.sql.DataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Quem decide se a simulação precisa correr, e garante que ela corra uma vez só.
 *
 * <h2>O problema</h2>
 *
 * <p>A retomada roda dentro da requisição que acorda a API. Quando o host dorme a noite inteira e
 * alguém abre a tela de manhã, o navegador dispara as quinze buscas das sete telas <b>ao mesmo
 * tempo</b>. Sem coordenação, quinze requisições reexecutariam as mesmas quatro horas em paralelo,
 * cada uma gravando as mesmas linhas, cada uma consumindo os mesmos 512 MB.
 *
 * <h2>A solução, em duas camadas</h2>
 *
 * <p><b>Dentro do processo</b>, um bloqueio comum basta e é barato.
 *
 * <p><b>Entre processos</b> — e o Render pode subir mais de uma instância durante um deploy — o
 * bloqueio é do banco: {@code pg_advisory_lock}. A segunda requisição <b>espera</b> a primeira
 * terminar e então lê o resultado dela, em vez de retomar a mesma janela. Esperar é melhor que
 * falhar: quem abriu a tela quer o dado, não um 409.
 *
 * <p>O lock é por sessão e é liberado explicitamente, num {@code finally}. Se o processo morrer no
 * meio, o Postgres o libera ao fechar a conexão — que é a razão de ser um lock de aviso e não uma
 * linha numa tabela de controle, que ficaria travada para sempre.
 *
 * <h2>A janela de frescor</h2>
 *
 * <p>Depois de uma retomada, as requisições dos próximos segundos não retomam nada: o processo
 * andou menos de um passo de varredura, e reexecutar seria gastar o mesmo trabalho para chegar ao
 * mesmo lugar.
 */
public class SimulationService {

  private static final Logger log = LoggerFactory.getLogger(SimulationService.class);

  /**
   * A chave do lock de aviso.
   *
   * <p>Um número qualquer, mas fixo e escrito: o espaço de chaves é global no banco, e duas
   * aplicações que escolhessem o mesmo número por acaso se bloqueariam sem entender por quê.
   */
  public static final long ADVISORY_LOCK_KEY = 0x9A9E_7704_1A1B_0001L;

  /** Quanto tempo uma retomada continua valendo. */
  public static final Duration FRESH_FOR = Duration.ofSeconds(5);

  private final CatchUp catchUp;
  private final JdbcTemplate template;
  private final Clock clock;
  private final int seed;
  private final int scanTicks;

  private final Object inProcess = new Object();
  private volatile Instant lastRun = Instant.EPOCH;
  private volatile CatchUp.Report lastReport;

  public SimulationService(
      CatchUp catchUp, DataSource dataSource, Clock clock, int seed, int scanTicks) {
    this.catchUp = catchUp;
    this.template = new JdbcTemplate(dataSource);
    this.clock = clock;
    this.seed = seed;
    this.scanTicks = scanTicks;
  }

  /**
   * Garante que a simulação chegou ao instante de agora, e devolve o relatório.
   *
   * <p>Chamada por toda rota que lê dados. É barata quando não há o que fazer.
   */
  public CatchUp.Report ensureCurrent() {
    var now = clock.instant();

    var fresh = freshReport(now);
    if (fresh != null) {
      return fresh;
    }

    synchronized (inProcess) {
      // outra thread pode ter rodado enquanto esperávamos o bloqueio
      fresh = freshReport(now);
      if (fresh != null) {
        return fresh;
      }

      return withAdvisoryLock(
          () -> {
            /*
             * E outra INSTÂNCIA pode ter rodado enquanto esperávamos o lock do
             * banco. Reler o relógio e checar de novo é o que transforma a
             * espera em leitura: a segunda requisição não retoma, ela aproveita.
             */
            var afterLock = clock.instant();
            var again = freshReport(afterLock);
            if (again != null) {
              return again;
            }

            var report = catchUp.run(seed, afterLock, scanTicks);
            lastReport = report;
            lastRun = afterLock;

            /*
             * O log da retomada é o instrumento de ajuste do teto em produção.
             *
             * As medições do desenho foram feitas num desktop; o Render Free dá
             * uma fração de CPU e a JVM acorda fria. Sem este log, descobrir que
             * quatro horas custam vinte segundos lá exigiria reproduzir o
             * ambiente. Com ele, basta ler a primeira retomada depois do start e
             * baixar `RESUME_MAX_HOURS` se o número incomodar.
             *
             * Por isso saem as três grandezas que decidem: quantas horas foram
             * recuperadas, quanto tempo levou e quanto de heap ficou em uso.
             */
            if (report.ticks() > 0) {
              log.info(
                  "retomada: {} h recuperadas em {} ms ({} ms de colheita), heap {} MB,"
                      + " {} linhas arquivadas, compressão {}:1{}",
                  String.format("%.2f", report.ticks() / (double) SimClock.TICKS_PER_HOUR),
                  report.durationMs(),
                  report.harvestMs(),
                  report.heapUsedMb(),
                  report.archived(),
                  Math.round(report.compression().ratio()),
                  report.reanchored() ? " (reancorou: o teto cortou o início)" : "");
            }

            return report;
          });
    }
  }

  private CatchUp.Report freshReport(Instant now) {
    var report = lastReport;
    if (report == null) {
      return null;
    }
    return Duration.between(lastRun, now).compareTo(FRESH_FOR) < 0 ? report : null;
  }

  /**
   * Roda com o lock de aviso tomado, <b>na mesma conexão do começo ao fim</b>.
   *
   * <p>Este é o detalhe que faz o lock funcionar, e a primeira versão o errou. {@code
   * pg_advisory_lock} é <b>por sessão</b>, não por transação nem por chamada: quem o detém é a
   * conexão. Tomá-lo com uma conexão do pool, devolvê-la, fazer o trabalho e liberar com outra
   * conexão não libera nada — o {@code pg_advisory_unlock} de uma sessão que não detém o lock
   * devolve falso e vai embora quieto.
   *
   * <p>O efeito seria pior que não ter lock nenhum: ele vazaria, e a retomada seguinte esperaria
   * para sempre por um lock de uma sessão que já voltou para o pool. Numa API que só retoma
   * quando alguém abre a tela, isso é a aplicação parar de responder sem um erro sequer no log.
   *
   * <p>{@code pg_advisory_lock} espera; não há variante com tempo limite que valha aqui, porque
   * desistir deixaria quem chamou sem resposta justamente no caso em que a resposta está a
   * caminho.
   */
  private CatchUp.Report withAdvisoryLock(java.util.function.Supplier<CatchUp.Report> work) {
    return template.execute(
        (java.sql.Connection connection) -> {
          try (var lock = connection.prepareStatement("select pg_advisory_lock(?)")) {
            lock.setLong(1, ADVISORY_LOCK_KEY);
            lock.execute();
          }

          try {
            return work.get();
          } finally {
            try (var unlock = connection.prepareStatement("select pg_advisory_unlock(?)")) {
              unlock.setLong(1, ADVISORY_LOCK_KEY);
              unlock.execute();
            }
          }
        });
  }

  /** O último relatório, ou {@code null} se a simulação ainda não rodou nesta instância. */
  public CatchUp.Report lastReport() {
    return lastReport;
  }
}
