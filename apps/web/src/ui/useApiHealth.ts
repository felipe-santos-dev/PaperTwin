import { useEffect, useState } from 'react';
import type { HealthResponse } from '@mp1/shared';

export type ApiState = 'checking' | 'up' | 'down';

/**
 * Consulta a saúde da API uma vez ao montar.
 *
 * Recebe a função de busca em vez de importá-la, para o teste poder observar o
 * estado sem interceptar o `fetch` global.
 */
export function useApiHealth(
  fetchHealth: (signal?: AbortSignal) => Promise<HealthResponse>,
): ApiState {
  const [state, setState] = useState<ApiState>('checking');

  useEffect(() => {
    const controller = new AbortController();

    fetchHealth(controller.signal)
      .then((health) => {
        if (!controller.signal.aborted) setState(health.status === 'ok' ? 'up' : 'down');
      })
      .catch(() => {
        if (!controller.signal.aborted) setState('down');
      });

    return () => {
      controller.abort();
    };
  }, [fetchHealth]);

  return state;
}
