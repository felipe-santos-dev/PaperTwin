import { describe, expect, it } from 'vitest';

import { PROCESS_CATALOG } from '../process/catalog';
import { isLabTag } from '../process/lab';
import { exceptionFilter, recordSeries, swingingDoor } from './compression';
import {
  compressedPoints,
  HISTORIAN_POINTS,
  historianPoint,
  historianPointById,
  isHistorianTag,
} from './points';
import {
  ARCHIVE_MAX_GAP_S,
  ARCHIVE_RETENTION_DAYS,
  ARCHIVE_ROW_BUDGET,
  ARCHIVE_ROWS_PER_POINT_PER_DAY,
  archiveBudgetUsedPct,
  archiveCutoff,
  estimatedArchiveMb,
  HISTORIAN_POINT_COUNT,
  rawCutoff,
  RAW_RETENTION_MINUTES,
} from './retention';
import type { Sample } from './types';

/** Uma série a cada segundo, a partir de t = 0. */
function series(values: readonly number[], stepS = 1): Sample[] {
  return values.map((v, i) => ({ t: i * stepS * 1000, v }));
}

/** Só os valores, para as comparações ficarem legíveis. */
const values = (samples: readonly Sample[]): number[] => samples.map((s) => s.v);

/** Instantes em segundos. */
const seconds = (samples: readonly Sample[]): number[] => samples.map((s) => s.t / 1000);

function runStage<T extends Sample>(
  stage: { feed(s: Sample): T[]; flush(): T[] },
  samples: readonly Sample[],
): T[] {
  const out: T[] = [];
  for (const sample of samples) out.push(...stage.feed(sample));
  out.push(...stage.flush());
  return out;
}

describe('pontos do historiador', () => {
  it('tem um ponto por variável do catálogo que não é de laboratório', () => {
    const esperados = PROCESS_CATALOG.filter((v) => !isLabTag(v.tag)).length;

    expect(HISTORIAN_POINTS).toHaveLength(esperados);
    expect(HISTORIAN_POINT_COUNT).toBe(esperados);
  });

  it('numera de 1 em diante, na ordem do catálogo', () => {
    expect(HISTORIAN_POINTS[0]?.pointId).toBe(1);
    expect(HISTORIAN_POINTS.at(-1)?.pointId).toBe(HISTORIAN_POINTS.length);

    for (const [index, point] of HISTORIAN_POINTS.entries()) {
      expect(point.pointId, point.tag).toBe(index + 1);
    }
  });

  it('não arquiva ensaio de laboratório', () => {
    expect(isHistorianTag('LAB-1206')).toBe(false);
    expect(historianPoint('LAB-1206')).toBeNull();
  });

  it('traz excDev e compDev do catálogo', () => {
    const pic514 = historianPoint('PIC-514');

    expect(pic514?.unit).toBe('kPa rel');
    expect(pic514?.excDev).toBe(1);
    expect(pic514?.compDev).toBe(2);
  });

  it('acha o ponto pelo id e pela tag', () => {
    const porTag = historianPoint('PIC-514');
    expect(porTag).not.toBeNull();
    expect(historianPointById(porTag?.pointId ?? 0)).toEqual(porTag);
    expect(historianPointById(0)).toBeNull();
  });

  it('tem compressão configurada em quase todos', () => {
    // as duas constantes do catálogo (largura útil) não têm exc/comp
    expect(compressedPoints().length).toBeGreaterThan(HISTORIAN_POINTS.length - 5);
  });
});

describe('filtro de exceção', () => {
  it('manda o primeiro valor sempre', () => {
    const out = runStage(exceptionFilter({ excDev: 1 }), series([100]));
    expect(values(out)).toEqual([100]);
  });

  it('descarta o que não passa do desvio', () => {
    const out = runStage(exceptionFilter({ excDev: 1 }), series([100, 100.5, 100.8, 100.2]));
    // só o primeiro passa; o último sai no flush, para a janela não perder a ponta
    expect(values(out)).toEqual([100, 100.2]);
  });

  it('manda a anterior junto, para o degrau não virar rampa', () => {
    const out = runStage(
      exceptionFilter({ excDev: 1, maxGapS: 10_000 }),
      series([100, 100, 100, 100, 140]),
    );

    expect(values(out)).toEqual([100, 100, 140]);
    // o 100 que vai junto é o de UM SEGUNDO antes do salto, não o de quatro
    expect(seconds(out)).toEqual([0, 3, 4]);
  });

  it('não repete a anterior quando ela já foi enviada', () => {
    const out = runStage(exceptionFilter({ excDev: 1, maxGapS: 10_000 }), series([100, 140, 180]));
    expect(values(out)).toEqual([100, 140, 180]);
  });

  it('envia por teto de tempo mesmo sem novidade', () => {
    const out = runStage(exceptionFilter({ excDev: 1, maxGapS: 3 }), series(Array(8).fill(100)));
    expect(seconds(out)).toEqual([0, 3, 6, 7]);
  });

  it('com desvio zero não descarta nada', () => {
    const entrada = series([100, 101, 102, 103]);
    expect(values(runStage(exceptionFilter({ excDev: 0 }), entrada))).toEqual([100, 101, 102, 103]);
  });
});

describe('porta oscilante', () => {
  it('arquiva o primeiro valor como inicial', () => {
    const out = runStage(swingingDoor({ compDev: 1 }), series([100]));
    expect(out).toEqual([{ t: 0, v: 100, reason: 'inicial' }]);
  });

  it('reduz uma rampa perfeita a duas pontas', () => {
    const rampa = series(Array.from({ length: 100 }, (_, i) => 100 + i));
    const out = runStage(swingingDoor({ compDev: 1, maxGapS: 10_000 }), rampa);

    expect(values(out)).toEqual([100, 199]);
    expect(out.map((s) => s.reason)).toEqual(['inicial', 'final']);
  });

  /**
   * Duas linhas, e não uma: a âncora e a ponta.
   *
   * A ponta vem do `flush`, que fecha a janela. Sem ela o arquivo diria onde o
   * sinal estava no início e nada sobre até quando ele esteve lá — e a garantia
   * da porta só vale **entre** dois valores arquivados.
   */
  it('reduz um sinal parado à âncora e à ponta', () => {
    const out = runStage(
      swingingDoor({ compDev: 1, maxGapS: 10_000 }),
      series(Array(200).fill(100)),
    );

    expect(values(out)).toEqual([100, 100]);
    expect(out.map((s) => s.reason)).toEqual(['inicial', 'final']);
    expect(seconds(out)).toEqual([0, 199]);
  });

  /**
   * O canto é arquivado **uma amostra depois** do canto real.
   *
   * A porta só descobre que a reta não serve mais quando chega a amostra que
   * não cabe nela, e então arquiva a anterior. A rampa chega a 110 no segundo
   * 10; a amostra do segundo 11, já parada, ainda cabe no corredor, e é a do 12
   * que o fecha — arquivando a do 11.
   *
   * É propriedade do algoritmo, não deste código, e está documentada porque
   * quem olha o gráfico vê o vértice um passo adiante de onde ele aconteceu.
   */
  it('guarda o canto uma amostra depois da mudança de inclinação', () => {
    // sobe até 110 em 10 s, depois fica parada em 110
    const sinal = series([
      ...Array.from({ length: 11 }, (_, i) => 100 + i),
      ...(Array(20).fill(110) as number[]),
    ]);
    const out = runStage(swingingDoor({ compDev: 0.5, maxGapS: 10_000 }), sinal);

    expect(values(out)).toEqual([100, 110, 110]);
    expect(out.map((s) => s.reason)).toEqual(['inicial', 'porta', 'final']);
    expect(seconds(out)[1]).toBe(11);
  });

  it('descarta o ruído que cabe no corredor', () => {
    const ruído = series([100, 100.4, 99.7, 100.3, 99.8, 100.1, 100.2]);
    const out = runStage(swingingDoor({ compDev: 1, maxGapS: 10_000 }), ruído);

    expect(out.length).toBeLessThanOrEqual(2);
    expect(values(out)[0]).toBe(100);
  });

  it('arquiva por teto de tempo quando nada muda', () => {
    const out = runStage(swingingDoor({ compDev: 1, maxGapS: 5 }), series(Array(16).fill(100)));

    expect(out.map((s) => s.reason)).toEqual(['inicial', 'intervalo', 'intervalo', 'intervalo']);
    expect(seconds(out)).toEqual([0, 5, 10, 15]);
  });

  it('com desvio zero não descarta nada', () => {
    const entrada = series([100, 101, 103, 106]);
    const out = runStage(swingingDoor({ compDev: 0, maxGapS: 10_000 }), entrada);
    expect(values(out)).toEqual([100, 101, 103, 106]);
  });

  it('nunca arquiva fora de ordem', () => {
    const sinal = series([100, 105, 102, 130, 131, 90, 90, 90, 120]);
    const out = runStage(swingingDoor({ compDev: 1, maxGapS: 4 }), sinal);

    const instantes = seconds(out);
    expect([...instantes].sort((a, b) => a - b)).toEqual(instantes);
  });

  /**
   * O erro da reta reconstruída não passa de **2 · `compDev`**.
   *
   * O corredor garante que existe *uma* reta dentro dele que serve para todas
   * as amostras descartadas; a reta que o gráfico desenha é outra — a corda
   * entre dois valores arquivados — e as duas podem divergir até o dobro do
   * desvio. É a promessa real da porta oscilante, e é o que importa saber ao
   * escolher o `compDev` de uma tag: o gráfico pode errar o dobro do que está
   * no catálogo.
   */
  it('mantém a reta reconstruída dentro do dobro do desvio', () => {
    const compDev = 0.8;
    const sinal = series(
      Array.from({ length: 300 }, (_, i) => 100 + 10 * Math.sin(i / 17) + (i % 7) * 0.2),
    );
    const out = runStage(swingingDoor({ compDev, maxGapS: 10_000 }), sinal);

    expect(out.length).toBeLessThan(sinal.length);

    for (const sample of sinal) {
      // acha o trecho arquivado que contém a amostra e interpola
      const after = out.findIndex((a) => a.t >= sample.t);
      if (after <= 0) continue;

      const a = out[after - 1];
      const b = out[after];
      if (!a || !b) continue;

      const fraction = (sample.t - a.t) / (b.t - a.t);
      const reconstructed = a.v + (b.v - a.v) * fraction;

      expect(Math.abs(reconstructed - sample.v), `em t=${String(sample.t)}`).toBeLessThanOrEqual(
        2 * compDev + 1e-9,
      );
    }
  });
});

describe('os dois estágios juntos', () => {
  const ponto = historianPoint('PIC-514');
  if (!ponto) throw new Error('PIC-514 ausente no historiador');

  it('comprime uma pressão parada com ruído', () => {
    const sinal = series(Array.from({ length: 600 }, (_, i) => 230 + Math.sin(i / 3) * 0.4));
    const { archived, stats } = recordSeries(ponto, sinal);

    expect(stats.samples).toBe(600);
    expect(stats.afterException).toBeLessThan(stats.samples);
    expect(stats.archived).toBe(archived.length);
    expect(stats.ratio).toBeGreaterThan(5);
  });

  it('é determinística: a mesma série dá o mesmo arquivo', () => {
    const sinal = series(Array.from({ length: 400 }, (_, i) => 230 + Math.sin(i / 11) * 6));

    expect(recordSeries(ponto, sinal).archived).toEqual(recordSeries(ponto, sinal).archived);
  });

  it('preserva o degrau', () => {
    const sinal = series([
      ...(Array(100).fill(230) as number[]),
      ...(Array(100).fill(280) as number[]),
    ]);
    const { archived } = recordSeries(ponto, sinal);

    const antes = archived.filter((s) => s.t < 100_000);
    const depois = archived.filter((s) => s.t >= 100_000);

    expect(antes.at(-1)?.v).toBe(230);
    expect(antes.at(-1)?.t).toBe(99_000);
    expect(depois[0]?.v).toBe(280);
    expect(depois[0]?.t).toBe(100_000);
  });

  it('não comprime ponto sem exc/comp no catálogo', () => {
    const semCompressão = { ...ponto, excDev: null, compDev: null };
    const sinal = series([230, 231, 233, 236, 240]);

    expect(recordSeries(semCompressão, sinal).archived.map((s) => s.v)).toEqual([
      230, 231, 233, 236, 240,
    ]);
  });

  it('não devolve série vazia para série vazia sem explodir', () => {
    const { archived, stats } = recordSeries(ponto, []);
    expect(archived).toEqual([]);
    expect(stats.ratio).toBe(0);
  });
});

describe('retenção', () => {
  it('conta o orçamento a partir do custo da linha', () => {
    expect(ARCHIVE_ROW_BUDGET).toBeGreaterThan(3_000_000);
    expect(estimatedArchiveMb(ARCHIVE_ROW_BUDGET)).toBeCloseTo(300, 0);
    expect(archiveBudgetUsedPct(ARCHIVE_ROW_BUDGET)).toBeCloseTo(100, 6);
  });

  it('o orçamento permite mais que o teto de tempo exige', () => {
    // o teto de uma hora obriga 24 linhas por ponto por dia; o orçamento tem de
    // caber isso com folga, senão o arquivo estoura sem nenhum sinal se mover
    const mínimoPeloTeto = 86_400 / ARCHIVE_MAX_GAP_S;
    expect(ARCHIVE_ROWS_PER_POINT_PER_DAY).toBeGreaterThan(mínimoPeloTeto * 10);
  });

  it('corta o bruto em minutos e o arquivo em dias', () => {
    const agora = new Date('2026-10-31T12:00:00Z');

    expect(rawCutoff(agora).toISOString()).toBe(
      new Date(agora.getTime() - RAW_RETENTION_MINUTES * 60_000).toISOString(),
    );
    expect(archiveCutoff(agora).toISOString()).toBe(
      new Date(agora.getTime() - ARCHIVE_RETENTION_DAYS * 86_400_000).toISOString(),
    );
  });
});
