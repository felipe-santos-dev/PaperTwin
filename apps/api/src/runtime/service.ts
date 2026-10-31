import { checkSetpoint, historianPoint, processVariable, type SetpointChange } from '@mp1/shared';

import type { Database } from '../db';
import { DEFAULT_SEED, tickTime } from '../simulation/clock';
import { cascadePairs, isCascadeSlave } from '../simulation/process-engine';
import { catchUp, type CatchupOptions, type CatchupReport } from './catchup';

/**
 * O serviço que as rotas enxergam.
 *
 * Toda rota de dado ao vivo começa com a mesma pergunta — "a simulação está em
 * dia?" — e o jeito errado de responder é cada rota chamar a retomada. Com três
 * requisições simultâneas numa API que acabou de acordar, três retomadas
 * rodariam o mesmo intervalo em paralelo, gravando as mesmas linhas três vezes e
 * gastando três vezes o CPU de um host que tem 512 MB.
 *
 * Então a retomada é **deduplicada e represada**:
 *
 * - **deduplicada**: se já há uma em andamento, quem chega espera a mesma
 *   promessa em vez de abrir outra;
 * - **represada**: logo depois de uma retomada, as próximas chamadas devolvem o
 *   último relatório sem ir ao banco, pelo intervalo de uma varredura. Rodar de
 *   novo meio segundo depois não acrescentaria nenhum passo.
 *
 * O resultado é que a primeira requisição depois de acordar paga os três
 * segundos e todas as outras pegam o resultado dela.
 */

/** Quanto tempo um relatório vale antes de valer a pena retomar de novo. */
export const FRESH_FOR_MS = 5000;

export interface SimulationService {
  /** Garante que a simulação chegou até agora e devolve o relatório. */
  ensureCurrent(now?: Date): Promise<CatchupReport>;
  /** O último relatório, sem retomar. `null` antes da primeira vez. */
  lastReport(): CatchupReport | null;
  /**
   * Escreve um setpoint, com auditoria.
   *
   * Recusa pelo catálogo — tag desconhecida, medição em vez de malha, fora da
   * faixa de operação, sem motivo — e, quando aceita, grava o registro de
   * auditoria com o valor anterior **lido pelo servidor**.
   */
  writeSetpoint(request: SetpointRequest): Promise<SetpointResult>;
}

export interface SetpointRequest {
  readonly tag: string;
  readonly value: number;
  readonly reason: string;
  readonly changedBy: string;
  readonly now?: Date;
}

export interface SetpointResult {
  readonly ok: boolean;
  /** O que recusou, no vocabulário de `@mp1/shared`; `null` quando aceitou. */
  readonly rejection: string | null;
  readonly message: string | null;
  readonly change: SetpointChange | null;
  /** Faixa de operação do catálogo, para a tela poder mostrar. */
  readonly min: number | null;
  readonly max: number | null;
}

export interface SimulationServiceOptions extends CatchupOptions {
  /** Janela em que um relatório é considerado fresco. */
  readonly freshForMs?: number;
  /**
   * De onde vem "agora".
   *
   * O padrão é o relógio do sistema. Poder trocá-lo não é conveniência de
   * teste: o gerador do instantâneo do modo de demonstração precisa de um
   * instante **fixo**, senão cada build produz um instantâneo de outro momento e
   * os testes de ponta a ponta passam a depender de quando rodaram. Com o
   * relógio vindo de fora, a mesma API serve ao vivo e ao instantâneo.
   */
  readonly clock?: () => Date;
}

export function simulationService(
  db: Database,
  options: SimulationServiceOptions = {},
): SimulationService {
  const seed = options.seed ?? DEFAULT_SEED;
  const freshFor = options.freshForMs ?? FRESH_FOR_MS;
  const clock = options.clock ?? ((): Date => new Date());

  let inFlight: Promise<CatchupReport> | null = null;
  let last: CatchupReport | null = null;
  let lastAt = 0;

  async function run(now: Date): Promise<CatchupReport> {
    const report = await catchUp(db, { ...options, seed, now });
    last = report;
    lastAt = Date.now();
    return report;
  }

  return {
    async ensureCurrent(now = clock()): Promise<CatchupReport> {
      if (inFlight) return inFlight;
      if (last && Date.now() - lastAt < freshFor) return last;

      inFlight = run(now).finally(() => {
        inFlight = null;
      });
      return inFlight;
    },

    lastReport(): CatchupReport | null {
      return last;
    },

    async writeSetpoint(request: SetpointRequest): Promise<SetpointResult> {
      const check = checkSetpoint(request.tag, request.value, request.reason);

      /**
       * A escrava de uma cascata não aceita escrita, e isso não é regra do
       * catálogo.
       *
       * `checkSetpoint` olha o catálogo: a tag existe, é malha, está na faixa,
       * tem motivo. A `PIC-711` passa em tudo isso — e ainda assim não aceita
       * escrita, porque o setpoint dela pertence ao mestre `AIC-903`. É regra de
       * arquitetura de controle, não de faixa, e por isso mora aqui.
       *
       * Recusar é melhor que aceitar e ignorar: aceitar gravaria um registro de
       * auditoria dizendo que alguém mudou um setpoint que o próximo passo
       * sobrescreveria sem aviso.
       */
      if (check.ok && isCascadeSlave(request.tag)) {
        const master = cascadePairs().find((pair) => pair.mv === request.tag)?.pv ?? '';
        return {
          ok: false,
          rejection: 'escrava-de-cascata',
          message:
            `${request.tag} é a malha escrava da cascata de ${master}: o setpoint dela ` +
            `pertence ao mestre. Escreva em ${master}.`,
          change: null,
          min: check.min,
          max: check.max,
        };
      }

      if (!check.ok) {
        return {
          ok: false,
          rejection: check.rejection,
          message: check.message,
          change: null,
          min: check.min,
          max: check.max,
        };
      }

      const report = await this.ensureCurrent(request.now);
      const changedAt = request.now ?? tickTime(report.toTick);

      /**
       * O valor anterior é lido pelo servidor, e não enviado por quem escreve.
       *
       * Quem escreve não tem como saber se alguém mexeu entre a leitura da tela
       * e o clique. A ordem de preferência é a última escrita registrada e, se
       * nunca houve nenhuma, o setpoint em vigor na rede — que no arranque é o
       * ponto de operação do catálogo.
       */
      const previousWrite = await db.latestSetpointChange(request.tag);
      const previousValue =
        previousWrite?.newValue ??
        report.values.get(request.tag) ??
        processVariable(request.tag)?.target ??
        0;

      const change: SetpointChange = {
        id: `SP-${String(Math.floor(changedAt.getTime() / 1000))}-${request.tag}`,
        tag: request.tag,
        previousValue: Number(previousValue.toFixed(4)),
        newValue: request.value,
        unit: processVariable(request.tag)?.unit ?? '',
        changedBy: request.changedBy,
        changedAt: changedAt.toISOString(),
        reason: request.reason,
      };

      await db.insertSetpointChange(change);

      /**
       * A escrita só tem efeito se entrar no estado gravado.
       *
       * A rede é remontada do estado a cada retomada, e o setpoint faz parte
       * dele. Sem isto, a auditoria registraria uma escrita que a simulação
       * nunca viu — o pior dos dois mundos, porque a tela mostraria o registro e
       * o processo não se mexeria.
       */
      const saved = await db.findSimState();
      const state = saved?.state as { setpoints?: Record<string, number> } | null | undefined;

      if (saved && state && typeof state === 'object') {
        await db.saveSimState({
          seed: saved.seed,
          lastTick: saved.lastTick,
          state: { ...state, setpoints: { ...state.setpoints, [request.tag]: request.value } },
          updatedAt: changedAt,
        });
      }

      return {
        ok: true,
        rejection: null,
        message: null,
        change,
        min: check.min,
        max: check.max,
      };
    },
  };
}

/** O ponto do historiador de uma tag, ou `null` — para as rotas resolverem. */
export function pointIdOf(tag: string): number | null {
  return historianPoint(tag)?.pointId ?? null;
}
