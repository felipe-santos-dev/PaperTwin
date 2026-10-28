import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HealthResponse } from '@mp1/shared';
import { API_URL, fetchHealth } from './client';

const payload: HealthResponse = {
  status: 'ok',
  service: 'mp1-twin-api',
  version: '0.0.0',
  uptimeS: 12,
  database: 'pglite',
  databaseUp: true,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchHealth', () => {
  it('chama /health na URL configurada e devolve o corpo', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(payload));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchHealth()).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(`${API_URL}/health`, {});
  });

  it('repassa o AbortSignal quando recebe um', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(payload));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    await fetchHealth(controller.signal);

    expect(fetchMock).toHaveBeenCalledWith(`${API_URL}/health`, { signal: controller.signal });
  });

  it('transforma resposta de erro em exceção', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    await expect(fetchHealth()).rejects.toThrow(/503/);
  });
});
