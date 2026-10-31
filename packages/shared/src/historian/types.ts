/**
 * O vocabulário do historiador.
 *
 * O modelo é o do PI: um ponto por tag, um filtro de exceção na coleta e uma
 * porta oscilante no arquivamento. Os parâmetros dos dois (`excDev` e
 * `compDev`) vêm do catálogo da lista base, coluna por coluna.
 */

/** Uma amostra: instante e valor. */
export interface Sample {
  /** Instante em milissegundos do epoch — a mesma base de `Date.getTime()`. */
  readonly t: number;
  readonly v: number;
}

/**
 * Por que uma amostra foi para o arquivo.
 *
 * Note que **`exceção` não está na lista**, e isso é a essência do modelo: o
 * filtro de exceção decide o que é *descartado* na coleta, antes do arquivo. O
 * que chega ao arquivo passou pelo filtro; o que o arquivo registra é por que
 * a porta oscilante não conseguiu representar aquele trecho por uma reta.
 */
export const ARCHIVE_REASONS = ['inicial', 'porta', 'intervalo', 'evento', 'final'] as const;

export type ArchiveReason = (typeof ARCHIVE_REASONS)[number];

/** O que cada razão quer dizer. */
export const ARCHIVE_REASON_LABELS: Readonly<Record<ArchiveReason, string>> = {
  inicial: 'Primeiro valor do ponto',
  porta: 'A porta oscilante fechou: a reta não representava mais o trecho',
  intervalo: 'Teto de tempo entre valores arquivados',
  evento: 'Forçado por um evento — quebra, troca de gramatura, escrita de setpoint',
  final: 'Último valor do trecho, gravado ao fechar a janela',
};

/** Uma amostra arquivada. */
export interface ArchivedSample extends Sample {
  readonly reason: ArchiveReason;
}

/**
 * Um ponto do historiador.
 *
 * `excDev` e `compDev` nulos significam **sem compressão**: tudo que chega é
 * arquivado. É o caso das variáveis que o catálogo deixa sem as duas colunas.
 */
export interface HistorianPoint {
  /**
   * Id numérico do ponto, de 1 em diante.
   *
   * O arquivo guarda o id, não a tag. Com 320 pontos, a tag em texto custa ~12
   * bytes por linha na tabela e outros tantos no índice, e o arquivo é a maior
   * tabela do banco — num banco de 0,5 GB isso é cerca de um quarto do espaço.
   * É a mesma razão pela qual o PI tem PointID.
   */
  readonly pointId: number;
  readonly tag: string;
  readonly unit: string;
  /** Filtro de exceção, na unidade da tag; `null` quando não há. */
  readonly excDev: number | null;
  /** Desvio da porta oscilante, na unidade da tag; `null` quando não há. */
  readonly compDev: number | null;
}

/** Uma amostra com o ponto a que pertence — o que vai para as tabelas. */
export interface PointSample extends Sample {
  readonly pointId: number;
}

/** Uma amostra arquivada com o ponto a que pertence. */
export interface PointArchivedSample extends ArchivedSample {
  readonly pointId: number;
}

/**
 * A razão como `smallint`, para a coluna do arquivo.
 *
 * O arquivo é a maior tabela do banco, e guardar `'intervalo'` em texto custaria
 * ~12 bytes por linha contra 2. O código é o índice em {@link ARCHIVE_REASONS},
 * começando em 1; um teste compara o teto com o `check` da migration.
 */
export function archiveReasonCode(reason: ArchiveReason): number {
  return ARCHIVE_REASONS.indexOf(reason) + 1;
}

/** A razão a partir do código gravado. */
export function archiveReasonFromCode(code: number): ArchiveReason {
  const reason = ARCHIVE_REASONS[code - 1];
  if (!reason) {
    throw new Error(
      `Código de razão de arquivamento desconhecido: ${String(code)}. ` +
        `São ${String(ARCHIVE_REASONS.length)} razões, de 1 a ${String(ARCHIVE_REASONS.length)}.`,
    );
  }
  return reason;
}
