import type { HistorianPoint, PointArchivedSample, PointSample } from '@mp1/shared';

import type { SimState } from './historian-queries';

/**
 * O contrato do historiador.
 *
 * A consulta é sempre **por ponto e por janela**, e nunca por tag: a tabela
 * guarda `point_id`, e resolver a tag para o id é passo de quem chama. É o
 * mesmo desenho do PI, e o motivo é de espaço — a tag em texto custaria um
 * quarto do banco gratuito.
 */

export interface HistorianQuery {
  readonly pointId: number;
  readonly from: Date;
  /** Exclusivo, como em todas as janelas do projeto. */
  readonly to: Date;
  readonly limit?: number;
}

export interface PruneResult {
  /** Instante antes do qual o bruto foi apagado. */
  readonly rawCutoff: string;
  /** Instante antes do qual o arquivo foi apagado. */
  readonly archiveCutoff: string;
}

export interface HistorianUsage {
  readonly points: number;
  readonly rawRows: number;
  readonly archiveRows: number;
}

export interface HistorianRepository {
  /** Reescreve a lista de pontos; o que sair da lista perde as amostras. */
  replaceHistorianPoints(points: readonly HistorianPoint[]): Promise<number>;
  listHistorianPoints(): Promise<HistorianPoint[]>;
  findHistorianPoint(tag: string): Promise<HistorianPoint | null>;

  /** Grava bruto, ignorando repetição do mesmo (ponto, instante). */
  insertRawSamples(samples: readonly PointSample[]): Promise<number>;
  insertArchiveSamples(samples: readonly PointArchivedSample[]): Promise<number>;

  rawSamples(query: HistorianQuery): Promise<PointSample[]>;
  archivedSamples(query: HistorianQuery): Promise<PointArchivedSample[]>;

  /**
   * O último arquivado antes do instante.
   *
   * É a âncora de entrada de qualquer tendência: sem ela, um gráfico que começa
   * às 14h não sabe de onde a linha vinha.
   */
  archivedBefore(pointId: number, before: Date): Promise<PointArchivedSample | null>;
  archivedAfter(pointId: number, from: Date): Promise<PointArchivedSample | null>;
  latestArchived(pointId: number): Promise<PointArchivedSample | null>;

  /**
   * Até onde a simulação rodou, ou `null` se nunca rodou.
   *
   * Mora com o historiador porque é a mesma pergunta: o marcador diz até onde
   * existem dados, e quem grava os dados é quem o move.
   */
  findSimState(): Promise<SimState | null>;
  saveSimState(state: {
    readonly seed: number;
    readonly lastTick: number;
    /** O estado da rede. `null` grava sem estado, o que força reancoragem. */
    readonly state?: unknown;
    readonly updatedAt: Date;
  }): Promise<void>;

  /** Apaga o que passou da retenção de cada tabela. */
  pruneHistorian(now: Date): Promise<PruneResult>;
  /** Linhas por tabela — de onde sai a taxa de compressão medida. */
  historianUsage(): Promise<HistorianUsage>;
}
