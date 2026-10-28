import type {
  AssetStatus,
  HealthResponse,
  IsoLimits,
  MachineAsset,
  RemainingLife,
  VibrationBucket,
  VibrationBucketSize,
} from '@mp1/shared';

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:3333';

/** Resposta de `GET /assets/:tag`. */
export interface AssetDetail {
  readonly asset: MachineAsset;
  readonly status: AssetStatus;
  readonly limits: IsoLimits | null;
}

/** Resposta de `GET /assets/:tag/vibration`. */
export interface VibrationSeries {
  readonly assetTag: string;
  readonly from: string;
  readonly to: string;
  readonly bucket: VibrationBucketSize;
  readonly limits: IsoLimits | null;
  readonly buckets: VibrationBucket[];
  readonly remainingLife: RemainingLife | null;
}

/** Erro de API que carrega o status, para quem chama poder distinguir 404 de queda. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, signal ? { signal } : {});

  if (!response.ok) {
    // a API manda `message` nos erros; se não vier, o status já diz o bastante
    const detail = await response
      .json()
      .then((body: { message?: string }) => body.message)
      .catch(() => undefined);
    throw new ApiError(response.status, detail ?? `A API respondeu ${String(response.status)}`);
  }

  return (await response.json()) as T;
}

/** Consulta `GET /health` da API. */
export function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return request<HealthResponse>('/health', signal);
}

export function fetchAsset(tag: string, signal?: AbortSignal): Promise<AssetDetail> {
  return request<AssetDetail>(`/assets/${encodeURIComponent(tag)}`, signal);
}

export interface VibrationQuery {
  readonly bucket?: VibrationBucketSize;
  readonly from?: Date;
  readonly to?: Date;
}

export function fetchVibration(
  tag: string,
  query: VibrationQuery = {},
  signal?: AbortSignal,
): Promise<VibrationSeries> {
  const params = new URLSearchParams();
  if (query.bucket) params.set('bucket', query.bucket);
  if (query.from) params.set('from', query.from.toISOString());
  if (query.to) params.set('to', query.to.toISOString());

  const search = params.size > 0 ? `?${params.toString()}` : '';
  return request<VibrationSeries>(`/assets/${encodeURIComponent(tag)}/vibration${search}`, signal);
}
