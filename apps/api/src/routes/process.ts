import {
  ENGINE_STATE_VERSION,
  isCascadeSlave,
  processEngine,
  runWhatIf,
  tickAt,
  tickTime,
  type EngineState,
  type LoopMode,
} from '@mp1/shared/simulation';
import {
  historianPoint,
  PROCESS_CATALOG,
  processVariable,
  STEAM_GROUPS,
  variablesOfArea,
  type ProcessVariable,
} from '@mp1/shared';
import type { FastifyInstance } from 'fastify';

import { reconstructTrend } from '../runtime/reconstruct';
import { notFound, badRequest } from './errors';
import {
  getTagSchema,
  getTagTrendSchema,
  listProcessValuesSchema,
  listSteamGroupsSchema,
  whatIfSchema,
  writeSetpointSchema,
} from './process-route-schemas';

/**
 * As rotas de processo: o que as tags valem agora e o que elas fizeram.
 *
 * Toda rota de valor ao vivo começa por `ensureCurrent`, que garante que a
 * simulação chegou até agora. A primeira requisição depois de a API acordar paga
 * a retomada; as outras pegam o resultado dela, porque o serviço deduplica e
 * represa — veja `runtime/service.ts`.
 */

/** O instante da simulação, que é o fim do último passo processado. */
function stampOf(app: FastifyInstance, toTick: number): string {
  void app;
  return tickTime(toTick).toISOString();
}

/** Monta a resposta de uma tag. */
function tagValue(
  variable: ProcessVariable,
  value: number,
  setpoint: number | null,
  ts: string,
): {
  tag: string;
  value: number;
  unit: string;
  ts: string;
  setpoint: number | null;
} {
  return {
    tag: variable.tag,
    value: Number(value.toFixed(4)),
    unit: variable.unit,
    ts,
    setpoint: setpoint === null ? null : Number(setpoint.toFixed(4)),
  };
}

export async function processRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Os valores atuais.
   *
   * Sem filtro devolve as 320 tags, o que é ~30 kB de JSON — aceitável, e é o
   * que a tela de Processo quer de uma vez. Com `area` ou `group`, só a parte.
   */
  app.get<{ Querystring: { area?: string; group?: string } }>(
    '/process/values',
    { schema: listProcessValuesSchema },
    async (request) => {
      const report = await app.simulation.ensureCurrent();
      const ts = stampOf(app, report.toTick);

      const wanted = request.query.area
        ? variablesOfArea(request.query.area)
        : [...PROCESS_CATALOG];

      const filtered = request.query.group
        ? wanted.filter((variable) => variable.group === request.query.group)
        : wanted;

      const values = filtered
        .map((variable) => {
          const value = report.values.get(variable.tag);
          if (value === undefined) return null;
          return tagValue(variable, value, null, ts);
        })
        .filter((item) => item !== null);

      return { ts, count: values.length, values };
    },
  );

  /** O catálogo de uma tag, com o valor e o setpoint. */
  app.get<{ Params: { tag: string } }>(
    '/process/tags/:tag',
    { schema: getTagSchema },
    async (request, reply) => {
      const variable = processVariable(request.params.tag);
      if (!variable) {
        return reply
          .code(404)
          .send(notFound(`A tag ${request.params.tag} não existe no catálogo de processo`));
      }

      const report = await app.simulation.ensureCurrent();
      const value = report.values.get(variable.tag);
      const ts = stampOf(app, report.toTick);

      return {
        variable,
        value: value === undefined ? null : tagValue(variable, value, null, ts),
        /**
         * Se a tag aceita escrita, e por que não quando não aceita.
         *
         * A tela precisa disso para desabilitar o campo **antes** de o usuário
         * digitar, em vez de recusar depois. Uma medição não tem setpoint; uma
         * escrava de cascata tem, mas quem manda nele é o mestre.
         */
        writable: variable.controlled && !isCascadeSlave(variable.tag),
        notWritableBecause: !variable.controlled
          ? 'medição: não tem setpoint'
          : isCascadeSlave(variable.tag)
            ? 'escrava de cascata: o setpoint pertence ao mestre'
            : null,
        archived: historianPoint(variable.tag) !== null,
      };
    },
  );

  /**
   * A tendência de uma tag.
   *
   * Devolve colunas de mínimo, máximo, primeiro e último — não uma série crua.
   * Uma janela de uma semana tem dezenas de milhares de pontos arquivados e
   * nenhuma tela tem tantos pixels; mandar tudo seria tráfego que o navegador
   * joga fora, e agregar com média apagaria os picos.
   */
  /**
   * A previsão: duas trajetórias do estado de agora, uma com a mudança.
   *
   * `POST` porque o corpo tem uma lista de mudanças, e não porque escreve algo
   * — esta rota **não escreve nada**: nem setpoint, nem arquivo, nem alarme.
   * Quem aplica é a rota de setpoint, com motivo obrigatório, como sempre foi.
   *
   * O estado de partida é o que está gravado, depois de a simulação chegar até
   * agora. Se não houver estado gravado — primeiro arranque —, a previsão sai
   * da rede em regime, e o cabeçalho da resposta diz isso.
   */
  app.post<{
    Body: {
      changes: { tag: string; value: number }[];
      horizonS?: number;
      mode?: LoopMode;
      points?: number;
    };
  }>('/process/what-if', { schema: whatIfSchema }, async (request, reply) => {
    await app.simulation.ensureCurrent();

    const saved = await app.db.findSimState();
    const state =
      saved?.state && (saved.state as { version?: unknown }).version === ENGINE_STATE_VERSION
        ? (saved.state as EngineState)
        : null;

    const engine = state
      ? null
      : processEngine(tickAt(new Date()), { noise: false, loops: request.body.mode ?? 'auto' });
    const início = state ?? engine?.snapshotState();
    if (!início) {
      return reply.code(503).send(notFound('A simulação ainda não tem estado para prever.'));
    }

    try {
      const result = runWhatIf(início, {
        changes: request.body.changes,
        horizonS: request.body.horizonS ?? 600,
        mode: request.body.mode ?? 'auto',
        ...(request.body.points === undefined ? {} : { points: request.body.points }),
      });

      return {
        ...result,
        ts: tickTime(result.fromTick).toISOString(),
        /** Falso quando não havia estado gravado e a rede arrancou em regime. */
        fromSavedState: state !== null,
      };
    } catch (error) {
      return reply.code(400).send(badRequest((error as Error).message));
    }
  });

  app.get<{
    Params: { tag: string };
    Querystring: { from?: string; to?: string; buckets?: number };
  }>('/process/tags/:tag/trend', { schema: getTagTrendSchema }, async (request, reply) => {
    const tag = request.params.tag;
    const variable = processVariable(tag);
    if (!variable) {
      return reply.code(404).send(notFound(`A tag ${tag} não existe no catálogo de processo`));
    }

    await app.simulation.ensureCurrent();

    const to = request.query.to ? new Date(request.query.to) : new Date();
    const from = request.query.from
      ? new Date(request.query.from)
      : new Date(to.getTime() - 3 * 60 * 60 * 1000);

    if (!(from < to)) {
      return reply.code(400).send(badRequest('`from` precisa ser anterior a `to`'));
    }

    /**
     * Quem grava, lê do arquivo; quem não grava, se reconstrói.
     *
     * A autônoma é função pura do passo e a calculada é conta sobre quem já
     * grava — as duas dão a mesma série agora e daqui a uma semana. A resposta
     * tem a mesma forma nos dois casos, de propósito: a tela não deveria saber
     * de onde a série veio.
     */
    const point = historianPoint(tag);
    const trend = point
      ? await app.db.trend({
          pointId: point.pointId,
          from,
          to,
          ...(request.query.buckets === undefined ? {} : { buckets: request.query.buckets }),
        })
      : await reconstructTrend(app.db, {
          tag,
          from,
          to,
          ...(request.query.buckets === undefined ? {} : { buckets: request.query.buckets }),
        });

    return {
      tag: variable.tag,
      unit: variable.unit,
      ...trend,
      // o catálogo da tag vai junto: o gráfico desenha os limites de alarme
      limits: variable.limits,
      target: variable.target,
      /** De onde a série veio, para quem quiser saber: arquivo ou conta. */
      archived: point !== null,
    };
  });

  /**
   * A escrita de setpoint.
   *
   * `PUT` e não `POST` porque o setpoint é um valor com identidade — a tag — e
   * escrever o mesmo valor duas vezes é a mesma coisa que escrever uma. O
   * registro de auditoria que isso gera, por outro lado, não é idempotente: ele
   * é um evento, e dois eventos são dois.
   */
  app.put<{
    Params: { tag: string };
    Body: { value: number; reason: string; changedBy?: string };
  }>('/process/tags/:tag/setpoint', { schema: writeSetpointSchema }, async (request, reply) => {
    const result = await app.simulation.writeSetpoint({
      tag: request.params.tag,
      value: request.body.value,
      reason: request.body.reason,
      changedBy: request.body.changedBy ?? 'operador',
    });

    if (!result.ok) {
      /**
       * Tag desconhecida é 404; o resto é 422.
       *
       * A diferença importa para quem consome: 404 significa "não existe, não
       * tente de novo"; 422 significa "existe, mas este pedido não serve" — e aí
       * a faixa vai na resposta para a tela poder corrigir.
       */
      const code = result.rejection === 'tag-desconhecida' ? 404 : 422;
      return reply.code(code).send({
        statusCode: code,
        error: code === 404 ? 'Not Found' : 'Unprocessable Entity',
        message: result.message ?? 'Escrita recusada',
        rejection: result.rejection,
        min: result.min,
        max: result.max,
      });
    }

    return { change: result.change, min: result.min, max: result.max };
  });

  /**
   * Os grupos de vapor, com as tags resolvidas e o valor de cada uma.
   *
   * É o painel da secagem: seis grupos, cada um com a sua válvula, o seu ΔP de
   * sifões e — nos quatro da pré-secagem — o nível do tanque separador. O G5 e o
   * G6 vêm com nível nulo e a nota explicando por quê.
   */
  app.get('/process/steam-groups', { schema: listSteamGroupsSchema }, async () => {
    const report = await app.simulation.ensureCurrent();
    const ts = stampOf(app, report.toTick);

    const read = (variable: ProcessVariable | null) => {
      if (!variable) return null;
      const value = report.values.get(variable.tag);
      return value === undefined ? null : tagValue(variable, value, null, ts);
    };

    return {
      ts,
      groups: STEAM_GROUPS.map((group) => ({
        id: group.id,
        label: group.label,
        role: group.role,
        section: group.section,
        cylinders: group.cylinders,
        pressure: read(group.pressure),
        siphonDeltaP: read(group.siphonDeltaP),
        condensateLevel: read(group.condensateLevel),
        condensateNote: group.condensateNote,
        division: group.division,
        tagMap: group.tagMap,
      })),
    };
  });
}
