package dev.felipesantos.papertwin.simulation;

/**
 * As malhas de controle, com o ajuste tirado da própria relação medida.
 *
 * <h2>Por que o ajuste não é inventado</h2>
 *
 * <p>Um simulador com ganho e tempo integral escolhidos a olho responde bem ou mal por acaso, e
 * quem olha não aprende nada. Aqui o ajuste sai de uma regra publicada — SIMC, de Skogestad —
 * aplicada aos coeficientes que a pesquisa B mediu:
 *
 * <blockquote>
 *
 * {@code Kc = τ / (K · (λ + θ))} e {@code Ti = min(τ, 4 · (λ + θ))}
 *
 * </blockquote>
 *
 * <p>com {@code λ = θ}, que é a escolha padrão do método e dá o compromisso usual entre rapidez e
 * robustez. Com isso, {@code Kc = τ / (2 · K · θ)} e {@code Ti = min(τ, 8 · θ)}.
 *
 * <p>O resultado é que as malhas lentas ficam lentas porque <b>o processo é lento</b>: a gramatura
 * tem 75 s de tempo morto e responde em minutos, a espessura tem 6 s e responde em segundos.
 * Nenhum dos dois números foi escolhido para a tela ficar bonita.
 *
 * <h2>O sinal se resolve sozinho</h2>
 *
 * <p>Metade das relações tem ganho negativo — mais vapor, menos umidade. Como {@code K} entra na
 * fórmula com o seu sinal, {@code Kc} sai negativo nessas, e o controlador baixa a saída para
 * subir a medida sem nenhum {@code if}. Um campo direta/inversa à parte seria um segundo lugar
 * para errar.
 */
public final class Pi {

  /** O ajuste de uma malha PI. */
  public record Tuning(double kc, double tiS) {}

  private Pi() {}

  /**
   * O ajuste SIMC de uma malha, a partir do modelo do processo.
   *
   * <p>{@code lambdaS} é a constante de tempo desejada em malha fechada. O padrão é o tempo morto,
   * que é a recomendação do método; valores maiores dão malha mais lenta e mais robusta.
   */
  public static Tuning simcTuning(Fopdt.Model model, Double lambdaS) {
    if (model.kp() == 0) {
      throw new IllegalArgumentException(
          "Uma malha com ganho de processo zero não tem ajuste: a MV não move a PV.");
    }
    if (!(model.tauS() > 0)) {
      throw new IllegalArgumentException("τ precisa ser maior que zero: " + model.tauS());
    }

    // com tempo morto zero, λ = θ daria divisão por zero; metade de τ é o
    // fallback conservador do próprio método
    double lambda =
        lambdaS != null ? lambdaS : (model.deadTimeS() > 0 ? model.deadTimeS() : model.tauS() / 2);
    double sum = lambda + model.deadTimeS();

    return new Tuning(model.tauS() / (model.kp() * sum), Math.min(model.tauS(), 4 * sum));
  }

  /** O ajuste SIMC com o λ padrão. */
  public static Tuning simcTuning(Fopdt.Model model) {
    return simcTuning(model, null);
  }

  /**
   * Um controlador PI com trava do integral na saturação.
   *
   * <p>A trava é o detalhe que separa um PI que funciona de um que parece funcionar. Sem ela, uma
   * malha que bate no limite da válvula continua acumulando erro no integral; quando o processo
   * volta, o integral está enorme e a malha demora minutos para sair da saturação, com a medida
   * passando longe do setpoint no caminho. É o "windup", e numa máquina de papel ele aparece
   * exatamente depois de uma quebra de folha — que é um dos cenários que este simulador roda.
   *
   * <p>A trava usada é a condicional: o integral só acumula quando a saída sem limite está dentro
   * da faixa, <b>ou</b> quando o novo erro empurra de volta para dentro dela. A segunda metade
   * importa: sem ela, uma malha saturada ficaria com o integral congelado e perderia a ação
   * integral justamente na volta.
   */
  public static final class Controller {

    private final double kc;
    private final double tiS;
    private final double bias;
    private final double min;
    private final double max;

    private double integral;
    private double output;

    public Controller(Tuning tuning, double bias, double min, double max, double integral) {
      if (!(tuning.tiS() > 0)) {
        throw new IllegalArgumentException("Ti precisa ser maior que zero: " + tuning.tiS());
      }
      if (min >= max) {
        throw new IllegalArgumentException(
            "Faixa da MV inválida: %s a %s. O mínimo precisa ser menor que o máximo."
                .formatted(min, max));
      }

      this.kc = tuning.kc();
      this.tiS = tuning.tiS();
      this.bias = bias;
      this.min = min;
      this.max = max;
      this.integral = integral;
      this.output = clamp(bias);
    }

    private double clamp(double value) {
      return Math.min(Math.max(value, min), max);
    }

    /**
     * Avança um passo e devolve a nova saída, já dentro da faixa.
     *
     * <p>O controlador é de passo fixo e <b>sem estado escondido além do integral</b>: dois
     * controladores com o mesmo integral e o mesmo erro dão a mesma saída.
     */
    public double step(double setpoint, double measured, double dtS) {
      if (!(dtS > 0)) {
        throw new IllegalArgumentException("dt precisa ser maior que zero: " + dtS);
      }

      double error = setpoint - measured;
      double candidate = integral + error * dtS;
      double unclamped = bias + kc * (error + candidate / tiS);

      boolean saturatedHigh = unclamped > max;
      boolean saturatedLow = unclamped < min;
      // kc · error é a direção em que este erro empurra a saída
      boolean pushesBack = (saturatedHigh && kc * error < 0) || (saturatedLow && kc * error > 0);

      if ((!saturatedHigh && !saturatedLow) || pushesBack) {
        integral = candidate;
      }

      output = clamp(bias + kc * (error + integral / tiS));
      return output;
    }

    public double output() {
      return output;
    }

    /** O termo integral acumulado, em unidades de PV · s. É o estado da malha. */
    public double integral() {
      return integral;
    }
  }

  /** Pressão atmosférica ao nível do mar, em kPa. */
  public static final double ATMOSPHERIC_KPA = 101.325;

  /**
   * A temperatura de saturação do vapor, em °C, a partir da pressão <b>relativa</b> em kPa.
   *
   * <p>Aproximação: {@code T = 100 · (p_abs / 101,325)^0,25}. Vale a pena dizer o erro, e não só a
   * fórmula — a 15 kPa rel ela dá 103,5 °C contra 103,3 reais, e a 230 kPa rel dá 134,5 contra
   * ~136,5, ou seja, até ~1,5 % na faixa que a secagem usa. Para mover a temperatura de superfície
   * de um cilindro num gêmeo digital isso é mais do que suficiente, e uma tabela de vapor seria um
   * arquivo de dados inteiro para ganhar dois graus.
   *
   * <p>As tags de vapor do catálogo estão em kPa <b>relativos</b>, inclusive com valores negativos
   * no G1 (que opera em vácuo parcial, de −30 a 60 kPa rel) — daí somar a pressão atmosférica
   * antes de qualquer conta.
   */
  public static double saturationTemperatureC(double gaugeKpa) {
    double absolute = Math.max(1, gaugeKpa + ATMOSPHERIC_KPA);
    return 100 * Math.pow(absolute / ATMOSPHERIC_KPA, 0.25);
  }

  /**
   * Quanto a superfície do cilindro fica abaixo da saturação, em °C.
   *
   * <p><b>Suposição.</b> A queda real depende da espessura do ferro, do filme de condensado e da
   * sujeira. 8 °C é o que põe a superfície do grupo principal (230 kPa rel → 134,5 °C de
   * saturação) em ~126 °C, que é o alvo de 125 que o catálogo dá para {@code TI-52nn}. Ou seja: o
   * número foi escolhido para a fórmula concordar com o catálogo, e não o contrário.
   */
  public static final double SHELL_TEMPERATURE_DROP_C = 8;

  /** Temperatura de superfície de um cilindro, pela pressão do seu grupo. */
  public static double cylinderSurfaceTempC(double gaugeKpa) {
    return saturationTemperatureC(gaugeKpa) - SHELL_TEMPERATURE_DROP_C;
  }
}
