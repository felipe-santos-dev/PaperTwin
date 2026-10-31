import type { OperationsRepository } from './operations-repository';
import type {
  AssetTag,
  MachineAsset,
  SectionId,
  VibrationBucket,
  VibrationBucketSize,
  VibrationReading,
} from '@mp1/shared';

/**
 * O contrato que as rotas enxergam.
 *
 * As rotas não sabem qual banco está atrás: em desenvolvimento e nos testes é o
 * PGlite embutido, em produção é um Postgres gerenciado pelo postgres.js. O que
 * difere entre os dois é só o executor (`executor.ts`); o SQL e o mapeamento
 * das linhas são os mesmos, para não haver dois comportamentos para manter.
 */

export interface AssetFilter {
  readonly section?: SectionId;
  readonly kind?: MachineAsset['kind'];
}

export interface AssetRepository {
  /** Ativos da máquina, em ordem de tag. */
  listAssets(filter?: AssetFilter): Promise<MachineAsset[]>;

  findAsset(tag: AssetTag): Promise<MachineAsset | null>;

  /**
   * Semeia a tabela a partir do modelo, substituindo o que estiver lá.
   * Devolve quantos ativos ficaram gravados.
   */
  replaceAssets(assets: readonly MachineAsset[]): Promise<number>;
}

export interface VibrationQuery {
  readonly tag: AssetTag;
  readonly from: Date;
  readonly to: Date;
  readonly bucket: VibrationBucketSize;
}

export interface VibrationRepository {
  /** Grava leituras, ignorando as que já existem para o mesmo (ativo, instante). */
  insertReadings(readings: readonly VibrationReading[]): Promise<number>;

  latestReading(tag: AssetTag): Promise<VibrationReading | null>;

  /** Leituras agregadas por janela, via `date_bin()`. */
  readingsByBucket(query: VibrationQuery): Promise<VibrationBucket[]>;

  countReadings(): Promise<number>;
}

/** Qual driver está atrás do repositório, para o `/health` poder dizer. */
export type DatabaseDriver = 'pglite' | 'postgres';

export interface Database extends AssetRepository, VibrationRepository, OperationsRepository {
  readonly driver: DatabaseDriver;
  /** Aplica as migrations pendentes. Seguro de chamar mais de uma vez. */
  migrate(): Promise<void>;
  /** Responde se o banco está acessível. */
  ping(): Promise<boolean>;
  close(): Promise<void>;
}
