import { useCallback, useEffect, useState } from 'react';
import { assetByTag, MP1, type AssetTag, type MachineAsset } from '@mp1/shared';

/**
 * A seleção do ativo, espelhada na URL.
 *
 * `?asset=MP1-SEC-G4-CS23-MLA` abre a cena já enquadrada naquele mancal, e
 * clicar num ativo passa a produzir um endereço que se compartilha. É o que
 * transforma "olha esse mancal" num link em vez de um roteiro de cliques.
 *
 * A URL entra com `replaceState`: cada clique na máquina não deveria virar um
 * passo no histórico do navegador, senão o botão voltar fica inútil.
 */

export const ASSET_PARAM = 'asset';

/** Lê a tag da URL, descartando o que não existir no modelo. */
function tagFromLocation(): AssetTag | null {
  if (typeof window === 'undefined') return null;

  const tag = new URLSearchParams(window.location.search).get(ASSET_PARAM);
  if (!tag) return null;

  // uma tag inventada na URL não pode travar a cena
  return assetByTag(MP1, tag) ? tag : null;
}

function writeToLocation(tag: AssetTag | null): void {
  const url = new URL(window.location.href);
  if (tag) url.searchParams.set(ASSET_PARAM, tag);
  else url.searchParams.delete(ASSET_PARAM);

  if (url.toString() !== window.location.href) {
    window.history.replaceState(null, '', url);
  }
}

export interface AssetSelection {
  readonly selectedTag: AssetTag | null;
  readonly selected: MachineAsset | null;
  readonly select: (tag: AssetTag | null) => void;
  /**
   * O ativo que veio na URL ao abrir a página, e que por isso a câmera deve
   * enquadrar. Clicar num ativo não mexe na câmera: quem clicou já está olhando
   * para ele, e mover a cena embaixo do cursor é desorientador.
   */
  readonly initialTag: AssetTag | null;
}

export function useAssetSelection(): AssetSelection {
  const [initialTag] = useState(tagFromLocation);
  const [selectedTag, setSelectedTag] = useState<AssetTag | null>(initialTag);

  const select = useCallback((tag: AssetTag | null) => {
    setSelectedTag(tag);
    writeToLocation(tag);
  }, []);

  // navegação pelo histórico (voltar/avançar) também muda a seleção
  useEffect(() => {
    const onPopState = () => {
      setSelectedTag(tagFromLocation());
    };
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
    };
  }, []);

  return {
    selectedTag,
    selected: selectedTag ? assetByTag(MP1, selectedTag) : null,
    select,
    initialTag,
  };
}
