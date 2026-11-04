package dev.felipesantos.papertwin.simulation;

import java.time.Instant;
import java.time.ZoneOffset;

/**
 * O relógio da simulação: uma grade de passos ancorada num instante absoluto.
 *
 * <h2>O problema</h2>
 *
 * <p>O host gratuito dorme sem tráfego. Quando a API acorda, pode ter passado meia hora ou um dia,
 * e o processo precisa estar onde estaria se ninguém tivesse desligado nada — porque é uma máquina
 * de papel, e máquina de papel não para porque o servidor dormiu.
 *
 * <p>A rede de primeira ordem com tempo morto <b>tem estado</b>: integradores, linhas de atraso,
 * termos integrais das malhas. Não existe forma fechada para "o valor em t"; a única maneira
 * honesta de chegar ao instante t é executar os passos até ele. Então a retomada <b>reexecuta</b> o
 * intervalo que faltou.
 *
 * <h2>Por que a grade é absoluta</h2>
 *
 * <p>Para reexecutar dar o mesmo resultado que ter rodado contínuo, a sequência de passos tem de
 * ser a mesma nos dois casos. Se o passo 0 fosse "quando o processo subiu", duas execuções com
 * arranques diferentes cairiam em instantes diferentes, com ruído diferente, e nunca coincidiriam.
 *
 * <p>Aqui o passo {@code k} é sempre o instante {@code SIM_EPOCH + k · TICK_MS}, qualquer que seja
 * o arranque. Rodar de 100 a 200 e depois de 200 a 300 dá exatamente o mesmo que rodar de 100 a
 * 300.
 */
public final class SimClock {

  /**
   * O instante zero da simulação.
   *
   * <p>Um valor fixo e escrito, não o relógio do primeiro arranque: a grade precisa ser a mesma em
   * qualquer máquina e em qualquer deploy, senão o instantâneo do modo de demonstração — gerado
   * numa máquina, servido de outra — cairia numa grade diferente da API ao vivo.
   */
  public static final long SIM_EPOCH_MS =
      java.time.LocalDate.of(2026, 1, 1).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli();

  /**
   * O passo da simulação, em milissegundos.
   *
   * <p>Um segundo. Vem de baixo e de cima: o catálogo tem τ de 4,5 s na calandra, e um passo que
   * não resolva isso perderia a dinâmica mais rápida do processo; e recalcular um dia de 86.400
   * passos custa frações de segundo.
   */
  public static final long TICK_MS = 1000;

  public static final long TICKS_PER_MINUTE = 60_000 / TICK_MS;
  public static final long TICKS_PER_HOUR = TICKS_PER_MINUTE * 60;

  /**
   * Teto de passos numa retomada: quatro horas.
   *
   * <p>É o limite da garantia de "recalcular = rodar contínuo", e precisa estar escrito — junto com
   * a razão, que é de orçamento e não de elegância.
   *
   * <p>A retomada roda <b>dentro de uma requisição HTTP</b>, porque não há processo de fundo: o
   * host gratuito dorme sem tráfego, e quem acorda a API é quem abriu a tela. Acima do teto, a
   * retomada <b>reancora</b>: começa quatro horas antes do instante pedido, em regime, e diz que
   * reancorou. É uma descontinuidade, e dizer isso é melhor que fingir que a máquina rodou a noite
   * inteira.
   *
   * <p><b>A consequência é um buraco no histórico</b>, e ela é inerente ao desenho: se ninguém
   * abrir a tela por um dia, não houve quem rodasse a simulação daquele dia.
   */
  public static final long MAX_CATCHUP_TICKS = 4 * TICKS_PER_HOUR;

  /**
   * A semente da simulação.
   *
   * <p>Um número só, e dele saem todas as séries: o ruído de cada tag é função de (semente, passo,
   * canal da tag). Trocar a semente dá outra máquina — mesma dinâmica, outro ruído e outras
   * assinaturas de mancal.
   */
  public static final int DEFAULT_SEED = 20_260_101;

  private SimClock() {}

  /** O passo que contém um instante. */
  public static long tickAt(Instant instant) {
    return Math.floorDiv(instant.toEpochMilli() - SIM_EPOCH_MS, TICK_MS);
  }

  /** O instante em que um passo acontece. */
  public static Instant tickTime(long tick) {
    return Instant.ofEpochMilli(SIM_EPOCH_MS + tick * TICK_MS);
  }

  /** Quantos passos há entre dois instantes. */
  public static long ticksBetween(Instant from, Instant to) {
    return tickAt(to) - tickAt(from);
  }

  /** Segundos que um nº de passos representa. */
  public static double ticksToSeconds(long ticks) {
    return ticks * TICK_MS / 1000.0;
  }

  /** Passos que um nº de segundos representa, arredondado. */
  public static long secondsToTicks(double seconds) {
    return Math.round(seconds * 1000 / TICK_MS);
  }

  /**
   * O trecho de passos que uma retomada vai executar.
   *
   * <p>{@code reanchored} diz que o intervalo pedido era maior que o teto e que o trecho foi
   * cortado pela frente. Quem chama precisa dessa informação para registrar a descontinuidade, e
   * não para esconder.
   */
  public record CatchupRange(long fromTick, long toTick, long ticks, boolean reanchored) {}

  /**
   * O trecho a executar para sair de {@code fromTick} e chegar ao instante {@code to}.
   *
   * <p>{@code fromTick} nulo significa "nunca rodou": aí o trecho começa no teto antes do instante
   * pedido, o que dá à rede tempo de sair do transiente de arranque antes do que alguém vai olhar.
   */
  public static CatchupRange catchupRange(Long fromTick, Instant to) {
    return catchupRange(fromTick, to, MAX_CATCHUP_TICKS);
  }

  /**
   * O mesmo, com o teto dado.
   *
   * <p>O teto é parâmetro, e não só a constante, porque ele depende da <b>máquina</b>. As quatro
   * horas foram medidas num desktop; o Render Free dá uma fração de CPU, e lá a mesma janela pode
   * custar várias vezes mais. Quem opera ajusta {@code RESUME_MAX_HOURS} olhando o log da
   * retomada, sem recompilar nada.
   */
  public static CatchupRange catchupRange(Long fromTick, Instant to, long maxTicks) {
    long toTick = tickAt(to);

    if (fromTick == null) {
      long start = toTick - maxTicks;
      return new CatchupRange(start, toTick, toTick - start, true);
    }

    if (toTick <= fromTick) {
      return new CatchupRange(toTick, toTick, 0, false);
    }

    long gap = toTick - fromTick;
    if (gap > maxTicks) {
      long start = toTick - maxTicks;
      return new CatchupRange(start, toTick, maxTicks, true);
    }

    return new CatchupRange(fromTick, toTick, gap, false);
  }
}
