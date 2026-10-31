import type { AssetTag, MachineAsset, VibrationReading } from '@mp1/shared';

import { DEFAULT_SEED, TICK_MS, tickAt, tickTime } from './clock';
import { correlatedNoise, streamOf } from './noise';

/**
 * O mancal: assinatura, degradação e ruído, como função do passo.
 *
 * Os dados são inventados, mas não são aleatórios: eles imitam como um defeito
 * de rolamento se manifesta de verdade, porque é isso que torna a tela útil
 * para mostrar a alguém.
 *
 * Quatro decisões sustentam isso:
 *
 * 1. **A linha de base é fixa por mancal.** Sai do hash da tag, então o mesmo
 *    mancal tem sempre a mesma assinatura entre reinícios do servidor.
 * 2. **A degradação acelera.** Um defeito de pista não cresce em linha reta: a
 *    trinca arranca devagar e se propaga cada vez mais rápido, daí o expoente
 *    acima de um.
 * 3. **O envelope avança na frente da velocidade.** O envelope de aceleração
 *    pega impacto de rolamento semanas antes de a velocidade RMS sair da faixa
 *    normal. É justamente por isso que se mede envelope — e uma simulação em
 *    que os dois sobem juntos ensinaria a coisa errada a quem olha o gráfico.
 * 4. **O valor é função do passo, não de uma sequência.** É o que permite a
 *    série gravada e o valor ao vivo saírem do mesmo modelo, sem costura entre
 *    os dois.
 */

/** Tudo que o simulador precisa saber de um mancal. */
export interface SimulatedBearing {
  readonly tag: AssetTag;
}

/**
 * Onde a degradação termina, em mm/s.
 *
 * Acima da fronteira C→D do grupo 2 com apoio rígido, que é 4,5 — a série
 * precisa terminar dentro da zona D para a tela ter o que mostrar.
 */
export const DEGRADED_PEAK_MM_S = 5.8;

/** Expoente da propagação do defeito. Acima de 1 = acelera com o tempo. */
const RMS_PROGRESSION = 2.2;

/** O envelope usa expoente menor, então sobe antes da velocidade. */
const ENVELOPE_PROGRESSION = 1.4;

/** Onde o envelope termina, em gE. */
const DEGRADED_ENVELOPE_GE = 4.2;

/** Quanto o mancal esquenta por mm/s de defeito, em °C. */
const HEAT_PER_MM_S = 4.5;

/**
 * Correlação do ruído de vibração, em passos.
 *
 * Curta: a vibração de um mancal muda rápido, e um ruído com muita memória
 * daria uma série suave demais para parecer medição de campo.
 */
const NOISE_TAU_TICKS = 4;

/**
 * A janela em que um mancal degrada.
 *
 * É **cenário**, não propriedade do mancal: alguém decide que este mancal, nesta
 * janela, vai de saudável a alarme. Fora da janela o defeito fica no valor da
 * borda — antes do começo, zero; depois do fim, o pico — o que é o que acontece
 * de verdade enquanto o mancal não é trocado.
 */
export interface DegradationScenario {
  readonly assetTag: AssetTag;
  readonly fromTick: number;
  readonly toTick: number;
}

/** Hash estável de uma tag, para a assinatura do mancal não variar. */
function hashTag(tag: string): number {
  return streamOf(tag);
}

interface Signature {
  readonly rmsBase: number;
  readonly tempBase: number;
  readonly envelopeBase: number;
}

/**
 * A assinatura de um mancal saudável.
 *
 * A linha de base fica entre 0,8 e 2,0 mm/s: dentro das zonas A e B do grupo 2
 * com apoio rígido, ou seja, uma máquina em operação normal.
 */
export function signatureOf(tag: AssetTag): Signature {
  const hash = hashTag(tag);
  return {
    rmsBase: 0.8 + ((hash % 1000) / 1000) * 1.2,
    tempBase: 58 + ((hash >> 10) % 100) / 10,
    envelopeBase: 0.3 + ((hash >> 17) % 100) / 400,
  };
}

/** Quanto do caminho da degradação já foi percorrido, de 0 a 1. */
export function degradationProgress(scenario: DegradationScenario, tick: number): number {
  if (scenario.toTick <= scenario.fromTick) return tick >= scenario.toTick ? 1 : 0;
  return Math.min(
    1,
    Math.max(0, (tick - scenario.fromTick) / (scenario.toTick - scenario.fromTick)),
  );
}

/** Uma leitura de mancal, sem o instante — quem chama sabe em que passo está. */
export interface BearingSample {
  readonly rmsMmS: number;
  readonly tempC: number;
  readonly envelopeGe: number;
}

/**
 * O valor de um mancal num passo.
 *
 * Função pura de (semente, passo, tag, cenário): perguntar duas vezes dá a
 * mesma resposta, e perguntar fora de ordem também. É o que permite a série
 * gravada e o valor ao vivo não terem costura.
 */
export function bearingSampleAt(
  seed: number,
  tick: number,
  tag: AssetTag,
  scenario: DegradationScenario | null,
): BearingSample {
  const signature = signatureOf(tag);
  const stream = hashTag(tag);

  const progress = scenario && scenario.assetTag === tag ? degradationProgress(scenario, tick) : 0;

  const climb = DEGRADED_PEAK_MM_S - signature.rmsBase;
  const defect = climb * progress ** RMS_PROGRESSION;
  const envelopeDefect = DEGRADED_ENVELOPE_GE * progress ** ENVELOPE_PROGRESSION;

  /**
   * Três canais separados: a vibração, o envelope e a temperatura de um mancal
   * não tremem juntos.
   *
   * As amplitudes são desvios padrão, e são pequenas de propósito. 0,02 mm/s
   * contra uma fronteira em 4,5 significa que o ruído **não decide zona**: um
   * mancal que aparece em C está em C. Com ruído maior, a série cruzaria a
   * fronteira para cima e para baixo várias vezes na subida, e a tela piscaria
   * entre duas zonas sem nada ter acontecido no mancal — o que um teste cobra.
   */
  const rms =
    signature.rmsBase + defect + 0.02 * correlatedNoise(seed, tick, stream, NOISE_TAU_TICKS, 0);
  const envelope =
    signature.envelopeBase +
    envelopeDefect +
    0.01 * correlatedNoise(seed, tick, stream, NOISE_TAU_TICKS, 1);
  const temp =
    signature.tempBase +
    defect * HEAT_PER_MM_S +
    0.17 * correlatedNoise(seed, tick, stream, NOISE_TAU_TICKS, 2);

  return {
    rmsMmS: Math.max(0, Number(rms.toFixed(3))),
    tempC: Number(temp.toFixed(2)),
    envelopeGe: Math.max(0, Number(envelope.toFixed(3))),
  };
}

// ----------------------------------------------- a série gravada da Fase 3

export interface SimulationOptions {
  readonly bearings: readonly SimulatedBearing[];
  readonly from: Date;
  readonly to: Date;
  /** Intervalo entre amostras. */
  readonly intervalMs: number;
  /** Mancal que degrada ao longo da janela, até cruzar a zona D. */
  readonly degradingTag: AssetTag;
  readonly seed?: number;
}

/** Amostragem padrão da série: a cada 15 minutos. */
export const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;

/** Janela padrão: as últimas 72 horas, como no conceito de tela. */
export const DEFAULT_WINDOW_MS = 72 * 60 * 60 * 1000;

/**
 * A série histórica de todos os mancais na janela pedida.
 *
 * O mancal em degradação vai de saudável a zona D **ao longo da janela**: o
 * cenário é montado a partir dela, do primeiro ao último passo. É o que faz a
 * tela ter sempre o que mostrar, e é escolha de apresentação — está dito aqui
 * para não passar por propriedade do mancal.
 *
 * A amostragem é de 15 min, e não de 1 s como o passo da simulação: 72 h a 1 s
 * seriam 259.200 linhas por mancal. A série histórica é para o gráfico de
 * tendência, onde 15 min é mais resolução do que o gráfico tem pixels.
 */
export function simulateVibration(options: SimulationOptions): VibrationReading[] {
  const from = options.from.getTime();
  const to = options.to.getTime();
  if (!(to > from))
    throw new RangeError('A janela da simulação precisa terminar depois de começar');
  if (options.intervalMs <= 0) throw new RangeError('O intervalo precisa ser positivo');

  const seed = options.seed ?? DEFAULT_SEED;
  const scenario: DegradationScenario = {
    assetTag: options.degradingTag,
    fromTick: tickAt(options.from),
    toTick: tickAt(options.to),
  };

  const readings: VibrationReading[] = [];

  for (const bearing of options.bearings) {
    for (let ts = from; ts <= to; ts += options.intervalMs) {
      // a amostra cai no passo que contém o instante, para a série gravada e o
      // valor ao vivo coincidirem onde se encontram
      const tick = tickAt(new Date(ts));
      const sample = bearingSampleAt(seed, tick, bearing.tag, scenario);

      readings.push({
        assetTag: bearing.tag,
        ts: new Date(ts).toISOString(),
        rmsMmS: sample.rmsMmS,
        tempC: sample.tempC,
        envelopeGe: sample.envelopeGe,
      });
    }
  }

  return readings;
}

/** Os mancais da máquina, que são os ativos com classe ISO declarada. */
export function bearingsOf(assets: readonly MachineAsset[]): SimulatedBearing[] {
  return assets.filter((asset) => asset.kind === 'bearing').map(({ tag }) => ({ tag }));
}

/** O instante de um passo, para quem monta a leitura a partir do modelo. */
export function readingAt(
  seed: number,
  tick: number,
  tag: AssetTag,
  scenario: DegradationScenario | null,
): VibrationReading {
  const sample = bearingSampleAt(seed, tick, tag, scenario);

  return {
    assetTag: tag,
    ts: tickTime(tick).toISOString(),
    rmsMmS: sample.rmsMmS,
    tempC: sample.tempC,
    envelopeGe: sample.envelopeGe,
  };
}

/** Passos por intervalo de amostragem da série histórica. */
export const TICKS_PER_SAMPLE = DEFAULT_INTERVAL_MS / TICK_MS;
