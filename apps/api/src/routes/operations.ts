import {
  noteFromSuggestion,
  type NotePriority,
  type NoteStatus,
  type SuggestionStatus,
} from '@mp1/shared';
import type { FastifyInstance } from 'fastify';

import { conflict, notFound } from './errors';
import {
  confirmNoteSuggestionSchema,
  dismissNoteSuggestionSchema,
  listLabResultsSchema,
  listNoteSuggestionsSchema,
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
  getBreakReplaySchema,
} from './process-route-schemas';
import { replayOf } from '../runtime/break-replay';
import { noteNumberFor } from '../runtime/entities';

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

  /**
   * O replay de uma quebra.
   *
   * Quem investiga uma parada quer três coisas ao mesmo tempo: o que se mexeu
   * primeiro, como as curvas andaram e o que mais aconteceu no período. Vão
   * juntas numa resposta só — uma tela, uma ida ao servidor.
   *
   * A rota **não escreve nada**: é a mesma conta que a retomada já fez ao colher
   * a entidade, refeita sobre as séries para a tela poder desenhá-las.
   */
  app.get<{ Params: { id: string } }>(
    '/web-breaks/:id/replay',
    { schema: getBreakReplaySchema },
    async (request, reply) => {
      await app.simulation.ensureCurrent();

      const webBreak = await app.db.findWebBreak(request.params.id);
      if (!webBreak) {
        return reply.code(404).send(notFound(`A quebra ${request.params.id} não existe`));
      }

      return replayOf(app.db, webBreak);
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

  // ------------------------------------------- ensaio de laboratório

  app.get<{
    Querystring: { tag?: string; reelNumber?: number; from?: string; to?: string; limit?: number };
  }>('/lab-results', { schema: listLabResultsSchema }, async (request) => {
    await app.simulation.ensureCurrent();
    const results = await app.db.listLabResults({
      ...windowOf(request.query),
      ...(request.query.tag ? { tag: request.query.tag } : {}),
      ...(request.query.reelNumber === undefined ? {} : { reelNumber: request.query.reelNumber }),
    });
    return { count: results.length, results };
  });

  // ------------------------------------------------- nota sugerida

  app.get<{ Querystring: { status?: SuggestionStatus; assetTag?: string; limit?: number } }>(
    '/note-suggestions',
    { schema: listNoteSuggestionsSchema },
    async (request) => {
      await app.simulation.ensureCurrent();
      const suggestions = await app.db.listNoteSuggestions({
        ...(request.query.status ? { status: request.query.status } : {}),
        ...(request.query.assetTag ? { assetTag: request.query.assetTag } : {}),
        ...(request.query.limit === undefined ? {} : { limit: request.query.limit }),
      });
      return { count: suggestions.length, suggestions };
    },
  );

  /**
   * Confirmar: a sugestão vira nota aberta.
   *
   * O número da nota sai do **mancal e do início da tendência**, e não do
   * instante do clique: confirmar é uma decisão sobre um episódio de
   * degradação, e derivar o número dele mantém a propriedade que o resto do
   * gêmeo tem — reexecutar não cria um segundo registro do mesmo fato.
   *
   * A escrita é guardada por `status = 'sugerida'` no `where`, então o segundo
   * clique não decide nada e leva 409.
   */
  app.post<{
    Params: { id: string };
    Body: {
      confirmedBy?: string;
      reason?: string;
      symptom?: string;
      priority?: NotePriority;
      requiresShutdown?: boolean;
    };
  }>(
    '/note-suggestions/:id/confirm',
    { schema: confirmNoteSuggestionSchema },
    async (request, reply) => {
      await app.simulation.ensureCurrent();

      const suggestion = await app.db.findNoteSuggestion(request.params.id);
      if (!suggestion) {
        return reply.code(404).send(notFound(`A sugestão ${request.params.id} não existe`));
      }
      if (suggestion.status !== 'sugerida') {
        return reply
          .code(409)
          .send(conflict(`A sugestão ${suggestion.id} já foi ${suggestion.status}`));
      }

      const at = new Date();
      const note = noteFromSuggestion(
        suggestion,
        noteNumberFor(suggestion.assetTag, suggestion.trendStart),
        at.toISOString(),
        {
          ...(request.body.symptom === undefined ? {} : { symptom: request.body.symptom }),
          ...(request.body.priority === undefined ? {} : { priority: request.body.priority }),
          ...(request.body.requiresShutdown === undefined
            ? {}
            : { requiresShutdown: request.body.requiresShutdown }),
        },
      );

      const done = await app.db.confirmNoteSuggestion({
        id: suggestion.id,
        note,
        by: request.body.confirmedBy ?? 'operador',
        at,
        reason: request.body.reason ?? null,
      });

      if (!done) {
        return reply.code(409).send(conflict(`A sugestão ${suggestion.id} já foi decidida`));
      }

      return done;
    },
  );

  /** Dispensar: com motivo, que é o que faz a linha servir de auditoria. */
  app.post<{ Params: { id: string }; Body: { reason: string; dismissedBy?: string } }>(
    '/note-suggestions/:id/dismiss',
    { schema: dismissNoteSuggestionSchema },
    async (request, reply) => {
      await app.simulation.ensureCurrent();

      const suggestion = await app.db.dismissNoteSuggestion({
        id: request.params.id,
        by: request.body.dismissedBy ?? 'operador',
        at: new Date(),
        reason: request.body.reason,
      });

      if (suggestion) return { suggestion };

      const existing = await app.db.findNoteSuggestion(request.params.id);
      if (!existing) {
        return reply.code(404).send(notFound(`A sugestão ${request.params.id} não existe`));
      }
      return reply.code(409).send(conflict(`A sugestão ${existing.id} já foi ${existing.status}`));
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
