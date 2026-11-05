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
import java.lang.management.ManagementFactory;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.junit.jupiter.api.extension.ExtendWith;

/**
 * A pegada de memória de uma retomada longa — a janela que o teto normalmente corta.
 *
 * <p>Está <b>desligado</b> de propósito, e isto é a parte importante: uma retomada de 24 h não
 * acontece com a configuração padrão. O teto de {@code RESUME_MAX_HOURS} corta em 4 h e o relatório
 * diz que cortou. Então este número não descreve o serviço como ele roda; ele descreve o que
 * aconteceria se alguém <b>subisse</b> o teto, e serve para essa decisão ser tomada com um número.
 *
 * <p>Medir aqui e não na suíte é por tempo: são 24 h de passos, mais a colheita de nove turnos.
 *
 * <pre>{@code ./mvnw test -Dtest=FootprintTest -DreuseForks=false -Dsurefire.failIfNoSpecifiedTests=false -DexcludedGroups=}</pre>
 *
 * <p>O que ele imprime é o <b>pico de heap em uso</b>, amostrado durante a execução, e não o valor
 * do fim: o fim é depois de o coletor ter passado, e o que estoura um container de 512 MB é o pico.
 * O resto da pegada da JVM — metaspace, cache de código, pilhas — não aparece aqui porque não vem
 * do heap; esse número sai do {@code NativeMemoryTracking} com a aplicação de pé, e está nas notas.
 */
@Disabled("medição sob demanda: 24 h de passos não cabem na suíte, e o teto padrão corta em 4 h")
@ExtendWith(EmbeddedPostgresExtension.class)
class FootprintTest {

  /** De quanto em quanto tempo o heap é amostrado, em ms. */
  private static final long SAMPLE_MS = 50;

  @Test
  @DisplayName("o pico de heap de uma retomada de 24 h, com o teto levantado")
  @Timeout(900)
  void peakHeapOfLongCatchUp() throws Exception {
    var dataSource = EmbeddedPostgresExtension.freshDatabase();
    Migrations.run(dataSource);

    var historian = new HistorianRepository(dataSource);
    var catchUp =
        new CatchUp(
            historian,
            new OperationsRepository(dataSource),
            new SimStateRepository(dataSource, new ObjectMapper()),
            24);

    historian.replacePoints();

    var peak = new AtomicLong();
    var sampling = new java.util.concurrent.atomic.AtomicBoolean(true);
    var memory = ManagementFactory.getMemoryMXBean();

    var sampler =
        new Thread(
            () -> {
              while (sampling.get()) {
                peak.accumulateAndGet(memory.getHeapMemoryUsage().getUsed(), Math::max);
                try {
                  Thread.sleep(SAMPLE_MS);
                } catch (InterruptedException e) {
                  Thread.currentThread().interrupt();
                  return;
                }
              }
            },
            "amostrador-de-heap");

    sampler.setDaemon(true);
    sampler.start();

    long started = System.nanoTime();
    var report =
        catchUp.run(
            SimClock.DEFAULT_SEED, Instant.parse("2026-03-02T09:00:00Z"), Recorder.SCAN_TICKS);
    long elapsedMs = (System.nanoTime() - started) / 1_000_000;

    sampling.set(false);
    sampler.join(1_000);

    System.out.printf(
        "[pegada] %.0f h em %d ms (%d ms de colheita), pico de heap %d MB, %d linhas arquivadas%n",
        report.ticks() / (double) SimClock.TICKS_PER_HOUR,
        elapsedMs,
        report.harvestMs(),
        peak.get() / 1_048_576,
        report.archived());

    assertThat(report.ticks()).isEqualTo(24 * SimClock.TICKS_PER_HOUR);
    assertThat(peak.get()).as("o amostrador viu alguma coisa").isPositive();
  }
}
