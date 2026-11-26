import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { DRYER_BEARING_TAGS, type NoteSuggestion } from '@mp1/shared';
import { tickAt } from '@mp1/shared/simulation';

import { DEGRADATION_PLANS } from '../simulation/bearings';

import { buildApp } from '../app';
import type { SqlExecutor } from '../db/executor';
import { DEGRADING_TAG, seedDatabase } from '../db/seed';
import { DRIVERS } from '../db/test-drivers';
import { loadEnv } from '../env';
import { catchUp } from './catchup';
import { deriveSuggestions } from './suggestions';

/**
 * O par de testes que a Fase 6 existe para passar.
 *
 * Dois mancais degradam de verdade na série — o CS23 do lado comando, o mesmo
 * do design das telas, e um segundo no meio da curva — e **nada** no caminho da
 * regra sabe quais são. Ela lê a série de todos os 72, faz a conta e decide. Se
 * o mancal que degrada não for apontado, a regra não serve; se mais algum for,
 * ela é um gerador de ordens de serviço, o que é pior.
 *
 * ## Apontado como: nota aberta **ou** sugestão, nunca os dois
 *
 * O CS23 está em zona D e tem alarme de `HH`, e o alarme já abre nota. Então o
 * trabalho dele **já está** na fila da manutenção, e sugerir de novo seria
 * pedir a mesma ordem de serviço duas vezes para o mesmo mancal. A regra da
 * Fase 6 é essa: nota aberta do mesmo mancal cala a sugestão, qualquer que seja
 * a origem da nota.
 *
 * Quem sobra para a sugestão é o segundo mancal — e é ele que mostra o que a
 * Fase 6 vale. A vibração dele está em zona B, abaixo de qualquer limite de
 * alarme: nenhuma nota se abre sozinha, e a única coisa que sabe que ele está
 * indo embora é a reta.
 *
 * O terceiro par é sobre a decisão de alguém: dispensar tem de calar a
 * sugestão, e confirmar tem de virar nota e calar também. Sem isso a fila
 * pediria todo dia a mesma decisão que já foi tomada.
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

/** O segundo mancal do cenário: o que ainda está no meio da curva. */
const SEGUNDO = DEGRADATION_PLANS[1]?.assetTag ?? '';

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

/** Um número em formato inglês, para cobrar a vírgula decimal nas frases. */
const NUMERO_INGLES = /\d\.\d/;

describe('a sugestão que a tendência gera', () => {
  it(
    'só o mancal sem nota aberta é sugerido',
    async () => {
      const sugestões = await emPé();

      expect(sugestões).toHaveLength(1);
      expect(sugestões[0]?.assetTag).toBe(SEGUNDO);
      for (const sugestão of sugestões) {
        expect(sugestão.measure).toBe('vibração');
        expect(sugestão.status).toBe('sugerida');
        expect(sugestão.noteNumber).toBeNull();
      }
    },
    LENTO,
  );

  /**
   * O CS23 é o caso que a revisão pegou.
   *
   * Ele tem nota aberta de origem `alarme` — a NM-205916 do design — e ganhava
   * nota sugerida ao lado dela: duas recomendações para o mesmo mancal, uma
   * delas pedindo parada e a outra não. A consulta que cala a sugestão filtrava
   * por `origin = 'tendência'`, e a nota do alarme passava por baixo dela.
   */
  it(
    'o mancal que degrada é apontado pela nota aberta, e não duas vezes',
    async () => {
      const notas = await app.db.listMaintenanceNotes({ assetTag: DEGRADING_TAG });
      const abertas = notas.filter((nota) => nota.status !== 'encerrada');

      expect(abertas.length).toBeGreaterThan(0);
      expect(abertas[0]?.origin).toBe('alarme');

      const sugestões = await app.db.listNoteSuggestions({ assetTag: DEGRADING_TAG });
      expect(sugestões).toEqual([]);
    },
    LENTO,
  );

  /**
   * A nota aberta pelo alarme diz o que a sugestão diria.
   *
   * Calar a sugestão só é honesto se a nota que ficou no lugar dela carregar a
   * mesma gravidade. O CS23 está em zona D: a nota tem de sair P1, com parada,
   * e com a zona escrita no sintoma — que é exatamente o que a sugestão dizia
   * antes de ser calada.
   */
  it(
    'a nota que ficou no lugar da sugestão tem a mesma gravidade',
    async () => {
      const notas = await app.db.listMaintenanceNotes({ assetTag: DEGRADING_TAG });
      const nota = notas.find((item) => item.status !== 'encerrada');
      if (!nota) throw new Error('o mancal que degrada deveria ter nota aberta');

      expect(nota.priority).toBe(1);
      expect(nota.requiresShutdown).toBe(true);
      expect(nota.symptom).toContain('zona D');
      // os números da frase são em português
      expect(nota.symptom).not.toMatch(NUMERO_INGLES);
    },
    LENTO,
  );

  it(
    'os outros 70 mancais não geram nada',
    async () => {
      const sugestões = await emPé();
      const outros = DRYER_BEARING_TAGS.filter(
        (m) => m.assetTag !== DEGRADING_TAG && m.assetTag !== SEGUNDO,
      );

      expect(outros).toHaveLength(70);
      for (const mancal of outros) {
        expect(sugestões.some((s) => s.assetTag === mancal.assetTag)).toBe(false);
      }
    },
    LENTO,
  );

  /**
   * O segundo mancal é o caso que separa prever de reagir.
   *
   * A **vibração** dele está em zona B, abaixo do limite de alarme: pela
   * medida que a norma usa para julgar severidade, ele está normal, e a única
   * coisa que sabe que ele está indo embora é a reta. Por isso a sugestão tem
   * **prazo** — e não "já passou" — e não exige parada.
   *
   * O que já passou do limite é o **envelope de aceleração**, e isso é o
   * modelo funcionando como deveria: o envelope pega impacto de rolamento
   * semanas antes de a velocidade sair da faixa. O alarme que acompanha a
   * sugestão é o dele, não o de vibração — e é por isso que o teste olha qual
   * alarme é, em vez de exigir que não haja nenhum.
   */
  it(
    'o segundo vem com prazo, sem parada, e com o alarme que vê antes',
    async () => {
      const sugestão = (await emPé())[0];
      if (!sugestão) throw new Error('o segundo mancal deveria ter sugestão');

      expect(sugestão.assetTag).toBe(SEGUNDO);
      expect(sugestão.daysToLimit).toBeGreaterThan(3);
      expect(sugestão.daysToLimit).toBeLessThan(20);
      expect(sugestão.priority).toBeGreaterThan(1);
      expect(sugestão.requiresShutdown).toBe(false);
      expect(sugestão.level).toBeLessThan(2.8);
      expect(sugestão.symptom).toContain('a projeção cruza');
      expect(sugestão.evidence.find((item) => item.kind === 'tendência')?.ref).toBe('VI-5136B');

      const alarme = sugestão.evidence.find((item) => item.kind === 'alarme');
      if (alarme) expect(alarme.label).toContain('VE-5136B');
    },
    LENTO,
  );

  it(
    'a sugestão vem preenchida: inclinação, amostras e as evidências',
    async () => {
      const sugestão = (await emPé())[0];
      if (!sugestão) throw new Error('nenhuma sugestão em pé');

      expect(sugestão.perDay).toBeGreaterThan(0);
      expect(sugestão.samples).toBeGreaterThan(24);
      expect(sugestão.limit).toBe(4.5);

      const kinds = sugestão.evidence.map((item) => item.kind);
      expect(kinds).toContain('tendência');
      expect(sugestão.evidence.find((item) => item.kind === 'tendência')?.ref).toBe('VI-5136B');
    },
    LENTO,
  );

  it(
    'a chave é o mancal e o início da tendência',
    async () => {
      const sugestão = (await emPé())[0];
      if (!sugestão) throw new Error('nenhuma sugestão em pé');

      expect(sugestão.id).toContain(SEGUNDO);
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
      expect(body.suggestions.map((item) => item.assetTag)).toEqual([SEGUNDO]);
    },
    LENTO,
  );

  it(
    'a retomada seguinte não cria uma segunda sugestão para o mesmo mancal',
    async () => {
      await catchUp(app.db, { seed: SEED, now: new Date(NOW.getTime() + 60_000) });
      const sugestões = await app.db.listNoteSuggestions({ assetTag: SEGUNDO });

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

      // o mancal dispensado sai da fila, e a fila fica vazia: o outro mancal
      // que degrada já está apontado pela nota aberta dele
      expect(await emPé()).toEqual([]);

      const dispensadas = await app.db.listNoteSuggestions({ status: 'dispensada' });
      expect(dispensadas).toHaveLength(1);
      expect(dispensadas[0]?.assetTag).toBe(SEGUNDO);
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
      expect(nota?.assetTag).toBe(SEGUNDO);
      expect(nota?.evidence.length).toBe(sugestão.evidence.length);

      /**
       * E agora a nota confirmada é ela mesma a que cala a sugestão.
       *
       * É o mesmo caminho do CS23, por outra porta: o trabalho entrou na fila
       * da manutenção, e a regra não pede duas vezes a mesma ordem de serviço.
       * Antes isto só valia para a nota de origem `tendência`; vale para
       * qualquer uma.
       */
      await catchUp(app.db, { seed: SEED, now: new Date(NOW.getTime() + 240_000) });
      expect(await emPé()).toEqual([]);
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

/**
 * A regra da supressão, nos dois sentidos, em banco próprio.
 *
 * Banco próprio porque o caso **mexe** no estado: encerra a nota do mancal que
 * degrada para ver a sugestão voltar. Fazer isso na suíte de cima deixaria as
 * decisões dos casos seguintes num banco que ninguém descreveu.
 *
 * E a regra tem de valer nos dois sentidos. Calar enquanto a nota está aberta é
 * metade dela; a outra metade é voltar quando a nota é encerrada, porque a
 * razão de calar é "o trabalho já está na fila" — e encerrar a nota tira o
 * trabalho da fila. Sem a volta, encerrar uma nota sem resolver o mancal o
 * apagaria do radar para sempre.
 */
describe('nota aberta cala, nota encerrada liberta', () => {
  it(
    'a sugestão do mancal volta quando a nota dele é encerrada',
    async () => {
      const aberto = await driver.openWithSql();
      const db = aberto.db;
      await db.migrate();
      await seedDatabase(db, { now: NOW });

      const início = new Date(NOW.getTime() - 10 * 60_000);
      await db.saveSimState({ seed: SEED, lastTick: tickAt(início), updatedAt: início });
      await catchUp(db, { seed: SEED, now: NOW });

      // calada: o mancal tem nota aberta de origem alarme
      const notas = await db.listMaintenanceNotes({ assetTag: DEGRADING_TAG });
      const nota = notas.find((item) => item.status !== 'encerrada');
      if (!nota) throw new Error('o mancal que degrada deveria ter nota aberta');
      expect(nota.origin).toBe('alarme');
      expect(await db.listNoteSuggestions({ assetTag: DEGRADING_TAG })).toEqual([]);

      /**
       * A nota é encerrada e a regra roda de novo — sem passar pela retomada.
       *
       * A retomada recolheria as notas dos alarmes e reabriria esta, porque ela
       * é derivada do arquivo e o alarme continua lá. Isso está certo para o
       * sistema e é o contrário do que este caso quer observar: o que se cobra
       * aqui é a regra da supressão, e ela é `deriveSuggestions`.
       */
      await aberto.sql.rows(
        'update maintenance_note set status = $1, closed_at = $2 where number = $3',
        ['encerrada', NOW.toISOString(), nota.number],
      );

      const voltou = await deriveSuggestions(db, { now: NOW });
      const doMancal = voltou.filter((item) => item.assetTag === DEGRADING_TAG);

      expect(doMancal).toHaveLength(1);
      expect(doMancal[0]?.priority).toBe(1);
      expect(doMancal[0]?.requiresShutdown).toBe(true);
      expect(doMancal[0]?.symptom).toContain('zona D');

      await db.close();
    },
    LENTO,
  );
});
