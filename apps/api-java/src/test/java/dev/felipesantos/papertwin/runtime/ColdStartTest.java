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
import java.time.Instant;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.junit.jupiter.api.extension.ExtendWith;

/**
 * Quanto custa a <b>primeira</b> retomada depois do start — a JVM fria.
 *
 * <p>É o número que importa para o Render Free, e ele é bem diferente do medido em regime. Numa
 * suíte, as medições anteriores já encontram o JIT aquecido pelas centenas de execuções do motor
 * que vieram antes; em produção, a primeira retomada do dia acontece com a JVM recém-iniciada,
 * interpretando bytecode, com as classes ainda sendo carregadas.
 *
 * <p>Esta classe roda <b>uma</b> retomada e mais nada, de propósito. Para o número ser de verdade
 * frio, ela precisa rodar numa JVM sua:
 *
 * <pre>{@code ./mvnw test -Dtest=ColdStartTest -DreuseForks=false}</pre>
 *
 * <p>Dentro da suíte completa o número sai aquecido, e o teste continua passando — ele não cobra
 * tempo, porque um limiar afinado nesta máquina seria falha intermitente no CI. O que ele faz é
 * <b>imprimir</b>, para o número ir para as notas do README.
 */
@ExtendWith(EmbeddedPostgresExtension.class)
class ColdStartTest {

  @Test
  @DisplayName("a primeira retomada depois do start, com a janela do teto")
  @Timeout(300)
  void firstCatchUpAfterStart() {
    var dataSource = EmbeddedPostgresExtension.freshDatabase();
    Migrations.run(dataSource);

    var historian = new HistorianRepository(dataSource);
    var catchUp =
        new CatchUp(
            historian,
            new OperationsRepository(dataSource),
            new SimStateRepository(dataSource, new ObjectMapper()));

    historian.replacePoints();

    long started = System.nanoTime();
    var report =
        catchUp.run(
            SimClock.DEFAULT_SEED,
            Instant.parse("2026-03-02T09:00:00Z"),
            Recorder.SCAN_TICKS);
    long elapsedMs = (System.nanoTime() - started) / 1_000_000;

    System.out.printf(
        "[jvm-fria] primeira retomada: %.2f h em %d ms, heap %d MB, %d linhas arquivadas%n",
        report.ticks() / (double) SimClock.TICKS_PER_HOUR,
        elapsedMs,
        report.heapUsedMb(),
        report.archived());

    assertThat(report.ticks()).isEqualTo(SimClock.MAX_CATCHUP_TICKS);
    assertThat(report.archived()).isPositive();
  }
}
