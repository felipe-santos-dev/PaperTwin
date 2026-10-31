import type { AssetKind, AssetTag, SectionId } from '../asset';
import type { MachineAsset, MachineModel, MachineSection } from './types';

/** Todos os ativos da máquina, na ordem do processo. */
export function allAssets(model: MachineModel): MachineAsset[] {
  return [...model.sections].sort((a, b) => a.order - b.order).flatMap((section) => section.assets);
}

/** Busca um ativo pela tag, ou `null` se não existir. */
export function assetByTag(model: MachineModel, tag: AssetTag): MachineAsset | null {
  return allAssets(model).find((asset) => asset.tag === tag) ?? null;
}

/** Ativos de um tipo. */
export function assetsOfKind(model: MachineModel, kind: AssetKind): MachineAsset[] {
  return allAssets(model).filter((asset) => asset.kind === kind);
}

/** Seção pelo id, ou `null`. */
export function sectionById(model: MachineModel, id: SectionId): MachineSection | null {
  return model.sections.find((section) => section.id === id) ?? null;
}

/** Ativos que têm medição de vibração — os que a API e o banco acompanham. */
export function monitoredAssets(model: MachineModel): MachineAsset[] {
  return allAssets(model).filter((asset) => asset.iso !== null);
}

/** O nº do cilindro que a tag carrega, ex.: `MP1-SEC-G4-CS23` → 23. */
const CYLINDER_NUMBER = /-CS(\d{2})$/;

/** Um cilindro secador e o nº com que ele aparece nas tags de processo. */
export interface DryerCylinder {
  readonly number: number;
  readonly asset: MachineAsset;
}

/**
 * Os cilindros secadores, em ordem de numeração.
 *
 * É daqui que o catálogo de processo tira sobre quantos cilindros expandir os
 * seus padrões por cilindro (`VI-51nnA` e companhia), em vez de repetir um 36
 * fixo: mudar o nº de pares no modelo muda o catálogo junto.
 */
export function dryerCylinders(model: MachineModel): DryerCylinder[] {
  return assetsOfKind(model, 'dryer-cylinder')
    .map((asset) => {
      const parsed = CYLINDER_NUMBER.exec(asset.tag);
      if (!parsed?.[1]) {
        throw new Error(
          `Cilindro secador com tag fora do padrão: ${asset.tag}. Esperado o sufixo -CSnn.`,
        );
      }
      return { number: Number(parsed[1]), asset };
    })
    .sort((a, b) => a.number - b.number);
}
