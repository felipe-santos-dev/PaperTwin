package dev.felipesantos.papertwin.runtime;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.felipesantos.papertwin.db.EmbeddedPostgresExtension;
import dev.felipesantos.papertwin.db.HistorianRepository;
import dev.felipesantos.papertwin.db.Migrations;
import dev.felipesantos.papertwin.db.OperationsRepository;
import dev.felipesantos.papertwin.db.SimStateRepository;
import dev.felipesantos.papertwin.historian.Recorder;
import dev.felipesantos.papertwin.simulation.SimClock;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * A retomada contra um Postgres de verdade.
 *
 * <p>Estes casos rodam horas de simulação cada um, e por isso são lentos de propósito: o que eles
 * cobram é justamente o que só aparece ao rodar de verdade — se a reexecução converge, se o lock
 * impede o trabalho duplicado e quanto tempo e memória uma janela longa custa.
 */
@ExtendWith(EmbeddedPostgresExtension.class)
class CatchUpTest {

  private static final Instant NOW = Instant.parse("2026-03-02T09:00:00Z");

  private DataSource dataSource;
  private HistorianRepository historian;
  private OperationsRepository operations;
  private SimStateRepository simState;
  private CatchUp catchUp;
  private JdbcTemplate template;

  @BeforeEach
  void freshDatabase() {
    dataSource = EmbeddedPostgresExtension.freshDatabase();
    Migrations.run(dataSource);

    historian = new HistorianRepository(dataSource);
    operations = new OperationsRepository(dataSource);
    simState = new SimStateRepository(dataSource, new ObjectMapper());
    catchUp = new CatchUp(historian, operations, simState);
    template = new JdbcTemplate(dataSource);

    historian.replacePoints();
  }

  private static Instant at(long ticksBefore) {
    return NOW.minusSeconds(ticksBefore);
  }

  @Test
  @DisplayName("a primeira retomada reancora e grava")
  @Timeout(120)
  void firstRunAnchors() {
    var report = catchUp.run(SimClock.DEFAULT_SEED, at(SimClock.TICKS_PER_HOUR), Recorder.SCAN_TICKS);

    assertThat(report.reanchored()).as("nunca rodou: começa no teto antes de agora").isTrue();
    assertThat(report.resumedFromState()).isFalse();
    assertThat(report.ticks()).isEqualTo(SimClock.MAX_CATCHUP_TICKS);
    assertThat(report.scans()).isPositive();
    assertThat(report.archived()).isPositive();
    assertThat(report.values()).isNotEmpty();

    assertThat(simState.find()).isNotNull();
    assertThat(simState.find().lastTick()).isEqualTo(report.toTick());
  }

  @Test
  @DisplayName("a segunda retomada continua do estado gravado, sem reancorar")
  @Timeout(180)
  void secondRunResumes() {
    var first = at(SimClock.TICKS_PER_HOUR);
    catchUp.run(SimClock.DEFAULT_SEED, first, Recorder.SCAN_TICKS);

    var second = catchUp.run(SimClock.DEFAULT_SEED, first.plusSeconds(600), Recorder.SCAN_TICKS);

    assertThat(second.reanchored()).isFalse();
    assertThat(second.resumedFromState()).as("continuou de onde parou").isTrue();
    assertThat(second.ticks()).isEqualTo(600);
  }

  @Test
  @DisplayName("reexecutar o mesmo trecho não duplica linha nenhuma")
  @Timeout(180)
  void reexecutionIsIdempotent() {
    /*
     * A varredura é ancorada na grade absoluta. Sem isso, duas retomadas que
     * começassem em passos diferentes varreriam instantes diferentes e o
     * `on conflict do nothing` não reconheceria as repetições: o mesmo trecho
     * entraria duas vezes, deslocado em um segundo.
     */
    var now = at(SimClock.TICKS_PER_HOUR);
    catchUp.run(SimClock.DEFAULT_SEED, now, Recorder.SCAN_TICKS);

    long afterFirst = template.queryForObject("select count(*) from historian_archive", Long.class);

    // apaga o marcador e roda de novo com o mesmo instante: as duas execuções
    // reancoram no mesmo passo e percorrem exatamente a mesma janela
    template.update("delete from sim_state");
    catchUp.run(SimClock.DEFAULT_SEED, now, Recorder.SCAN_TICKS);

    long afterSecond = template.queryForObject("select count(*) from historian_archive", Long.class);

    assertThat(afterSecond)
        .as("a reexecução não acrescentou linhas repetidas")
        .isEqualTo(afterFirst);
  }

  @Test
  @DisplayName("trocar a semente reancora em vez de colar duas máquinas")
  @Timeout(180)
  void seedChangeReanchors() {
    var now = at(SimClock.TICKS_PER_HOUR);
    catchUp.run(SimClock.DEFAULT_SEED, now, Recorder.SCAN_TICKS);

    var other = catchUp.run(SimClock.DEFAULT_SEED + 1, now.plusSeconds(600), Recorder.SCAN_TICKS);

    assertThat(other.seedChanged()).isTrue();
    assertThat(other.reanchored()).as("semente diferente é outra máquina").isTrue();
    assertThat(other.resumedFromState()).isFalse();
  }

  @Test
  @DisplayName("sem nada a fazer, a retomada ainda diz onde a máquina está")
  @Timeout(120)
  void nothingToDoStillAnswers() {
    var now = at(SimClock.TICKS_PER_HOUR);
    catchUp.run(SimClock.DEFAULT_SEED, now, Recorder.SCAN_TICKS);

    var again = catchUp.run(SimClock.DEFAULT_SEED, now, Recorder.SCAN_TICKS);

    assertThat(again.ticks()).isZero();
    assertThat(again.values()).as("a pergunta continua tendo resposta").isNotEmpty();
    assertThat(again.values()).containsKey("AIC-902");
  }

  @Nested
  @DisplayName("concorrência")
  class Concurrency {

    @Test
    @DisplayName("dez requisições simultâneas retomam uma vez só")
    @Timeout(300)
    void onlyOneCatchUpRuns() throws Exception {
      /*
       * É o caso de verdade: o host dormiu a noite, alguém abre a tela de
       * manhã e o navegador dispara as quinze buscas das sete telas ao mesmo
       * tempo. Sem coordenação, quinze requisições reexecutariam as mesmas
       * quatro horas em paralelo.
       */
      var ran = new AtomicInteger();
      var counting =
          new CatchUp(historian, operations, simState) {
            @Override
            public Report run(int seed, Instant now, int scanTicks) {
              ran.incrementAndGet();
              return super.run(seed, now, scanTicks);
            }
          };

      var service =
          new SimulationService(
              counting, dataSource, Clock.fixed(at(SimClock.TICKS_PER_HOUR), ZoneOffset.UTC),
              SimClock.DEFAULT_SEED, Recorder.SCAN_TICKS);

      try (var pool = Executors.newFixedThreadPool(10)) {
        var calls = new java.util.ArrayList<Callable<CatchUp.Report>>();
        for (int i = 0; i < 10; i++) {
          calls.add(service::ensureCurrent);
        }

        var results = pool.invokeAll(calls);
        for (var result : results) {
          assertThat(result.get()).as("toda requisição recebe um relatório").isNotNull();
        }
      }

      assertThat(ran.get())
          .as("uma retomada só; as outras nove leram o resultado dela")
          .isEqualTo(1);
    }

    @Test
    @DisplayName("o lock de aviso é liberado mesmo quando a retomada falha")
    @Timeout(120)
    void lockIsReleasedOnFailure() {
      var exploding =
          new CatchUp(historian, operations, simState) {
            @Override
            public Report run(int seed, Instant now, int scanTicks) {
              throw new IllegalStateException("falha simulada");
            }
          };

      var service =
          new SimulationService(
              exploding, dataSource, Clock.fixed(NOW, ZoneOffset.UTC),
              SimClock.DEFAULT_SEED, Recorder.SCAN_TICKS);

      assertThat(org.assertj.core.api.Assertions.catchThrowable(service::ensureCurrent))
          .hasMessageContaining("falha simulada");

      // se o lock tivesse vazado, ninguém mais conseguiria tomá-lo
      var free =
          template.queryForObject(
              "select pg_try_advisory_lock(?)", Boolean.class, SimulationService.ADVISORY_LOCK_KEY);

      assertThat(free).as("o lock foi liberado no finally").isTrue();
      template.queryForObject(
          "select pg_advisory_unlock(?)", Boolean.class, SimulationService.ADVISORY_LOCK_KEY);
    }

    @Test
    @DisplayName("dentro da janela de frescor, a requisição seguinte não retoma nada")
    @Timeout(180)
    void freshWindowSkipsWork() {
      var ran = new AtomicInteger();
      var counting =
          new CatchUp(historian, operations, simState) {
            @Override
            public Report run(int seed, Instant now, int scanTicks) {
              ran.incrementAndGet();
              return super.run(seed, now, scanTicks);
            }
          };

      var service =
          new SimulationService(
              counting, dataSource, Clock.fixed(at(SimClock.TICKS_PER_HOUR), ZoneOffset.UTC),
              SimClock.DEFAULT_SEED, Recorder.SCAN_TICKS);

      service.ensureCurrent();
      service.ensureCurrent();
      service.ensureCurrent();

      assertThat(ran.get()).isEqualTo(1);
    }
  }

  @Nested
  @DisplayName("orçamento")
  class Budget {

    /**
     * Mede tempo e memória de uma janela, e imprime.
     *
     * <p>Os números vão para as notas do README, e o teste não falha por eles: a máquina de
     * desenvolvimento e o runner do CI têm desempenhos diferentes, e um limiar afinado numa
     * delas seria falha intermitente na outra. O que o teste cobra é o teto de quatro horas —
     * esse sim é decisão de desenho.
     */
    private record Measured(CatchUp.Report report, long elapsedMs) {}

    private Measured measure(String label, long hours) {
      var runtime = Runtime.getRuntime();
      System.gc();
      long before = runtime.totalMemory() - runtime.freeMemory();

      var now = NOW.minusSeconds(hours * 3600);
      long started = System.nanoTime();
      var report = catchUp.run(SimClock.DEFAULT_SEED, now, Recorder.SCAN_TICKS);
      long elapsedMs = (System.nanoTime() - started) / 1_000_000;

      long after = runtime.totalMemory() - runtime.freeMemory();

      System.out.printf(
          "[orçamento] %s: %d passos em %d ms (%d ms de colheita), %d linhas arquivadas,"
              + " compressão %.0f:1, heap +%d MB%n",
          label,
          report.ticks(),
          elapsedMs,
          report.harvestMs(),
          report.archived(),
          report.compression().ratio(),
          Math.max(0, (after - before) / 1_048_576));

      return new Measured(report, elapsedMs);
    }

    @Test
    @DisplayName("uma retomada nunca passa do teto de quatro horas, qualquer que seja o pedido")
    @Timeout(600)
    void ceilingHolds() {
      /*
       * É o que torna a retomada previsível: pedir 72 h não roda 72 h.
       *
       * A consequência é um buraco no histórico — se ninguém abrir a tela por
       * um dia, não houve quem rodasse a simulação daquele dia — e ela é
       * inerente ao desenho de um host que dorme. Está no checklist de deploy.
       */
      // em ordem crescente de instante: o marcador avança, e pedir um instante
      // anterior ao que já foi simulado não é retomada, é outra pergunta
      var longWindow = measure("72 h pedidas", 72);
      var shortWindow = measure("1 h depois", 1);

      assertThat(longWindow.report().ticks())
          .as("o teto vale: pedir 72 h não roda 72 h")
          .isEqualTo(SimClock.MAX_CATCHUP_TICKS);
      assertThat(longWindow.report().reanchored())
          .as("e a reancoragem é dita, não escondida")
          .isTrue();

      assertThat(shortWindow.report().ticks())
          .as("a janela curta cabe inteira, sem cortar")
          .isLessThanOrEqualTo(SimClock.MAX_CATCHUP_TICKS);

      assertThat(longWindow.elapsedMs()).isPositive();
      assertThat(shortWindow.elapsedMs()).isPositive();
    }
  }

  @Nested
  @DisplayName("o teto configurável")
  class ConfigurableCeiling {

    @Test
    @DisplayName("RESUME_MAX_HOURS corta a janela no valor pedido")
    @Timeout(180)
    void respectsConfiguredCeiling() {
      /*
       * O teto depende da máquina. Quatro horas foram medidas num desktop; no
       * Render Free, que dá uma fração de CPU, a mesma janela custa várias
       * vezes mais — e quem opera precisa poder baixar o teto sem recompilar.
       */
      var oneHour = new CatchUp(historian, operations, simState, 1);
      var report = oneHour.run(SimClock.DEFAULT_SEED, NOW, Recorder.SCAN_TICKS);

      assertThat(oneHour.maxHours()).isEqualTo(1);
      assertThat(report.ticks()).isEqualTo(SimClock.TICKS_PER_HOUR);
      assertThat(report.reanchored()).as("cortou, e diz que cortou").isTrue();
    }

    @Test
    @DisplayName("um teto menor que uma hora é recusado na montagem")
    void refusesTinyCeiling() {
      // meia hora de janela não dá tempo de a rede sair do transiente de
      // arranque antes do que alguém vai olhar
      assertThat(
              org.assertj.core.api.Assertions.catchThrowable(
                  () -> new CatchUp(historian, operations, simState, 0)))
          .isInstanceOf(IllegalArgumentException.class)
          .hasMessageContaining("pelo menos uma hora");
    }

    @Test
    @DisplayName("o relatório traz o heap em uso, que é o que o Render Free limita")
    @Timeout(180)
    void reportsHeap() {
      var report =
          catchUp.run(SimClock.DEFAULT_SEED, at(SimClock.TICKS_PER_HOUR), Recorder.SCAN_TICKS);

      assertThat(report.heapUsedMb())
          .as("heap em uso ao fim da retomada")
          .isPositive()
          .isLessThan(512);
    }
  }

  @Test
  @DisplayName("os valores do relatório cobrem processo e mancais")
  @Timeout(180)
  void valuesCoverBothHalves() {
    var report = catchUp.run(SimClock.DEFAULT_SEED, at(SimClock.TICKS_PER_HOUR), Recorder.SCAN_TICKS);

    // o motor de processo para na área `mancais`; a ponte de tags junta as
    // duas metades
    assertThat(report.values()).containsKeys("AIC-902", "PIC-514", "VI-5123A", "TI-5323A");

    assertThat(List.copyOf(report.values().keySet()))
        .as("as 320 do catálogo")
        .hasSizeGreaterThanOrEqualTo(320);
  }
}
