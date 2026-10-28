/** Resposta de `GET /health` da API. Contrato compartilhado com a web. */
export interface HealthResponse {
  readonly status: 'ok' | 'degraded';
  readonly service: 'mp1-twin-api';
  readonly version: string;
  /** Tempo de processo em segundos, arredondado. */
  readonly uptimeS: number;
  /** Qual driver está atrás do repositório. */
  readonly database: 'pglite' | 'postgres';
  /** Falso quando o banco não respondeu — o serviço fica `degraded`. */
  readonly databaseUp: boolean;
}
