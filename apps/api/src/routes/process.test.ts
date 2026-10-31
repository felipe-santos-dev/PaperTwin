import {
  allAssets,
  ALARM_FLOOD_THRESHOLD,
  HISTORIAN_POINTS,
  MAX_SHELVE_HOURS,
  MP1,
  type Alarm,
  type GradeChange,
  type JumboReel,
  type MaintenanceNote,
  type ProcessVariable,
  type Round,
  type SetpointChange,
  type WebBreak,
  shiftWindowAt,
} from '@mp1/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../app';
import { openPglite } from '../db/sql-database';
import { loadEnv } from '../env';
import { TICKS_PER_HOUR, tickAt, tickTime } from '../simulation/clock';
import { shiftPlan } from '../simulation/scenarios';
import { catchUp } from '../runtime/catchup';

/**
 * As rotas da Fase 5 contra um banco de verdade, com a simulação já rodada.
 *
 * A retomada é cara, então ela roda **uma vez** no `beforeAll`, com um instante
 * fixo, e todas as rotas consultam o resultado dela. O serviço represa a
 * retomada por cinco segundos, o que faz as chamadas das rotas não rodarem nada
 * de novo — e é por isso que `now` fica no passado: se fosse `new Date()`, cada
 * requisição tentaria avançar a simulação e o teste mediria o relógio.
 */

const SEED = 4242;

/** Um turno B inteiro, que tem troca de gramatura, bobinas e ronda. */
const TURNO = shiftWindowAt(new Date('2026-06-15T18:00:00Z'));
const PLANO = shiftPlan(SEED, TURNO);
const NOW = tickTime(PLANO.startTick + 4 * TICKS_PER_HOUR);

let app: FastifyInstance;

beforeAll(async () => {
  const db = await openPglite();
  await db.migrate();
  await db.replaceAssets(allAssets(MP1));
  await db.replaceHistorianPoints(HISTORIAN_POINTS);
  await db.saveSimState({
    seed: SEED,
    lastTick: PLANO.startTick,
    updatedAt: tickTime(PLANO.startTick),
  });
  await catchUp(db, { seed: SEED, now: NOW });

  /**
   * O relógio da aplicação é fixado no instante do cenário.
   *
   * Sem isto, cada rota chamaria `ensureCurrent()` com o relógio de parede, a
   * simulação tentaria avançar até hoje — reancorando, porque o cenário está no
   * futuro ou no passado — e o teste mediria o relógio em vez da API.
   */
  app = await buildApp(loadEnv({ NODE_ENV: 'test' }), db, { seed: SEED, clock: () => NOW });
  await app.simulation.ensureCurrent();
}, 180_000);

afterAll(async () => {
  await app.close();
});

const get = (url: string) => app.inject({ method: 'GET', url });
type Payload = Record<string, unknown>;

const post = (url: string, payload: Payload) => app.inject({ method: 'POST', url, payload });
const put = (url: string, payload: Payload) => app.inject({ method: 'PUT', url, payload });

describe('GET /process/values', () => {
  it('devolve as variáveis do catálogo com valor e unidade', async () => {
    const response = await get('/process/values');
    expect(response.statusCode).toBe(200);

    const body = response.json<{
      ts: string;
      count: number;
      values: { tag: string; value: number; unit: string }[];
    }>();

    expect(body.count).toBeGreaterThan(300);
    expect(body.values).toHaveLength(body.count);
    expect(Date.parse(body.ts)).toBeGreaterThan(0);

    const vapor = body.values.find((item) => item.tag === 'PIC-514');
    expect(vapor?.unit).toBe('kPa rel');
    expect(vapor?.value).toBeGreaterThan(100);
    expect(vapor?.value).toBeLessThan(360);
  });

  it('inclui as tags de mancal, que não são do motor de processo', async () => {
    const body = (await get('/process/values')).json<{
      values: { tag: string; value: number }[];
    }>();

    const vibração = body.values.find((item) => item.tag === 'VI-5123A');
    expect(vibração).toBeDefined();
    expect(vibração?.value).toBeGreaterThan(0);
  });

  it('filtra por área e por grupo', async () => {
    const área = (await get('/process/values?area=pr%C3%A9-secagem')).json<{
      count: number;
      values: { tag: string }[];
    }>();
    expect(área.count).toBeGreaterThan(0);
    expect(área.count).toBeLessThan(60);

    const grupo = (await get('/process/values?area=pr%C3%A9-secagem&group=vapor')).json<{
      values: { tag: string }[];
    }>();
    expect(grupo.values.map((v) => v.tag).sort()).toEqual([
      'PIC-511',
      'PIC-512',
      'PIC-513',
      'PIC-514',
    ]);
  });

  it('recusa parâmetro que não existe, em vez de ignorar', async () => {
    const response = await get('/process/values?areas=qualquer');
    expect(response.statusCode).toBe(400);
  });
});

describe('GET /process/tags/:tag', () => {
  it('devolve o catálogo da tag com o valor atual', async () => {
    const body = (await get('/process/tags/PIC-514')).json<{
      variable: ProcessVariable;
      value: { value: number } | null;
      writable: boolean;
      notWritableBecause: string | null;
      archived: boolean;
    }>();

    expect(body.variable.tag).toBe('PIC-514');
    expect(body.variable.limits).toBeDefined();
    expect(body.variable.compression.excDev).toBe(1);
    expect(body.value?.value).toBeGreaterThan(0);
    expect(body.archived).toBe(true);
  });

  /**
   * A tela precisa saber se pode escrever **antes** de o usuário digitar.
   *
   * Recusar depois de o motivo já estar escrito é pedir que alguém trabalhe para
   * nada.
   */
  it('diz se a tag aceita escrita, e por que não quando não aceita', async () => {
    const malha = (await get('/process/tags/PIC-712')).json<{
      writable: boolean;
      notWritableBecause: string | null;
    }>();
    expect(malha.writable).toBe(true);
    expect(malha.notWritableBecause).toBeNull();

    const medição = (await get('/process/tags/AI-407')).json<{
      writable: boolean;
      notWritableBecause: string | null;
    }>();
    expect(medição.writable).toBe(false);
    expect(medição.notWritableBecause).toMatch(/medição/);

    const escrava = (await get('/process/tags/PIC-711')).json<{
      writable: boolean;
      notWritableBecause: string | null;
    }>();
    expect(escrava.writable).toBe(false);
    expect(escrava.notWritableBecause).toMatch(/cascata/);
  });

  it('responde 404 para tag fora do catálogo', async () => {
    expect((await get('/process/tags/PIC-999')).statusCode).toBe(404);
  });
});

describe('GET /process/tags/:tag/trend', () => {
  const janela = () => {
    const to = NOW.toISOString();
    const from = new Date(NOW.getTime() - 2 * 3_600_000).toISOString();
    return `from=${from}&to=${to}`;
  };

  it('devolve colunas com os quatro valores e a média no tempo', async () => {
    const body = (await get(`/process/tags/PIC-514/trend?${janela()}&buckets=60`)).json<{
      tag: string;
      bucketS: number;
      buckets: { min: number; max: number; first: number; last: number; samples: number }[];
      timeWeightedAverage: number | null;
      limits: unknown;
      target: number | null;
    }>();

    expect(body.tag).toBe('PIC-514');
    expect(body.bucketS).toBe(120);
    expect(body.buckets.length).toBeGreaterThan(0);
    expect(body.timeWeightedAverage).not.toBeNull();
    expect(body.target).toBe(230);

    for (const coluna of body.buckets) {
      expect(coluna.max).toBeGreaterThanOrEqual(coluna.min);
      expect(coluna.samples).toBeGreaterThan(0);
    }
  });

  it('traz os limites de alarme junto, para o gráfico desenhá-los', async () => {
    const body = (await get(`/process/tags/AIC-903/trend?${janela()}`)).json<{
      limits: { l: number | null; h: number | null };
    }>();

    expect(body.limits.l).toBe(4.3);
    expect(body.limits.h).toBe(5.3);
  });

  it('recusa janela invertida', async () => {
    const to = NOW.toISOString();
    const from = new Date(NOW.getTime() + 3_600_000).toISOString();
    expect((await get(`/process/tags/PIC-514/trend?from=${from}&to=${to}`)).statusCode).toBe(400);
  });

  it('responde 404 para tag fora do catálogo', async () => {
    expect((await get('/process/tags/PIC-999/trend')).statusCode).toBe(404);
  });

  it('recusa mais colunas que o teto', async () => {
    expect((await get('/process/tags/PIC-514/trend?buckets=99999')).statusCode).toBe(400);
  });
});

describe('PUT /process/tags/:tag/setpoint', () => {
  it('aceita valor na faixa, com motivo, e grava a auditoria', async () => {
    const response = await put('/process/tags/PIC-712/setpoint', {
      value: 160,
      reason: 'umidade final acima do alvo no fim do turno',
      changedBy: 'turno B',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ change: SetpointChange; min: number; max: number }>();

    expect(body.change.tag).toBe('PIC-712');
    expect(body.change.newValue).toBe(160);
    expect(body.change.changedBy).toBe('turno B');
    expect(body.change.unit).toBe('kPa rel');
    expect(body.min).toBe(40);
    expect(body.max).toBe(250);
    // o valor anterior é lido pelo servidor, não enviado
    expect(body.change.previousValue).toBeGreaterThan(0);
  });

  it('recusa fora da faixa de operação, dizendo qual é a faixa', async () => {
    const response = await put('/process/tags/PIC-712/setpoint', {
      value: 400,
      reason: 'quero secar mais',
    });

    expect(response.statusCode).toBe(422);
    const body = response.json<{ rejection: string; message: string; min: number; max: number }>();
    expect(body.rejection).toBe('fora-dos-limites');
    expect(body.message).toMatch(/40 a 250/);
    expect(body.max).toBe(250);
  });

  it('recusa escrita em medição', async () => {
    const response = await put('/process/tags/AI-407/setpoint', {
      value: 51,
      reason: 'motivo',
    });

    expect(response.statusCode).toBe(422);
    expect(response.json<{ rejection: string }>().rejection).toBe('tag-nao-controlada');
  });

  /**
   * A escrava de cascata é recusada, e não aceita-e-ignorada.
   *
   * Aceitar gravaria um registro de auditoria dizendo que alguém mudou um
   * setpoint que o próximo passo sobrescreveria sem aviso.
   */
  it('recusa escrita na escrava de uma cascata, apontando o mestre', async () => {
    const response = await put('/process/tags/PIC-711/setpoint', {
      value: 150,
      reason: 'motivo',
    });

    expect(response.statusCode).toBe(422);
    const body = response.json<{ rejection: string; message: string }>();
    expect(body.rejection).toBe('escrava-de-cascata');
    expect(body.message).toMatch(/AIC-903/);
  });

  it('recusa sem motivo pelo schema, antes de chegar ao domínio', async () => {
    expect(
      (await put('/process/tags/PIC-712/setpoint', { value: 150, reason: '' })).statusCode,
    ).toBe(400);
  });

  it('responde 404 para tag fora do catálogo', async () => {
    expect(
      (await put('/process/tags/PIC-999/setpoint', { value: 1, reason: 'motivo' })).statusCode,
    ).toBe(404);
  });

  it('aparece na auditoria depois de escrita', async () => {
    await put('/process/tags/TIC-802/setpoint', {
      value: 135,
      reason: 'calandragem mais quente para a espessura',
      changedBy: 'turno B',
    });

    const body = (await get('/setpoint-changes?tag=TIC-802')).json<{
      count: number;
      changes: SetpointChange[];
    }>();

    expect(body.count).toBe(1);
    expect(body.changes[0]?.newValue).toBe(135);
    expect(body.changes[0]?.reason).toMatch(/calandragem/);
  });
});

describe('GET /process/steam-groups', () => {
  it('devolve os seis grupos com as tags resolvidas', async () => {
    const body = (await get('/process/steam-groups')).json<{
      groups: {
        id: string;
        pressure: { tag: string; value: number } | null;
        siphonDeltaP: { tag: string } | null;
        condensateLevel: { tag: string } | null;
        condensateNote: string | null;
        division: { source: string };
        tagMap: { source: string };
      }[];
    }>();

    expect(body.groups.map((g) => g.id)).toEqual(['G1', 'G2', 'G3', 'G4', 'G5', 'G6']);

    const g4 = body.groups.find((g) => g.id === 'G4');
    expect(g4?.pressure?.tag).toBe('PIC-514');
    expect(g4?.siphonDeltaP?.tag).toBe('PDIC-524');
    expect(g4?.condensateLevel?.tag).toBe('LIC-534');
    expect(g4?.condensateNote).toBeNull();
  });

  it('mostra o G5 e o G6 sem nível, com a nota explicando', async () => {
    const body = (await get('/process/steam-groups')).json<{
      groups: { id: string; condensateLevel: unknown; condensateNote: string | null }[];
    }>();

    for (const id of ['G5', 'G6']) {
      const grupo = body.groups.find((g) => g.id === id);
      expect(grupo?.condensateLevel).toBeNull();
      expect(grupo?.condensateNote).toMatch(/tanque existe na máquina/);
    }
  });

  it('separa a proveniência da divisão da do mapa de tags', async () => {
    const body = (await get('/process/steam-groups')).json<{
      groups: { division: { source: string }; tagMap: { source: string } }[];
    }>();

    for (const grupo of body.groups) {
      expect(grupo.division.source).toBe('assumed');
      expect(grupo.tagMap.source).toBe('B');
    }
  });
});

describe('GET /alarms', () => {
  it('lista os alarmes com a contagem de inundação', async () => {
    const body = (await get('/alarms')).json<{
      count: number;
      floodWindowS: number;
      floodThreshold: number;
      inFloodWindow: number;
      flooding: boolean;
      alarms: Alarm[];
    }>();

    expect(body.floodWindowS).toBe(600);
    expect(body.floodThreshold).toBe(ALARM_FLOOD_THRESHOLD);
    expect(body.count).toBeGreaterThan(0);
    expect(body.alarms).toHaveLength(body.count);

    for (const alarme of body.alarms) {
      expect(['LL', 'L', 'H', 'HH']).toContain(alarme.limit);
      expect(Date.parse(alarme.raisedAt)).toBeGreaterThan(0);
    }
  });

  it('tem o alarme do mancal que degrada', async () => {
    const body = (await get('/alarms?tag=VI-5123A')).json<{ alarms: Alarm[] }>();

    expect(body.alarms.length).toBeGreaterThan(0);
    expect(body.alarms.map((a) => a.limit)).toContain('HH');
  });

  it('filtra o que pede ação', async () => {
    const body = (await get('/alarms?needsAction=true')).json<{ alarms: Alarm[] }>();

    for (const alarme of body.alarms) {
      expect(alarme.acknowledgedAt === null || alarme.state === 'ativo').toBe(true);
    }
  });

  it('recusa estado que não existe', async () => {
    expect((await get('/alarms?state=qualquer')).statusCode).toBe(400);
  });
});

describe('POST /alarms/:id/ack', () => {
  it('reconhece uma vez e recusa a segunda com 409', async () => {
    const lista = (await get('/alarms?needsAction=true')).json<{ alarms: Alarm[] }>();
    const alvo = lista.alarms.find((a) => a.acknowledgedAt === null);
    expect(alvo, 'nenhum alarme sem reconhecimento').toBeDefined();
    if (!alvo) return;

    const primeira = await post(`/alarms/${alvo.id}/ack`, { acknowledgedBy: 'turno B' });
    expect(primeira.statusCode).toBe(200);
    expect(primeira.json<{ alarm: Alarm }>().alarm.acknowledgedBy).toBe('turno B');

    const segunda = await post(`/alarms/${alvo.id}/ack`, { acknowledgedBy: 'turno C' });
    expect(segunda.statusCode).toBe(409);
    expect(segunda.json<{ message: string }>().message).toMatch(/turno B/);
  });

  it('responde 404 para alarme que não existe', async () => {
    expect(
      (await post('/alarms/AL-NAO-EXISTE/ack', { acknowledgedBy: 'turno B' })).statusCode,
    ).toBe(404);
  });

  it('exige quem reconheceu', async () => {
    expect((await post('/alarms/qualquer/ack', {})).statusCode).toBe(400);
  });
});

describe('POST /alarms/:id/shelve', () => {
  it('engaveta por um prazo e desengaveta', async () => {
    const lista = (await get('/alarms')).json<{ alarms: Alarm[] }>();
    const alvo = lista.alarms[0];
    expect(alvo).toBeDefined();
    if (!alvo) return;

    const engavetado = await post(`/alarms/${alvo.id}/shelve`, {
      shelvedBy: 'turno B',
      hours: 2,
    });
    expect(engavetado.statusCode).toBe(200);
    expect(engavetado.json<{ alarm: Alarm }>().alarm.shelvedBy).toBe('turno B');

    const livre = await post(`/alarms/${alvo.id}/unshelve`, {});
    expect(livre.statusCode).toBe(200);
    expect(livre.json<{ alarm: Alarm }>().alarm.shelvedUntil).toBeNull();
  });

  /**
   * O teto é recusado em vez de cortado em silêncio.
   *
   * Quem pediu doze horas precisa saber que não vai ter doze horas, em vez de
   * descobrir quando o alarme voltar no meio do turno seguinte.
   */
  it('recusa prazo acima de um turno', async () => {
    const lista = (await get('/alarms')).json<{ alarms: Alarm[] }>();
    const alvo = lista.alarms[0];
    if (!alvo) return;

    const response = await post(`/alarms/${alvo.id}/shelve`, {
      shelvedBy: 'turno B',
      hours: MAX_SHELVE_HOURS + 1,
    });

    expect(response.statusCode).toBe(422);
    expect(response.json<{ message: string }>().message).toMatch(/teto de 8 h/);
  });
});

describe('rotas das entidades de operação', () => {
  it('lista os turnos e abre um com tudo dentro', async () => {
    const lista = (await get('/shifts')).json<{ count: number; shifts: { id: string }[] }>();
    expect(lista.count).toBeGreaterThan(0);

    const id = lista.shifts[0]?.id ?? '';
    const body = (await get(`/shifts/${id}`)).json<{
      shift: { id: string; productionT: number; handover: string[] };
      reels: JumboReel[];
      webBreaks: WebBreak[];
      gradeChanges: GradeChange[];
      rounds: Round[];
    }>();

    expect(body.shift.id).toBe(id);
    expect(body.shift.productionT).toBeGreaterThan(0);
    expect(body.reels.length).toBeGreaterThan(0);
    expect(body.rounds.length).toBeGreaterThan(0);
  });

  it('responde 404 para turno que não existe', async () => {
    expect((await get('/shifts/T-1900-01-01-A')).statusCode).toBe(404);
  });

  it('lista as bobinas e abre uma', async () => {
    const lista = (await get('/reels')).json<{ count: number; reels: JumboReel[] }>();
    expect(lista.count).toBeGreaterThan(0);

    const fechada = lista.reels.find((reel) => reel.endedAt !== null);
    expect(fechada, 'nenhuma bobina fechada').toBeDefined();
    if (!fechada) return;

    const body = (await get(`/reels/${String(fechada.number)}`)).json<{ reel: JumboReel }>();
    expect(body.reel.number).toBe(fechada.number);
    expect(body.reel.basisWeightGsm).not.toBeNull();
    expect(body.reel.cdSpread).not.toBeNull();
  });

  it('responde 404 para bobina que não existe', async () => {
    expect((await get('/reels/999999')).statusCode).toBe(404);
  });

  it('lista as trocas de gramatura com as bobinas afetadas', async () => {
    const body = (await get('/grade-changes')).json<{
      count: number;
      gradeChanges: GradeChange[];
    }>();

    expect(body.count).toBe(1);
    expect(body.gradeChanges[0]?.affectedReels.length).toBeGreaterThan(0);
    expect(body.gradeChanges[0]?.stabilizedAt).not.toBeNull();
  });

  it('lista as rondas com o campo ao lado do online', async () => {
    const body = (await get('/rounds')).json<{ count: number; rounds: Round[] }>();

    expect(body.count).toBeGreaterThan(0);
    const ponto = body.rounds[0]?.points[0];
    expect(ponto?.onlineTag).toMatch(/^TI-53/);
    expect(ponto?.fieldTempC).not.toBeNull();
  });

  it('abre uma ronda pelo id', async () => {
    const lista = (await get('/rounds')).json<{ rounds: Round[] }>();
    const id = lista.rounds[0]?.id ?? '';

    expect((await get(`/rounds/${id}`)).statusCode).toBe(200);
    expect((await get('/rounds/RD-000')).statusCode).toBe(404);
  });

  it('lista as notas de manutenção abertas pelos alarmes', async () => {
    const body = (await get('/notes')).json<{ count: number; notes: MaintenanceNote[] }>();

    expect(body.count).toBeGreaterThan(0);
    const nota = body.notes[0];
    expect(nota?.origin).toBe('alarme');
    expect(nota?.originRef).not.toBeNull();
    expect(nota?.evidence.length).toBeGreaterThan(0);
    expect(nota?.number).toMatch(/^NM-\d{6}$/);
  });

  it('filtra as notas por situação e por ativo', async () => {
    const abertas = (await get('/notes?status=aberta')).json<{ notes: MaintenanceNote[] }>();
    for (const nota of abertas.notes) expect(nota.status).toBe('aberta');

    const semNada = (await get('/notes?assetTag=MP1-QCS-SC1')).json<{ count: number }>();
    expect(semNada.count).toBe(0);
  });

  it('responde 404 para nota que não existe', async () => {
    expect((await get('/notes/NM-999999')).statusCode).toBe(404);
  });

  it('lista as quebras de folha com os sinais anteriores', async () => {
    const body = (await get('/web-breaks')).json<{ count: number; webBreaks: WebBreak[] }>();

    // o turno pode não ter quebra; quando tem, os sinais vêm do arquivo
    for (const quebra of body.webBreaks) {
      expect(quebra.precursors.length).toBeGreaterThan(0);
      for (const sinal of quebra.precursors) {
        expect(sinal.leadTimeS).toBeLessThanOrEqual(600);
        expect(sinal.description.trim()).not.toBe('');
      }
    }
  });
});

describe('erros', () => {
  it('têm a mesma forma em toda a API', async () => {
    for (const url of [
      '/process/tags/PIC-999',
      '/shifts/T-1900-01-01-A',
      '/reels/999999',
      '/notes/NM-999999',
      '/alarms/AL-NAO-EXISTE/unshelve',
    ]) {
      const response = url.includes('unshelve') ? await post(url, {}) : await get(url);
      expect(response.statusCode, url).toBe(404);

      const erro = response.json<{ statusCode: number; error: string; message: string }>();
      expect(erro.statusCode, url).toBe(404);
      expect(erro.error, url).toBe('Not Found');
      expect(erro.message.trim(), url).not.toBe('');
    }
  });
});

describe('GET /stream', () => {
  /**
   * O stream é testado contra um socket de verdade, não com `inject`.
   *
   * `inject` espera a resposta terminar, e um stream de SSE não termina — o
   * teste ficaria pendurado até o tempo limite. Subir o servidor numa porta
   * qualquer, ler o primeiro evento e abortar testa o que importa: o cabeçalho,
   * o formato do evento e que o quadro carrega valores. E prova que funciona
   * sobre HTTP de verdade, que é onde o `X-Accel-Buffering` importa.
   */
  it('manda o primeiro quadro na hora, com cabeçalho de SSE', async () => {
    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    const controller = new AbortController();

    try {
      const response = await fetch(`${address}/stream`, { signal: controller.signal });

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toMatch(/text\/event-stream/);
      expect(response.headers.get('cache-control')).toMatch(/no-cache/);

      const reader = response.body?.getReader();
      expect(reader).toBeDefined();
      if (!reader) return;

      const { value } = await reader.read();
      const texto = new TextDecoder().decode(value);

      expect(texto).toMatch(/^id: \d+\n/);

      const linha = texto.split('\n').find((l) => l.startsWith('data: '));
      const quadro = JSON.parse(linha?.slice(6) ?? '{}') as {
        ts: string;
        tick: number;
        values: Record<string, number>;
        alarmsNeedingAction: number;
      };

      expect(quadro.tick).toBe(tickAt(NOW));
      expect(Date.parse(quadro.ts)).toBeGreaterThan(0);
      // o primeiro quadro traz tudo, porque não há anterior para comparar
      expect(Object.keys(quadro.values).length).toBeGreaterThan(100);
      expect(quadro.alarmsNeedingAction).toBeGreaterThanOrEqual(0);
    } finally {
      controller.abort();
    }
  }, 30_000);
});

/** Confere que o instante usado no teste é o que a simulação alcançou. */
describe('coerência do cenário do teste', () => {
  it('rodou até o fim da janela planejada', () => {
    expect(tickAt(NOW)).toBe(PLANO.startTick + 4 * TICKS_PER_HOUR);
    expect(app.simulation.lastReport()?.toTick).toBe(tickAt(NOW));
  });
});
