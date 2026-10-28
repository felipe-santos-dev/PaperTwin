import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { assetByTag, MP1, type MachineAsset } from '@mp1/shared';
import type { AssetDetail, VibrationSeries } from '../api/client';
import { useAssetDetail, type AssetFetchers } from './useAssetDetail';

function asset(tag: string): MachineAsset {
  const found = assetByTag(MP1, tag);
  if (!found) throw new Error(`ativo ausente no modelo: ${tag}`);
  return found;
}

const bearing = asset('MP1-SEC-G4-CS23-MLA');
const scanner = asset('MP1-QCS-SC1');

const detailOf = (asset: MachineAsset): AssetDetail => ({
  asset,
  status: { assetTag: asset.tag, zone: null, health: null, latest: null },
  limits: null,
});

const series = {
  assetTag: bearing.tag,
  from: '2026-03-01T00:00:00Z',
  to: '2026-03-04T00:00:00Z',
  bucket: '1 hour',
  limits: null,
  buckets: [],
  remainingLife: null,
} as unknown as VibrationSeries;

function fetchers(overrides: Partial<AssetFetchers> = {}): AssetFetchers {
  return {
    fetchAsset: vi.fn().mockResolvedValue(detailOf(bearing)),
    fetchVibration: vi.fn().mockResolvedValue(series),
    ...overrides,
  };
}

describe('useAssetDetail', () => {
  it('não busca nada sem tag selecionada', () => {
    const f = fetchers();
    const { result } = renderHook(() => useAssetDetail(null, f));

    expect(result.current.phase).toBe('loading');
    expect(f.fetchAsset).not.toHaveBeenCalled();
  });

  it('busca o ativo e a vibração de um mancal', async () => {
    const f = fetchers();
    const { result } = renderHook(() => useAssetDetail(bearing.tag, f));

    await waitFor(() => {
      expect(result.current.phase).toBe('ready');
    });
    expect(result.current.detail?.asset.tag).toBe(bearing.tag);
    expect(result.current.series).toEqual(series);
    expect(f.fetchVibration).toHaveBeenCalledOnce();
  });

  it('não pede vibração de ativo que não é medido', async () => {
    const f = fetchers({ fetchAsset: vi.fn().mockResolvedValue(detailOf(scanner)) });
    const { result } = renderHook(() => useAssetDetail(scanner.tag, f));

    await waitFor(() => {
      expect(result.current.phase).toBe('ready');
    });
    expect(result.current.series).toBeNull();
    expect(f.fetchVibration).not.toHaveBeenCalled();
  });

  it('reporta a falha sem derrubar o painel', async () => {
    const f = fetchers({ fetchAsset: vi.fn().mockRejectedValue(new Error('A API respondeu 503')) });
    const { result } = renderHook(() => useAssetDetail(bearing.tag, f));

    await waitFor(() => {
      expect(result.current.phase).toBe('error');
    });
    expect(result.current.error).toBe('A API respondeu 503');
  });

  it('volta a carregar quando a seleção muda', async () => {
    const f = fetchers();
    const { result, rerender } = renderHook(({ tag }) => useAssetDetail(tag, f), {
      initialProps: { tag: bearing.tag },
    });

    await waitFor(() => {
      expect(result.current.phase).toBe('ready');
    });

    rerender({ tag: 'MP1-SEC-G1-CS01-MLA' });
    expect(f.fetchAsset).toHaveBeenCalledTimes(2);
  });

  it('aborta a busca ao desmontar, para não escrever em componente que saiu', async () => {
    const f = fetchers({
      fetchAsset: vi.fn((_tag: string, signal?: AbortSignal) => {
        expect(signal?.aborted).toBe(false);
        return new Promise<AssetDetail>(() => undefined);
      }),
    });

    const { unmount } = renderHook(() => useAssetDetail(bearing.tag, f));
    const mock = f.fetchAsset as ReturnType<typeof vi.fn>;
    const signal = mock.mock.calls[0]?.[1] as AbortSignal | undefined;

    unmount();
    await waitFor(() => {
      expect(signal?.aborted).toBe(true);
    });
  });
});
