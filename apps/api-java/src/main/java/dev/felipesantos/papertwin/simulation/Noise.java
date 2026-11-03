package dev.felipesantos.papertwin.simulation;

/**
 * Ruído determinístico por posição, e não por sequência.
 *
 * <p>Esta é a decisão que faz a simulação inteira funcionar num host que dorme.
 *
 * <p>Um gerador pseudoaleatório comum guarda estado e avança a cada chamada: o n-ésimo número
 * depende de <b>quantas vezes</b> ele foi chamado antes. Mas aqui a API dorme, acorda e precisa
 * recalcular o intervalo que faltou — e se o ruído dependesse da contagem de chamadas, uma
 * retomada que executasse um número diferente de passos produziria outra série. "Recalcular"
 * deixaria de dar o mesmo resultado que "rodar contínuo", que é justamente a propriedade que o
 * projeto precisa ter.
 *
 * <p>Então o ruído aqui é uma <b>função pura de (semente, passo, canal)</b>. Não há estado, não há
 * ordem de chamada: o valor do passo 12.345 é o mesmo tenha a simulação começado no passo 0 ou no
 * 12.344. Perguntar duas vezes dá a mesma resposta, e perguntar fora de ordem também.
 *
 * <h2>Aritmética de 32 bits</h2>
 *
 * <p>Tudo aqui é {@code int}, e de propósito: a implementação de origem é JavaScript, onde
 * {@code Math.imul} e {@code >>>} dão exatamente a aritmética de 32 bits com estouro que o
 * {@code int} do Java tem. Trocar por {@code long} em qualquer ponto mudaria os bits e, com eles,
 * toda série de ruído do simulador — e o gabarito em {@code reference/golden/} deixaria de bater.
 */
public final class Noise {

  /**
   * Misturador de 32 bits (splitmix32).
   *
   * <p>Avalanche boa o bastante para um bit de entrada mudar metade dos bits de saída, que é o que
   * se precisa aqui: passos vizinhos não podem dar valores vizinhos.
   */
  private static int mix32(int input) {
    int z = input + 0x9e3779b9;
    z ^= z >>> 16;
    z *= 0x21f0aaad;
    z ^= z >>> 15;
    z *= 0x735a2d97;
    z ^= z >>> 15;
    return z;
  }

  /**
   * O hash de uma posição: semente, passo, canal e sub-canal.
   *
   * <p>{@code stream} separa as tags — duas variáveis não podem ter o mesmo ruído — e {@code
   * channel} separa usos dentro de uma tag, como as três uniformes que formam uma normal.
   */
  private static int hashPosition(int seed, int tick, int stream, int channel) {
    int h = 0x811c9dc5 ^ seed;
    h = mix32(h ^ (tick * 0x27d4eb2f));
    h = mix32(h ^ (stream * 0x165667b1));
    h = mix32(h ^ (channel * 0x9e3779b1));
    return h;
  }

  private Noise() {}

  /** Uniforme em [0, 1). */
  public static double unit(int seed, int tick, int stream, int channel) {
    return Integer.toUnsignedLong(hashPosition(seed, tick, stream, channel)) / 4_294_967_296.0;
  }

  /**
   * Normal aproximada, média 0 e desvio 1.
   *
   * <p>Soma de três uniformes, que é a aproximação barata de sempre. Uma uniforme em [0, 1) tem
   * variância 1/12, três somadas têm 1/4, e portanto desvio 1/2 — daí o fator 2. Sem ele, "desvio
   * 1" seria mentira e todo ruído do simulador viria pela metade do que o código pede.
   *
   * <p>O corte em ±3 desvios é consequência da aproximação, não escolha: três uniformes não
   * produzem cauda além disso. Para ruído de instrumento isso é irrelevante — e é bom, porque a
   * simulação não inventa um pico de 6σ que dispararia um alarme sem motivo.
   */
  public static double gaussian(int seed, int tick, int stream, int channel) {
    int base = channel * 3;
    double sum =
        unit(seed, tick, stream, base)
            + unit(seed, tick, stream, base + 1)
            + unit(seed, tick, stream, base + 2);

    return (sum - 1.5) * 2;
  }

  /**
   * Teto de passos que o ruído correlacionado olha para trás.
   *
   * <p>Com peso {@code exp(−k/τ)}, em 3τ o peso já caiu a ~5 %. O teto existe porque o custo é
   * linear nos tap e este ruído é avaliado por tag a cada passo.
   */
  private static final int MAX_TAPS = 32;

  /**
   * Ruído correlacionado no tempo, com constante {@code tauTicks}.
   *
   * <p>Ruído branco em cima de uma variável de processo fica com cara de erro de instrumento:
   * tremido, sem memória. O ruído de um processo de verdade é correlacionado — a turbulência de um
   * instante parece com a do anterior.
   *
   * <p>O jeito usual de obter isso é um filtro de primeira ordem sobre ruído branco (um AR(1)), e
   * aqui ele <b>não serve</b>: o filtro tem estado, e o estado depende de onde a simulação começou.
   * Uma retomada depois de dormir teria estado diferente e série diferente.
   *
   * <p>Então a correlação é feita por soma ponderada dos últimos passos — um FIR de resposta
   * exponencial. É equivalente a um AR(1) truncado, custa algumas multiplicações por tag por
   * passo, e continua sendo <b>função pura da posição</b>.
   *
   * <p>A soma é normalizada pela raiz da soma dos quadrados dos pesos, para o desvio continuar 1 —
   * somar oito normais independentes sem normalizar daria desvio 2,8.
   */
  public static double correlated(int seed, int tick, int stream, double tauTicks, int channel) {
    if (!(tauTicks > 0)) {
      return gaussian(seed, tick, stream, channel);
    }

    int taps = Math.min(MAX_TAPS, Math.max(1, (int) Math.ceil(3 * tauTicks)));

    double sum = 0;
    double energy = 0;

    for (int k = 0; k < taps; k++) {
      double weight = Math.exp(-k / tauTicks);
      sum += weight * gaussian(seed, tick - k, stream, channel);
      energy += weight * weight;
    }

    return sum / Math.sqrt(energy);
  }

  /**
   * O canal de ruído de uma tag.
   *
   * <p>FNV-1a sobre a tag: estável entre execuções, entre versões e entre máquinas, que é o
   * requisito — o instantâneo do modo de demonstração é gerado numa máquina e servido de outra.
   *
   * <p>Duas tags podem, em princípio, cair no mesmo canal; com algumas centenas de tags em 2^32
   * canais isso é improvável, e o efeito seria duas variáveis compartilharem ruído, não a
   * simulação quebrar.
   */
  public static int streamOf(String tag) {
    int hash = 0x811c9dc5;
    for (int i = 0; i < tag.length(); i++) {
      hash ^= tag.charAt(i);
      hash *= 16777619;
    }
    return hash;
  }
}
