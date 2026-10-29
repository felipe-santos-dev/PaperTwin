import type { HealthResponse } from '@mp1/shared';
import { ApiError, type AssetDetail, type VibrationSeries } from './client';

/**
 * O espelho estático da API, para quando ela não está no ar.
 *
 * Os arquivos em `public/demo/` são gerados no build pela própria API rodando
 * contra o PGlite (`@mp1/api demo:data`), então têm exatamente o formato das
 * respostas — o que permite trocar a origem dos dados sem tocar no resto da
 * aplicação.
 *
 * O que o modo de demonstração **não** faz é fingir ser a API: ele serve um
 * instantâneo, sempre a mesma janela de 72 h, e a faixa no topo da tela diz
 * isso a quem está olhando.
 */

/** `BASE_URL` já vem com a barra final; no Pages vale `/PaperTwin/`. */
const DEMO_BASE = `${import.meta.env.BASE_URL}demo`;

/**
 * Um servidor estático responde a um caminho inexistente com a página de erro,
 * ou até com o `index.html`, e `response.ok` continua verdadeiro. Sem conferir
 * a forma do corpo, uma página HTML viraria "dados" e quebraria lá na frente,
 * longe da causa.
 */
function ensureShape<T>(body: unknown, required: readonly string[], path: string): T {
  if (typeof body !== 'object' || body === null) {
    throw new ApiError(502, `Resposta de demonstração inválida em ${path}`);
  }

  const missing = required.filter((key) => !(key in body));
  if (missing.length > 0) {
    throw new ApiError(502, `Resposta de demonstração sem ${missing.join(', ')} em ${path}`);
  }

  return body as T;
}

async function loadDemo<T>(
  path: string,
  required: readonly string[],
  signal?: AbortSignal,
): Promise<T> {
  const url = `${DEMO_BASE}${path}`;
  const response = await fetch(url, signal ? { signal } : {});

  if (!response.ok) {
    throw new ApiError(response.status, `Demonstração indisponível (${String(response.status)})`);
  }

  return ensureShape<T>(await response.json(), required, path);
}

export function fetchDemoHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return loadDemo<HealthResponse>('/health.json', ['status', 'service'], signal);
}

export function fetchDemoAsset(tag: string, signal?: AbortSignal): Promise<AssetDetail> {
  return loadDemo<AssetDetail>(
    `/assets/${encodeURIComponent(tag)}.json`,
    ['asset', 'status', 'limits'],
    signal,
  );
}

export function fetchDemoVibration(
  tag: string,
  _query?: unknown,
  signal?: AbortSignal,
): Promise<VibrationSeries> {
  // o instantâneo tem uma janela só; `from`, `to` e `bucket` não se aplicam
  return loadDemo<VibrationSeries>(
    `/assets/${encodeURIComponent(tag)}/vibration.json`,
    ['assetTag', 'buckets', 'limits'],
    signal,
  );
}
