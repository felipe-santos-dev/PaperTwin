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
  /**
   * Onde a simulação parou, **sem** rodar a retomada.
   *
   * A sonda de liveness não pode reexecutar horas de processo: ela seria o
   * caminho mais caro da API em vez do mais barato, e um balanceador que a
   * chama a cada dez segundos acordaria a simulação sem ninguém olhando.
   * Então aqui vai só a leitura do marcador — uma linha indexada — e o atraso
   * que ela revela.
   *
   * Opcional porque o instantâneo do modo de demonstração foi gerado antes
   * deste campo existir, e um instantâneo antigo não deve quebrar a tela.
   */
  readonly simulation?: SimulationHealth;
}

/** O estado da simulação, como o `/health` o relata. */
export interface SimulationHealth {
  readonly seed: number;
  /** Último passo simulado; `null` se a simulação nunca rodou. */
  readonly lastTick: number | null;
  /** Quando a retomada gravou esse passo; `null` se nunca rodou. */
  readonly lastRunAt: string | null;
  /**
   * Quantos segundos a simulação está atrás de agora.
   *
   * É o número que diz se o desenho está aguentando: num host com tráfego fica
   * em segundos, e num host que dormiu a noite fica em horas — e aí o buraco no
   * histórico é esperado, não defeito.
   */
  readonly behindS: number | null;
}
