package dev.felipesantos.papertwin.runtime;

import static org.assertj.core.api.Assertions.assertThat;

import dev.felipesantos.papertwin.operation.Scenarios;
import dev.felipesantos.papertwin.simulation.SimClock;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

/**
 * Quando a colheita roda — e, principalmente, quando não roda.
 *
 * <p>É a decisão que separa uma API usável de uma que leva onze segundos por requisição. A
 * colheita lê o arquivo de ~20 tags pela janela do turno e reescreve as entidades dele; rodá-la em
 * toda retomada fazia cada tela pagar isso, porque a janela de frescor é de cinco segundos.
 *
 * <p>Tudo aqui é aritmética pura sobre o plano do turno — nenhum teste daqui toca no banco, que é
 * justamente a propriedade que torna a decisão barata.
 */
class HarvestCadenceTest {

  private static final int SEED = SimClock.DEFAULT_SEED;

  /** Um passo bem no meio de um turno, longe de qualquer fronteira. */
  private static long calmTick() {
    var plan = Scenarios.planAt(SEED, 10 * SimClock.TICKS_PER_HOUR);

    /*
     * Procura um minuto em que nada acontece: nem borda de turno, nem de
     * bobina, nem ronda, nem quebra, nem troca. Procurar é mais honesto que
     * escolher um número à mão, que silenciosamente deixaria de valer quando o
     * plano mudasse.
     */
    for (long tick = plan.startTick() + 60; tick < plan.endTick() - 60; tick += 60) {
      if (!Harvest.dueIn(SEED, tick, tick + 5)) {
        return tick;
      }
    }

    throw new IllegalStateException("nenhum instante calmo no turno: o plano mudou?");
  }

  @Nested
  @DisplayName("não colhe")
  class DoesNotHarvest {

    @Test
    @DisplayName("numa janela de cinco segundos sem nada acontecendo")
    void skipsTinyQuietWindow() {
      // é o caso comum: duas telas abertas, seis segundos de intervalo
      long tick = calmTick();
      assertThat(Harvest.dueIn(SEED, tick, tick + 5)).isFalse();
    }

    @Test
    @DisplayName("numa janela vazia, nem que ela caia em cima de uma fronteira")
    void skipsEmptyWindow() {
      var plan = Scenarios.planAt(SEED, 10 * SimClock.TICKS_PER_HOUR);
      assertThat(Harvest.dueIn(SEED, plan.startTick(), plan.startTick())).isFalse();
    }
  }

  @Nested
  @DisplayName("colhe")
  class Harvests {

    @Test
    @DisplayName("quando uma bobina fecha dentro da janela")
    void whenAReelCloses() {
      var plan = Scenarios.planAt(SEED, 10 * SimClock.TICKS_PER_HOUR);
      var reel = plan.reels().getFirst();

      // a bobina que fecha é a notícia que a tela espera: não pode esperar
      // cinco minutos pela grade
      assertThat(Harvest.dueIn(SEED, reel.endTick() - 1, reel.endTick())).isTrue();
    }

    @Test
    @DisplayName("quando a ronda termina dentro da janela")
    void whenTheRoundEnds() {
      var plan = Scenarios.planAt(SEED, 10 * SimClock.TICKS_PER_HOUR);
      long end = plan.round().endTick();

      assertThat(Harvest.dueIn(SEED, end - 1, end)).isTrue();
    }

    @Test
    @DisplayName("quando a janela cruza a grade de cinco minutos")
    void whenCrossingTheGrid() {
      /*
       * É o que atualiza o que muda continuamente — a produção acumulada e a
       * eficiência do turno —, e é por isso que a grade existe: sem ela, um
       * turno sem fronteira nenhuma ficaria com a produção congelada.
       */
      long grid = Harvest.HARVEST_EVERY_TICKS;
      long antes = calmTick() / grid * grid + grid - 1;

      assertThat(Harvest.dueIn(SEED, antes, antes + 2)).isTrue();
    }

    @Test
    @DisplayName("na primeira retomada, que é sempre larga")
    void onTheFirstCatchUp() {
      // a retomada do arranque cobre a janela do teto, e atravessa tudo
      long to = 10 * SimClock.TICKS_PER_HOUR;
      assertThat(Harvest.dueIn(SEED, to - 4 * SimClock.TICKS_PER_HOUR, to)).isTrue();
    }
  }

  @Test
  @DisplayName("a grade é absoluta, e não contada a partir da última colheita")
  void gridIsAbsolute() {
    /*
     * Duas retomadas que começam em passos diferentes e terminam no mesmo
     * passo têm de concordar sobre colher ou não. Com a grade contada a partir
     * do início de cada uma, elas colheriam em instantes diferentes — e a
     * idempotência da retomada, que é o que faz reexecutar um trecho não mudar
     * nada, se perderia.
     */
    long grid = Harvest.HARVEST_EVERY_TICKS;
    long gridLine = calmTick() / grid * grid + grid;

    assertThat(Harvest.dueIn(SEED, gridLine - 1, gridLine))
        .as("a janela que termina na linha da grade colhe")
        .isTrue();
    assertThat(Harvest.dueIn(SEED, gridLine - 10, gridLine))
        .as("e a que começa dez passos antes também, pelo mesmo motivo")
        .isTrue();
    assertThat(Harvest.dueIn(SEED, gridLine, gridLine + 1))
        .as("logo depois da linha, não há o que colher de novo")
        .isFalse();
  }
}
