package dev.felipesantos.papertwin.vibration;

import dev.felipesantos.papertwin.simulation.Noise;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.List;

/**
 * O mancal: assinatura, degradação e ruído, como função do passo.
 *
 * <p>Os dados são inventados, mas não são aleatórios: eles imitam como um defeito de rolamento se
 * manifesta de verdade, porque é isso que torna a tela útil para mostrar a alguém.
 *
 * <p>Quatro decisões sustentam isso:
 *
 * <ol>
 *   <li><b>A linha de base é fixa por mancal.</b> Sai do hash da tag, então o mesmo mancal tem
 *       sempre a mesma assinatura entre reinícios do servidor.
 *   <li><b>A degradação acelera.</b> Um defeito de pista não cresce em linha reta: a trinca
 *       arranca devagar e se propaga cada vez mais rápido, daí o expoente acima de um.
 *   <li><b>O envelope avança na frente da velocidade.</b> O envelope de aceleração pega impacto de
 *       rolamento semanas antes de a velocidade RMS sair da faixa normal. É justamente por isso
 *       que se mede envelope — e uma simulação em que os dois sobem juntos ensinaria a coisa
 *       errada a quem olha o gráfico.
 *   <li><b>O valor é função do passo, não de uma sequência.</b> É o que permite a série gravada e
 *       o valor ao vivo saírem do mesmo modelo, sem costura entre os dois.
 * </ol>
 */
public final class Bearings {

  /**
   * Onde a degradação termina, em mm/s.
   *
   * <p>Acima da fronteira C→D do grupo 2 com apoio rígido, que é 4,5 — a série precisa terminar
   * dentro da zona D para a tela ter o que mostrar.
   */
  public static final double DEGRADED_PEAK_MM_S = 5.8;

  /** Expoente da propagação do defeito. Acima de 1 = acelera com o tempo. */
  private static final double RMS_PROGRESSION = 2.2;

  /** O envelope usa expoente menor, então sobe antes da velocidade. */
  private static final double ENVELOPE_PROGRESSION = 1.4;

  /** Onde o envelope termina, em gE. */
  private static final double DEGRADED_ENVELOPE_GE = 4.2;

  /** Quanto o mancal esquenta por mm/s de defeito, em °C. */
  private static final double HEAT_PER_MM_S = 4.5;

  /**
   * Correlação do ruído de vibração, em passos.
   *
   * <p>Curta: a vibração de um mancal muda rápido, e um ruído com muita memória daria uma série
   * suave demais para parecer medição de campo.
   */
  private static final double NOISE_TAU_TICKS = 4;

  /** Amostragem padrão da série: a cada 15 minutos. */
  public static final long DEFAULT_INTERVAL_MS = 15 * 60 * 1000L;

  /** Janela padrão: as últimas 72 horas, como no conceito de tela. */
  public static final long DEFAULT_WINDOW_MS = 72 * 60 * 60 * 1000L;

  /**
   * A janela em que um mancal degrada.
   *
   * <p>É <b>cenário</b>, não propriedade do mancal: alguém decide que este mancal, nesta janela,
   * vai de saudável a alarme. Fora da janela o defeito fica no valor da borda — antes do começo,
   * zero; depois do fim, o pico — o que é o que acontece de verdade enquanto o mancal não é
   * trocado.
   */
  public record DegradationScenario(String assetTag, long fromTick, long toTick) {}

  /** A assinatura de um mancal saudável. */
  public record Signature(double rmsBase, double tempBase, double envelopeBase) {}

  /** Uma leitura de mancal, sem o instante — quem chama sabe em que passo está. */
  public record Sample(double rmsMmS, double tempC, double envelopeGe) {}

  /** Uma leitura com instante, como gravada. */
  public record Reading(String assetTag, Instant ts, double rmsMmS, double tempC, double envelopeGe) {}

  /**
   * Leituras agregadas numa janela de tempo.
   *
   * <p>A média serve à tendência; o máximo é o que não pode ser perdido, porque um pico de
   * vibração de poucos segundos some numa média de dez minutos.
   */
  public record Bucket(
      Instant bucketStart,
      int samples,
      double rmsAvgMmS,
      double rmsMaxMmS,
      double tempAvgC,
      double envelopeMaxGe) {}

  /**
   * Os tamanhos de janela que a API aceita.
   *
   * <p>Os rótulos são os do {@code date_bin} do Postgres, porque foi de lá que vieram: a versão
   * TypeScript agregava no banco. Aqui a agregação é em memória — a amostra é função pura de
   * (semente, passo, tag, cenário), e 72 h a cada 15 min são 289 pontos, que custam menos de
   * gerar do que de buscar. Os rótulos ficaram para o contrato não mudar debaixo do front.
   *
   * <p>É enumeração, e não texto com um mapa de milissegundos ao lado: assim o contrato publica
   * {@code "1 minute" | ... | "1 day"} em vez de {@code string}, e a tela que escolhe a janela é
   * conferida pelo compilador.
   */
  public enum BucketSize {
    ONE_MINUTE("1 minute", 60_000L),
    FIVE_MINUTES("5 minutes", 5 * 60_000L),
    FIFTEEN_MINUTES("15 minutes", 15 * 60_000L),
    ONE_HOUR("1 hour", 60 * 60_000L),
    SIX_HOURS("6 hours", 6 * 60 * 60_000L),
    ONE_DAY("1 day", 24 * 60 * 60_000L);

    private final String label;
    private final long millis;

    BucketSize(String label, long millis) {
      this.label = label;
      this.millis = millis;
    }

    @com.fasterxml.jackson.annotation.JsonValue
    public String label() {
      return label;
    }

    public long millis() {
      return millis;
    }

    /** Pelo rótulo, ou {@code null} se não existe — quem chama decide o que dizer a quem errou. */
    public static BucketSize byLabel(String label) {
      for (var value : values()) {
        if (value.label.equals(label)) {
          return value;
        }
      }
      return null;
    }

    /** Os rótulos aceitos, para a mensagem de recusa. */
    public static String labels() {
      var out = new java.util.StringJoiner(", ");
      for (var value : values()) {
        out.add(value.label);
      }
      return out.toString();
    }
  }

  /** A janela padrão da tela: uma hora. */
  public static final BucketSize DEFAULT_BUCKET = BucketSize.ONE_HOUR;

  private Bearings() {}

  /**
   * Agrega leituras em janelas alinhadas à época.
   *
   * <p>O início de cada janela vem de {@code floor(t / tamanho)}, e não da primeira leitura: é
   * o que o {@code date_bin} faz, e é o que faz duas consultas com recortes diferentes
   * devolverem as mesmas janelas. Alinhar na primeira leitura deslocaria o gráfico a cada
   * recarga.
   */
  public static List<Bucket> bucketize(List<Reading> readings, long bucketMs) {
    if (bucketMs <= 0) {
      throw new IllegalArgumentException("O tamanho da janela precisa ser positivo: " + bucketMs);
    }

    var groups = new java.util.TreeMap<Long, List<Reading>>();
    for (var reading : readings) {
      long start = Math.floorDiv(reading.ts().toEpochMilli(), bucketMs) * bucketMs;
      groups.computeIfAbsent(start, key -> new java.util.ArrayList<>()).add(reading);
    }

    var out = new java.util.ArrayList<Bucket>(groups.size());
    groups.forEach(
        (start, group) -> {
          double rmsSum = 0;
          double tempSum = 0;
          double rmsMax = 0;
          double envelopeMax = 0;

          for (var reading : group) {
            rmsSum += reading.rmsMmS();
            tempSum += reading.tempC();
            rmsMax = Math.max(rmsMax, reading.rmsMmS());
            envelopeMax = Math.max(envelopeMax, reading.envelopeGe());
          }

          out.add(
              new Bucket(
                  Instant.ofEpochMilli(start),
                  group.size(),
                  round(rmsSum / group.size(), 3),
                  rmsMax,
                  round(tempSum / group.size(), 2),
                  envelopeMax));
        });

    return List.copyOf(out);
  }

  /**
   * A assinatura de um mancal saudável.
   *
   * <p>A linha de base fica entre 0,8 e 2,0 mm/s: dentro das zonas A e B do grupo 2 com apoio
   * rígido, ou seja, uma máquina em operação normal.
   *
   * <p>A temperatura fica entre 58 e 68 °C e o envelope entre 0,3 e 0,55 gE.
   *
   * <p><b>Os três termos operam sobre o hash sem sinal</b>, e isto já esteve errado dos dois
   * lados. Em JavaScript {@code >>} converte para inteiro de 32 bits com sinal antes de deslocar,
   * então em metade das tags o resto saía negativo e a temperatura de base caía para 48 °C. Aqui
   * o hash vira {@code long} sem sinal uma vez, e os deslocamentos e restos sobre ele são sempre
   * não negativos — que é o que torna desnecessário um {@code Math.floorMod} em cada linha.
   */
  public static Signature signatureOf(String tag) {
    long hash = Integer.toUnsignedLong(Noise.streamOf(tag));

    return new Signature(
        0.8 + (hash % 1000) / 1000.0 * 1.2,
        58 + ((hash >>> 10) % 100) / 10.0,
        0.3 + ((hash >>> 17) % 100) / 400.0);
  }

  /** Quanto do caminho da degradação já foi percorrido, de 0 a 1. */
  public static double progress(DegradationScenario scenario, long tick) {
    if (scenario.toTick() <= scenario.fromTick()) {
      return tick >= scenario.toTick() ? 1 : 0;
    }
    double span = (double) (scenario.toTick() - scenario.fromTick());
    return Math.min(1, Math.max(0, (tick - scenario.fromTick()) / span));
  }

  /**
   * Arredonda como a implementação de origem.
   *
   * <p>O JavaScript usa {@code toFixed}, que arredonda meio para cima sobre o valor <b>exato</b>
   * do double — não sobre a representação decimal curta. {@code BigDecimal} com o construtor de
   * {@code double} dá esse valor exato, e é o único jeito de as duas implementações concordarem
   * na terceira casa em todos os casos.
   */
  private static double round(double value, int scale) {
    return new BigDecimal(value).setScale(scale, RoundingMode.HALF_UP).doubleValue();
  }

  /**
   * O valor de um mancal num passo.
   *
   * <p>Função pura de (semente, passo, tag, cenário): perguntar duas vezes dá a mesma resposta, e
   * perguntar fora de ordem também. É o que permite a série gravada e o valor ao vivo não terem
   * costura.
   */
  public static Sample sampleAt(int seed, long tick, String tag, DegradationScenario scenario) {
    var signature = signatureOf(tag);
    int stream = Noise.streamOf(tag);

    double progress =
        scenario != null && scenario.assetTag().equals(tag) ? progress(scenario, tick) : 0;

    double climb = DEGRADED_PEAK_MM_S - signature.rmsBase();
    double defect = climb * Math.pow(progress, RMS_PROGRESSION);
    double envelopeDefect = DEGRADED_ENVELOPE_GE * Math.pow(progress, ENVELOPE_PROGRESSION);

    /*
     * Três canais separados: a vibração, o envelope e a temperatura de um
     * mancal não tremem juntos.
     *
     * As amplitudes são desvios padrão, e são pequenas de propósito. 0,02 mm/s
     * contra uma fronteira em 4,5 significa que o ruído NÃO decide zona: um
     * mancal que aparece em C está em C. Com ruído maior, a série cruzaria a
     * fronteira para cima e para baixo várias vezes na subida, e a tela
     * piscaria entre duas zonas sem nada ter acontecido no mancal.
     */
    int t = (int) tick;
    double rms = signature.rmsBase() + defect + 0.02 * Noise.correlated(seed, t, stream, NOISE_TAU_TICKS, 0);
    double envelope =
        signature.envelopeBase()
            + envelopeDefect
            + 0.01 * Noise.correlated(seed, t, stream, NOISE_TAU_TICKS, 1);
    double temp =
        signature.tempBase()
            + defect * HEAT_PER_MM_S
            + 0.17 * Noise.correlated(seed, t, stream, NOISE_TAU_TICKS, 2);

    return new Sample(
        Math.max(0, round(rms, 3)), round(temp, 2), Math.max(0, round(envelope, 3)));
  }
}
