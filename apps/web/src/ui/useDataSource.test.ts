import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { HealthResponse } from '@mp1/shared';
import { useDataSource, type DataSourceProbes } from './useDataSource';

const ok: HealthResponse = {
  status: 'ok',
  service: 'mp1-twin-api',
  version: '0.0.0',
  uptimeS: 3,
  database: 'pglite',
  databaseUp: true,
};

const caiu = () => Promise.reject(new Error('conexão recusada'));

function probes(overrides: Partial<DataSourceProbes> = {}): DataSourceProbes {
  return {
    probeApi: vi.fn().mockResolvedValue(ok),
    probeDemo: vi.fn().mockResolvedValue(ok),
    ...overrides,
  };
}

describe('useDataSource', () => {
  it('começa consultando', () => {
    const { result } = renderHook(() =>
      useDataSource(probes({ probeApi: () => new Promise(() => undefined) })),
    );
    expect(result.current).toBe('checking');
  });

  it('usa a API quando ela responde', async () => {
    const p = probes();
    const { result } = renderHook(() => useDataSource(p));

    await waitFor(() => {
      expect(result.current).toBe('live');
    });
    // nem chega a procurar o instantâneo
    expect(p.probeDemo).not.toHaveBeenCalled();
  });

  it('cai para o instantâneo quando a API não responde', async () => {
    const { result } = renderHook(() => useDataSource(probes({ probeApi: caiu })));
    await waitFor(() => {
      expect(result.current).toBe('demo');
    });
  });

  it('recusa uma API que responde mas se diz degradada', async () => {
    const { result } = renderHook(() =>
      useDataSource(probes({ probeApi: () => Promise.resolve({ ...ok, status: 'degraded' }) })),
    );
    // uma API que não alcança o próprio banco não é fonte melhor que o instantâneo
    await waitFor(() => {
      expect(result.current).toBe('demo');
    });
  });

  it('fica sem dados quando nem a API nem o instantâneo respondem', async () => {
    const { result } = renderHook(() => useDataSource(probes({ probeApi: caiu, probeDemo: caiu })));
    await waitFor(() => {
      expect(result.current).toBe('offline');
    });
  });

  it('resolve uma vez só, e não por requisição', async () => {
    const p = probes({ probeApi: vi.fn(caiu) });
    const { result, rerender } = renderHook(() => useDataSource(p));

    await waitFor(() => {
      expect(result.current).toBe('demo');
    });

    rerender();
    rerender();
    expect(p.probeApi).toHaveBeenCalledOnce();
  });

  it('aborta as sondagens ao desmontar', () => {
    const probeApi = vi.fn((signal?: AbortSignal) => {
      expect(signal?.aborted).toBe(false);
      return new Promise<HealthResponse>(() => undefined);
    });

    const { unmount } = renderHook(() => useDataSource(probes({ probeApi })));
    const signal = probeApi.mock.calls[0]?.[0];

    unmount();
    expect(signal?.aborted).toBe(true);
  });
});
