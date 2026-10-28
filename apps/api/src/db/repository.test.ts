import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { allAssets, assetByTag, MP1, type MachineAsset, type VibrationReading } from '@mp1/shared';
import { PgliteRepository } from './pglite-repository';
import { PostgresRepository } from './postgres-repository';
import type { Database } from './repository';

/**
 * A mesma suíte contra os dois drivers.
 *
 * É o único jeito de garantir que o SQL é mesmo o mesmo. O PGlite roda sempre;
 * o Postgres só quando `DATABASE_URL` está definido, e fica pulado em vez de
 * falhar — o teste não pode exigir um banco que a máquina não tem.
 *
 * Quem roda contra um Postgres de verdade precisa saber: a suíte **apaga** as
 * tabelas `asset` e `vibration_reading` do banco apontado. Use um banco de teste.
 */

const DATABASE_URL = process.env['DATABASE_URL'];

const drivers = [
  {
    name: 'PGlite',
    enabled: true,
    open: (): Promise<Database> => PgliteRepository.open(),
  },
  {
    name: 'Postgres',
    enabled: Boolean(DATABASE_URL),
    open: (): Promise<Database> => Promise.resolve(PostgresRepository.open(DATABASE_URL ?? '')),
  },
];

const assets = allAssets(MP1);
const bearing = assetByTag(MP1, 'MP1-SEC-G4-CS23-MLA');
if (!bearing) throw new Error('mancal de referência ausente no modelo');

/** Leituras de teste em instantes conhecidos, para a agregação ser verificável. */
function readingsAt(tag: string, times: readonly string[], rms: readonly number[]) {
  return times.map((ts, i): VibrationReading => ({
    assetTag: tag,
    ts,
    rmsMmS: rms[i] ?? 1,
    tempC: 60 + i,
    envelopeGe: 0.5 + i / 10,
  }));
}

for (const driver of drivers) {
  const suite = driver.enabled ? describe : describe.skip;

  suite(`repositório · ${driver.name}`, () => {
    let db: Database;

    beforeAll(async () => {
      db = await driver.open();
      await db.migrate();
    }, 60_000);

    afterAll(async () => {
      await db.close();
    });

    beforeEach(async () => {
      // apagar os ativos cascateia nas leituras
      await db.replaceAssets([]);
    });

    describe('migrations', () => {
      it('podem rodar de novo sem quebrar', async () => {
        await expect(db.migrate()).resolves.toBeUndefined();
      });

      it('deixam o banco acessível', async () => {
        await expect(db.ping()).resolves.toBe(true);
      });
    });

    describe('ativos', () => {
      it('grava a máquina inteira a partir do modelo', async () => {
        const written = await db.replaceAssets(assets);
        expect(written).toBe(assets.length);

        const stored = await db.listAssets();
        expect(stored).toHaveLength(assets.length);
      });

      it('devolve o ativo exatamente como entrou', async () => {
        await db.replaceAssets(assets);
        const stored = await db.findAsset(bearing.tag);
        expect(stored).toEqual(bearing);
      });

      it('filtra por seção e por tipo', async () => {
        await db.replaceAssets(assets);

        const preDryer = await db.listAssets({ section: 'pre-dryer' });
        expect(preDryer.length).toBeGreaterThan(0);
        expect(preDryer.every((a) => a.section === 'pre-dryer')).toBe(true);

        const scanners = await db.listAssets({ kind: 'scanner' });
        expect(scanners.map((a) => a.tag).sort()).toEqual(['MP1-QCS-SC1', 'MP1-QCS-SC2']);

        const both = await db.listAssets({ section: 'pre-dryer', kind: 'bearing' });
        expect(both.every((a) => a.section === 'pre-dryer' && a.kind === 'bearing')).toBe(true);
      });

      it('devolve null para tag que não existe', async () => {
        await expect(db.findAsset('MP1-NAO-EXISTE')).resolves.toBeNull();
      });

      it('substitui o conteúdo anterior em vez de somar', async () => {
        await db.replaceAssets(assets);
        await db.replaceAssets([assets[0] as MachineAsset]);
        expect(await db.listAssets()).toHaveLength(1);
      });

      it('recusa mancal apontando para corpo que não existe', async () => {
        const órfão: MachineAsset = { ...bearing, parentTag: 'MP1-NAO-EXISTE' };
        await expect(db.replaceAssets([órfão])).rejects.toThrow();
      });
    });

    describe('leituras de vibração', () => {
      beforeEach(async () => {
        await db.replaceAssets(assets);
      });

      it('grava e devolve a mais recente', async () => {
        const written = await db.insertReadings(
          readingsAt(
            bearing.tag,
            ['2026-03-01T10:00:00Z', '2026-03-01T11:00:00Z', '2026-03-01T12:00:00Z'],
            [1.2, 2.4, 3.6],
          ),
        );
        expect(written).toBe(3);

        const latest = await db.latestReading(bearing.tag);
        expect(latest?.rmsMmS).toBe(3.6);
        expect(latest?.ts).toBe('2026-03-01T12:00:00.000Z');
      });

      it('ignora repetição do mesmo (ativo, instante)', async () => {
        const batch = readingsAt(bearing.tag, ['2026-03-01T10:00:00Z'], [1.2]);
        await db.insertReadings(batch);
        await db.insertReadings(batch);
        expect(await db.countReadings()).toBe(1);
      });

      it('aceita um lote maior que o tamanho do comando', async () => {
        const times = Array.from({ length: 1200 }, (_, i) =>
          new Date(Date.UTC(2026, 2, 1) + i * 60_000).toISOString(),
        );
        await db.insertReadings(
          readingsAt(
            bearing.tag,
            times,
            times.map(() => 1.5),
          ),
        );
        expect(await db.countReadings()).toBe(1200);
      });

      it('devolve null quando o mancal não tem leitura', async () => {
        await expect(db.latestReading(bearing.tag)).resolves.toBeNull();
      });

      it('recusa leitura de ativo que não existe', async () => {
        await expect(
          db.insertReadings(readingsAt('MP1-NAO-EXISTE', ['2026-03-01T10:00:00Z'], [1])),
        ).rejects.toThrow();
      });
    });

    describe('agregação por janela', () => {
      beforeEach(async () => {
        await db.replaceAssets(assets);
        await db.insertReadings(
          readingsAt(
            bearing.tag,
            [
              '2026-03-01T10:05:00Z',
              '2026-03-01T10:35:00Z',
              '2026-03-01T11:10:00Z',
              '2026-03-01T11:50:00Z',
            ],
            [1.0, 3.0, 2.0, 6.0],
          ),
        );
      });

      it('agrupa por hora, com média e máximo', async () => {
        const buckets = await db.readingsByBucket({
          tag: bearing.tag,
          from: new Date('2026-03-01T00:00:00Z'),
          to: new Date('2026-03-02T00:00:00Z'),
          bucket: '1 hour',
        });

        expect(buckets).toHaveLength(2);
        expect(buckets[0]).toMatchObject({
          bucketStart: '2026-03-01T10:00:00.000Z',
          samples: 2,
          rmsAvgMmS: 2,
          rmsMaxMmS: 3,
        });
        expect(buckets[1]).toMatchObject({
          bucketStart: '2026-03-01T11:00:00.000Z',
          samples: 2,
          rmsAvgMmS: 4,
          rmsMaxMmS: 6,
        });
      });

      it('alinha as janelas a uma origem fixa, e não ao primeiro dado', async () => {
        // a primeira leitura é 10:05, mas a janela começa em 10:00
        const buckets = await db.readingsByBucket({
          tag: bearing.tag,
          from: new Date('2026-03-01T10:03:00Z'),
          to: new Date('2026-03-02T00:00:00Z'),
          bucket: '1 hour',
        });
        expect(buckets[0]?.bucketStart).toBe('2026-03-01T10:00:00.000Z');
      });

      it('respeita o recorte: `to` é exclusivo', async () => {
        const buckets = await db.readingsByBucket({
          tag: bearing.tag,
          from: new Date('2026-03-01T10:00:00Z'),
          to: new Date('2026-03-01T11:00:00Z'),
          bucket: '1 hour',
        });
        expect(buckets).toHaveLength(1);
        expect(buckets[0]?.samples).toBe(2);
      });

      it('muda a granularidade conforme a janela pedida', async () => {
        const buckets = await db.readingsByBucket({
          tag: bearing.tag,
          from: new Date('2026-03-01T00:00:00Z'),
          to: new Date('2026-03-02T00:00:00Z'),
          bucket: '1 day',
        });
        expect(buckets).toHaveLength(1);
        expect(buckets[0]?.samples).toBe(4);
      });

      it('devolve vazio fora da janela', async () => {
        const buckets = await db.readingsByBucket({
          tag: bearing.tag,
          from: new Date('2026-04-01T00:00:00Z'),
          to: new Date('2026-04-02T00:00:00Z'),
          bucket: '1 hour',
        });
        expect(buckets).toEqual([]);
      });
    });
  });
}
