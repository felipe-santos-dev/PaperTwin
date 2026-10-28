import { useEffect, useState } from 'react';
import type { AssetTag } from '@mp1/shared';
import type { AssetDetail, VibrationSeries } from '../api/client';

/**
 * Carrega o ativo e, se ele for medido, a sua série de vibração.
 *
 * As duas buscas entram como parâmetro em vez de serem importadas, para o teste
 * poder observar os estados sem interceptar o `fetch` global.
 */

export interface AssetData {
  readonly phase: 'loading' | 'ready' | 'error';
  readonly detail: AssetDetail | null;
  readonly series: VibrationSeries | null;
  readonly error: string | null;
}

export interface AssetFetchers {
  readonly fetchAsset: (tag: string, signal?: AbortSignal) => Promise<AssetDetail>;
  readonly fetchVibration: (
    tag: string,
    query?: Record<string, never>,
    signal?: AbortSignal,
  ) => Promise<VibrationSeries>;
}

const EMPTY: AssetData = { phase: 'loading', detail: null, series: null, error: null };

export function useAssetDetail(tag: AssetTag | null, fetchers: AssetFetchers): AssetData {
  const [data, setData] = useState<AssetData>(EMPTY);
  const [loadedTag, setLoadedTag] = useState<AssetTag | null>(tag);

  /**
   * Trocar de ativo zera o painel durante a renderização, e não dentro do
   * efeito: um `setState` síncrono no corpo do efeito provoca uma segunda
   * renderização em cascata, e por um instante o painel do ativo novo mostraria
   * os números do anterior.
   */
  if (tag !== loadedTag) {
    setLoadedTag(tag);
    setData(EMPTY);
  }

  useEffect(() => {
    if (!tag) return;

    const controller = new AbortController();

    const load = async () => {
      const detail = await fetchers.fetchAsset(tag, controller.signal);

      // só ativo com classe ISO tem vibração medida
      const series = detail.asset.iso
        ? await fetchers.fetchVibration(tag, undefined, controller.signal)
        : null;

      if (!controller.signal.aborted) {
        setData({ phase: 'ready', detail, series, error: null });
      }
    };

    load().catch((cause: unknown) => {
      if (controller.signal.aborted) return;
      setData({
        phase: 'error',
        detail: null,
        series: null,
        error: cause instanceof Error ? cause.message : 'Falha ao consultar a API',
      });
    });

    return () => {
      controller.abort();
    };
  }, [tag, fetchers]);

  return tag === null ? EMPTY : data;
}
