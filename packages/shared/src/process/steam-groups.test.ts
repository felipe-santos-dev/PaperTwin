import { describe, expect, it } from 'vitest';

import { MP1 } from '../machine/mp1';
import { allAssets } from '../machine/query';
import { DRYER_CYLINDER_COUNT, DRYER_STEAM_GROUPS } from '../machine/steam-groups';
import { isCatalogTag } from './catalog';
import {
  CONDENSATE_TANK_NOTE,
  STEAM_GROUPS,
  steamGroup,
  steamGroupOfCylinderNumber,
  steamGroupsOfSection,
  steamGroupTags,
} from './steam-groups';

const tags = new Set(allAssets(MP1).map((asset) => asset.tag));

describe('os seis grupos', () => {
  it('tem um grupo resolvido por faixa da divisão', () => {
    expect(STEAM_GROUPS).toHaveLength(DRYER_STEAM_GROUPS.length);
    expect(STEAM_GROUPS.map((group) => group.id)).toEqual(
      DRYER_STEAM_GROUPS.map((group) => group.id),
    );
  });

  it('soma 36 cilindros entre todos', () => {
    const total = STEAM_GROUPS.reduce((sum, group) => sum + group.cylinders.length, 0);
    expect(total).toBe(DRYER_CYLINDER_COUNT);
  });

  it('nomeia o papel dos dois grupos que a pesquisa nomeia', () => {
    expect(steamGroup('G1')?.label).toBe('Grupo de vapor G1 · aquecimento');
    expect(steamGroup('G4')?.label).toBe('Grupo de vapor G4 · grupo principal');
    expect(steamGroup('G2')?.label).toBe('Grupo de vapor G2');
    expect(steamGroup('G2')?.role).toBeNull();
  });

  it('devolve null para grupo que não existe', () => {
    expect(steamGroup('G9')).toBeNull();
    expect(steamGroupTags('G9')).toEqual([]);
  });
});

describe('tags resolvidas contra o catálogo', () => {
  it('resolve a válvula e o sifão de todo grupo', () => {
    for (const group of STEAM_GROUPS) {
      expect(isCatalogTag(group.pressure.tag), group.id).toBe(true);
      expect(isCatalogTag(group.siphonDeltaP.tag), group.id).toBe(true);
    }
  });

  it('traz a variável inteira, não só a tag', () => {
    const g4 = steamGroup('G4');

    expect(g4?.pressure.tag).toBe('PIC-514');
    expect(g4?.pressure.unit).toBe('kPa rel');
    expect(g4?.pressure.target).toBe(230);
    expect(g4?.pressure.controlled).toBe(true);
    expect(g4?.siphonDeltaP.tag).toBe('PDIC-524');
    expect(g4?.siphonDeltaP.limits.ll).toBe(18);
  });

  it('usa a numeração 51x/52x/53x na pré e 71x/72x na pós', () => {
    expect(steamGroupsOfSection('pre-dryer').map((g) => g.pressure.tag)).toEqual([
      'PIC-511',
      'PIC-512',
      'PIC-513',
      'PIC-514',
    ]);
    expect(steamGroupsOfSection('post-dryer').map((g) => g.pressure.tag)).toEqual([
      'PIC-711',
      'PIC-712',
    ]);
  });

  it('aponta cilindros e mancais que existem no modelo', () => {
    for (const group of STEAM_GROUPS) {
      for (const tag of [...group.cylinderTags, ...group.bearingTags]) {
        expect(tags.has(tag), tag).toBe(true);
      }
      expect(group.bearingTags).toHaveLength(group.cylinderTags.length * 2);
    }
  });
});

describe('tanque de condensado', () => {
  it('tem nível nos quatro grupos da pré-secagem', () => {
    for (const group of steamGroupsOfSection('pre-dryer')) {
      expect(group.condensateLevel?.tag, group.id).toBe(`LIC-53${group.id.slice(1)}`);
      expect(group.condensateNote, group.id).toBeNull();
    }
  });

  it('é null explícito com nota no G5 e no G6', () => {
    for (const group of steamGroupsOfSection('post-dryer')) {
      expect(group.condensateLevel, group.id).toBeNull();
      expect(group.condensateNote, group.id).toBe(CONDENSATE_TANK_NOTE);
    }
  });

  it('não lista o nível entre as tags do grupo quando não há', () => {
    expect(steamGroupTags('G4').map((v) => v.tag)).toEqual(['PIC-514', 'PDIC-524', 'LIC-534']);
    expect(steamGroupTags('G5').map((v) => v.tag)).toEqual(['PIC-711', 'PDIC-721']);
  });

  it('explica na nota que o tanque existe e a medição é que falta', () => {
    expect(CONDENSATE_TANK_NOTE).toMatch(/tanque existe na máquina/);
  });
});

describe('proveniência separada', () => {
  it('marca a divisão como suposição', () => {
    for (const group of STEAM_GROUPS) {
      expect(group.division.source, group.id).toBe('assumed');
      expect(group.division.note.trim(), group.id).not.toBe('');
    }
  });

  it('marca o mapa de tags como pesquisa B', () => {
    for (const group of STEAM_GROUPS) {
      expect(group.tagMap.source, group.id).toBe('B');
      expect(group.tagMap.note.trim(), group.id).not.toBe('');
    }
  });

  it('não deixa o mapa de tags herdar o assumed da divisão', () => {
    const g4 = steamGroup('G4');

    expect(g4?.division.source).toBe('assumed');
    expect(g4?.tagMap.source).toBe('B');
    expect(g4?.pressure.source).toBe('B');
  });
});

describe('o grupo de um cilindro', () => {
  it('acha o G4 pelo CS23', () => {
    expect(steamGroupOfCylinderNumber(23)?.id).toBe('G4');
  });

  it('devolve null fora da faixa', () => {
    expect(steamGroupOfCylinderNumber(0)).toBeNull();
    expect(steamGroupOfCylinderNumber(DRYER_CYLINDER_COUNT + 1)).toBeNull();
  });
});
