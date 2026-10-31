import {
  allAssets,
  ARCHIVE_RETENTION_DAYS,
  HISTORIAN_POINTS,
  historianPoint,
  MP1,
  RAW_RETENTION_MINUTES,
  shiftWindowAt,
} from '@mp1/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { SqlExecutor } from '../db/executor';
import type { Database } from '../db/repository';
import { clearOperations, DRIVERS } from '../db/test-drivers';
import {
  MAX_CATCHUP_TICKS,
  TICKS_PER_HOUR,
  TICKS_PER_MINUTE,
  tickAt,
  tickTime,
} from '../simulation/clock';
import { shiftPlan } from '../simulation/scenarios';
import { bearingValuesAt, catchUp, degradationScenarioAt, MAX_CATCHUP_HOURS } from './catchup';
import { HISTORIAN_SCAN_TICKS, RAW_TAGS } from './recorder';

/** Um instante fixo, para a retomada ser comparável entre execuções. */
const NOW = new Date('2026-06-15T12:00:00Z');
const SEED = 4242;

const minutosAntes = (minutos: number): Date => new Date(NOW.getTime() - minutos * 60_000);

/**
 * Só o PGlite.
 *
 * A retomada roda a cadeia inteira — motor, mancais, compressão, alarmes — e
 * duplicar isso contra um Postgres remoto custaria minutos sem testar nada que
 * as suítes de repositório já não testem nos dois drivers.
 */
const driver = DRIVERS[0];
if (!driver) throw new Error('nenhum driver de teste disponível');

const LENTO = 60_000;

describe('retomada', () => {
  let db: Database;
  let sql: SqlExecutor;

  /** Põe o marcador a `minutos` do instante de referência. */
  async function marcarEm(minutos: number): Promise<void> {
    await db.saveSimState({
      seed: SEED,
      lastTick: tickAt(minutosAntes(minutos)),
      updatedAt: minutosAntes(minutos),
    });
  }

  beforeAll(async () => {
    ({ db, sql } = await driver.openWithSql());
    await db.migrate();
  }, LENTO);

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await clearOperations(sql);
    await sql.exec('delete from historian_point');
    await sql.exec('delete from sim_state');
    await db.replaceAssets(allAssets(MP1));
    await db.replaceHistorianPoints(HISTORIAN_POINTS);
  });

  it(
    'semeia os pontos se ainda não houver',
    async () => {
      await sql.exec('delete from historian_point');
      await marcarEm(5);
      await catchUp(db, { seed: SEED, now: NOW });

      expect((await db.historianUsage()).points).toBe(HISTORIAN_POINTS.length);
    },
    LENTO,
  );

  it(
    'grava arquivo e bruto, e deixa o marcador onde parou',
    async () => {
      await marcarEm(10);
      const report = await catchUp(db, { seed: SEED, now: NOW });

      expect(report.reanchored).toBe(false);
      expect(report.ticks).toBe(10 * TICKS_PER_MINUTE);
      expect(report.scans).toBeGreaterThan(0);
      expect(report.archived).toBeGreaterThan(0);

      const uso = await db.historianUsage();
      expect(uso.archiveRows).toBeGreaterThan(0);
      expect(uso.rawRows).toBeGreaterThan(0);

      const estado = await db.findSimState();
      expect(estado?.seed).toBe(SEED);
      expect(estado?.lastTick).toBe(report.toTick);
    },
    LENTO,
  );

  it(
    'não faz nada quando já está em dia',
    async () => {
      await marcarEm(5);
      await catchUp(db, { seed: SEED, now: NOW });
      const segunda = await catchUp(db, { seed: SEED, now: NOW });

      expect(segunda.ticks).toBe(0);
      expect(segunda.archived).toBe(0);
      expect(segunda.scans).toBe(0);
    },
    LENTO,
  );

  it(
    'reancora na primeira vez, porque não há de onde continuar',
    async () => {
      const report = await catchUp(db, { seed: SEED, now: NOW });

      expect(report.reanchored).toBe(true);
      expect(report.ticks).toBe(MAX_CATCHUP_TICKS);
      expect(report.fromTick).toBe(tickAt(NOW) - MAX_CATCHUP_TICKS);
    },
    LENTO,
  );

  it(
    'reancora e avisa quando dormiu mais que o teto',
    async () => {
      await marcarEm((MAX_CATCHUP_HOURS + 5) * 60);

      const depois = await catchUp(db, { seed: SEED, now: NOW });
      expect(depois.reanchored).toBe(true);
      expect(depois.ticks).toBe(MAX_CATCHUP_TICKS);
    },
    LENTO,
  );

  /**
   * Trocar a semente é trocar de máquina.
   *
   * Sem detectar isso, o arquivo passaria a ter duas séries diferentes coladas
   * no mesmo eixo de tempo, sem nada indicando onde uma acaba.
   */
  it(
    'detecta troca de semente e reancora',
    async () => {
      await marcarEm(5);
      const outra = await catchUp(db, { seed: SEED + 1, now: NOW });

      expect(outra.seedChanged).toBe(true);
      expect(outra.reanchored).toBe(true);
    },
    LENTO,
  );

  it(
    'continua do estado gravado em vez de reancorar',
    async () => {
      await marcarEm(20);
      const primeira = await catchUp(db, { seed: SEED, now: minutosAntes(10) });
      expect(primeira.resumedFromState).toBe(false);

      const segunda = await catchUp(db, { seed: SEED, now: NOW });
      expect(segunda.resumedFromState).toBe(true);
      expect(segunda.reanchored).toBe(false);
    },
    LENTO,
  );

  /**
   * A rede tem estado, e retomar precisa continuar dele.
   *
   * Este é o teste que pegou o erro: antes, cada retomada montava a rede no
   * ponto de operação, e acordar no meio de um transiente perdia o transiente.
   * Aqui a comparação é sobre a **verdade** gravada, que é o estado físico da
   * máquina — não sobre a medida, que tem ruído, nem sobre o arquivo, que ganha
   * pontos de borda a cada retomada.
   *
   * Uma relação do catálogo tem 270 s de tempo morto. Fatiar o intervalo em
   * pedaços de dez minutos põe cortes no meio dessa linha de atraso, que é
   * exatamente onde um estado perdido apareceria.
   */
  it(
    'chega ao mesmo estado físico rodando de uma vez ou em pedaços',
    async () => {
      await marcarEm(40);
      await catchUp(db, { seed: SEED, now: NOW });
      const contínuo = (await db.findSimState())?.state as { truth: Record<string, number> };

      await sql.exec('delete from sim_state');
      await sql.exec('delete from historian_archive');
      await marcarEm(40);
      for (const minutos of [30, 20, 10, 0]) {
        await catchUp(db, { seed: SEED, now: minutosAntes(minutos) });
      }
      const fatiado = (await db.findSimState())?.state as { truth: Record<string, number> };

      expect(Object.keys(fatiado.truth).length).toBeGreaterThan(100);
      expect(fatiado.truth).toEqual(contínuo.truth);
    },
    LENTO,
  );

  /**
   * Um transiente atravessando o corte.
   *
   * A troca de gramatura do plano move o setpoint da `AIC-902`, e a cascata leva
   * minutos para estabilizar: a relação que a governa tem 75 s de tempo morto e
   * τ de 23 s. Se a retomada reancorasse, a rede voltaria ao ponto de operação
   * no meio da transição e a tela mostraria uma gramatura que já chegou quando
   * ela ainda está subindo.
   *
   * O instante é escolhido a partir do próprio plano, e não escrito: quem decide
   * quando a troca acontece é o cenário, e o teste pergunta a ele.
   */
  it(
    'preserva um transiente que atravessa o corte da retomada',
    async () => {
      // o dia 2026-06-15 tem troca no turno B; o plano diz exatamente quando
      const turnoB = shiftWindowAt(new Date('2026-06-15T18:00:00Z'));
      const troca = shiftPlan(SEED, turnoB).gradeChange;
      expect(troca).not.toBeNull();
      if (!troca) return;

      const inicioDaTroca = tickTime(troca.startTick);
      const antes = new Date(inicioDaTroca.getTime() - 5 * 60_000);

      await db.saveSimState({ seed: SEED, lastTick: tickAt(antes), updatedAt: antes });
      // a primeira retomada reancora (não há estado) e deixa a rede em regime
      await catchUp(db, { seed: SEED, now: inicioDaTroca });
      const noComeço = (await db.findSimState())?.state as { truth: Record<string, number> };
      expect(noComeço.truth['AIC-902'] ?? 0).toBeCloseTo(troca.fromGsm, 0);

      // dois minutos depois da troca: a gramatura está no caminho, não no destino
      await catchUp(db, { seed: SEED, now: new Date(inicioDaTroca.getTime() + 2 * 60_000) });
      const meio = (await db.findSimState())?.state as { truth: Record<string, number> };
      const noMeio = meio.truth['AIC-902'] ?? 0;

      const [menor, maior] = [troca.fromGsm, troca.toGsm].sort((a, b) => a - b);
      expect(noMeio).toBeGreaterThan(menor ?? 0);
      expect(noMeio).toBeLessThan(maior ?? 0);

      // e, em pedaços, chega ao destino
      for (const minutos of [6, 12, 25]) {
        await catchUp(db, {
          seed: SEED,
          now: new Date(inicioDaTroca.getTime() + minutos * 60_000),
        });
      }
      const fim = (await db.findSimState())?.state as { truth: Record<string, number> };

      expect(Math.abs((fim.truth['AIC-902'] ?? 0) - troca.toGsm)).toBeLessThan(1);
    },
    LENTO,
  );

  /**
   * A propriedade da regra 9, de ponta a ponta — e o que ela **não** diz.
   *
   * Os valores arquivados nos instantes que as duas execuções têm em comum são
   * idênticos: a compressão não desloca nada, não arredonda diferente, não
   * deriva. É isso que o `on conflict do nothing` precisa para reconhecer uma
   * repetição.
   *
   * O que a execução fatiada tem **a mais** são os pontos de borda. Cada
   * retomada monta um gravador novo, e a porta oscilante de cada ponto arranca
   * sem âncora: o primeiro valor da janela entra com razão `inicial` e o último
   * com `final`. Três retomadas têm três bordas. É o comportamento certo, e é o
   * que um historiador de verdade faz ao reiniciar — o valor logo depois de um
   * corte não pode ser descartado por caber numa reta cuja outra ponta está do
   * outro lado do corte.
   */
  it(
    'arquiva os mesmos valores em pedaços, com os pontos de borda a mais',
    async () => {
      const ponto = historianPoint('PIC-514');
      const pointId = ponto?.pointId ?? 0;
      // a janela inclui NOW: é lá que cai o ponto de borda `final` de cada
      // execução, e é justamente ele que a comparação precisa ver
      const janela = { pointId, from: minutosAntes(30), to: new Date(NOW.getTime() + 1000) };

      await marcarEm(30);
      await catchUp(db, { seed: SEED, now: NOW });
      const deUmaVez = await db.archivedSamples(janela);

      await sql.exec('delete from historian_archive');
      await sql.exec('delete from historian_raw');
      await sql.exec('delete from sim_state');

      await marcarEm(30);
      for (const minutos of [20, 10, 0]) {
        await catchUp(db, { seed: SEED, now: minutosAntes(minutos) });
      }
      const emPedaços = await db.archivedSamples(janela);

      // uma execução deixa as duas bordas da janela; três execuções deixam seis
      expect(deUmaVez.length).toBeGreaterThanOrEqual(2);
      expect(emPedaços.length).toBeGreaterThan(deUmaVez.length);

      // nos instantes comuns, o valor é exatamente o mesmo
      const porInstante = new Map(emPedaços.map((s) => [s.t, s.v]));
      for (const amostra of deUmaVez) {
        if (!porInstante.has(amostra.t)) continue;
        expect(porInstante.get(amostra.t), new Date(amostra.t).toISOString()).toBe(amostra.v);
      }

      // e os instantes de um são subconjunto dos do outro
      const comuns = deUmaVez.filter((s) => porInstante.has(s.t));
      expect(comuns.length).toBeGreaterThan(0);
    },
    LENTO,
  );

  it(
    'não duplica amostra quando o mesmo trecho é reexecutado',
    async () => {
      await marcarEm(10);
      await catchUp(db, { seed: SEED, now: NOW });
      const antes = await db.historianUsage();

      // o marcador volta atrás: o trecho é reexecutado por inteiro
      await marcarEm(10);
      await catchUp(db, { seed: SEED, now: NOW });

      const depois = await db.historianUsage();
      expect(depois.archiveRows).toBe(antes.archiveRows);
      expect(depois.rawRows).toBe(antes.rawRows);
    },
    LENTO,
  );

  it(
    'comprime: muito mais amostras alimentadas que linhas arquivadas',
    async () => {
      await marcarEm(30);
      const report = await catchUp(db, { seed: SEED, now: NOW });

      expect(report.compression.fed).toBeGreaterThan(report.compression.archived);
      expect(report.compression.ratio).toBeGreaterThan(10);
    },
    LENTO,
  );

  it(
    'grava bruto só dos pontos declarados, e só dentro da retenção dele',
    async () => {
      await marcarEm(RAW_RETENTION_MINUTES * 3);
      await catchUp(db, { seed: SEED, now: NOW });

      const ids = new Set(
        RAW_TAGS.map((tag) => historianPoint(tag)?.pointId).filter((id) => id !== undefined),
      );
      const rows = await sql.rows<{ point_id: number }>(
        'select distinct point_id from historian_raw',
      );
      expect(rows.length).toBe(ids.size);
      for (const row of rows) expect(ids.has(Number(row.point_id))).toBe(true);

      // três vezes a retenção de bruto rodada, mas só uma retenção coletada
      const esperado = (ids.size * (RAW_RETENTION_MINUTES * 60)) / HISTORIAN_SCAN_TICKS;
      expect((await db.historianUsage()).rawRows).toBeLessThanOrEqual(esperado + ids.size);
    },
    LENTO,
  );

  it(
    'varre na grade absoluta, em múltiplos do intervalo de varredura',
    async () => {
      await marcarEm(10);
      await catchUp(db, { seed: SEED, now: NOW });

      const ponto = historianPoint('PIC-514');
      const amostras = await db.rawSamples({
        pointId: ponto?.pointId ?? 0,
        from: minutosAntes(20),
        to: NOW,
      });

      expect(amostras.length).toBeGreaterThan(0);
      for (const amostra of amostras) {
        const tick = Math.round((amostra.t - tickTime(0).getTime()) / 1000);
        expect(tick % HISTORIAN_SCAN_TICKS).toBe(0);
      }
    },
    LENTO,
  );

  it(
    'poda o que passou da retenção',
    async () => {
      const ponto = historianPoint('PIC-514');
      const velho = new Date(NOW.getTime() - (ARCHIVE_RETENTION_DAYS + 2) * 86_400_000);

      await db.insertArchiveSamples([
        { pointId: ponto?.pointId ?? 0, t: velho.getTime(), v: 230, reason: 'porta' },
      ]);
      expect((await db.historianUsage()).archiveRows).toBe(1);

      await marcarEm(5);
      await catchUp(db, { seed: SEED, now: NOW });

      const sobrou = await db.archivedSamples({
        pointId: ponto?.pointId ?? 0,
        from: new Date(velho.getTime() - 86_400_000),
        to: new Date(velho.getTime() + 86_400_000),
      });
      expect(sobrou).toEqual([]);
    },
    LENTO,
  );

  /**
   * A retomada roda dentro de uma requisição HTTP, no pior caso de quatro
   * horas. A folga do limite é grande de propósito: o teste é contra regressão
   * de ordem de grandeza, não um banco de medição.
   */
  it(
    'cabe no tempo de uma requisição, no pior caso',
    async () => {
      const report = await catchUp(db, { seed: SEED, now: NOW });

      expect(report.ticks).toBe(MAX_CATCHUP_TICKS);
      expect(report.durationMs).toBeLessThan(30_000);
    },
    LENTO,
  );
});

describe('valores de mancal na retomada', () => {
  it('traz as três medições de cada mancal de secador, nas tags do catálogo', () => {
    const scenario = degradationScenarioAt(NOW);
    const values = bearingValuesAt(SEED, scenario.toTick, scenario);

    // 36 cilindros × 2 lados × 3 medições
    expect(values.size).toBe(36 * 2 * 3);
    expect(values.get('VI-5123A')).toBeGreaterThan(0);
    expect(values.get('TI-5323A')).toBeGreaterThan(0);
    expect(values.get('VE-5123A')).toBeGreaterThan(0);
  });

  it('põe o mancal que degrada em alarme no fim da janela', () => {
    const scenario = degradationScenarioAt(NOW);
    const values = bearingValuesAt(SEED, scenario.toTick, scenario);

    // HH da VI-51nnA é 4,5 mm/s, a fronteira C→D do grupo 2 rígido
    expect(values.get('VI-5123A')).toBeGreaterThan(4.5);
    // o vizinho do outro lado do mesmo cilindro segue saudável
    expect(values.get('VI-5123B')).toBeLessThan(2.8);
  });

  it('ancora a degradação para terminar agora', () => {
    const scenario = degradationScenarioAt(NOW);

    expect(scenario.assetTag).toBe('MP1-SEC-G4-CS23-MLA');
    expect(scenario.toTick - scenario.fromTick).toBe(72 * TICKS_PER_HOUR);
  });
});
