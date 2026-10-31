import {
  exceptionFilter,
  HISTORIAN_POINTS,
  historianPoint,
  swingingDoor,
  type HistorianPoint,
  type PointArchivedSample,
  type PointSample,
} from '@mp1/shared';

import { TICK_MS, tickTime } from '../simulation/clock';

/**
 * O gravador do historiador: liga o motor de simulação às duas tabelas.
 *
 * Para cada ponto ele mantém os dois estágios de compressão — filtro de exceção
 * e porta oscilante — e vai acumulando o que passa. Quem chama alimenta valores
 * por passo e drena o acumulado em lotes, para uma retomada de horas não montar
 * um array de centenas de milhares de linhas antes da primeira inserção.
 *
 * ## A taxa de varredura não é o passo da simulação
 *
 * O motor anda de 1 s porque o catálogo tem τ de 4,5 s e perder isso perderia a
 * dinâmica. O historiador coleta de 5 s, que é taxa de classe de varredura
 * comum num coletor de verdade, e isso divide por cinco o trabalho de
 * compressão de uma retomada. Nada se perde no arquivo: a porta oscilante
 * trabalha sobre o que ela recebe, e 5 s é bem mais resolução do que o `compDev`
 * de qualquer tag do catálogo distingue.
 *
 * ## O bruto é gravado só de alguns pontos
 *
 * A tabela de valor bruto existe para se poder **ver** o que o filtro de exceção
 * jogou fora. Gravá-la para os 320 pontos custaria mais que o arquivo que ela
 * serve para explicar — a 5 s, são 3.840 linhas por minuto. Então o bruto é
 * gravado de um punhado de pontos declarados: os que a tela de Processo mostra,
 * mais um mancal. O resto chega só ao arquivo, como num PI de verdade, onde o
 * bruto não chega a lugar nenhum.
 */

/** Passos entre duas varreduras do historiador. */
export const HISTORIAN_SCAN_TICKS = 5;

/** Segundos entre duas varreduras. */
export const HISTORIAN_SCAN_S = (HISTORIAN_SCAN_TICKS * TICK_MS) / 1000;

/**
 * Os pontos que gravam valor bruto.
 *
 * Escolhidos pelo que eles mostram: uma pressão de vapor e uma umidade (as duas
 * pontas da cascata que mais se move), a gramatura e a velocidade (o par que
 * explica a produção), um ΔP de sifões (de onde saem as quebras), a espessura, e
 * a vibração e a temperatura do mancal que degrada.
 */
export const RAW_TAGS: readonly string[] = [
  'PIC-514',
  'AIC-903',
  'AIC-902',
  'SIC-1104',
  'PDIC-524',
  'AIC-905',
  'VI-5123A',
  'TI-5323A',
];

/** O que uma varredura produziu. */
export interface RecordedBatch {
  readonly archive: readonly PointArchivedSample[];
  readonly raw: readonly PointSample[];
}

export interface RecorderStats {
  /** Valores alimentados, somando todos os pontos. */
  readonly fed: number;
  /** Valores que passaram o filtro de exceção. */
  readonly afterException: number;
  /** Linhas que foram para o arquivo. */
  readonly archived: number;
  /** Linhas de bruto gravadas. */
  readonly raw: number;
  /** Amostras alimentadas por linha arquivada. */
  readonly ratio: number;
}

export interface HistorianRecorder {
  /** Alimenta uma varredura. `tick` precisa ser crescente. */
  feed(tick: number, values: ReadonlyMap<string, number>): void;
  /** Entrega o acumulado e esvazia. */
  drain(): RecordedBatch;
  /** Fecha as janelas de todos os pontos e entrega o que estava retido. */
  flush(): readonly PointArchivedSample[];
  stats(): RecorderStats;
}

export interface RecorderOptions {
  /** Pontos que gravam bruto. O padrão é `RAW_TAGS`. */
  readonly rawTags?: readonly string[];
  /** Pontos a gravar. O padrão é o catálogo inteiro. */
  readonly points?: readonly HistorianPoint[];
  /**
   * Instante (em ms) a partir do qual o bruto é coletado.
   *
   * O bruto tem retenção de minutos, e a retomada pode ser de horas: sem este
   * corte, uma retomada de quatro horas coletaria 23 mil linhas de bruto para
   * a poda apagar 21 mil delas no mesmo arranque. Medido antes de existir este
   * campo — é o tipo de desperdício que só aparece quando se mede.
   *
   * O padrão é coletar tudo, que é o que um teste de compressão quer.
   */
  readonly rawFrom?: number;
}

/**
 * Monta o gravador.
 *
 * Cada retomada monta um gravador novo, então a porta oscilante de cada ponto
 * arranca sem âncora e o primeiro valor da janela entra no arquivo com razão
 * `inicial`. É o comportamento certo e é o que um historiador de verdade faz ao
 * reiniciar: o primeiro valor depois de um corte não pode ser descartado por
 * caber numa reta cuja outra ponta está do outro lado do corte.
 */
export function historianRecorder(options: RecorderOptions = {}): HistorianRecorder {
  const points = options.points ?? HISTORIAN_POINTS;
  const rawTags = new Set(options.rawTags ?? RAW_TAGS);
  const rawFrom = options.rawFrom ?? Number.NEGATIVE_INFINITY;

  const stages = points.map((point) => ({
    point,
    exception: exceptionFilter({ excDev: point.excDev ?? 0 }),
    door: swingingDoor({ compDev: point.compDev ?? 0 }),
  }));

  let archive: PointArchivedSample[] = [];
  let raw: PointSample[] = [];
  let lastTick: number | null = null;

  let fed = 0;
  let afterException = 0;
  let archived = 0;
  let rawCount = 0;

  return {
    feed(tick: number, values: ReadonlyMap<string, number>): void {
      if (lastTick !== null && tick <= lastTick) {
        throw new Error(
          `O gravador recebeu o passo ${String(tick)} depois de ${String(lastTick)}. ` +
            'A compressão só funciona em ordem de tempo.',
        );
      }
      lastTick = tick;

      const t = tickTime(tick).getTime();

      for (const { point, exception, door } of stages) {
        const value = values.get(point.tag);
        if (value === undefined || !Number.isFinite(value)) continue;

        fed += 1;

        if (rawTags.has(point.tag) && t >= rawFrom) {
          raw.push({ pointId: point.pointId, t, v: value });
          rawCount += 1;
        }

        for (const passed of exception.feed({ t, v: value })) {
          afterException += 1;
          for (const sample of door.feed(passed)) {
            archive.push({ ...sample, pointId: point.pointId });
            archived += 1;
          }
        }
      }
    },

    drain(): RecordedBatch {
      const batch = { archive, raw };
      archive = [];
      raw = [];
      return batch;
    },

    flush(): readonly PointArchivedSample[] {
      const closing: PointArchivedSample[] = [];

      for (const { point, exception, door } of stages) {
        for (const passed of exception.flush()) {
          afterException += 1;
          for (const sample of door.feed(passed)) {
            closing.push({ ...sample, pointId: point.pointId });
          }
        }
        for (const sample of door.flush()) {
          closing.push({ ...sample, pointId: point.pointId });
        }
      }

      archived += closing.length;
      return closing;
    },

    stats(): RecorderStats {
      return {
        fed,
        afterException,
        archived,
        raw: rawCount,
        ratio: archived === 0 ? 0 : fed / archived,
      };
    },
  };
}

/** Os pontos que o gravador cobre, para quem precisa semear a tabela antes. */
export function recordedPoints(options: RecorderOptions = {}): readonly HistorianPoint[] {
  return options.points ?? HISTORIAN_POINTS;
}

/** Se a tag grava bruto. */
export function recordsRaw(tag: string, options: RecorderOptions = {}): boolean {
  return new Set(options.rawTags ?? RAW_TAGS).has(tag);
}

/**
 * Confere que todas as tags de bruto existem como ponto.
 *
 * Verificado na carga: uma tag de bruto que não é ponto do historiador seria
 * silenciosamente ignorada, e a tabela de bruto ficaria sem o ponto que alguém
 * escolheu justamente para poder olhar.
 */
for (const tag of RAW_TAGS) {
  if (!historianPoint(tag)) {
    throw new Error(
      `A tag de bruto ${tag} não é ponto do historiador. ` +
        'Ou ela saiu do catálogo, ou a lista RAW_TAGS está desatualizada.',
    );
  }
}
