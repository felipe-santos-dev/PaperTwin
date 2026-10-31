import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import {
  ARCHIVE_REASONS,
  ARCHIVE_RETENTION_DAYS,
  archiveReasonCode,
  HISTORIAN_POINTS,
  historianPoint,
  RAW_RETENTION_MINUTES,
  recordSeries,
  type HistorianPoint,
  type PointArchivedSample,
  type PointSample,
} from '@mp1/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { SqlExecutor } from './executor';
import { MAX_PLOT_BUCKETS } from './historian-store';
import type { Database } from './repository';
import { DRIVERS } from './test-drivers';

/**
 * O ponto, ou falha.
 *
 * Em função, e não um `if (!ponto) throw` no escopo do módulo: o
 * estreitamento de um `const` do módulo não atravessa uma declaração de
 * função, que é içada, e o compilador volta a ver `| null` lá dentro.
 */
function requirePoint(tag: string): HistorianPoint {
  const point = historianPoint(tag);
  if (!point) throw new Error(`${tag} ausente no historiador`);
  return point;
}

const ponto = requirePoint('PIC-514');
const outroPonto = requirePoint('PIC-711');

const T0 = Date.UTC(2026, 9, 31, 12, 0, 0);

/** Amostras de um ponto, uma por segundo. */
function samples(pointId: number, values: readonly number[], stepS = 1): PointSample[] {
  return values.map((v, i) => ({ pointId, t: T0 + i * stepS * 1000, v }));
}

for (const driver of DRIVERS) {
  const suite = driver.enabled ? describe : describe.skip;

  suite(`historiador · ${driver.name}`, () => {
    let db: Database;
    let sql: SqlExecutor;

    beforeAll(async () => {
      ({ db, sql } = await driver.openWithSql());
      await db.migrate();
    }, 60_000);

    afterAll(async () => {
      await db.close();
    });

    beforeEach(async () => {
      // apagar os pontos cascateia em bruto e arquivo
      await db.replaceHistorianPoints([]);
      await db.replaceHistorianPoints(HISTORIAN_POINTS);
    });

    describe('pontos', () => {
      it('grava a lista inteira do catálogo', async () => {
        expect(await db.replaceHistorianPoints(HISTORIAN_POINTS)).toBe(HISTORIAN_POINTS.length);
        expect(await db.listHistorianPoints()).toHaveLength(HISTORIAN_POINTS.length);
      });

      it('devolve o ponto exatamente como entrou', async () => {
        expect(await db.findHistorianPoint('PIC-514')).toEqual(ponto);
      });

      it('mantém a ordem dos ids', async () => {
        const stored = await db.listHistorianPoints();
        expect(stored.map((p) => p.pointId)).toEqual(HISTORIAN_POINTS.map((p) => p.pointId));
      });

      it('devolve null para tag que não é arquivada', async () => {
        await expect(db.findHistorianPoint('LAB-1206')).resolves.toBeNull();
      });

      it('recusa amostra de um ponto que não existe', async () => {
        await expect(db.insertRawSamples([{ pointId: 30_000, t: T0, v: 1 }])).rejects.toThrow();
      });

      it('leva as amostras junto quando o ponto sai da lista', async () => {
        await db.insertRawSamples(samples(ponto.pointId, [230, 231]));
        expect((await db.historianUsage()).rawRows).toBe(2);

        await db.replaceHistorianPoints([]);
        expect(await db.historianUsage()).toEqual({ points: 0, rawRows: 0, archiveRows: 0 });
      });
    });

    describe('valor bruto', () => {
      it('grava e devolve na ordem do tempo', async () => {
        const entrada = samples(ponto.pointId, [230, 231, 232]);
        expect(await db.insertRawSamples(entrada)).toBe(3);

        const stored = await db.rawSamples({
          pointId: ponto.pointId,
          from: new Date(T0),
          to: new Date(T0 + 60_000),
        });

        expect(stored).toEqual(entrada);
      });

      it('ignora repetição do mesmo (ponto, instante)', async () => {
        const entrada = samples(ponto.pointId, [230]);
        await db.insertRawSamples(entrada);
        await db.insertRawSamples(entrada);

        expect((await db.historianUsage()).rawRows).toBe(1);
      });

      it('aceita lote maior que o tamanho do comando', async () => {
        const grande = samples(
          ponto.pointId,
          Array.from({ length: 2500 }, (_, i) => 230 + (i % 7)),
        );
        await db.insertRawSamples(grande);

        expect((await db.historianUsage()).rawRows).toBe(2500);
      });

      it('respeita a janela, fechada no início e aberta no fim', async () => {
        await db.insertRawSamples(samples(ponto.pointId, [230, 231, 232, 233]));

        const stored = await db.rawSamples({
          pointId: ponto.pointId,
          from: new Date(T0 + 1000),
          to: new Date(T0 + 3000),
        });

        expect(stored.map((s) => s.v)).toEqual([231, 232]);
      });

      it('não mistura pontos', async () => {
        await db.insertRawSamples([
          ...samples(ponto.pointId, [230]),
          ...samples(outroPonto.pointId, [120]),
        ]);

        const stored = await db.rawSamples({
          pointId: outroPonto.pointId,
          from: new Date(T0),
          to: new Date(T0 + 60_000),
        });

        expect(stored.map((s) => s.v)).toEqual([120]);
      });
    });

    describe('valor arquivado', () => {
      /** O que a compressão produz para um sinal com ruído e um degrau. */
      function arquivo(): PointArchivedSample[] {
        const sinal = [
          ...Array.from({ length: 120 }, (_, i) => 230 + Math.sin(i / 4) * 0.5),
          ...Array.from({ length: 120 }, () => 280),
        ];
        const { archived } = recordSeries(ponto, samples(ponto.pointId, sinal));
        return archived.map((s) => ({ ...s, pointId: ponto.pointId }));
      }

      it('grava com a razão de cada linha', async () => {
        const entrada = arquivo();
        expect(entrada.length).toBeGreaterThan(2);
        expect(await db.insertArchiveSamples(entrada)).toBe(entrada.length);

        const stored = await db.archivedSamples({
          pointId: ponto.pointId,
          from: new Date(T0),
          to: new Date(T0 + 600_000),
        });

        expect(stored).toEqual(entrada);
        expect(stored[0]?.reason).toBe('inicial');
      });

      it('aceita todas as razões declaradas', async () => {
        const todas: PointArchivedSample[] = ARCHIVE_REASONS.map((reason, i) => ({
          pointId: ponto.pointId,
          t: T0 + i * 1000,
          v: 230,
          reason,
        }));
        await db.insertArchiveSamples(todas);

        const stored = await db.archivedSamples({
          pointId: ponto.pointId,
          from: new Date(T0),
          to: new Date(T0 + 60_000),
        });

        expect(stored.map((s) => s.reason)).toEqual([...ARCHIVE_REASONS]);
      });

      it('recusa código de razão fora da lista', async () => {
        await expect(
          sql.rows(
            `insert into historian_archive (ts, value, point_id, reason)
             values ($1::timestamptz, 230, $2, $3)`,
            [new Date(T0).toISOString(), ponto.pointId, ARCHIVE_REASONS.length + 1],
          ),
        ).rejects.toThrow();
      });

      it('acha a âncora antes e depois da janela', async () => {
        await db.insertArchiveSamples(arquivo());

        const antes = await db.archivedBefore(ponto.pointId, new Date(T0 + 150_000));
        expect(antes).not.toBeNull();
        expect(antes?.t).toBeLessThan(T0 + 150_000);

        const depois = await db.archivedAfter(ponto.pointId, new Date(T0 + 150_000));
        expect(depois?.t).toBeGreaterThanOrEqual(T0 + 150_000);
      });

      it('não tem âncora antes do primeiro valor', async () => {
        await db.insertArchiveSamples(arquivo());
        await expect(db.archivedBefore(ponto.pointId, new Date(T0))).resolves.toBeNull();
      });

      it('acha o último arquivado do ponto', async () => {
        const entrada = arquivo();
        await db.insertArchiveSamples(entrada);

        expect((await db.latestArchived(ponto.pointId))?.t).toBe(entrada.at(-1)?.t);
        await expect(db.latestArchived(outroPonto.pointId)).resolves.toBeNull();
      });

      /**
       * O arquivo é menor que o bruto, e é por isso que ele existe.
       *
       * Grava o mesmo sinal nas duas tabelas e compara. A taxa aqui é de um
       * sinal de teste, não da simulação — a de verdade sai de `historianUsage`
       * depois de a Fase 5 rodar um turno.
       */
      it('ocupa muito menos linhas que o bruto do mesmo sinal', async () => {
        const sinal = Array.from({ length: 600 }, (_, i) => 230 + Math.sin(i / 5) * 0.4);
        const bruto = samples(ponto.pointId, sinal);
        const { archived } = recordSeries(ponto, bruto);

        await db.insertRawSamples(bruto);
        await db.insertArchiveSamples(archived.map((s) => ({ ...s, pointId: ponto.pointId })));

        const uso = await db.historianUsage();
        expect(uso.rawRows).toBe(600);
        expect(uso.archiveRows).toBeLessThan(uso.rawRows / 5);
      });
    });

    describe('tendência', () => {
      /** Uma rampa de 0 a 100 em 100 s, um ponto por segundo. */
      function rampa(): PointArchivedSample[] {
        return Array.from({ length: 101 }, (_, i) => ({
          pointId: ponto.pointId,
          t: T0 + i * 1000,
          v: i,
          reason: 'porta' as const,
        }));
      }

      it('devolve colunas com mínimo, máximo, primeiro e último', async () => {
        await db.insertArchiveSamples(rampa());

        const t = await db.trend({
          pointId: ponto.pointId,
          from: new Date(T0),
          to: new Date(T0 + 100_000),
          buckets: 10,
        });

        expect(t.bucketS).toBe(10);
        expect(t.buckets.length).toBeGreaterThan(8);

        const primeira = t.buckets[0];
        expect(primeira?.min).toBe(0);
        expect(primeira?.max).toBe(9);
        expect(primeira?.first).toBe(0);
        expect(primeira?.last).toBe(9);
        expect(primeira?.samples).toBe(10);
      });

      /**
       * É para isto que a coluna tem quatro valores.
       *
       * Um pico de um segundo numa janela de cem, desenhada em dez colunas,
       * desapareceria numa média por coluna. No máximo da coluna ele aparece.
       */
      it('preserva um pico curto que uma média apagaria', async () => {
        await db.insertArchiveSamples([
          ...rampa(),
          { pointId: ponto.pointId, t: T0 + 55_500, v: 900, reason: 'porta' },
        ]);

        const t = await db.trend({
          pointId: ponto.pointId,
          from: new Date(T0),
          to: new Date(T0 + 100_000),
          buckets: 10,
        });

        expect(Math.max(...t.buckets.map((b) => b.max))).toBe(900);
      });

      it('traz as âncoras dos dois lados da janela', async () => {
        await db.insertArchiveSamples(rampa());

        const t = await db.trend({
          pointId: ponto.pointId,
          from: new Date(T0 + 30_000),
          to: new Date(T0 + 60_000),
          buckets: 10,
        });

        expect(t.before?.t).toBeLessThan(T0 + 30_000);
        expect(t.after?.t).toBeGreaterThanOrEqual(T0 + 60_000);
      });

      it('dá média no tempo, não média dos pontos', async () => {
        await db.insertArchiveSamples(rampa());

        const t = await db.trend({
          pointId: ponto.pointId,
          from: new Date(T0),
          to: new Date(T0 + 100_000),
          buckets: 10,
        });

        // rampa de 0 a 100: a média no tempo é 50
        expect(t.timeWeightedAverage).toBeCloseTo(50, 6);
      });

      it('alinha as colunas a uma origem fixa, não ao primeiro dado', async () => {
        await db.insertArchiveSamples(rampa());

        const inteiro = await db.trend({
          pointId: ponto.pointId,
          from: new Date(T0),
          to: new Date(T0 + 100_000),
          buckets: 10,
        });
        const recortado = await db.trend({
          pointId: ponto.pointId,
          from: new Date(T0 + 20_000),
          to: new Date(T0 + 100_000),
          buckets: 8,
        });

        const bordasDoInteiro = new Set(inteiro.buckets.map((b) => b.bucketStart));
        for (const bucket of recortado.buckets) {
          expect(bordasDoInteiro.has(bucket.bucketStart), bucket.bucketStart).toBe(true);
        }
      });

      it('não devolve mais colunas que o teto', async () => {
        await db.insertArchiveSamples(rampa());

        const t = await db.trend({
          pointId: ponto.pointId,
          from: new Date(T0),
          to: new Date(T0 + 100_000),
          buckets: 10_000,
        });

        expect(t.buckets.length).toBeLessThanOrEqual(MAX_PLOT_BUCKETS);
        // com janela de 100 s, o piso de 1 s por coluna limita a 100
        expect(t.bucketS).toBe(1);
      });

      it('recusa janela invertida', async () => {
        await expect(
          db.trend({
            pointId: ponto.pointId,
            from: new Date(T0 + 1000),
            to: new Date(T0),
          }),
        ).rejects.toThrow(/terminar depois de começar/);
      });

      it('devolve janela vazia sem explodir', async () => {
        const t = await db.trend({
          pointId: ponto.pointId,
          from: new Date(T0),
          to: new Date(T0 + 1000),
        });

        expect(t.buckets).toEqual([]);
        expect(t.timeWeightedAverage).toBeNull();
      });
    });

    describe('valor num instante', () => {
      it('interpola entre os arquivados', async () => {
        await db.insertArchiveSamples([
          { pointId: ponto.pointId, t: T0, v: 100, reason: 'inicial' },
          { pointId: ponto.pointId, t: T0 + 10_000, v: 200, reason: 'porta' },
        ]);

        const lido = await db.valueAt(ponto.pointId, new Date(T0 + 5000));
        expect(lido?.kind).toBe('interpolada');
        expect(lido?.v).toBeCloseTo(150, 6);
      });

      it('é exato no instante de um arquivado', async () => {
        await db.insertArchiveSamples([
          { pointId: ponto.pointId, t: T0, v: 100, reason: 'inicial' },
        ]);

        const lido = await db.valueAt(ponto.pointId, new Date(T0));
        expect(lido).toMatchObject({ v: 100, kind: 'exata' });
      });

      it('extrapola depois do último, e diz que extrapolou', async () => {
        await db.insertArchiveSamples([
          { pointId: ponto.pointId, t: T0, v: 100, reason: 'inicial' },
        ]);

        const lido = await db.valueAt(ponto.pointId, new Date(T0 + 60_000));
        expect(lido).toMatchObject({ v: 100, kind: 'extrapolada' });
      });

      it('devolve null quando o ponto não tem nada arquivado', async () => {
        await expect(db.valueAt(outroPonto.pointId, new Date(T0))).resolves.toBeNull();
      });
    });

    describe('retenção', () => {
      it('apaga o bruto em minutos e o arquivo em dias', async () => {
        const agora = new Date(T0 + 30 * 86_400_000);

        const velho = new Date(agora.getTime() - (ARCHIVE_RETENTION_DAYS + 1) * 86_400_000);
        const recente = new Date(agora.getTime() - 60_000);
        const antigoParaBruto = new Date(agora.getTime() - (RAW_RETENTION_MINUTES + 5) * 60_000);

        await db.insertRawSamples([
          { pointId: ponto.pointId, t: recente.getTime(), v: 230 },
          { pointId: ponto.pointId, t: antigoParaBruto.getTime(), v: 229 },
        ]);
        await db.insertArchiveSamples([
          { pointId: ponto.pointId, t: recente.getTime(), v: 230, reason: 'porta' },
          { pointId: ponto.pointId, t: antigoParaBruto.getTime(), v: 229, reason: 'porta' },
          { pointId: ponto.pointId, t: velho.getTime(), v: 228, reason: 'porta' },
        ]);

        const result = await db.pruneHistorian(agora);
        const uso = await db.historianUsage();

        // o bruto perde o que passou dos minutos; o arquivo só o que passou dos dias
        expect(uso.rawRows).toBe(1);
        expect(uso.archiveRows).toBe(2);
        expect(Date.parse(result.rawCutoff)).toBeGreaterThan(Date.parse(result.archiveCutoff));
      });

      it('podar duas vezes não muda nada', async () => {
        const agora = new Date(T0 + 30 * 86_400_000);
        await db.insertRawSamples([
          { pointId: ponto.pointId, t: agora.getTime() - 60_000, v: 230 },
        ]);

        await db.pruneHistorian(agora);
        const depois = await db.historianUsage();
        await db.pruneHistorian(agora);

        expect(await db.historianUsage()).toEqual(depois);
      });

      it('conta linhas por tabela', async () => {
        await db.insertRawSamples(samples(ponto.pointId, [230, 231]));
        await db.insertArchiveSamples([
          { pointId: ponto.pointId, t: T0, v: 230, reason: 'inicial' },
        ]);

        expect(await db.historianUsage()).toEqual({
          points: HISTORIAN_POINTS.length,
          rawRows: 2,
          archiveRows: 1,
        });
      });
    });
  });
}

describe('o SQL do historiador bate com @mp1/shared', () => {
  const migration = fileURLToPath(new URL('./migrations/004_historian.sql', import.meta.url));

  it('aceita exatamente os códigos de razão que existem', async () => {
    const sql = await readFile(migration, 'utf8');

    expect(sql).toContain(`reason between 1 and ${String(ARCHIVE_REASONS.length)}`);
    expect(archiveReasonCode(ARCHIVE_REASONS[0])).toBe(1);
    expect(archiveReasonCode(ARCHIVE_REASONS.at(-1) ?? 'final')).toBe(ARCHIVE_REASONS.length);
  });

  /**
   * A ordem das colunas é escolha de espaço, e um `prettier` do SQL ou uma
   * "arrumação" bem-intencionada a desfaria sem ninguém notar. O teste é o que
   * mantém a razão viva junto da decisão.
   */
  it('declara ts e value antes de point_id, pelo alinhamento', async () => {
    const sql = await readFile(migration, 'utf8');

    for (const table of ['historian_raw', 'historian_archive']) {
      const bloco = new RegExp(`create table if not exists ${table} \\(([^;]*?)\\n\\);`, 's').exec(
        sql,
      );
      expect(bloco, table).not.toBeNull();

      const colunas = [...(bloco?.[1] ?? '').matchAll(/^\s{4}(\w+)\s/gm)].map((m) => m[1]);
      expect(colunas.slice(0, 3), table).toEqual(['ts', 'value', 'point_id']);
    }
  });
});
