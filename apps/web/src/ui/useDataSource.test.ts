import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { HealthResponse } from '@mp1/shared';
import {
  PROBE_TIMEOUT_MS,
  RETRY_INTERVAL_MS,
  useDataSource,
  type DataSourceProbes,
} from './useDataSource';

const ok: HealthResponse = {
  status: 'ok',
  service: 'mp1-twin-api',
  version: '0.0.0',
  uptimeS: 3,
  database: 'pglite',
  databaseUp: true,
};

const caiu = () => Promise.reject(new Error('conexão recusada'));

/**
 * Uma API lenta, que responde só depois de `delayMs` — e que respeita o aborto,
 * como um `fetch` de verdade faz.
 */
function lenta(delayMs: number, response: HealthResponse = ok) {
  return (signal?: AbortSignal) =>
    new Promise<HealthResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        resolve(response);
      }, delayMs);

      signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new Error('abortado'));
      });
    });
}

function probes(overrides: Partial<DataSourceProbes> = {}): DataSourceProbes {
  return {
    probeApi: vi.fn().mockResolvedValue(ok),
    probeDemo: vi.fn().mockResolvedValue(ok),
    ...overrides,
  };
}

/** Deixa as promessas pendentes resolverem junto com os temporizadores. */
const avançar = (ms: number) => act(async () => vi.advanceTimersByTimeAsync(ms));

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('resolução inicial', () => {
  it('começa consultando', () => {
    const { result } = renderHook(() => useDataSource(probes({ probeApi: lenta(1_000) })));
    expect(result.current.source).toBe('checking');
  });

  it('usa a API quando ela responde dentro do prazo', async () => {
    const p = probes({ probeApi: lenta(PROBE_TIMEOUT_MS - 500) });
    const { result } = renderHook(() => useDataSource(p));

    await avançar(PROBE_TIMEOUT_MS);
    expect(result.current.source).toBe('live');
    expect(p.probeDemo).not.toHaveBeenCalled();
  });

  it('cai para o instantâneo quando a API não responde', async () => {
    const { result } = renderHook(() => useDataSource(probes({ probeApi: caiu })));

    await avançar(10);
    expect(result.current.source).toBe('demo');
  });

  it('recusa uma API que responde mas se diz degradada', async () => {
    const { result } = renderHook(() =>
      useDataSource(probes({ probeApi: () => Promise.resolve({ ...ok, status: 'degraded' }) })),
    );

    await avançar(10);
    expect(result.current.source).toBe('demo');
  });

  it('fica sem dados quando nem a API nem o instantâneo respondem', async () => {
    const { result } = renderHook(() => useDataSource(probes({ probeApi: caiu, probeDemo: caiu })));

    await avançar(10);
    expect(result.current.source).toBe('offline');
  });
});

describe('API lenta', () => {
  it('não espera além do prazo: aos 4 s entra o modo de demonstração', async () => {
    // host gratuito acordando: responderia, mas só em 30 s
    const p = probes({ probeApi: lenta(30_000) });
    const { result } = renderHook(() => useDataSource(p));

    await avançar(PROBE_TIMEOUT_MS - 1);
    expect(result.current.source, 'antes do prazo ainda espera').toBe('checking');

    await avançar(2);
    expect(result.current.source, 'estourou o prazo').toBe('demo');
  });

  it('aborta a sondagem que estourou, em vez de deixá-la correndo', async () => {
    let abortada = false;
    const probeApi = (signal?: AbortSignal) =>
      new Promise<HealthResponse>((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
          abortada = true;
          reject(new Error('abortado'));
        });
      });

    const p = probes({ probeApi });
    renderHook(() => useDataSource(p));
    await avançar(PROBE_TIMEOUT_MS + 10);

    expect(abortada).toBe(true);
  });

  it('a resposta atrasada não muda a fonte pelas costas', async () => {
    const p = probes({ probeApi: lenta(30_000) });
    const { result } = renderHook(() => useDataSource(p));

    await avançar(PROBE_TIMEOUT_MS + 10);
    expect(result.current.source).toBe('demo');

    // o que chegaria aos 30 s já foi abortado; a tela não pode pular para live
    await avançar(30_000);
    expect(result.current.source).toBe('demo');
  });
});

describe('recuperação em segundo plano', () => {
  it('segue perguntando a cada 15 s enquanto mostra o instantâneo', async () => {
    const probeApi = vi.fn(caiu);
    const p = probes({ probeApi });
    renderHook(() => useDataSource(p));

    await avançar(10);
    expect(probeApi, 'sondagem inicial').toHaveBeenCalledTimes(1);

    await avançar(RETRY_INTERVAL_MS);
    expect(probeApi).toHaveBeenCalledTimes(2);

    await avançar(RETRY_INTERVAL_MS * 2);
    expect(probeApi).toHaveBeenCalledTimes(4);
  });

  it('avisa quando a API volta, mas não troca a fonte sozinho', async () => {
    const probeApi = vi.fn().mockRejectedValueOnce(new Error('caiu')).mockResolvedValue(ok);
    const p = probes({ probeApi });
    const { result } = renderHook(() => useDataSource(p));

    await avançar(10);
    expect(result.current.source).toBe('demo');
    expect(result.current.apiRecovered).toBe(false);

    await avançar(RETRY_INTERVAL_MS);
    expect(result.current.apiRecovered, 'a API voltou').toBe(true);
    // números mudando debaixo de quem lê é pior que números velhos e rotulados
    expect(result.current.source, 'a tela continua no instantâneo').toBe('demo');
  });

  it('para de perguntar depois que a API volta', async () => {
    const probeApi = vi.fn().mockRejectedValueOnce(new Error('caiu')).mockResolvedValue(ok);
    const p = probes({ probeApi });
    renderHook(() => useDataSource(p));

    await avançar(10);
    await avançar(RETRY_INTERVAL_MS);
    const chamadas = probeApi.mock.calls.length;

    await avançar(RETRY_INTERVAL_MS * 3);
    expect(probeApi.mock.calls.length).toBe(chamadas);
  });

  it('troca a tela inteira para a API quando a pessoa pede', async () => {
    const probeApi = vi.fn().mockRejectedValueOnce(new Error('caiu')).mockResolvedValue(ok);
    const p = probes({ probeApi });
    const { result } = renderHook(() => useDataSource(p));

    await avançar(10);
    await avançar(RETRY_INTERVAL_MS);
    expect(result.current.apiRecovered).toBe(true);

    act(() => {
      result.current.useLive();
    });

    expect(result.current.source).toBe('live');
    expect(result.current.apiRecovered, 'a faixa some junto').toBe(false);
  });

  it('não fica perguntando quando a fonte já é a API', async () => {
    const probeApi = vi.fn().mockResolvedValue(ok);
    const p = probes({ probeApi });
    renderHook(() => useDataSource(p));

    await avançar(10);
    await avançar(RETRY_INTERVAL_MS * 3);
    expect(probeApi).toHaveBeenCalledTimes(1);
  });
});

describe('ciclo de vida', () => {
  it('aborta as sondagens ao desmontar', async () => {
    const probeApi = vi.fn((signal?: AbortSignal) => {
      expect(signal?.aborted).toBe(false);
      return new Promise<HealthResponse>(() => undefined);
    });

    const p = probes({ probeApi });
    const { unmount } = renderHook(() => useDataSource(p));
    const signal = probeApi.mock.calls[0]?.[0];

    unmount();
    expect(signal?.aborted).toBe(true);
    await avançar(RETRY_INTERVAL_MS * 2);
  });

  it('resolve uma vez só, e não a cada render', async () => {
    const probeApi = vi.fn(caiu);
    const p = probes({ probeApi });
    const { rerender } = renderHook(() => useDataSource(p));

    await avançar(10);
    rerender();
    rerender();

    expect(probeApi).toHaveBeenCalledTimes(1);
  });
});
