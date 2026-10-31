import { describe, expect, it } from 'vitest';

import { POST_DRYER_PAIRS, PRE_DRYER_PAIRS } from './geometry';
import { MP1 } from './mp1';
import { dryerCylinders } from './query';
import {
  cylindersOfSteamGroup,
  DRYER_CYLINDER_COUNT,
  DRYER_STEAM_GROUPS,
  LAST_PRE_DRYER_CYLINDER,
  sectionOfCylinder,
  steamGroupOfCylinder,
  steamGroupRange,
} from './steam-groups';

describe('numeração dos cilindros', () => {
  it('conta dois cilindros por par', () => {
    expect(DRYER_CYLINDER_COUNT).toBe((PRE_DRYER_PAIRS + POST_DRYER_PAIRS) * 2);
    expect(DRYER_CYLINDER_COUNT).toBe(36);
  });

  it('põe a fronteira entre as secagens no último cilindro da pré', () => {
    expect(LAST_PRE_DRYER_CYLINDER).toBe(26);
    expect(sectionOfCylinder(26)).toBe('pre-dryer');
    expect(sectionOfCylinder(27)).toBe('post-dryer');
  });
});

describe('cobertura 1–36', () => {
  it('cobre todo cilindro, sem furo e sem repetir', () => {
    const cobertos = DRYER_STEAM_GROUPS.flatMap((group) => cylindersOfSteamGroup(group.id));

    expect(cobertos).toHaveLength(DRYER_CYLINDER_COUNT);
    expect(new Set(cobertos).size).toBe(DRYER_CYLINDER_COUNT);
    expect([...cobertos].sort((a, b) => a - b)).toEqual(
      Array.from({ length: DRYER_CYLINDER_COUNT }, (_, i) => i + 1),
    );
  });

  it('emenda cada faixa na anterior', () => {
    for (const [index, group] of DRYER_STEAM_GROUPS.entries()) {
      const anterior = DRYER_STEAM_GROUPS[index - 1];
      expect(group.from, group.id).toBe(anterior ? anterior.to + 1 : 1);
    }
  });

  it('acha o grupo do CS23 no G4, que é o ponto fixo da divisão', () => {
    expect(steamGroupOfCylinder(23)).toBe('G4');
  });

  it('recusa um cilindro fora da faixa', () => {
    expect(() => steamGroupOfCylinder(0)).toThrow(/fora dos grupos/);
    expect(() => steamGroupOfCylinder(DRYER_CYLINDER_COUNT + 1)).toThrow(/fora dos grupos/);
  });
});

describe('grupo contido numa seção', () => {
  it('declara cada grupo na seção dos seus cilindros', () => {
    for (const group of DRYER_STEAM_GROUPS) {
      expect(sectionOfCylinder(group.from), group.id).toBe(group.section);
      expect(sectionOfCylinder(group.to), group.id).toBe(group.section);
    }
  });

  it('bate com a seção do ativo no modelo da máquina', () => {
    for (const { number, asset } of dryerCylinders(MP1)) {
      const group = steamGroupRange(steamGroupOfCylinder(number));
      expect(group, `cilindro ${String(number)}`).not.toBeNull();
      expect(asset.steamGroup, asset.tag).toBe(group?.id);
      expect(asset.section, asset.tag).toBe(group?.section);
    }
  });

  it('não parte nenhum grupo entre as duas secagens', () => {
    const atravessam = DRYER_STEAM_GROUPS.filter(
      (group) => group.from <= LAST_PRE_DRYER_CYLINDER && group.to > LAST_PRE_DRYER_CYLINDER,
    );

    expect(atravessam).toEqual([]);
  });
});

describe('consultas', () => {
  it('devolve os cilindros de um grupo em ordem', () => {
    expect(cylindersOfSteamGroup('G1')).toEqual([1, 2, 3, 4, 5, 6]);
    expect(cylindersOfSteamGroup('G6')).toEqual([33, 34, 35, 36]);
  });

  it('devolve lista vazia para grupo que não existe', () => {
    expect(cylindersOfSteamGroup('G9')).toEqual([]);
    expect(steamGroupRange('G9')).toBeNull();
  });
});
