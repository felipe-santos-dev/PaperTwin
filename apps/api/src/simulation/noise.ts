/**
 * Ruído determinístico por posição, e não por sequência.
 *
 * Esta é a decisão que faz a simulação inteira funcionar num host que dorme.
 *
 * Um gerador pseudoaleatório comum guarda estado e avança a cada chamada: o
 * n-ésimo número depende de **quantas vezes** ele foi chamado antes. Isso basta
 * para gerar uma série de uma vez, e foi o que a Fase 3 usou na vibração. Mas
 * aqui a API dorme, acorda e precisa recalcular o intervalo que faltou — e se o
 * ruído dependesse da contagem de chamadas, uma retomada que executasse um
 * número diferente de passos produziria outra série. "Recalcular" deixaria de
 * dar o mesmo resultado que "rodar contínuo", que é justamente a propriedade
 * que o projeto precisa ter.
 *
 * Então o ruído aqui é uma **função pura de (semente, passo, canal)**. Não há
 * estado, não há ordem de chamada: o valor do passo 12.345 é o mesmo tenha a
 * simulação começado no passo 0 ou no 12.344. Perguntar duas vezes dá a mesma
 * resposta, e perguntar fora de ordem também.
 */

/**
 * Misturador de 32 bits (splitmix32).
 *
 * Avalanche boa o bastante para um bit de entrada mudar metade dos bits de
 * saída, que é o que se precisa aqui: passos vizinhos não podem dar valores
 * vizinhos.
 */
function mix32(input: number): number {
  let z = (input + 0x9e3779b9) | 0;
  z ^= z >>> 16;
  z = Math.imul(z, 0x21f0aaad);
  z ^= z >>> 15;
  z = Math.imul(z, 0x735a2d97);
  z ^= z >>> 15;
  return z >>> 0;
}

/**
 * O hash de uma posição: semente, passo, canal e sub-canal.
 *
 * `stream` separa as tags — duas variáveis não podem ter o mesmo ruído — e
 * `channel` separa usos dentro de uma tag, como as três uniformes que formam
 * uma normal.
 */
function hashPosition(seed: number, tick: number, stream: number, channel: number): number {
  let h = 2166136261 ^ (seed | 0);
  h = mix32(h ^ Math.imul(tick | 0, 0x27d4eb2f));
  h = mix32(h ^ Math.imul(stream | 0, 0x165667b1));
  h = mix32(h ^ Math.imul(channel | 0, 0x9e3779b1));
  return h;
}

/** Uniforme em [0, 1). */
export function unitNoise(seed: number, tick: number, stream: number, channel = 0): number {
  return hashPosition(seed, tick, stream, channel) / 4_294_967_296;
}

/**
 * Normal aproximada, média 0 e desvio 1.
 *
 * Soma de três uniformes, que é a aproximação barata de sempre. Uma uniforme em
 * [0, 1) tem variância 1/12, três somadas têm 1/4, e portanto desvio 1/2 — daí
 * o fator 2. Sem ele, "desvio 1" seria mentira e todo ruído do simulador viria
 * pela metade do que o código pede.
 *
 * O corte em ±3 desvios é consequência da aproximação, não escolha: três
 * uniformes não produzem cauda além disso. Para ruído de instrumento isso é
 * irrelevante — e é bom, porque a simulação não inventa um pico de 6σ que
 * dispararia um alarme sem motivo.
 */
export function gaussianNoise(seed: number, tick: number, stream: number, channel = 0): number {
  const base = channel * 3;
  const sum =
    unitNoise(seed, tick, stream, base) +
    unitNoise(seed, tick, stream, base + 1) +
    unitNoise(seed, tick, stream, base + 2);

  return (sum - 1.5) * 2;
}

/**
 * Teto de passos que o ruído correlacionado olha para trás.
 *
 * Com peso `exp(−k/τ)`, em 3τ o peso já caiu a ~5 %. O teto existe porque o
 * custo é linear nos tap e este ruído é avaliado por tag a cada passo.
 */
const MAX_TAPS = 32;

/**
 * Ruído correlacionado no tempo, com constante `tauTicks`.
 *
 * Ruído branco em cima de uma variável de processo fica com cara de erro de
 * instrumento: tremido, sem memória. O ruído de um processo de verdade é
 * correlacionado — a turbulência de um instante parece com a do anterior.
 *
 * O jeito usual de obter isso é um filtro de primeira ordem sobre ruído branco
 * (um AR(1)), e aqui ele **não serve**: o filtro tem estado, e o estado depende
 * de onde a simulação começou. Uma retomada depois de dormir teria estado
 * diferente e série diferente.
 *
 * Então a correlação é feita por soma ponderada dos últimos passos — um FIR de
 * resposta exponencial. É equivalente a um AR(1) truncado, custa alguns
 * multiplicações por tag por passo, e continua sendo **função pura da
 * posição**: o valor do passo 12.345 não sabe onde a simulação começou.
 *
 * A soma é normalizada pela raiz da soma dos quadrados dos pesos, para o desvio
 * continuar 1 — somar oito normais independentes sem normalizar daria desvio
 * 2,8, e o ruído sairia três vezes maior do que o pedido.
 */
export function correlatedNoise(
  seed: number,
  tick: number,
  stream: number,
  tauTicks: number,
  channel = 0,
): number {
  if (!(tauTicks > 0)) return gaussianNoise(seed, tick, stream, channel);

  const taps = Math.min(MAX_TAPS, Math.max(1, Math.ceil(3 * tauTicks)));

  let sum = 0;
  let energy = 0;

  for (let k = 0; k < taps; k += 1) {
    const weight = Math.exp(-k / tauTicks);
    sum += weight * gaussianNoise(seed, tick - k, stream, channel);
    energy += weight * weight;
  }

  return sum / Math.sqrt(energy);
}

/**
 * O canal de ruído de uma tag.
 *
 * FNV-1a sobre a tag: estável entre execuções, entre versões do Node e entre
 * máquinas, que é o requisito — o instantâneo do modo de demonstração é gerado
 * numa máquina e servido de outra.
 *
 * Duas tags podem, em princípio, cair no mesmo canal; com algumas centenas de
 * tags em 2^32 canais isso é improvável, e o efeito seria duas variáveis
 * compartilharem ruído, não a simulação quebrar.
 */
export function streamOf(tag: string): number {
  let hash = 2166136261;
  for (let i = 0; i < tag.length; i += 1) {
    hash ^= tag.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
