import { describe, expect, it } from 'vitest';

import { MP1 } from '../machine/mp1';
import { monitoredAssets } from '../machine/query';
import { DRYER_CYLINDER_COUNT } from '../machine/steam-groups';
import {
  bearingOfProcessTag,
  bearingTagsOf,
  bearingsWithoutProcessTags,
  DRYER_BEARING_TAGS,
  isBearingProcessTag,
} from './bearing-tags';
import { isCatalogTag } from './catalog';

describe('ponte entre ativo e tags de processo', () => {
  it('tem dois mancais por cilindro secador', () => {
    expect(DRYER_BEARING_TAGS).toHaveLength(DRYER_CYLINDER_COUNT * 2);
  });

  it('traduz o CS23 do lado acionamento', () => {
    const mancal = bearingTagsOf('MP1-SEC-G4-CS23-MLA');

    expect(mancal).toEqual({
      assetTag: 'MP1-SEC-G4-CS23-MLA',
      cylinder: 23,
      side: 'LA',
      vibration: 'VI-5123A',
      envelope: 'VE-5123A',
      temperature: 'TI-5323A',
    });
  });

  /**
   * `A` é LA e `B` é LC, como a LISTA-BASE escreve. Não confundir com o `A`/`B`
   * das zonas da ISO 20816-3, que é outra coisa.
   */
  it('usa B para o lado comando', () => {
    const mancal = bearingTagsOf('MP1-SEC-G4-CS23-MLC');

    expect(mancal?.side).toBe('LC');
    expect(mancal?.vibration).toBe('VI-5123B');
    expect(mancal?.temperature).toBe('TI-5323B');
  });

  it('põe dois dígitos no nº do cilindro', () => {
    expect(bearingTagsOf('MP1-SEC-G1-CS01-MLA')?.vibration).toBe('VI-5101A');
    expect(bearingTagsOf('MP1-SEC-G6-CS36-MLC')?.vibration).toBe('VI-5136B');
  });

  it('resolve todas as tags contra o catálogo', () => {
    for (const mancal of DRYER_BEARING_TAGS) {
      for (const tag of [mancal.vibration, mancal.envelope, mancal.temperature]) {
        expect(isCatalogTag(tag), tag).toBe(true);
      }
    }
  });

  it('volta da tag de processo para o ativo', () => {
    expect(bearingOfProcessTag('VE-5123A')?.assetTag).toBe('MP1-SEC-G4-CS23-MLA');
    expect(bearingOfProcessTag('TI-5323B')?.assetTag).toBe('MP1-SEC-G4-CS23-MLC');
    expect(bearingOfProcessTag('PIC-514')).toBeNull();
  });

  it('reconhece o que é medição de mancal', () => {
    expect(isBearingProcessTag('VI-5101A')).toBe(true);
    expect(isBearingProcessTag('TI-5201')).toBe(false);
  });

  it('não tem tag para ativo que não é mancal de secador', () => {
    expect(bearingTagsOf('MP1-QCS-SC1')).toBeNull();
    expect(bearingTagsOf('MP1-SEC-G4-CS23')).toBeNull();
  });

  /**
   * Pendência da lista base, não deste código.
   *
   * O padrão por cilindro cobre só os cilindros secadores, então os mancais dos
   * rolos de prensa, do Speed Sizer, da calandra e da Pope são acompanhados pelo
   * gêmeo — têm classe ISO no modelo — e não têm instrumento no catálogo.
   * Inventar uma tag para eles daria ao simulador medições que ninguém
   * especificou.
   */
  it('lista os mancais monitorados sem instrumento no catálogo', () => {
    const semTag = bearingsWithoutProcessTags();
    const monitorados = monitoredAssets(MP1).length;

    expect(semTag.length).toBe(monitorados - DRYER_BEARING_TAGS.length);
    expect(semTag.length).toBeGreaterThan(0);
    expect(semTag.every((tag) => !tag.includes('-CS'))).toBe(true);
  });

  it('não repete tag de processo entre mancais', () => {
    const todas = DRYER_BEARING_TAGS.flatMap((m) => [m.vibration, m.envelope, m.temperature]);
    expect(new Set(todas).size).toBe(todas.length);
  });
});
