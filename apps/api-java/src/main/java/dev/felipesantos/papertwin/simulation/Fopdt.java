package dev.felipesantos.papertwin.simulation;

import java.util.Arrays;
import java.util.List;

/**
 * O núcleo de primeira ordem com tempo morto do simulador.
 *
 * <p>As relações da pesquisa B são modelos de primeira ordem com tempo morto: um ganho, um atraso
 * puro e uma constante de tempo. Esta classe as integra.
 *
 * <p>Três decisões sustentam isso:
 *
 * <ol>
 *   <li><b>Discretização exata (ZOH), não Euler.</b> Com entrada constante entre amostras, a
 *       solução da equação de primeira ordem é fechada: {@code a = exp(−dt/τ)} e {@code y ← a·y +
 *       (1−a)·kp·u}. Isso é exato nos instantes de amostragem, não uma aproximação, e é estável
 *       para qualquer {@code dt} — {@code a} fica sempre em (0, 1). O Euler {@code y ← y +
 *       (dt/τ)(kp·u − y)} divergiria com {@code dt > 2τ}, e o catálogo tem τ de 4,5 s: um passo de
 *       10 s já explodiria.
 *   <li><b>Tudo em desvio do ponto de operação.</b> A saída diz quanto a variável se afastou de
 *       onde estava, não o valor absoluto. É o que permite somar.
 *   <li><b>Superposição.</b> Várias entradas na mesma saída se somam — a gramatura recebe quatro
 *       relações. Só vale porque os modelos são lineares, que é a hipótese da própria pesquisa ao
 *       dar um {@code kp} por unidade.
 * </ol>
 */
public final class Fopdt {

  /** Os três coeficientes de uma relação. */
  public record Model(double kp, double deadTimeS, double tauS) {}

  /**
   * O estado de um integrador, serializável.
   *
   * <p>A linha de atraso é o estado que não dá para recalcular: ela guarda o que entrou nos últimos
   * {@code θ} segundos, e sem ela a retomada perderia tudo que está no caminho entre a válvula e a
   * medida. Numa relação com 270 s de tempo morto, isso é quatro minutos e meio de processo que já
   * aconteceu e ainda não apareceu.
   */
  public record State(List<Double> line, int step, double output) {}

  private Fopdt() {}

  /** Quanto do desvio anterior sobrevive a um passo de {@code dt}. */
  public static double decayPerStep(double tauS, double dtS) {
    return Math.exp(-dtS / tauS);
  }

  /**
   * O tempo morto em passos.
   *
   * <p>Arredondado: com {@code dt} grosseiro o atraso não cai num múltiplo exato, e arredondar erra
   * no máximo meio passo — truncar sempre adiantaria a resposta.
   */
  public static int delaySteps(double deadTimeS, double dtS) {
    return (int) Math.round(deadTimeS / dtS);
  }

  private static void assertUsable(Model model, double dtS) {
    if (!(dtS > 0)) {
      throw new IllegalArgumentException("dt precisa ser maior que zero: " + dtS);
    }
    if (!(model.tauS() > 0)) {
      throw new IllegalArgumentException("τ precisa ser maior que zero: " + model.tauS());
    }
    if (model.deadTimeS() < 0) {
      throw new IllegalArgumentException(
          "tempo morto não pode ser negativo: " + model.deadTimeS());
    }
  }

  /**
   * Um integrador para uma relação, com a sua linha de atraso.
   *
   * <p>A linha é um anel de {@code d + 1} posições: o passo {@code n} escreve em {@code n % L} e lê
   * em {@code (n + 1) % L}, que é exatamente a entrada de {@code d} passos atrás. Antes de a janela
   * encher, o que se lê é zero — nenhum desvio.
   */
  public static final class Runner {

    private final double kp;
    private final double decay;
    private final double[] line;
    private int step;
    private double output;

    private Runner(Model model, double dtS, State state) {
      assertUsable(model, dtS);

      this.kp = model.kp();
      this.decay = decayPerStep(model.tauS(), dtS);

      int length = delaySteps(model.deadTimeS(), dtS) + 1;
      this.line = new double[length];

      if (state != null) {
        if (state.line().size() != length) {
          throw new IllegalArgumentException(
              "A linha de atraso gravada tem %d posições e esta relação precisa de %d. O tempo morto ou o passo mudaram desde a gravação, e continuar daí misturaria dois modelos."
                  .formatted(state.line().size(), length));
        }
        for (int i = 0; i < length; i++) {
          line[i] = state.line().get(i);
        }
        this.step = state.step();
        this.output = state.output();
      }
    }

    /** Avança um passo com o desvio de entrada e devolve o desvio de saída depois de {@code dt}. */
    public double advance(double inputDeviation) {
      int length = line.length;
      line[Math.floorMod(step, length)] = inputDeviation;
      double delayed = line[Math.floorMod(step + 1, length)];
      step += 1;

      output = decay * output + (1 - decay) * kp * delayed;
      return output;
    }

    /** O desvio de saída atual, sem avançar. */
    public double output() {
      return output;
    }

    /** O estado atual, para gravar e retomar. */
    public State snapshot() {
      var copy = Arrays.stream(line).boxed().toList();
      return new State(copy, step, output);
    }
  }

  /** Um integrador novo, zerado. */
  public static Runner runner(Model model, double dtS) {
    return new Runner(model, dtS, null);
  }

  /** Um integrador retomado de um estado gravado. */
  public static Runner runner(Model model, double dtS, State state) {
    return new Runner(model, dtS, state);
  }

  /**
   * A resposta a uma série de entrada.
   *
   * <p>Devolve {@code inputs.length + 1} pontos: o primeiro é o desvio zero de antes do primeiro
   * passo, para o índice {@code k} ser o instante {@code k · dt}.
   */
  public static double[] simulate(Model model, double[] inputs, double dtS) {
    var runner = runner(model, dtS);
    var series = new double[inputs.length + 1];

    for (int i = 0; i < inputs.length; i++) {
      series[i + 1] = runner.advance(inputs[i]);
    }

    return series;
  }

  /**
   * A resposta a um degrau aplicado em {@code t = 0} e mantido.
   *
   * <p>O índice {@code k} do resultado é o instante {@code k · dt}, então a resposta vale zero até
   * {@code k = θ/dt} e chega a {@code kp · degrau · (1 − 1/e)} em {@code k = (θ + τ)/dt}.
   */
  public static double[] stepResponse(Model model, double stepValue, double dtS, int samples) {
    var inputs = new double[samples];
    Arrays.fill(inputs, stepValue);
    return simulate(model, inputs, dtS);
  }

  /**
   * Soma as respostas que chegam na mesma saída.
   *
   * <p>As séries precisam ter o mesmo comprimento: são o mesmo eixo de tempo visto por relações
   * diferentes.
   */
  public static double[] superpose(List<double[]> responses) {
    if (responses.isEmpty()) {
      return new double[0];
    }

    int length = responses.getFirst().length;
    for (var response : responses) {
      if (response.length != length) {
        throw new IllegalArgumentException(
            "Superposição exige séries do mesmo comprimento: %d ≠ %d"
                .formatted(length, response.length));
      }
    }

    var sum = new double[length];
    for (var response : responses) {
      for (int i = 0; i < length; i++) {
        sum[i] += response[i];
      }
    }
    return sum;
  }
}
