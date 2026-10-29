import { useEffect, useState } from 'react';
import type { HealthResponse } from '@mp1/shared';

/**
 * De onde os dados vêm nesta sessão.
 *
 * - `checking` — ainda perguntando.
 * - `live` — a API respondeu.
 * - `demo` — a API não respondeu, mas o instantâneo estático está disponível.
 * - `offline` — nenhum dos dois.
 *
 * A decisão é tomada **uma vez**, ao abrir, e não por requisição. Alternar
 * entre API e instantâneo no meio da navegação daria uma tela em que metade dos
 * números é ao vivo e a outra metade é de ontem, sem nada indicando qual é qual.
 */
export type DataSource = 'checking' | 'live' | 'demo' | 'offline';

export interface DataSourceProbes {
  readonly probeApi: (signal?: AbortSignal) => Promise<HealthResponse>;
  readonly probeDemo: (signal?: AbortSignal) => Promise<HealthResponse>;
}

export function useDataSource(probes: DataSourceProbes): DataSource {
  const [source, setSource] = useState<DataSource>('checking');

  useEffect(() => {
    const controller = new AbortController();

    const resolve = async (): Promise<DataSource> => {
      try {
        const health = await probes.probeApi(controller.signal);
        // uma API que responde mas se diz degradada não serve de fonte
        if (health.status === 'ok') return 'live';
      } catch {
        // sem API: segue para o instantâneo
      }

      if (controller.signal.aborted) return 'checking';

      try {
        await probes.probeDemo(controller.signal);
        return 'demo';
      } catch {
        return 'offline';
      }
    };

    resolve()
      .then((resolved) => {
        if (!controller.signal.aborted) setSource(resolved);
      })
      .catch(() => {
        if (!controller.signal.aborted) setSource('offline');
      });

    return () => {
      controller.abort();
    };
  }, [probes]);

  return source;
}
