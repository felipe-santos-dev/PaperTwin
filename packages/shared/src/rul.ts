import type { IsoLimits } from './iso20816';
import type { RemainingLife, VibrationBucket } from './vibration';

/**
 * Estimativa de vida útil restante por tendência linear.
 *
 * É o método mais simples que ainda é honesto: ajusta uma reta à vibração
 * recente por mínimos quadrados e pergunta quando ela cruza a fronteira C→D da
 * ISO 20816-3.
 *
 * As limitações são reais e estão expostas no retorno, não escondidas:
 *
 * - A degradação de rolamento **acelera**, então a reta subestima: a data real
 *   chega antes da estimada. Isso torna o número conservador no sentido errado,
 *   e quem usa precisa saber.
 * - Com tendência plana ou de queda não existe resposta, e a função devolve
 *   `null` em vez de um número gigante que pareceria informação.
 * - **Uma inclinação dentro do próprio ruído do ajuste também não é resposta.**
 *   Esta é a parte que um limiar fixo não resolve: o quanto a reta pode subir
 *   só por azar depende da dispersão das leituras e de quantas há, não de um
 *   número escrito no código. Então a inclinação é comparada com o **erro
 *   padrão dela mesma**, e só vale como degradação se passar de duas vezes
 *   esse erro. Sem isso, um mancal saudável produz de vez em quando uma
 *   previsão de "zona D em 2.030 dias", que é ruído com cara de informação —
 *   exatamente o que este módulo não pode fazer.
 * - `samples` sai junto para quem lê poder descartar um ajuste feito com três
 *   pontos.
 *
 * Um modelo melhor — exponencial, ou por envelope em vez de velocidade — é
 * trabalho de outra fase; o que não pode é um número sem procedência.
 */

/** Piso absoluto: abaixo disto a tendência não é degradação em escala nenhuma. */
const MIN_SLOPE_MM_S_PER_DAY = 1e-4;

/**
 * Quantos erros padrão a inclinação precisa ter para valer.
 *
 * Dois é a convenção de sempre — aproximadamente 95 % de confiança numa amostra
 * razoável. Não é rigor estatístico encenado: é o que separa "o mancal está
 * subindo" de "a reta subiu porque as leituras espalham".
 */
const MIN_SLOPE_SIGMAS = 2;

/** Menos que isto não dá reta nenhuma. */
const MIN_SAMPLES = 3;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function estimateRemainingLife(
  buckets: readonly VibrationBucket[],
  limits: IsoLimits,
): RemainingLife {
  const points = buckets
    .map((bucket) => ({ t: Date.parse(bucket.bucketStart), v: bucket.rmsAvgMmS }))
    .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.v))
    .sort((a, b) => a.t - b.t);

  if (points.length < MIN_SAMPLES) {
    return { trendMmSPerDay: 0, daysToZoneD: null, samples: points.length };
  }

  // tempo em dias a partir da primeira amostra, para o coeficiente já sair na
  // unidade que a tela mostra
  const t0 = points[0]?.t ?? 0;
  const xs = points.map((point) => (point.t - t0) / MS_PER_DAY);
  const ys = points.map((point) => point.v);

  const n = points.length;
  const meanX = xs.reduce((sum, x) => sum + x, 0) / n;
  const meanY = ys.reduce((sum, y) => sum + y, 0) / n;

  let covariance = 0;
  let variance = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = (xs[i] ?? 0) - meanX;
    covariance += dx * ((ys[i] ?? 0) - meanY);
    variance += dx * dx;
  }

  if (variance === 0) {
    return { trendMmSPerDay: 0, daysToZoneD: null, samples: n };
  }

  const slope = covariance / variance;
  const intercept = meanY - slope * meanX;

  if (slope <= MIN_SLOPE_MM_S_PER_DAY) {
    return { trendMmSPerDay: slope, daysToZoneD: null, samples: n };
  }

  /**
   * O erro padrão da inclinação, da regressão simples.
   *
   * `residual² / (n − 2)` é a variância das leituras em torno da reta, e
   * dividida pela dispersão do eixo do tempo dá quanto a inclinação pode variar
   * só por acaso. Com 3 pontos o denominador é 1 e o erro fica grande, o que é
   * o comportamento certo: três pontos não sustentam previsão.
   */
  let residualSquares = 0;
  for (let i = 0; i < n; i += 1) {
    const fitted = intercept + slope * (xs[i] ?? 0);
    residualSquares += ((ys[i] ?? 0) - fitted) ** 2;
  }
  const slopeStdErr = Math.sqrt(residualSquares / Math.max(1, n - 2) / variance);

  if (slope <= MIN_SLOPE_SIGMAS * slopeStdErr) {
    return { trendMmSPerDay: slope, daysToZoneD: null, samples: n };
  }

  // parte do valor ajustado no instante mais recente, e não da última leitura
  // crua: um pico isolado não deve encurtar a previsão sozinho
  const lastX = xs[n - 1] ?? 0;
  const fittedNow = intercept + slope * lastX;
  const remaining = (limits.cToD - fittedNow) / slope;

  return {
    trendMmSPerDay: slope,
    daysToZoneD: remaining <= 0 ? 0 : remaining,
    samples: n,
  };
}
