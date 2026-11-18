import type { EngineState, WhatIfOptions, WhatIfResult } from '@mp1/shared/simulation';

import { ApiError } from './client';
import type { WhatIfJob, WhatIfReply } from './whatif-worker';

/**
 * O "e se" no navegador, para quando não há API.
 *
 * O estado do motor vem do instantâneo (`demo/sim-state.json`) e a conta roda
 * num Web Worker com o **mesmo** `runWhatIf` do servidor. É isso que permite o
 * teste que compara as duas respostas: não há duas implementações para
 * divergir, há uma rodando em dois lugares.
 */

export interface WhatIfResponse extends WhatIfResult {
  readonly ts: string;
  /** No navegador é sempre o estado do instantâneo. */
  readonly fromSavedState: boolean;
}

const DEMO_STATE = `${import.meta.env.BASE_URL}demo/sim-state.json`;

let cached: Promise<EngineState> | null = null;

/** O estado do instantâneo, baixado uma vez por sessão. */
async function snapshotState(signal?: AbortSignal): Promise<EngineState> {
  cached ??= (async () => {
    const response = await fetch(DEMO_STATE, signal ? { signal } : {});
    if (!response.ok) {
      throw new ApiError(
        response.status,
        'O instantâneo não tem o estado do motor; sem ele não dá para prever.',
      );
    }
    return (await response.json()) as EngineState;
  })();

  try {
    return await cached;
  } catch (error) {
    // uma falha não pode envenenar a sessão inteira
    cached = null;
    throw error;
  }
}

/**
 * Roda a previsão no navegador.
 *
 * O worker é criado por chamada e encerrado no fim: a conta dura menos de um
 * segundo, e um worker vivo por horas para ser usado duas vezes é memória
 * parada.
 */
export async function runWhatIfInBrowser(
  options: WhatIfOptions,
  signal?: AbortSignal,
): Promise<WhatIfResponse> {
  const state = await snapshotState(signal);
  const worker = new Worker(new URL('./whatif-worker.ts', import.meta.url), { type: 'module' });

  try {
    const result = await new Promise<WhatIfResult>((resolve, reject) => {
      const abort = () => {
        reject(new ApiError(499, 'Previsão cancelada.'));
      };
      signal?.addEventListener('abort', abort, { once: true });

      worker.onmessage = (event: MessageEvent<WhatIfReply>) => {
        signal?.removeEventListener('abort', abort);
        if (event.data.ok) resolve(event.data.result);
        else reject(new ApiError(400, event.data.message));
      };
      worker.onerror = (event) => {
        signal?.removeEventListener('abort', abort);
        reject(new ApiError(500, event.message || 'O worker da previsão falhou.'));
      };

      const job: WhatIfJob = { state, options };
      worker.postMessage(job);
    });

    return {
      ...result,
      ts: new Date().toISOString(),
      fromSavedState: true,
    };
  } finally {
    worker.terminate();
  }
}
