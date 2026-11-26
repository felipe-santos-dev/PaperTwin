import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HealthResponse } from '@mp1/shared';
import { API_URL, fetchHealth } from './client';
import { resetInflight } from './inflight';

const payload: HealthResponse = {
  status: 'ok',
  service: 'mp1-twin-api',
  version: '0.0.0',
  uptimeS: 12,
  database: 'pglite',
  databaseUp: true,
};

beforeEach(() => {
  // as buscas são represadas por URL; sem limpar, um caso pega a do anterior
  resetInflight();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchHealth', () => {
  it('chama /health na URL configurada e devolve o corpo', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(payload));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchHealth()).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(`${API_URL}/health`, {
      signal: expect.any(AbortSignal),
    });
  });

  /**
   * O sinal que chega ao `fetch` é o do pedido, não o de quem chamou.
   *
   * São objetos diferentes de propósito — duas telas podem esperar a mesma
   * busca, e a desistência de uma não pode cancelar a da outra. O que o
   * contrato promete é o efeito: quando o último interessado desiste, o pedido
   * é abortado. É disso que a sondagem de `useDataSource` depende para desistir
   * da API no prazo dela.
   */
  it('aborta o pedido quando o último interessado desiste', async () => {
    const vistos: (AbortSignal | null)[] = [];
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      vistos.push(init?.signal ?? null);
      return new Promise<Response>(() => {
        // nunca resolve: é uma API dormindo
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const controller = new AbortController();
    void fetchHealth(controller.signal).catch(() => undefined);

    const [doPedido] = vistos;
    expect(doPedido).toBeInstanceOf(AbortSignal);
    expect(doPedido).not.toBe(controller.signal);
    expect(doPedido?.aborted).toBe(false);

    controller.abort();
    expect(doPedido?.aborted).toBe(true);
  });

  it('atende duas chamadas da mesma URL com uma busca só', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(payload));
    vi.stubGlobal('fetch', fetchMock);

    const [first, second] = await Promise.all([fetchHealth(), fetchHealth()]);

    expect(first).toEqual(payload);
    expect(second).toEqual(payload);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a busca seguinte sai de novo: represar não é guardar', async () => {
    // um `Response` só não serve para duas leituras de corpo
    const fetchMock = vi.fn(() => Promise.resolve(Response.json(payload)));
    vi.stubGlobal('fetch', fetchMock);

    await fetchHealth();
    await fetchHealth();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('transforma resposta de erro em exceção', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    await expect(fetchHealth()).rejects.toThrow(/503/);
  });
});
