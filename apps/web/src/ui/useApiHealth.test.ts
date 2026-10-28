import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { HealthResponse } from '@mp1/shared';
import { useApiHealth } from './useApiHealth';

const ok: HealthResponse = {
  status: 'ok',
  service: 'mp1-twin-api',
  version: '0.0.0',
  uptimeS: 3,
  database: 'pglite',
  databaseUp: true,
};

describe('useApiHealth', () => {
  it('começa consultando', () => {
    const { result } = renderHook(() => useApiHealth(() => new Promise(() => undefined)));
    expect(result.current).toBe('checking');
  });

  it('marca a API no ar quando ela responde ok', async () => {
    const { result } = renderHook(() => useApiHealth(() => Promise.resolve(ok)));
    await waitFor(() => {
      expect(result.current).toBe('up');
    });
  });

  it('marca fora do ar quando a busca falha', async () => {
    const { result } = renderHook(() =>
      useApiHealth(() => Promise.reject(new Error('conexão recusada'))),
    );
    await waitFor(() => {
      expect(result.current).toBe('down');
    });
  });

  it('marca fora do ar quando a API se diz degradada', async () => {
    const { result } = renderHook(() =>
      useApiHealth(() => Promise.resolve({ ...ok, status: 'degraded' })),
    );
    await waitFor(() => {
      expect(result.current).toBe('down');
    });
  });

  it('aborta a busca ao desmontar, para não escrever em componente que saiu', () => {
    const fetchHealth = vi.fn((signal?: AbortSignal) => {
      expect(signal?.aborted).toBe(false);
      return new Promise<HealthResponse>(() => undefined);
    });

    const { unmount } = renderHook(() => useApiHealth(fetchHealth));
    const signal = fetchHealth.mock.calls[0]?.[0];

    unmount();
    expect(signal?.aborted).toBe(true);
  });
});
