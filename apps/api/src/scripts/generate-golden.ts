import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  alarmThreshold,
  exceptionFilter,
  historianPoint,
  interpolate,
  readAt,
  recordSeries,
  relation,
  swingingDoor,
  timeWeightedAverage,
  type Alarm,
  type ArchivedSample,
  type HistorianPoint,
  type Sample,
} from '@mp1/shared';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../app';
import { openPglite } from '../db/sql-database';
import { seedDatabase } from '../db/seed';
import { loadEnv } from '../env';
import { catchUp } from '../runtime/catchup';
import { alarmEngine } from '../simulation/alarm-engine';
import { cdKernel, cdSteadyState } from '../simulation/cd-profile';
import { DEFAULT_SEED, tickTime } from '../simulation/clock';
import { decayPerStep, delaySteps, stepResponse } from '../simulation/fopdt';
import { processEngine } from '../simulation/process-engine';

/**
 * Gera o gabarito da implementação TypeScript.
 *
 * O back-end está sendo reescrito em Java, e a pergunta que importa não é "o
 * código Java compila?" — é "ele devolve os mesmos números?". Este script grava
 * em `reference/golden/` a entrada e a saída da implementação atual para um
 * conjunto de casos escolhidos, e os testes da implementação Java leem os
 * mesmos arquivos, alimentam a mesma entrada e comparam.
 *
 * Três decisões de formato, e todas têm a mesma razão — o arquivo é lido por
 * outra linguagem:
 *
 * 1. **Entrada e saída no mesmo arquivo.** Um gabarito que guardasse só a saída
 *    obrigaria a reconstruir a entrada dos dois lados, e aí o teste passaria a
 *    comparar duas reconstruções em vez de duas implementações.
 * 2. **Nada de `Infinity`, `NaN` ou `undefined`.** O JSON não os tem, e cada
 *    linguagem inventa o seu. O que falta é `null`.
 * 3. **Instantes em milissegundos do epoch**, não em texto ISO. Fuso e formato
 *    de data são justamente onde duas plataformas divergem em silêncio.
 *
 * O gabarito **não** é a especificação: ele é o que a implementação atual faz.
 * Se um caso revelar um erro na versão TypeScript, o certo é corrigir os dois
 * lados e regravar, não ensinar o Java a errar igual — e está escrito no README
 * da pasta.
 */

const OUT_DIR = fileURLToPath(new URL('../../../../reference/golden/', import.meta.url));

/** Quanto os testes do Java podem divergir deste gabarito. */
const TOLERANCE = 1e-9;

/**
 * O instante do gabarito das rotas.
 *
 * Escolhido, e não `Date.now()`: um gabarito que mudasse a cada execução não
 * seria gabarito. Fica meses depois da época da simulação de propósito, porque
 * a semente grava 72 h de histórico de mancal terminando aqui, e perto da época
 * esse histórico cairia antes dela.
 */
const GOLDEN_INSTANT = new Date('2026-03-02T09:00:00.000Z');

async function write(relativePath: string, body: unknown): Promise<number> {
  const file = OUT_DIR + relativePath;
  await mkdir(dirname(file), { recursive: true });

  // indentado de propósito: o gabarito é lido por gente quando um teste falha
  const json = `${JSON.stringify(body, null, 2)}\n`;
  await writeFile(file, json, 'utf8');
  return json.length;
}

// ---------------------------------------------------------------- FOPDT ----

/**
 * Resposta ao degrau de três relações.
 *
 * A escolha das três não é aleatória. A 14 é a mais rápida do conjunto —
 * τ = 4,5 s — e vai amostrada a cada 10 s de propósito: é o caso em que o
 * passo é **maior** que a constante de tempo, onde a discretização por
 * retentor de ordem zero se separa de uma aproximação de Euler. Euler daria
 * `1 - dt/τ = -1,22`, um fator negativo, e a resposta oscilaria de sinal a cada
 * passo. A exata dá `exp(-10/4,5) = 0,108`, que é o que uma primeira ordem faz.
 *
 * A 1 tem tempo morto de 75 s, três vezes a constante de tempo — ela cobra o
 * atraso puro, que é onde um laço mal escrito perde um passo. A 4 tem τ = 57 s
 * contra θ = 20 s, a situação oposta.
 */
function fopdtFixture(): unknown {
  const cases = [
    { relationId: '14', dtS: 10, samples: 40 },
    { relationId: '14', dtS: 1, samples: 60 },
    { relationId: '1', dtS: 5, samples: 80 },
    { relationId: '4', dtS: 1, samples: 200 },
  ];

  return {
    tolerance: TOLERANCE,
    note: 'Degrau unitário aplicado em t=0 e mantido. O índice k do vetor é o instante k·dt.',
    cases: cases.map(({ relationId, dtS, samples }) => {
      const model = relation(relationId);
      if (!model) throw new Error(`relação ${relationId} não existe`);

      return {
        relationId,
        input: model.input,
        output: model.output,
        model: { kp: model.kp, deadTimeS: model.deadTimeS, tauS: model.tauS },
        dtS,
        samples,
        stepValue: 1,
        expected: {
          decayPerStep: decayPerStep(model.tauS, dtS),
          delaySteps: delaySteps(model.deadTimeS, dtS),
          response: stepResponse(
            { kp: model.kp, deadTimeS: model.deadTimeS, tauS: model.tauS },
            1,
            dtS,
            samples,
          ),
        },
      };
    }),
  };
}

/**
 * O espalhamento lateral da relação 11 — diluição por zona sobre a gramatura.
 *
 * Corrigir a zona 70 não mexe só na zona 70: a massa se espalha, e o kernel
 * gaussiano com σ de 45 mm chega a cerca de duas zonas de cada lado. O caso
 * inclui a zona 1 de propósito, porque é onde a borda trunca — o que vazaria
 * para fora da folha some, e não é redistribuído.
 */
function cdFixture(): unknown {
  const model = relation('11');
  if (!model) throw new Error('relação 11 não existe');

  return {
    tolerance: TOLERANCE,
    relationId: '11',
    input: model.input,
    output: model.output,
    kp: model.kp,
    note: 'cdSteadyState: desvio estacionário por zona de um degrau numa zona. Bordas truncam.',
    kernel: cdKernel(),
    cases: [70, 1, 139].map((zoneIndex) => ({
      zoneIndex,
      stepValue: 10,
      expected: cdSteadyState(model.kp, 10, zoneIndex),
    })),
  };
}

// ----------------------------------------------------------- historiador ----

/** Uma série sintética, escrita à mão para exercer cada caminho da compressão. */
function series(point: HistorianPoint, shape: 'rampa' | 'degrau' | 'ruído'): Sample[] {
  const start = Date.UTC(2026, 0, 1, 12, 0, 0);
  const span = point.excDev ?? 1;
  const out: Sample[] = [];

  for (let i = 0; i < 120; i += 1) {
    const t = start + i * 5000;
    const v =
      shape === 'rampa'
        ? 100 + i * span * 0.4
        : shape === 'degrau'
          ? 100 + (i < 40 ? 0 : i < 80 ? span * 6 : span * 2)
          : // um seno lento mais um dente miúdo: o dente tem de morrer no filtro
            100 + Math.sin(i / 12) * span * 8 + (i % 2 === 0 ? span * 0.2 : -span * 0.2);

    out.push({ t, v });
  }

  return out;
}

function compressionFixture(): unknown {
  const tags = ['PIC-514', 'AIC-902', 'TI-5323A'];
  const shapes = ['rampa', 'degrau', 'ruído'] as const;

  return {
    tolerance: TOLERANCE,
    note:
      'Duas etapas em sequência: filtro de exceção na coleta, porta oscilante no arquivo. ' +
      '`afterException` é a saída da primeira; `archived` é a da segunda.',
    cases: tags.flatMap((tag, index) => {
      const point = historianPoint(tag);
      if (!point) throw new Error(`${tag} não é ponto do historiador`);

      const shape = shapes[index] ?? 'rampa';
      const samples = series(point, shape);

      // as duas etapas rodadas em separado, para o gabarito mostrar o meio
      const exception = exceptionFilter({ excDev: point.excDev ?? 0 });
      const afterException = samples.flatMap((sample) => exception.feed(sample));
      afterException.push(...exception.flush());

      const door = swingingDoor({ compDev: point.compDev ?? 0 });
      const archived: ArchivedSample[] = afterException.flatMap((sample) => door.feed(sample));
      archived.push(...door.flush());

      const whole = recordSeries(point, samples);

      return [
        {
          tag,
          shape,
          point: {
            pointId: point.pointId,
            unit: point.unit,
            excDev: point.excDev,
            compDev: point.compDev,
          },
          input: samples,
          expected: {
            afterException,
            archived,
            stats: whole.stats,
          },
        },
      ];
    }),
  };
}

/**
 * Leitura em instante arbitrário e média no tempo.
 *
 * A série é desigual de propósito: um trecho parado com um ponto só e um trecho
 * agitado com vários. É nela que a média dos pontos e a média no tempo dão
 * respostas diferentes, e só a segunda está certa.
 */
function interpolationFixture(): unknown {
  const t0 = Date.UTC(2026, 0, 1, 12, 0, 0);
  const archived: ArchivedSample[] = [
    { t: t0, v: 100, reason: 'inicial' },
    { t: t0 + 600_000, v: 100.4, reason: 'intervalo' },
    { t: t0 + 1_200_000, v: 118, reason: 'porta' },
    { t: t0 + 1_230_000, v: 126, reason: 'porta' },
    { t: t0 + 1_260_000, v: 121, reason: 'porta' },
    { t: t0 + 1_800_000, v: 103, reason: 'porta' },
    { t: t0 + 3_600_000, v: 102.5, reason: 'final' },
  ];

  const reads = [
    t0 - 60_000,
    t0,
    t0 + 300_000,
    t0 + 1_215_000,
    t0 + 1_245_000,
    t0 + 3_600_000,
    t0 + 7_200_000,
  ];

  const before = (t: number) => archived.filter((s) => s.t <= t).at(-1) ?? null;
  const after = (t: number) => archived.find((s) => s.t > t) ?? null;

  return {
    tolerance: TOLERANCE,
    note: 'readAt devolve o tipo da leitura junto com o valor: exata, interpolada ou extrapolada.',
    archived,
    reads: reads.map((t) => ({ t, expected: readAt(t, before(t), after(t)) })),
    interpolate: [
      {
        before: archived[2],
        after: archived[3],
        t: t0 + 1_215_000,
        expected: interpolate(archived[2] as Sample, archived[3] as Sample, t0 + 1_215_000),
      },
    ],
    timeWeightedAverage: [
      { from: t0, to: t0 + 3_600_000 },
      { from: t0 + 1_200_000, to: t0 + 1_800_000 },
      { from: t0 + 900_000, to: t0 + 1_500_000 },
    ].map((window) => ({
      ...window,
      expected: timeWeightedAverage(archived, window.from, window.to),
      note: 'As pontas são interpoladas: a média não depende de onde caiu o ponto mais próximo.',
    })),
  };
}

// --------------------------------------------------------------- alarmes ----

/**
 * Um cenário ISA-18.2 inteiro, varredura a varredura.
 *
 * A sequência é a que a norma descreve e a que uma tela de alarmes precisa
 * mostrar certo: dispara, piora, é reconhecido, normaliza. Depois um segundo
 * alarme é engavetado, e um terceiro trecho estoura vários pares de uma vez
 * para exercitar a contagem de inundação.
 */
function alarmFixture(): unknown {
  // a vibração do mancal do lado acionamento do CS23 — o mancal que a tela de
  // Mancais abre por padrão, e o único cuja tag aparece no conceito de tela
  const tag = 'VI-5123A';
  const high = alarmThreshold(tag, 'H');
  const highHigh = alarmThreshold(tag, 'HH');
  if (high === null || highHigh === null) throw new Error(`${tag} sem limites H/HH no catálogo`);

  const t0 = Date.UTC(2026, 0, 1, 12, 0, 0);
  const at = (minutes: number) => new Date(t0 + minutes * 60_000);

  const engine = alarmEngine();
  const steps: unknown[] = [];

  const scan = (minutes: number, value: number, note: string) => {
    const result = engine.scan(new Map([[tag, value]]), at(minutes));
    steps.push({
      minutes,
      action: 'scan',
      value,
      note,
      raised: result.raised,
      cleared: result.cleared,
      updated: result.updated,
      floodCount: engine.floodCount(at(minutes)),
    });
  };

  // os degraus são proporcionais à distância entre H e HH, e não valores fixos:
  // a mesma receita serve para uma tag de vibração em mm/s e uma de pressão em kPa
  const band = highHigh - high;

  scan(0, high - band, 'em regime, abaixo do H');
  scan(1, high + band * 0.2, 'estoura o H');
  scan(2, high + band * 0.7, 'piora: o pico sobe, o estado não muda');
  scan(3, high + band * 0.3, 'ainda alto, mas o pico guardado é o pior');

  const raised = engine.all().find((alarm) => alarm.limit === 'H');
  if (!raised) throw new Error('o alarme de H não foi registrado');

  const acknowledged = engine.acknowledge(raised.id, 'operador-turno-B', at(4));
  steps.push({ minutes: 4, action: 'acknowledge', by: 'operador-turno-B', alarm: acknowledged });

  scan(5, high - band * 0.1, 'normaliza: reconhecido e normalizado sai da lista de ação');

  // engavetamento: o alarme volta a estourar e é silenciado por um prazo
  scan(10, highHigh + band * 0.3, 'estoura o HH');
  const second = engine.all().find((alarm) => alarm.limit === 'HH' && alarm.clearedAt === null);
  if (!second) throw new Error('o alarme de HH não foi registrado');

  const shelved = engine.shelve(second.id, 'operador-turno-B', at(130));
  steps.push({
    minutes: 11,
    action: 'shelve',
    by: 'operador-turno-B',
    untilMinutes: 130,
    alarm: shelved,
  });

  const unshelved = engine.unshelve(second.id);
  steps.push({ minutes: 12, action: 'unshelve', alarm: unshelved });

  scan(13, high - band, 'tudo normaliza');

  const final: Alarm[] = engine.all();

  return {
    tolerance: TOLERANCE,
    note:
      'Os ids são determinísticos: AL-<instante em segundos>-<tag>-<limite>. ' +
      'O pico guardado é o pior valor desde o disparo, não o último.',
    tag,
    thresholds: { H: high, HH: highHigh },
    epochMs: t0,
    steps,
    finalState: final,
  };
}

// ------------------------------------------------------------- simulação ----

/**
 * A simulação em três instantes, e a prova de que dormir não muda nada.
 *
 * O terceiro caso é o que importa para o Render Free: a API dorme sem tráfego e
 * recupera o intervalo perdido quando acorda. Rodar de uma vez e rodar em dois
 * pedaços têm de dar o mesmo número — e foi um teste assim que, na versão
 * TypeScript, revelou que o estado do motor precisava ser persistido.
 */
function simulationFixture(): unknown {
  const tags = [
    'PIC-514',
    'PIC-711',
    'PIC-712',
    'FIC-105',
    'AIC-104',
    'SIC-1104',
    'WIC-401',
    'WIC-801',
    'ZIC-205',
    'AIC-901',
    'AIC-902',
    'AIC-903',
    'AIC-905',
    'AI-407',
    'AI-907',
    'TIC-5201',
    'LIC-5301',
    'PDIC-702',
    'QIC-301',
    'NIC-601',
  ];

  const ticks = [0, 600, 3600];

  const snapshotAt = (tick: number) => {
    const engine = processEngine(0, { seed: DEFAULT_SEED });
    engine.runTo(tick);

    const measured: Record<string, number | null> = {};
    const truth: Record<string, number | null> = {};
    for (const tag of tags) {
      measured[tag] = engine.measured(tag);
      truth[tag] = engine.truth(tag);
    }
    return { measured, truth };
  };

  // de uma vez contra em dois pedaços, com o estado serializado no meio
  const SPLIT_TICK = 1500;

  const whole = processEngine(0, { seed: DEFAULT_SEED });
  whole.runTo(3600);

  const firstHalf = processEngine(0, { seed: DEFAULT_SEED });
  firstHalf.runTo(SPLIT_TICK);
  const saved = firstHalf.snapshotState();

  // a retomada começa no passo gravado, não em zero: o motor recusa outro, e
  // com razão — retomar de outro passo saltaria ou repetiria processo
  const resumed = processEngine(SPLIT_TICK, { seed: DEFAULT_SEED, state: saved });
  resumed.runTo(3600);

  const sample = (engine: ReturnType<typeof processEngine>) =>
    Object.fromEntries(tags.map((tag) => [tag, engine.measured(tag)]));

  return {
    tolerance: TOLERANCE,
    note:
      'Os valores saem de (semente, passo) mais o estado da rede. A grade de passos é absoluta, ' +
      'ancorada na época escrita, e o passo é de 1 s.',
    seed: DEFAULT_SEED,
    tags,
    snapshots: ticks.map((tick) => ({
      tick,
      atMs: tickTime(tick).getTime(),
      expected: snapshotAt(tick),
    })),
    resume: {
      note: 'Rodar 0→3600 de uma vez e rodar 0→1500, salvar, restaurar e ir até 3600 dão o mesmo.',
      splitAtTick: SPLIT_TICK,
      toTick: 3600,
      savedState: saved,
      expected: { whole: sample(whole), resumed: sample(resumed) },
    },
  };
}

// -------------------------------------------------------------- as rotas ----

/**
 * A resposta de cada rota para um estado fixo.
 *
 * O estado é construído do zero: banco em memória, migrations, semente e uma
 * retomada de duas horas até um instante escolhido. O mesmo roteiro cabe no
 * teste Java com Testcontainers, e o que se compara é o corpo da resposta.
 */
async function routeFixture(app: FastifyInstance, nowMs: number): Promise<unknown> {
  const routes = [
    '/health',
    '/assets',
    '/process/values',
    '/process/steam-groups',
    '/alarms',
    '/shifts',
    '/reels',
    '/web-breaks',
    '/grade-changes',
    '/rounds',
    '/notes',
    '/setpoint-changes',
    '/process/tags/PIC-514',
    '/assets/MP1-SEC-G4-CS23-MLA',
  ];

  const responses: Record<string, unknown> = {};
  for (const url of routes) {
    const response = await app.inject({ method: 'GET', url: encodeURI(url) });
    if (response.statusCode !== 200) {
      throw new Error(`GET ${url} respondeu ${String(response.statusCode)}: ${response.body}`);
    }
    responses[url] = response.json();
  }

  return {
    tolerance: TOLERANCE,
    note:
      'Estado fixo: banco em memória, migrations, semente e retomada de 2 h até `nowMs`. ' +
      'Campos que carregam o instante da geração mudam com o relógio e estão listados em ' +
      '`volatileFields` — o teste Java os ignora.',
    nowMs,
    seed: DEFAULT_SEED,
    volatileFields: ['uptimeS', 'generatedAt'],
    responses,
  };
}

// ------------------------------------------------------------------ main ----

async function main(): Promise<void> {
  let bytes = 0;
  let files = 0;

  const put = async (path: string, body: unknown): Promise<void> => {
    bytes += await write(path, body);
    files += 1;
  };

  await put('fopdt/step-responses.json', fopdtFixture());
  await put('fopdt/cd-spread.json', cdFixture());
  await put('historian/compression.json', compressionFixture());
  await put('historian/interpolation.json', interpolationFixture());
  await put('alarms/sequence.json', alarmFixture());
  await put('simulation/tags.json', simulationFixture());

  // as rotas precisam de banco; o resto é tudo função pura
  const now = GOLDEN_INSTANT;
  const db = await openPglite();
  await db.migrate();
  await seedDatabase(db, { now });
  const report = await catchUp(db, { now });

  const app = await buildApp(loadEnv({ NODE_ENV: 'test' }), db, { clock: () => now });
  await put('api/routes.json', await routeFixture(app, now.getTime()));
  await app.close();

  console.log(
    `gabarito: ${String(files)} arquivos, ${(bytes / 1024).toFixed(0)} kB — ` +
      `${String(report.scans)} varreduras, ${String(report.archived)} linhas arquivadas, ` +
      `até ${now.toISOString()}`,
  );
}

await main();
