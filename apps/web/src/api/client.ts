import type { HealthResponse } from '@mp1/shared';

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:3333';

/** Consulta `GET /health` da API. */
export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch(`${API_URL}/health`, signal ? { signal } : {});
  if (!response.ok) {
    throw new Error(`A API respondeu ${String(response.status)} em /health`);
  }
  return (await response.json()) as HealthResponse;
}
