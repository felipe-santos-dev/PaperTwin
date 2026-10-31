import { ARCHIVE_MAX_GAP_S, EXCEPTION_MAX_GAP_S } from './retention';
import type { ArchivedSample, HistorianPoint, Sample } from './types';

/**
 * A compressão do historiador, em dois estágios, como no PI.
 *
 * ```
 *   simulação ──► filtro de exceção ──► porta oscilante ──► arquivo
 *    1 amostra/s        descarta o que        descarta o que
 *                       não mudou             a reta já explica
 * ```
 *
 * Os dois estágios respondem a perguntas diferentes, e é por isso que são dois:
 *
 * - **exceção**: "este valor é novidade?" Compara com o último valor *enviado*.
 *   É o estágio que, num PI de verdade, roda no nó de interface, junto do
 *   processo, e cujo descarte não existe em lugar nenhum depois.
 * - **porta oscilante**: "este trecho ainda cabe numa reta?" Compara com a
 *   *reta* desde o último valor arquivado. É o estágio que transforma uma rampa
 *   de mil amostras em dois pontos.
 *
 * Um filtro de exceção sozinho não comprime rampa nenhuma: num sinal que sobe
 * devagar, toda amostra é novidade. Uma porta oscilante sozinha gasta o
 * processamento comparando retas para um sinal que está parado. Juntos, o
 * primeiro é barato e tira o volume, o segundo é esperto e tira a forma
 * redundante.
 */

/** Um estágio da compressão: recebe amostras, devolve as que passam. */
export interface CompressionStage<T extends Sample = Sample> {
  /** Processa uma amostra e devolve o que ela produziu — zero, uma ou duas. */
  feed(sample: Sample): T[];
  /** Fecha a janela, devolvendo o que estava retido. */
  flush(): T[];
}

export interface ExceptionOptions {
  /** Desvio mínimo para o valor ser considerado novidade. */
  readonly excDev: number;
  /** Teto de tempo sem enviar nada, em segundos. */
  readonly maxGapS?: number;
}

/**
 * O filtro de exceção.
 *
 * Quando a amostra é novidade, o filtro envia **duas**: a amostra anterior,
 * que ainda não havia sido enviada, e a nova. Sem isso um degrau viraria rampa.
 *
 * Imagine um sinal em 100 por dez minutos que salta para 140 num segundo. Sem
 * enviar a anterior, o arquivo teria o 100 de dez minutos atrás e o 140 de
 * agora, e qualquer interpolação entre os dois desenharia uma subida de dez
 * minutos que não aconteceu. Enviando as duas, o arquivo tem o 100 de um
 * segundo antes do salto, e a subida fica onde foi.
 */
export function exceptionFilter(options: ExceptionOptions): CompressionStage {
  const maxGapMs = (options.maxGapS ?? EXCEPTION_MAX_GAP_S) * 1000;
  const excDev = Math.abs(options.excDev);

  let lastSent: Sample | null = null;
  /** A última amostra vista e não enviada. */
  let held: Sample | null = null;

  return {
    feed(sample: Sample): Sample[] {
      if (!lastSent) {
        lastSent = sample;
        held = null;
        return [sample];
      }

      const isNews = Math.abs(sample.v - lastSent.v) > excDev;
      const isStale = sample.t - lastSent.t >= maxGapMs;

      if (!isNews && !isStale) {
        held = sample;
        return [];
      }

      /**
       * A anterior acompanha a **novidade**, nunca o teto de tempo.
       *
       * No degrau ela é indispensável: sem ela, a subida apareceria começando
       * no último valor enviado, que pode ser de minutos atrás. No teto de
       * tempo não há degrau nenhum para preservar — o valor não mudou, só o
       * tempo passou — e mandar a anterior junto gravaria duas linhas
       * praticamente iguais a cada estouro do teto.
       */
      const sending = isNews && held && held.t > lastSent.t ? [held, sample] : [sample];
      lastSent = sample;
      held = null;
      return sending;
    },

    flush(): Sample[] {
      if (!held || !lastSent || held.t <= lastSent.t) return [];
      const last = held;
      lastSent = last;
      held = null;
      return [last];
    },
  };
}

export interface SwingingDoorOptions {
  /** Meia largura do corredor em que a reta pode passar. */
  readonly compDev: number;
  /** Teto de tempo entre valores arquivados, em segundos. */
  readonly maxGapS?: number;
}

/**
 * A porta oscilante.
 *
 * O arquivo guarda uma âncora e, enquanto puder, nada mais: tudo que vem depois
 * é descartado se uma reta saindo da âncora puder passar a menos de `compDev`
 * de cada amostra descartada.
 *
 * O algoritmo mantém duas inclinações, que formam um corredor em leque a partir
 * da âncora. Cada amostra nova aperta o corredor: a inclinação máxima nunca
 * sobe, a mínima nunca desce. Quando o corredor fecha — máxima abaixo da mínima
 * — não existe mais reta que sirva para todas, e aí a amostra **anterior** vai
 * para o arquivo e vira a nova âncora. É a anterior, e não a atual, porque a
 * anterior é a última que a reta antiga ainda explicava.
 *
 * Com `compDev` zero nada é descartado — e é o comportamento certo para uma tag
 * sem compressão no catálogo.
 *
 * ## O que `compDev` garante, exatamente
 *
 * O corredor garante que **existe** uma reta saindo da faixa `âncora ± compDev`
 * que passa a menos de `compDev` de cada amostra descartada. Mas a reta que
 * quem lê o arquivo desenha não é essa: é a corda entre dois valores
 * arquivados. As duas podem divergir, e o erro da corda chega a **2 ·
 * `compDev`** no pior caso.
 *
 * Isso não é defeito da implementação, é o que a porta oscilante promete — e
 * vale saber ao escolher o `compDev` de uma tag: o desvio que o gráfico pode
 * mostrar é o dobro do que está no catálogo. Um teste cobra esse limite sobre
 * um sinal com ruído e curvatura.
 *
 * Por consequência, a porta também fecha **uma amostra depois** da mudança: ela
 * só descobre que a reta não serve mais quando chega a amostra que não cabe, e
 * aí arquiva a anterior. Num canto de rampa, o vértice arquivado é o ponto
 * seguinte ao vértice real.
 */
export function swingingDoor(options: SwingingDoorOptions): CompressionStage<ArchivedSample> {
  const maxGapMs = (options.maxGapS ?? ARCHIVE_MAX_GAP_S) * 1000;
  const compDev = Math.abs(options.compDev);

  let anchor: Sample | null = null;
  let held: Sample | null = null;
  let maxSlope = Number.POSITIVE_INFINITY;
  let minSlope = Number.NEGATIVE_INFINITY;

  function openDoorAt(sample: Sample): void {
    anchor = sample;
    held = null;
    maxSlope = Number.POSITIVE_INFINITY;
    minSlope = Number.NEGATIVE_INFINITY;
  }

  /** Aperta o corredor com a amostra; devolve `false` quando ele fecha. */
  function narrow(sample: Sample): boolean {
    if (!anchor) return true;

    const dtS = (sample.t - anchor.t) / 1000;
    // amostra no mesmo instante da âncora não diz nada sobre inclinação
    if (dtS <= 0) return true;

    const up = (sample.v + compDev - anchor.v) / dtS;
    const down = (sample.v - compDev - anchor.v) / dtS;

    const nextMax = Math.min(maxSlope, up);
    const nextMin = Math.max(minSlope, down);

    if (nextMax < nextMin) return false;

    maxSlope = nextMax;
    minSlope = nextMin;
    return true;
  }

  return {
    feed(sample: Sample): ArchivedSample[] {
      if (!anchor) {
        openDoorAt(sample);
        return [{ ...sample, reason: 'inicial' }];
      }

      if (sample.t - anchor.t >= maxGapMs) {
        /**
         * O teto de tempo vence antes de a porta fechar.
         *
         * Aqui a amostra arquivada é a **atual**, e não a retida. Quando a
         * porta fecha, a retida importa porque ela é a última que a reta antiga
         * ainda explicava. No teto de tempo não houve nada que a reta deixasse
         * de explicar: o que se quer registrar é "o ponto estava vivo e valia
         * isto agora", e isso é a amostra de agora. Arquivar a retida deixaria
         * uma marca um segundo antes do teto, sem razão.
         */
        openDoorAt(sample);
        return [{ ...sample, reason: 'intervalo' }];
      }

      if (narrow(sample)) {
        held = sample;
        return [];
      }

      // a porta fechou: a anterior é a última que a reta antiga explicava
      const archived = held ?? sample;
      openDoorAt(archived);
      const out: ArchivedSample[] = [{ ...archived, reason: 'porta' }];

      if (archived !== sample) {
        held = sample;
        narrow(sample);
      }
      return out;
    },

    flush(): ArchivedSample[] {
      if (!held || !anchor || held.t <= anchor.t) return [];
      const last = held;
      openDoorAt(last);
      return [{ ...last, reason: 'final' }];
    },
  };
}

/** Quanto a compressão economizou. */
export interface CompressionStats {
  readonly samples: number;
  /** Quantas passaram o filtro de exceção. */
  readonly afterException: number;
  readonly archived: number;
  /** Amostras de entrada por linha arquivada. */
  readonly ratio: number;
}

export interface RecordResult {
  readonly archived: readonly ArchivedSample[];
  readonly stats: CompressionStats;
}

/**
 * Passa uma série pelos dois estágios, com os parâmetros de um ponto.
 *
 * Um ponto sem `excDev` nem `compDev` no catálogo não é comprimido: os dois
 * estágios recebem zero e tudo chega ao arquivo. É o comportamento conservador
 * certo — a ausência do parâmetro não é licença para descartar.
 */
export function recordSeries(point: HistorianPoint, samples: readonly Sample[]): RecordResult {
  const exception = exceptionFilter({ excDev: point.excDev ?? 0 });
  const door = swingingDoor({ compDev: point.compDev ?? 0 });

  const archived: ArchivedSample[] = [];
  let afterException = 0;

  for (const sample of samples) {
    for (const passed of exception.feed(sample)) {
      afterException += 1;
      archived.push(...door.feed(passed));
    }
  }

  for (const passed of exception.flush()) {
    afterException += 1;
    archived.push(...door.feed(passed));
  }
  archived.push(...door.flush());

  return {
    archived,
    stats: {
      samples: samples.length,
      afterException,
      archived: archived.length,
      ratio: archived.length === 0 ? 0 : samples.length / archived.length,
    },
  };
}
