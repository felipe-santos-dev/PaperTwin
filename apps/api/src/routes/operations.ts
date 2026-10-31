import type { NoteStatus } from '@mp1/shared';
import type { FastifyInstance } from 'fastify';

import { notFound } from './errors';
import {
  getNoteSchema,
  getReelSchema,
  getRoundSchema,
  getShiftSchema,
  listGradeChangesSchema,
  listNotesSchema,
  listReelsSchema,
  listRoundsSchema,
  listSetpointChangesSchema,
  listShiftsSchema,
  listWebBreaksSchema,
} from './process-route-schemas';

/**
 * As rotas das entidades de operação.
 *
 * São leitura, com uma exceção que não está aqui: a escrita de setpoint, que
 * mora nas rotas de processo porque é lá que a malha está. Reconhecer alarme
 * também é escrita, e mora nas rotas de alarme.
 *
 * Toda rota começa por `ensureCurrent`, porque a entidade que falta pode ser a
 * da bobina que fechou enquanto a API dormia — as entidades são colhidas pela
 * retomada, não existem antes dela.
 */

/** Filtros de janela, quando a rota aceita. */
interface WindowQuery {
  from?: string;
  to?: string;
  limit?: number;
}

const windowOf = (query: WindowQuery) => ({
  ...(query.from ? { from: new Date(query.from) } : {}),
  ...(query.to ? { to: new Date(query.to) } : {}),
  ...(query.limit === undefined ? {} : { limit: query.limit }),
});

export async function operationRoutes(app: FastifyInstance): Promise<void> {
  // ------------------------------------------------------------- turno

  app.get<{ Querystring: WindowQuery }>(
    '/shifts',
    { schema: listShiftsSchema },
    async (request) => {
      await app.simulation.ensureCurrent();
      const shifts = await app.db.listShifts(windowOf(request.query));
      return { count: shifts.length, shifts };
    },
  );

  /**
   * Um turno com tudo que aconteceu nele.
   *
   * Cinco consultas numa rota, e não cinco rotas: a tela de Turno mostra as
   * cinco coisas juntas, e cinco idas ao servidor num host que acabou de acordar
   * seriam cinco esperas.
   */
  app.get<{ Params: { id: string } }>(
    '/shifts/:id',
    { schema: getShiftSchema },
    async (request, reply) => {
      await app.simulation.ensureCurrent();

      const shift = await app.db.findShift(request.params.id);
      if (!shift) {
        return reply.code(404).send(notFound(`O turno ${request.params.id} não existe`));
      }

      const [reels, webBreaks, gradeChanges, rounds] = await Promise.all([
        app.db.listReels({ shiftId: shift.id, limit: 100 }),
        app.db.listWebBreaks({ shiftId: shift.id, limit: 100 }),
        app.db.listGradeChanges({ shiftId: shift.id, limit: 100 }),
        app.db.listRounds({ shiftId: shift.id, limit: 100 }),
      ]);

      return { shift, reels, webBreaks, gradeChanges, rounds };
    },
  );

  // ------------------------------------------------------ bobina jumbo

  app.get<{ Querystring: { shiftId?: string; limit?: number } }>(
    '/reels',
    { schema: listReelsSchema },
    async (request) => {
      await app.simulation.ensureCurrent();
      const reels = await app.db.listReels({
        ...(request.query.shiftId ? { shiftId: request.query.shiftId } : {}),
        ...(request.query.limit === undefined ? {} : { limit: request.query.limit }),
      });
      return { count: reels.length, reels };
    },
  );

  app.get<{ Params: { number: number } }>(
    '/reels/:number',
    { schema: getReelSchema },
    async (request, reply) => {
      await app.simulation.ensureCurrent();
      const reel = await app.db.findReel(request.params.number);
      if (!reel) {
        return reply
          .code(404)
          .send(notFound(`A bobina ${String(request.params.number)} não existe`));
      }
      return { reel };
    },
  );

  // --------------------------------------------------- quebra de folha

  app.get<{ Querystring: WindowQuery & { shiftId?: string } }>(
    '/web-breaks',
    { schema: listWebBreaksSchema },
    async (request) => {
      await app.simulation.ensureCurrent();
      const webBreaks = await app.db.listWebBreaks({
        ...windowOf(request.query),
        ...(request.query.shiftId ? { shiftId: request.query.shiftId } : {}),
      });
      return { count: webBreaks.length, webBreaks };
    },
  );

  // ------------------------------------------------ troca de gramatura

  app.get<{ Querystring: WindowQuery & { shiftId?: string } }>(
    '/grade-changes',
    { schema: listGradeChangesSchema },
    async (request) => {
      await app.simulation.ensureCurrent();
      const gradeChanges = await app.db.listGradeChanges({
        ...windowOf(request.query),
        ...(request.query.shiftId ? { shiftId: request.query.shiftId } : {}),
      });
      return { count: gradeChanges.length, gradeChanges };
    },
  );

  // ------------------------------------------------------------- ronda

  app.get<{ Querystring: { shiftId?: string; limit?: number } }>(
    '/rounds',
    { schema: listRoundsSchema },
    async (request) => {
      await app.simulation.ensureCurrent();
      const rounds = await app.db.listRounds({
        ...(request.query.shiftId ? { shiftId: request.query.shiftId } : {}),
        ...(request.query.limit === undefined ? {} : { limit: request.query.limit }),
      });
      return { count: rounds.length, rounds };
    },
  );

  app.get<{ Params: { id: string } }>(
    '/rounds/:id',
    { schema: getRoundSchema },
    async (request, reply) => {
      await app.simulation.ensureCurrent();
      const round = await app.db.findRound(request.params.id);
      if (!round) {
        return reply.code(404).send(notFound(`A ronda ${request.params.id} não existe`));
      }
      return { round };
    },
  );

  // --------------------------------------------- nota de manutenção

  app.get<{ Querystring: { status?: NoteStatus; assetTag?: string; limit?: number } }>(
    '/notes',
    { schema: listNotesSchema },
    async (request) => {
      await app.simulation.ensureCurrent();
      const notes = await app.db.listMaintenanceNotes({
        ...(request.query.status ? { status: request.query.status } : {}),
        ...(request.query.assetTag ? { assetTag: request.query.assetTag } : {}),
        ...(request.query.limit === undefined ? {} : { limit: request.query.limit }),
      });
      return { count: notes.length, notes };
    },
  );

  app.get<{ Params: { number: string } }>(
    '/notes/:number',
    { schema: getNoteSchema },
    async (request, reply) => {
      await app.simulation.ensureCurrent();
      const note = await app.db.findMaintenanceNote(request.params.number);
      if (!note) {
        return reply.code(404).send(notFound(`A nota ${request.params.number} não existe`));
      }
      return { note };
    },
  );

  // ------------------------------------------- alteração de setpoint

  app.get<{ Querystring: { tag?: string; limit?: number } }>(
    '/setpoint-changes',
    { schema: listSetpointChangesSchema },
    async (request) => {
      await app.simulation.ensureCurrent();
      const changes = await app.db.listSetpointChanges({
        ...(request.query.tag ? { tag: request.query.tag } : {}),
        ...(request.query.limit === undefined ? {} : { limit: request.query.limit }),
      });
      return { count: changes.length, changes };
    },
  );
}
