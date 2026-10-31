import {
  ALARM_FLOOD_THRESHOLD,
  ALARM_FLOOD_WINDOW_S,
  MAX_SHELVE_HOURS,
  type AlarmPriority,
  type AlarmState,
} from '@mp1/shared';
import type { FastifyInstance } from 'fastify';

import { conflict, notFound, unprocessable } from './errors';
import {
  acknowledgeAlarmSchema,
  listAlarmsSchema,
  shelveAlarmSchema,
} from './process-route-schemas';

/**
 * As rotas de alarme.
 *
 * O alarme é a única entidade da Fase 5 que aceita escrita vinda de fora além do
 * setpoint — e as duas escritas que ele aceita, reconhecer e engavetar, são as
 * que a ISA-18.2 define como ação de operador.
 */

export async function alarmRoutes(app: FastifyInstance): Promise<void> {
  app.get<{
    Querystring: {
      state?: AlarmState;
      priority?: AlarmPriority;
      tag?: string;
      needsAction?: boolean;
      from?: string;
      to?: string;
      limit?: number;
    };
  }>('/alarms', { schema: listAlarmsSchema }, async (request) => {
    await app.simulation.ensureCurrent();

    const query = request.query;
    const alarms = await app.db.listAlarms({
      ...(query.state ? { state: query.state } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.tag ? { tag: query.tag } : {}),
      ...(query.needsAction === undefined ? {} : { needsAction: query.needsAction }),
      ...(query.from ? { from: new Date(query.from) } : {}),
      ...(query.to ? { to: new Date(query.to) } : {}),
      ...(query.limit === undefined ? {} : { limit: query.limit }),
    });

    /**
     * A contagem de inundação vai na resposta, e não numa rota própria.
     *
     * Quem está olhando a lista de alarmes é exatamente quem precisa saber que a
     * lista está inundada — e uma segunda requisição para descobrir isso
     * chegaria depois de a tela já ter desenhado quarenta linhas.
     */
    const now = new Date();
    const inFloodWindow = await app.db.countAlarmsInWindow(
      new Date(now.getTime() - ALARM_FLOOD_WINDOW_S * 1000),
      now,
    );

    return {
      count: alarms.length,
      floodWindowS: ALARM_FLOOD_WINDOW_S,
      floodThreshold: ALARM_FLOOD_THRESHOLD,
      inFloodWindow,
      flooding: inFloodWindow > ALARM_FLOOD_THRESHOLD,
      alarms,
    };
  });

  /**
   * Reconhecer.
   *
   * O repositório devolve `null` tanto quando o alarme não existe quanto quando
   * ele já havia sido reconhecido, porque a leitura e a escrita acontecem no
   * mesmo comando — e é isso que impede dois cliques simultâneos de gravar dois
   * reconhecimentos. Aqui os dois casos são separados por uma segunda consulta,
   * porque para quem chamou eles são bem diferentes: 404 é "esse alarme não
   * existe", 409 é "alguém chegou antes de você".
   */
  app.post<{ Params: { id: string }; Body: { acknowledgedBy: string } }>(
    '/alarms/:id/ack',
    { schema: acknowledgeAlarmSchema },
    async (request, reply) => {
      const acknowledged = await app.db.acknowledgeAlarm(
        request.params.id,
        request.body.acknowledgedBy,
        new Date(),
      );

      if (acknowledged) return { alarm: acknowledged };

      const existing = await app.db.findAlarm(request.params.id);
      if (!existing) {
        return reply.code(404).send(notFound(`O alarme ${request.params.id} não existe`));
      }

      return reply
        .code(409)
        .send(
          conflict(
            `O alarme ${request.params.id} já foi reconhecido por ` +
              `${existing.acknowledgedBy ?? 'outro operador'}`,
          ),
        );
    },
  );

  /**
   * Engavetar.
   *
   * O prazo tem teto de um turno, e o teto é recusado em vez de silenciosamente
   * cortado: quem pediu doze horas precisa saber que não vai ter doze horas, em
   * vez de descobrir quando o alarme voltar no meio do turno seguinte.
   */
  app.post<{ Params: { id: string }; Body: { shelvedBy: string; hours: number } }>(
    '/alarms/:id/shelve',
    { schema: shelveAlarmSchema },
    async (request, reply) => {
      if (request.body.hours > MAX_SHELVE_HOURS) {
        return reply
          .code(422)
          .send(
            unprocessable(
              `O engavetamento tem teto de ${String(MAX_SHELVE_HOURS)} h, um turno: uma gaveta ` +
                'que sobrevive à troca de turno esconde o alarme de quem assume.',
            ),
          );
      }

      const until = new Date(Date.now() + request.body.hours * 3_600_000);
      const shelved = await app.db.shelveAlarm(request.params.id, request.body.shelvedBy, until);

      if (!shelved) {
        return reply.code(404).send(notFound(`O alarme ${request.params.id} não existe`));
      }

      return { alarm: shelved };
    },
  );

  /** Desengavetar antes do prazo. */
  app.post<{ Params: { id: string } }>(
    '/alarms/:id/unshelve',
    {
      schema: {
        tags: ['Alarmes'],
        summary: 'Desengaveta um alarme antes do prazo',
        params: {
          type: 'object',
          properties: { id: { type: 'string', minLength: 1 } },
          required: ['id'],
        },
        response: {
          200: { type: 'object', properties: { alarm: { $ref: 'Alarm' } }, required: ['alarm'] },
          404: { $ref: 'Error' },
        },
      },
    },
    async (request, reply) => {
      const alarm = await app.db.unshelveAlarm(request.params.id);
      if (!alarm) {
        return reply.code(404).send(notFound(`O alarme ${request.params.id} não existe`));
      }
      return { alarm };
    },
  );
}
