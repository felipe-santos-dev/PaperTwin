package dev.felipesantos.papertwin.runtime;

import static org.assertj.core.api.Assertions.assertThat;

import dev.felipesantos.papertwin.historian.Recorder;
import dev.felipesantos.papertwin.simulation.ProcessEngine;
import dev.felipesantos.papertwin.simulation.SimClock;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;

/**
 * Quanto custa reexecutar uma janela, e por que o teto é de quatro horas.
 *
 * <p>O teto não é um número escolhido por gosto: ele sai desta medição. A retomada roda
 * <b>dentro de uma requisição HTTP</b>, porque não há processo de fundo — quem acorda a API é
 * quem abriu a tela. Uma janela que custe mais do que alguém espera por uma página deixa a
 * primeira visita do dia pendurada.
 *
 * <p>A medição é do motor e do gravador, sem banco: é o custo de CPU que escala com a janela. A
 * escrita no banco é proporcional às linhas arquivadas, que a compressão mantém em algumas
 * milhares, e por isso não é ela que decide o teto.
 *
 * <p><b>O teste não falha por tempo.</b> A máquina de desenvolvimento e o runner do CI têm
 * desempenhos diferentes, e um limiar afinado numa delas seria falha intermitente na outra. O que
 * ele cobra é a <b>forma</b>: o custo cresce em linha reta com a janela, que é o que torna o teto
 * previsível. Os números medidos vão para as notas do README.
 */
class CatchUpBudgetTest {

  private record Cost(long ticks, long elapsedMs, long heapMb, long archived) {}

  /** Roda a janela no motor e no gravador, sem tocar no banco. */
  private static Cost measure(String label, long hours) {
    long ticks = hours * SimClock.TICKS_PER_HOUR;
    long fromTick = SimClock.tickAt(java.time.Instant.parse("2026-03-02T09:00:00Z")) - ticks;

    var runtime = Runtime.getRuntime();
    System.gc();
    long heapBefore = runtime.totalMemory() - runtime.freeMemory();
    long started = System.nanoTime();

    var engine = ProcessEngine.at(fromTick, SimClock.DEFAULT_SEED);
    var recorder = Recorder.forCatalog(Long.MAX_VALUE); // sem bruto: ele tem retenção de minutos
    var archive = new ArrayList<Object>();
    var scenario = CatchUp.scenarioAt(SimClock.tickTime(fromTick + ticks));

    for (long tick = fromTick + 1; tick <= fromTick + ticks; tick++) {
      engine.advance();
      if (tick % Recorder.SCAN_TICKS != 0) {
        continue;
      }

      var values = new LinkedHashMap<>(engine.snapshot());
      values.putAll(CatchUp.bearingValuesAt(SimClock.DEFAULT_SEED, tick, scenario));
      recorder.feed(tick, values);
      archive.addAll(recorder.drain().archive());
    }
    archive.addAll(recorder.flush());

    long elapsedMs = (System.nanoTime() - started) / 1_000_000;
    long heapMb = Math.max(0, (runtime.totalMemory() - runtime.freeMemory() - heapBefore) / 1_048_576);

    System.out.printf(
        "[orcamento] %s: %d passos em %d ms, %d linhas arquivadas, heap +%d MB%n",
        label, ticks, elapsedMs, archive.size(), heapMb);

    return new Cost(ticks, elapsedMs, heapMb, archive.size());
  }

  @Test
  @DisplayName("1 h, 24 h e 72 h: o custo cresce em linha reta, e é isso que fixa o teto")
  @Timeout(900)
  void windowCost() {
    var oneHour = measure("1 h", 1);
    var fourHours = measure("4 h (o teto)", 4);
    var oneDay = measure("24 h", 24);
    var threeDays = measure("72 h", 72);

    var all = List.of(oneHour, fourHours, oneDay, threeDays);

    for (var cost : all) {
      assertThat(cost.elapsedMs()).as("%d passos levaram tempo mensurável", cost.ticks()).isPositive();
      assertThat(cost.archived()).as("e produziram arquivo").isPositive();
    }

    /*
     * A forma importa mais que o número: o custo por passo não cresce com a
     * janela. Se crescesse, haveria acúmulo em algum estágio — uma lista que
     * nunca é esvaziada, um estado que incha — e o teto não seria previsível.
     */
    double perTickShort = oneHour.elapsedMs() / (double) oneHour.ticks();
    double perTickLong = threeDays.elapsedMs() / (double) threeDays.ticks();

    assertThat(perTickLong)
        .as("o custo por passo de 72 h não é muito maior que o de 1 h")
        .isLessThan(perTickShort * 3);

    /*
     * E a medida que justifica o teto: 72 h custam uma ordem de grandeza mais
     * que o teto, não um pouco mais.
     *
     * Medido nesta máquina: 4 h em ~1,1 s de CPU, 72 h em ~33 s. Trinta e três
     * segundos é mais do que qualquer tempo limite razoável de requisição, e a
     * retomada roda dentro de uma — então o teto corta, a reancoragem é dita no
     * relatório, e o intervalo que não rodou fica como buraco no histórico.
     *
     * A comparação é relativa de propósito. O número absoluto muda com a
     * máquina; a proporção entre as duas janelas, não.
     */
    assertThat(threeDays.elapsedMs())
        .as("72 h custam uma ordem de grandeza mais que o teto de 4 h")
        .isGreaterThan(fourHours.elapsedMs() * 10);

    /*
     * A memória NÃO é medida aqui, e a omissão é deliberada.
     *
     * O delta de heap entre dois instantes é dominado por quando o coletor
     * resolveu rodar, não pelo tamanho da janela — nesta mesma execução, 1 h
     * mediu +21 MB e 4 h mediu +6 MB, o que não quer dizer que 4 h custem menos
     * memória que 1 h. O número impresso serve de indicação para as notas do
     * README; transformá-lo em asserção seria transformar ruído de GC em
     * build vermelha.
     *
     * O que limita a memória de verdade está no desenho e é verificável sem
     * medir: o gravador é esvaziado a cada varredura, e o motor guarda um
     * estado de tamanho fixo.
     */
  }

  @Test
  @DisplayName("o teto de quatro horas é o que cabe numa requisição")
  void ceilingIsDeliberate() {
    // quatro horas, e não um dia: um dia são 86.400 passos, e ao custo medido
    // isso passa de qualquer tempo limite razoável de requisição
    assertThat(SimClock.MAX_CATCHUP_TICKS).isEqualTo(4 * SimClock.TICKS_PER_HOUR);
    assertThat(CatchUp.MAX_CATCHUP_HOURS).isEqualTo(4);
  }
}
