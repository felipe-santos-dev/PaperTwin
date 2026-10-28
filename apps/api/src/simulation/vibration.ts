import type { AssetTag, MachineAsset, VibrationReading } from '@mp1/shared';

/**
 * Gerador da série de vibração.
 *
 * Os dados são inventados, mas não são aleatórios: eles imitam como um defeito
 * de rolamento se manifesta de verdade, porque é isso que torna a tela útil
 * para mostrar a alguém.
 *
 * Três decisões sustentam isso:
 *
 * 1. **A linha de base é fixa por mancal.** Sai do hash da tag, então o mesmo
 *    mancal tem sempre a mesma assinatura entre reinícios do servidor.
 * 2. **A degradação acelera.** Um defeito de pista não cresce em linha reta:
 *    a trinca arranca devagar e se propaga cada vez mais rápido, daí o
 *    expoente acima de um.
 * 3. **O envelope avança na frente da velocidade.** O envelope de aceleração
 *    pega impacto de rolamento semanas antes de a velocidade RMS sair da faixa
 *    normal. É justamente por isso que se mede envelope — e uma simulação em
 *    que os dois sobem juntos ensinaria a coisa errada a quem olha o gráfico.
 */

/** Tudo que o simulador precisa saber de um mancal. */
export interface SimulatedBearing {
  readonly tag: AssetTag;
}

export interface SimulationOptions {
  readonly bearings: readonly SimulatedBearing[];
  readonly from: Date;
  readonly to: Date;
  /** Intervalo entre amostras. */
  readonly intervalMs: number;
  /** Mancal que degrada ao longo da janela, até cruzar a zona D. */
  readonly degradingTag: AssetTag;
}

/** Amostragem padrão da série: a cada 15 minutos. */
export const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;

/** Janela padrão: as últimas 72 horas, como no conceito de tela. */
export const DEFAULT_WINDOW_MS = 72 * 60 * 60 * 1000;

/**
 * Onde a degradação termina, em mm/s.
 *
 * Acima da fronteira C→D do grupo 2 com apoio rígido, que é 4,5 — a série
 * precisa terminar dentro da zona D para a tela ter o que mostrar.
 */
const DEGRADED_PEAK_MM_S = 5.8;

/** Expoente da propagação do defeito. Acima de 1 = acelera com o tempo. */
const RMS_PROGRESSION = 2.2;

/** O envelope usa expoente menor, então sobe antes da velocidade. */
const ENVELOPE_PROGRESSION = 1.4;

/** Gerador determinístico, para a série ser a mesma a cada execução. */
function seededRandom(seed: number): () => number {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

/** Hash estável de uma tag, para a assinatura do mancal não variar. */
function hashTag(tag: string): number {
  let hash = 2166136261;
  for (let i = 0; i < tag.length; i += 1) {
    hash ^= tag.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

/** Ruído aproximadamente normal, somando uniformes. */
function noise(random: () => number): number {
  return (random() + random() + random() - 1.5) / 1.5;
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
function signatureOf(tag: AssetTag): Signature {
  const hash = hashTag(tag);
  return {
    rmsBase: 0.8 + ((hash % 1000) / 1000) * 1.2,
    tempBase: 58 + ((hash >> 10) % 100) / 10,
    envelopeBase: 0.3 + ((hash >> 17) % 100) / 400,
  };
}

/** Quanto do caminho até o fim da janela já foi percorrido, de 0 a 1. */
function progressAt(ts: number, from: number, to: number): number {
  if (to <= from) return 0;
  return Math.min(1, Math.max(0, (ts - from) / (to - from)));
}

/** Gera a série de todos os mancais na janela pedida. */
export function simulateVibration(options: SimulationOptions): VibrationReading[] {
  const from = options.from.getTime();
  const to = options.to.getTime();
  if (!(to > from))
    throw new RangeError('A janela da simulação precisa terminar depois de começar');
  if (options.intervalMs <= 0) throw new RangeError('O intervalo precisa ser positivo');

  const readings: VibrationReading[] = [];

  for (const bearing of options.bearings) {
    const signature = signatureOf(bearing.tag);
    const random = seededRandom(hashTag(bearing.tag));
    const degrading = bearing.tag === options.degradingTag;
    const climb = DEGRADED_PEAK_MM_S - signature.rmsBase;

    for (let ts = from; ts <= to; ts += options.intervalMs) {
      const progress = degrading ? progressAt(ts, from, to) : 0;

      const defect = degrading ? climb * progress ** RMS_PROGRESSION : 0;
      const envelopeDefect = degrading ? 4.2 * progress ** ENVELOPE_PROGRESSION : 0;

      const rms = signature.rmsBase + defect + noise(random) * 0.06;
      const envelope = signature.envelopeBase + envelopeDefect + noise(random) * 0.03;
      // o mancal esquenta junto com o defeito, mas bem menos que a vibração
      const temp = signature.tempBase + defect * 4.5 + noise(random) * 0.5;

      readings.push({
        assetTag: bearing.tag,
        ts: new Date(ts).toISOString(),
        rmsMmS: Math.max(0, Number(rms.toFixed(3))),
        tempC: Number(temp.toFixed(2)),
        envelopeGe: Math.max(0, Number(envelope.toFixed(3))),
      });
    }
  }

  return readings;
}

/** Os mancais da máquina, que são os ativos com classe ISO declarada. */
export function bearingsOf(assets: readonly MachineAsset[]): SimulatedBearing[] {
  return assets.filter((asset) => asset.kind === 'bearing').map(({ tag }) => ({ tag }));
}
