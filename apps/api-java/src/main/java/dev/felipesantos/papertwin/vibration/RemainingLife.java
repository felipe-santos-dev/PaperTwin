package dev.felipesantos.papertwin.vibration;

import dev.felipesantos.papertwin.api.Nullable;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * Estimativa de vida útil restante por tendência linear.
 *
 * <p>É o método mais simples que ainda é honesto: ajusta uma reta à vibração recente por mínimos
 * quadrados e pergunta quando ela cruza a fronteira C→D da ISO 20816-3.
 *
 * <p>As limitações são reais e estão expostas no retorno, não escondidas:
 *
 * <ul>
 *   <li>A degradação de rolamento <b>acelera</b>, então a reta subestima: a data real chega antes
 *       da estimada. Isso torna o número conservador no sentido errado, e quem usa precisa saber.
 *   <li>Com tendência plana ou de queda não existe resposta, e o método devolve {@code null} em vez
 *       de um número gigante que pareceria informação.
 *   <li><b>Uma inclinação dentro do próprio ruído do ajuste também não é resposta.</b> Esta é a
 *       parte que um limiar fixo não resolve: o quanto a reta pode subir só por azar depende da
 *       dispersão das leituras e de quantas há, não de um número escrito no código. Então a
 *       inclinação é comparada com o <b>erro padrão dela mesma</b>, e só vale como degradação se
 *       passar de duas vezes esse erro. Sem isso, um mancal saudável produz de vez em quando uma
 *       previsão de "zona D em 2.030 dias", que é ruído com cara de informação.
 *   <li>{@code samples} sai junto para quem lê poder descartar um ajuste feito com três pontos.
 * </ul>
 *
 * <p>Um modelo melhor — exponencial, ou por envelope em vez de velocidade — é trabalho de outra
 * fase; o que não pode é um número sem procedência.
 */
public final class RemainingLife {

  /** Piso absoluto: abaixo disto a tendência não é degradação em escala nenhuma. */
  private static final double MIN_SLOPE_MM_S_PER_DAY = 1e-4;

  /**
   * Quantos erros padrão a inclinação precisa ter para valer.
   *
   * <p>Dois é a convenção de sempre — aproximadamente 95 % de confiança numa amostra razoável. Não
   * é rigor estatístico encenado: é o que separa "o mancal está subindo" de "a reta subiu porque
   * as leituras espalham".
   */
  private static final int MIN_SLOPE_SIGMAS = 2;

  /** Menos que isto não dá reta nenhuma. */
  private static final int MIN_SAMPLES = 3;

  private static final double MS_PER_DAY = 24 * 60 * 60 * 1000d;

  /**
   * O que a estimativa devolve.
   *
   * @param trendMmSPerDay inclinação da tendência, em mm/s por dia
   * @param daysToZoneD dias até cruzar a fronteira C→D, ou {@code null} se a tendência não leva lá
   * @param samples quantas janelas entraram no ajuste
   */
  public record Estimate(
      double trendMmSPerDay, @Nullable Double daysToZoneD, int samples) {}

  private RemainingLife() {}

  public static Estimate estimate(List<Bearings.Bucket> buckets, Iso20816.Limits limits) {
    var points = new ArrayList<double[]>(buckets.size());
    for (var bucket : buckets) {
      double t = bucket.bucketStart().toEpochMilli();
      double v = bucket.rmsAvgMmS();
      if (Double.isFinite(t) && Double.isFinite(v)) {
        points.add(new double[] {t, v});
      }
    }
    points.sort(Comparator.comparingDouble(point -> point[0]));

    int n = points.size();
    if (n < MIN_SAMPLES) {
      return new Estimate(0, null, n);
    }

    // tempo em dias a partir da primeira amostra, para o coeficiente já sair na
    // unidade que a tela mostra
    double t0 = points.get(0)[0];
    var xs = new double[n];
    var ys = new double[n];
    for (int i = 0; i < n; i++) {
      xs[i] = (points.get(i)[0] - t0) / MS_PER_DAY;
      ys[i] = points.get(i)[1];
    }

    double meanX = 0;
    double meanY = 0;
    for (int i = 0; i < n; i++) {
      meanX += xs[i];
      meanY += ys[i];
    }
    meanX /= n;
    meanY /= n;

    double covariance = 0;
    double variance = 0;
    for (int i = 0; i < n; i++) {
      double dx = xs[i] - meanX;
      covariance += dx * (ys[i] - meanY);
      variance += dx * dx;
    }

    if (variance == 0) {
      return new Estimate(0, null, n);
    }

    double slope = covariance / variance;
    double intercept = meanY - slope * meanX;

    if (slope <= MIN_SLOPE_MM_S_PER_DAY) {
      return new Estimate(slope, null, n);
    }

    /*
     * O erro padrão da inclinação, da regressão simples.
     *
     * `residual² / (n − 2)` é a variância das leituras em torno da reta, e
     * dividida pela dispersão do eixo do tempo dá quanto a inclinação pode
     * variar só por acaso. Com 3 pontos o denominador é 1 e o erro fica grande,
     * o que é o comportamento certo: três pontos não sustentam previsão.
     */
    double residualSquares = 0;
    for (int i = 0; i < n; i++) {
      double fitted = intercept + slope * xs[i];
      residualSquares += Math.pow(ys[i] - fitted, 2);
    }
    double slopeStdErr = Math.sqrt(residualSquares / Math.max(1, n - 2) / variance);

    if (slope <= MIN_SLOPE_SIGMAS * slopeStdErr) {
      return new Estimate(slope, null, n);
    }

    // parte do valor ajustado no instante mais recente, e não da última leitura
    // crua: um pico isolado não deve encurtar a previsão sozinho
    double fittedNow = intercept + slope * xs[n - 1];
    double remaining = (limits.cToD() - fittedNow) / slope;

    return new Estimate(slope, remaining <= 0 ? 0 : remaining, n);
  }
}
