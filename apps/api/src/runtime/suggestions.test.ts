import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { DRYER_BEARING_TAGS, type NoteSuggestion } from '@mp1/shared';
import { tickAt } from '@mp1/shared/simulation';

import { buildApp } from '../app';
import type { SqlExecutor } from '../db/executor';
import { DEGRADING_TAG, seedDatabase } from '../db/seed';
import { DRIVERS } from '../db/test-drivers';
import { loadEnv } from '../env';
import { catchUp } from './catchup';

/**
 * O par de testes que a Fase 6 existe para passar.
 *
 * Um mancal degrada de verdade na série — o CS23 do lado comando, o mesmo do
 * design das telas — e **nada** no caminho da regra sabe qual é. Ela lê a série
 * de todos os 72, faz a conta e decide. Se o mancal que degrada não sair com
 * sugestão, a regra não serve; se mais algum sair, ela é um gerador de ordens
 * de serviço, o que é pior.
 *
 * O segundo par é sobre a decisão de alguém: dispensar tem de calar a sugestão,
 * e confirmar tem de virar nota e calar também. Sem isso a fila pediria todo
 * dia a mesma decisão que já foi tomada.
 */

/**
 * Só o PGlite.
 *
 * A suíte roda a semeadura, a retomada e a regra inteira; duplicar isso contra
 * um Postgres remoto custaria minutos sem testar nada que as suítes de
 * repositório já não testem nos dois drivers.
 */
const driver = DRIVERS[0];
if (!driver) throw new Error('nenhum driver de teste disponível');

const SEED = 4242;
const NOW = new Date('2026-06-15T12:00:00Z');
const UMA_HORA = 60 * 60 * 1000;
const LENTO = 180_000;

let app: FastifyInstance;
let sql: SqlExecutor;

beforeAll(async () => {
  const aberto = await driver.openWithSql();
  sql = aberto.sql;
  const db = aberto.db;

  await db.migrate();
  // a série de vibração dos mancais, 72 h terminando em NOW: é dela que a regra
  // lê, e é a mesma que a tela de Mancais desenha
  await seedDatabase(db, { now: NOW });
  await db.saveSimState({
    seed: SEED,
    lastTick: tickAt(new Date(NOW.getTime() - UMA_HORA)),
    updatedAt: new Date(NOW.getTime() - UMA_HORA),
  });

  app = await buildApp(loadEnv({ NODE_ENV: 'test' }), db, { seed: SEED, clock: () => NOW });
  await catchUp(db, { seed: SEED, now: NOW });
}, LENTO);

afterAll(async () => {
  await app.close();
});

const emPé = (): Promise<NoteSuggestion[]> => app.db.listNoteSuggestions({ status: 'sugerida' });

describe('a sugestão que a tendência gera', () => {
  it(
    'o mancal que degrada ganha uma sugestão, e é o único',
    async () => {
      const sugestões = await emPé();

      expect(sugestões).toHaveLength(1);
      expect(sugestões[0]?.assetTag).toBe(DEGRADING_TAG);
      expect(sugestões[0]?.measure).toBe('vibração');
      expect(sugestões[0]?.status).toBe('sugerida');
      expect(sugestões[0]?.noteNumber).toBeNull();
    },
    LENTO,
  );

  it(
    'os outros 71 mancais não geram nada',
    async () => {
      const sugestões = await emPé();
      const outros = DRYER_BEARING_TAGS.filter((m) => m.assetTag !== DEGRADING_TAG);

      expect(outros).toHaveLength(71);
      for (const mancal of outros) {
        expect(sugestões.some((s) => s.assetTag === mancal.assetTag)).toBe(false);
      }
    },
    LENTO,
  );

  it(
    'a sugestão vem preenchida: prioridade, parada e as evidências',
    async () => {
      const sugestão = (await emPé())[0];
      if (!sugestão) throw new Error('nenhuma sugestão em pé');

      // na zona D, a projeção já passou a fronteira: P1 e parada
      expect(sugestão.priority).toBe(1);
      expect(sugestão.requiresShutdown).toBe(true);
      expect(sugestão.symptom).toContain('zona D');
      expect(sugestão.perDay).toBeGreaterThan(0);
      expect(sugestão.samples).toBeGreaterThan(24);

      const kinds = sugestão.evidence.map((item) => item.kind);
      expect(kinds).toContain('tendência');
      // o mancal em zona D tem alarme, e é ele que vai junto na sugestão
      expect(kinds).toContain('alarme');
      expect(sugestão.evidence.find((item) => item.kind === 'tendência')?.ref).toBe('VI-5123B');
    },
    LENTO,
  );

  it(
    'a chave é o mancal e o início da tendência',
    async () => {
      const sugestão = (await emPé())[0];
      if (!sugestão) throw new Error('nenhuma sugestão em pé');

      expect(sugestão.id).toContain(DEGRADING_TAG);
      expect(Date.parse(sugestão.trendStart)).toBeLessThan(NOW.getTime());
      // a janela é de 72 h: o início fica a três dias do instante da conta
      const dias = (NOW.getTime() - Date.parse(sugestão.trendStart)) / (24 * UMA_HORA);
      expect(dias).toBeGreaterThan(2.9);
      expect(dias).toBeLessThan(3.1);
    },
    LENTO,
  );

  it(
    'a rota lista o que o banco tem',
    async () => {
      const response = await app.inject({ method: 'GET', url: '/note-suggestions' });
      const body = response.json() as { count: number; suggestions: NoteSuggestion[] };

      expect(response.statusCode).toBe(200);
      expect(body.count).toBe(1);
      expect(body.suggestions[0]?.assetTag).toBe(DEGRADING_TAG);
    },
    LENTO,
  );

  it(
    'a retomada seguinte não cria uma segunda sugestão para o mesmo mancal',
    async () => {
      await catchUp(app.db, { seed: SEED, now: new Date(NOW.getTime() + 60_000) });
      const sugestões = await app.db.listNoteSuggestions({ assetTag: DEGRADING_TAG });

      expect(sugestões).toHaveLength(1);
    },
    LENTO,
  );
});

/**
 * Dispensar e confirmar, em ordem, no mesmo banco.
 *
 * A ordem é de propósito: dispensar primeiro, conferir que a retomada não
 * desfaz a decisão, apagar a linha dispensada (encanamento de teste, não regra)
 * e então confirmar a sugestão que volta.
 */
describe('a decisão de alguém, e o que a retomada faz com ela', () => {
  it(
    'dispensar sem motivo é recusado',
    async () => {
      const sugestão = (await emPé())[0];
      const response = await app.inject({
        method: 'POST',
        url: `/note-suggestions/${encodeURIComponent(sugestão?.id ?? '')}/dismiss`,
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    },
    LENTO,
  );

  it(
    'dispensada com motivo, ela não volta na retomada seguinte',
    async () => {
      const sugestão = (await emPé())[0];
      if (!sugestão) throw new Error('nenhuma sugestão em pé');

      const response = await app.inject({
        method: 'POST',
        url: `/note-suggestions/${encodeURIComponent(sugestão.id)}/dismiss`,
        payload: { reason: 'mancal já programado para a parada de agosto', dismissedBy: 'Turno B' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as { suggestion: NoteSuggestion };
      expect(body.suggestion.status).toBe('dispensada');
      expect(body.suggestion.reason).toContain('parada de agosto');
      expect(body.suggestion.decidedBy).toBe('Turno B');

      await catchUp(app.db, { seed: SEED, now: new Date(NOW.getTime() + 120_000) });

      expect(await emPé()).toHaveLength(0);
      const dispensadas = await app.db.listNoteSuggestions({ status: 'dispensada' });
      expect(dispensadas).toHaveLength(1);
      expect(dispensadas[0]?.reason).toContain('parada de agosto');
    },
    LENTO,
  );

  it(
    'o segundo clique na dispensa leva 409, e o id desconhecido leva 404',
    async () => {
      const dispensada = (await app.db.listNoteSuggestions({ status: 'dispensada' }))[0];

      const repetido = await app.inject({
        method: 'POST',
        url: `/note-suggestions/${encodeURIComponent(dispensada?.id ?? '')}/dismiss`,
        payload: { reason: 'de novo' },
      });
      expect(repetido.statusCode).toBe(409);

      const inexistente = await app.inject({
        method: 'POST',
        url: '/note-suggestions/SG-0-NADA/dismiss',
        payload: { reason: 'não existe' },
      });
      expect(inexistente.statusCode).toBe(404);
    },
    LENTO,
  );

  it(
    'confirmada, vira nota aberta de origem tendência — e não volta a ser sugerida',
    async () => {
      // encanamento: apaga a dispensa para a sugestão poder voltar
      await sql.exec("delete from note_suggestion where status = 'dispensada'");
      await catchUp(app.db, { seed: SEED, now: new Date(NOW.getTime() + 180_000) });

      const sugestão = (await emPé())[0];
      if (!sugestão) throw new Error('a sugestão deveria ter voltado');

      const response = await app.inject({
        method: 'POST',
        url: `/note-suggestions/${encodeURIComponent(sugestão.id)}/confirm`,
        payload: { confirmedBy: 'Turno B', priority: 2 },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as {
        suggestion: NoteSuggestion;
        note: { number: string; origin: string; originRef: string; priority: number };
      };

      expect(body.suggestion.status).toBe('confirmada');
      expect(body.suggestion.noteNumber).toBe(body.note.number);
      expect(body.note.origin).toBe('tendência');
      expect(body.note.originRef).toBe(sugestão.id);
      // a edição antes de confirmar vale
      expect(body.note.priority).toBe(2);

      // a nota está no banco, com as evidências da sugestão
      const nota = await app.db.findMaintenanceNote(body.note.number);
      expect(nota?.assetTag).toBe(DEGRADING_TAG);
      expect(nota?.evidence.length).toBe(sugestão.evidence.length);

      // e a retomada não sugere de novo o que já está na fila da manutenção
      await catchUp(app.db, { seed: SEED, now: new Date(NOW.getTime() + 240_000) });
      expect(await emPé()).toHaveLength(0);
    },
    LENTO,
  );

  it(
    'confirmar duas vezes leva 409',
    async () => {
      const confirmada = (await app.db.listNoteSuggestions({ status: 'confirmada' }))[0];

      const response = await app.inject({
        method: 'POST',
        url: `/note-suggestions/${encodeURIComponent(confirmada?.id ?? '')}/confirm`,
        payload: {},
      });

      expect(response.statusCode).toBe(409);
    },
    LENTO,
  );
});

/**
 * A propriedade da regra 9 outra vez, agora sobre a sugestão.
 *
 * A sugestão em pé é projeção do arquivo, e a gravação substitui as em pé. Então
 * retomar em pedaços tem de deixar o **mesmo** banco que retomar de uma vez —
 * campo por campo, inclusive o id, que sai da chave.
 */
describe('retomada em pedaços', () => {
  it(
    'deixa a mesma sugestão que a retomada de uma vez',
    async () => {
      const comoFoi = async (cortes: readonly number[]): Promise<NoteSuggestion[]> => {
        const { db } = await driver.openWithSql();
        await db.migrate();
        await seedDatabase(db, { now: NOW });

        const início = new Date(NOW.getTime() - 40 * 60_000);
        await db.saveSimState({ seed: SEED, lastTick: tickAt(início), updatedAt: início });

        for (const minutos of cortes) {
          await catchUp(db, { seed: SEED, now: new Date(NOW.getTime() - minutos * 60_000) });
        }

        const sugestões = await db.listNoteSuggestions({});
        await db.close();
        return sugestões;
      };

      /**
       * A comparação deixa de fora o **rótulo** da evidência da ronda.
       *
       * Ele carrega a leitura de campo, que a colheita lê do arquivo no
       * instante da ronda — e a retomada fatiada tem pontos de borda a mais,
       * como o teste da própria retomada documenta. O valor muda no primeiro
       * decimal, e é a única coisa que muda: id, janela, inclinação, prazo,
       * prioridade e frase saem da série de vibração, que nenhuma retomada
       * reescreve.
       */
      const semRótulos = (sugestões: readonly NoteSuggestion[]) =>
        sugestões.map((s) => ({
          ...s,
          evidence: s.evidence.map(({ kind, ref }) => ({ kind, ref })),
        }));

      const [deUmaVez, fatiado] = await Promise.all([comoFoi([0]), comoFoi([30, 20, 10, 0])]);

      expect(deUmaVez).toHaveLength(1);
      expect(semRótulos(fatiado)).toEqual(semRótulos(deUmaVez));
    },
    LENTO,
  );
});
