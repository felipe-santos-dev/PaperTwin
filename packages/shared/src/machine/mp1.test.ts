import { describe, expect, it } from 'vitest';
import { SECTION_IDS } from '../asset';
import {
  BEARING_Z_M,
  DRY_SECTION_WEB_Y_M,
  DRYER_BOTTOM_Y_M,
  DRYER_RADIUS_M,
  DRYER_TOP_Y_M,
  POST_DRYER_PAIRS,
  PRE_DRYER_PAIRS,
  SCANNER_1_X_M,
  SIZER_ROLL_RADIUS_M,
  SIZER_X_M,
} from './geometry';
import { MP1 } from './mp1';
import { allAssets, assetByTag, assetsOfKind, monitoredAssets, sectionById } from './query';
import type { MachineAsset } from './types';

const assets = allAssets(MP1);
const bodies = assets.filter((asset) => asset.radius !== null);
const dryers = assetsOfKind(MP1, 'dryer-cylinder');
const bearings = assetsOfKind(MP1, 'bearing');

/** Tolerância para comparar distâncias em metros, dada a aritmética de ponto flutuante. */
const EPS = 1e-9;

const distance2d = (a: MachineAsset, b: MachineAsset): number =>
  Math.hypot(a.position[0] - b.position[0], a.position[1] - b.position[1]);

describe('tags', () => {
  it('são únicas em toda a máquina', () => {
    const seen = new Map<string, number>();
    for (const asset of assets) seen.set(asset.tag, (seen.get(asset.tag) ?? 0) + 1);

    const duplicadas = [...seen.entries()].filter(([, count]) => count > 1).map(([tag]) => tag);
    expect(duplicadas).toEqual([]);
    expect(seen.size).toBe(assets.length);
  });

  it('seguem o padrão da planta', () => {
    for (const asset of assets) {
      expect(asset.tag).toMatch(/^MP1(-[A-Z0-9]+)+$/);
    }
  });

  it('inclui o mancal do conceito de tela de monitoramento', () => {
    // O conceito mostra `MP1-SEC-G4-CS23-MLA`. Se o agrupamento dos cilindros
    // mudar, esta tag muda junto e a tela precisa saber.
    const mancal = assetByTag(MP1, 'MP1-SEC-G4-CS23-MLA');
    expect(mancal).not.toBeNull();
    expect(mancal?.kind).toBe('bearing');
    expect(mancal?.side).toBe('LA');
    expect(mancal?.driveGroup).toBe('G4');
    expect(assetByTag(MP1, 'MP1-SEC-G4-CS23')?.label).toBe('Cilindro secador 23');
  });
});

describe('seções', () => {
  it('cobre cada seção do processo exatamente uma vez', () => {
    expect(MP1.sections.map((s) => s.id).sort()).toEqual([...SECTION_IDS].sort());
  });

  it('numera a ordem do processo de 1 a 10, sem buracos', () => {
    const orders = MP1.sections.map((s) => s.order).sort((a, b) => a - b);
    expect(orders).toEqual(Array.from({ length: SECTION_IDS.length }, (_, i) => i + 1));
  });

  it('declara em cada ativo a seção que o contém', () => {
    for (const section of MP1.sections) {
      for (const asset of section.assets) {
        expect(asset.section).toBe(section.id);
      }
    }
  });

  it('avança no eixo X na mesma ordem do processo', () => {
    const positioned = [...MP1.sections]
      .filter((s) => s.assets.length > 0)
      .sort((a, b) => a.order - b.order)
      .map((s) => ({ id: s.id, minX: Math.min(...s.assets.map((a) => a.position[0])) }));

    for (let i = 1; i < positioned.length; i += 1) {
      const previous = positioned[i - 1];
      const current = positioned[i];
      if (!previous || !current) throw new Error('seção ausente');
      expect(current.minX).toBeGreaterThan(previous.minX);
    }
  });
});

describe('cilindros secadores', () => {
  it('tem 13 pares na pré-secagem e 5 na pós', () => {
    expect(
      sectionById(MP1, 'pre-dryer')?.assets.filter((a) => a.kind === 'dryer-cylinder'),
    ).toHaveLength(PRE_DRYER_PAIRS * 2);
    expect(
      sectionById(MP1, 'post-dryer')?.assets.filter((a) => a.kind === 'dryer-cylinder'),
    ).toHaveLength(POST_DRYER_PAIRS * 2);
  });

  it('numera CS1 a CS36 sem furo nem repetição', () => {
    const numbers = dryers.map((d) => Number(/CS(\d+)$/.exec(d.tag)?.[1])).sort((a, b) => a - b);
    const total = (PRE_DRYER_PAIRS + POST_DRYER_PAIRS) * 2;
    expect(numbers).toEqual(Array.from({ length: total }, (_, i) => i + 1));
  });

  it('alterna entre a fileira de cima e a de baixo', () => {
    for (const dryer of dryers) {
      expect([DRYER_TOP_Y_M, DRYER_BOTTOM_Y_M]).toContain(dryer.position[1]);
      expect(dryer.radius).toBe(DRYER_RADIUS_M);
    }
  });
});

describe('geometria', () => {
  it('não sobrepõe nenhum corpo girante', () => {
    const sobrepostos: string[] = [];

    for (let i = 0; i < bodies.length; i += 1) {
      for (let j = i + 1; j < bodies.length; j += 1) {
        const a = bodies[i];
        const b = bodies[j];
        if (!a?.radius || !b?.radius) continue;

        const folga = distance2d(a, b) - (a.radius + b.radius);
        if (folga < -EPS) {
          sobrepostos.push(`${a.tag} × ${b.tag} (penetração de ${(-folga).toFixed(3)} m)`);
        }
      }
    }

    expect(sobrepostos).toEqual([]);
  });

  it('encosta os dois rolos de cada nip, sem afastar nem penetrar', () => {
    for (const [tagA, tagB] of [
      ['MP1-PRE-R1', 'MP1-PRE-R2'],
      ['MP1-SZR-RS', 'MP1-SZR-RI'],
      ['MP1-CAL-RT', 'MP1-CAL-RR'],
    ] as const) {
      const a = assetByTag(MP1, tagA);
      const b = assetByTag(MP1, tagB);
      if (!a?.radius || !b?.radius) throw new Error(`rolo ausente: ${tagA} ou ${tagB}`);

      expect(distance2d(a, b)).toBeCloseTo(a.radius + b.radius, 9);
    }
  });

  it('mantém os cilindros vizinhos separados por pelo menos um passo útil', () => {
    const tops = dryers
      .filter((d) => d.position[1] === DRYER_TOP_Y_M)
      .map((d) => d.position[0])
      .sort((a, b) => a - b);

    for (let i = 1; i < tops.length; i += 1) {
      const gap = (tops[i] ?? 0) - (tops[i - 1] ?? 0);
      expect(gap).toBeGreaterThanOrEqual(2 * DRYER_RADIUS_M);
    }
  });
});

describe('caminho do papel entre a pré-secagem e a pós-secagem', () => {
  it('corre horizontal a y=4,8 pelo scanner 1 e pelo nip do Speed Sizer', () => {
    expect(assetByTag(MP1, 'MP1-QCS-SC1')?.position).toEqual([
      SCANNER_1_X_M,
      DRY_SECTION_WEB_Y_M,
      0,
    ]);
    expect(assetByTag(MP1, 'MP1-SZR-NIP')?.position).toEqual([SIZER_X_M, DRY_SECTION_WEB_Y_M, 0]);
  });

  it('empilha os dois rolos do Speed Sizer tangentes à linha do papel', () => {
    const superior = assetByTag(MP1, 'MP1-SZR-RS');
    const inferior = assetByTag(MP1, 'MP1-SZR-RI');

    expect(superior?.position[1]).toBeCloseTo(DRY_SECTION_WEB_Y_M + SIZER_ROLL_RADIUS_M, 9);
    expect(inferior?.position[1]).toBeCloseTo(DRY_SECTION_WEB_Y_M - SIZER_ROLL_RADIUS_M, 9);
    expect(superior?.position[0]).toBe(inferior?.position[0]);
  });

  it('deixa a linha do papel livre: nenhum cilindro secador a atravessa', () => {
    for (const dryer of dryers) {
      const y = dryer.position[1];
      const r = dryer.radius ?? 0;
      const atravessa = y - r <= DRY_SECTION_WEB_Y_M && DRY_SECTION_WEB_Y_M <= y + r;
      expect(atravessa, `${dryer.tag} cruza a linha do papel`).toBe(false);
    }
  });

  it('põe o scanner 1 depois da pré-secagem e o Speed Sizer antes da pós', () => {
    const preMaxX = Math.max(
      ...dryers.filter((d) => d.section === 'pre-dryer').map((d) => d.position[0]),
    );
    const postMinX = Math.min(
      ...dryers.filter((d) => d.section === 'post-dryer').map((d) => d.position[0]),
    );

    expect(preMaxX).toBeLessThan(SCANNER_1_X_M);
    expect(SCANNER_1_X_M).toBeLessThan(SIZER_X_M);
    expect(SIZER_X_M).toBeLessThan(postMinX);
  });
});

describe('mancais', () => {
  it('dá dois mancais a cada corpo girante, um por lado', () => {
    expect(bearings).toHaveLength(bodies.length * 2);
  });

  it('aponta para um corpo que existe e herda a posição dele', () => {
    for (const bearing of bearings) {
      expect(bearing.parentTag).not.toBeNull();
      const parent = bearing.parentTag ? assetByTag(MP1, bearing.parentTag) : null;

      expect(parent, `pai ausente de ${bearing.tag}`).not.toBeNull();
      expect(parent?.radius).not.toBeNull();
      expect(bearing.position[0]).toBe(parent?.position[0]);
      expect(bearing.position[1]).toBe(parent?.position[1]);
      expect(bearing.section).toBe(parent?.section);
    }
  });

  it('põe o lado acionamento em Z negativo e o lado comando em Z positivo', () => {
    for (const bearing of bearings) {
      expect(bearing.position[2]).toBe(bearing.side === 'LA' ? -BEARING_Z_M : BEARING_Z_M);
    }
  });
});

describe('ativos monitorados', () => {
  it('são exatamente os mancais', () => {
    expect(
      monitoredAssets(MP1)
        .map((a) => a.tag)
        .sort(),
    ).toEqual(bearings.map((a) => a.tag).sort());
  });

  it('usa grupo 2 com apoio rígido enquanto a potência de acionamento não vem', () => {
    for (const bearing of bearings) {
      expect(bearing.iso).toEqual({ group: 'group2', support: 'rigid' });
    }
  });
});
