import { useCallback, useEffect, useState } from 'react';
import type { HealthResponse } from '@mp1/shared';

/**
 * De onde os dados vêm nesta sessão.
 *
 * - `checking` — ainda perguntando.
 * - `live` — a API respondeu.
 * - `demo` — a API não respondeu a tempo, mas o instantâneo estático está lá.
 * - `offline` — nenhum dos dois.
 *
 * A decisão é tomada **uma vez**, ao abrir, e não por requisição. Alternar
 * entre API e instantâneo no meio da navegação daria uma tela em que metade dos
 * números é ao vivo e a outra metade é de ontem, sem nada indicando qual é qual.
 *
 * A troca depois existe, mas é **explícita**: quando a API volta, a faixa
 * oferece o botão e a tela inteira muda de fonte de uma vez só.
 */
export type DataSource = 'checking' | 'live' | 'demo' | 'offline';

/**
 * Quanto se espera pela sondagem inicial.
 *
 * Um host gratuito que dorme pode levar meio minuto para acordar. Esperar por
 * ele deixaria a tela em branco todo esse tempo, quando existe um instantâneo
 * pronto para mostrar — então desiste-se rápido e tenta-se de novo por trás.
 */
export const PROBE_TIMEOUT_MS = 4_000;

/** De quanto em quanto tempo se pergunta se a API voltou. */
export const RETRY_INTERVAL_MS = 15_000;

export interface DataSourceProbes {
  readonly probeApi: (signal?: AbortSignal) => Promise<HealthResponse>;
  readonly probeDemo: (signal?: AbortSignal) => Promise<HealthResponse>;
}

export interface DataSourceState {
  readonly source: DataSource;
  /** A API respondeu enquanto a tela mostrava o instantâneo. */
  readonly apiRecovered: boolean;
  /** Troca a tela inteira para a API. */
  readonly useLive: () => void;
}

/**
 * Sonda com prazo. Devolve `false` em erro **e** em estouro de tempo: para quem
 * chama, uma API que demais demora é indistinguível de uma que não responde.
 */
async function probeWithin(
  probe: (signal?: AbortSignal) => Promise<HealthResponse>,
  outer: AbortSignal,
  timeoutMs: number,
): Promise<boolean> {
  const controller = new AbortController();
  const abort = () => {
    controller.abort();
  };

  outer.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, timeoutMs);

  try {
    const health = await probe(controller.signal);
    // uma API que responde mas se diz degradada não é fonte melhor que o instantâneo
    return health.status === 'ok';
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
    outer.removeEventListener('abort', abort);
  }
}

export function useDataSource(probes: DataSourceProbes): DataSourceState {
  const [source, setSource] = useState<DataSource>('checking');
  const [apiRecovered, setApiRecovered] = useState(false);

  const useLive = useCallback(() => {
    setSource('live');
    setApiRecovered(false);
  }, []);

  // resolução inicial
  useEffect(() => {
    const controller = new AbortController();

    const resolve = async (): Promise<DataSource> => {
      if (await probeWithin(probes.probeApi, controller.signal, PROBE_TIMEOUT_MS)) return 'live';
      if (controller.signal.aborted) return 'checking';

      if (await probeWithin(probes.probeDemo, controller.signal, PROBE_TIMEOUT_MS)) return 'demo';
      return 'offline';
    };

    void resolve().then((resolved) => {
      if (!controller.signal.aborted && resolved !== 'checking') setSource(resolved);
    });

    return () => {
      controller.abort();
    };
  }, [probes]);

  /**
   * Enquanto a tela está no instantâneo, segue perguntando por trás.
   *
   * O retorno da API não troca a fonte sozinho: números mudando debaixo de quem
   * está lendo é pior do que números velhos e rotulados. A faixa avisa e a
   * pessoa decide.
   */
  useEffect(() => {
    if (source !== 'demo' || apiRecovered) return;

    const controller = new AbortController();

    const tick = () => {
      void probeWithin(probes.probeApi, controller.signal, PROBE_TIMEOUT_MS).then((up) => {
        if (up && !controller.signal.aborted) setApiRecovered(true);
      });
    };

    const timer = setInterval(tick, RETRY_INTERVAL_MS);

    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [source, apiRecovered, probes]);

  return { source, apiRecovered, useLive };
}
