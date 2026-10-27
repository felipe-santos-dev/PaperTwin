import { describe, expect, it } from 'vitest';
import * as geometry from './geometry';
import { MP1 } from './mp1';
import { ARRANGEMENTS, assumptions, MEASUREMENTS, type Source } from './provenance';
import { allAssets } from './query';

const assets = allAssets(MP1);

/**
 * Os nomes que `geometry.ts` exporta como dado — tudo menos as funções.
 * É contra esta lista que a exaustividade é cobrada: uma constante nova sem
 * proveniência quebra o teste abaixo em vez de passar despercebida.
 */
const measurementExports = Object.entries(geometry)
  .filter(([, value]) => typeof value !== 'function')
  .map(([name]) => name);

describe('cobertura da proveniência', () => {
  it('não deixa nenhuma medida da geometria sem origem', () => {
    const semOrigem = measurementExports.filter((name) => !(name in MEASUREMENTS));
    expect(semOrigem).toEqual([]);
  });

  it('não registra origem para medida que não existe mais', () => {
    const orfas = Object.keys(MEASUREMENTS).filter((name) => !measurementExports.includes(name));
    expect(orfas).toEqual([]);
  });

  it('cobre as 29 medidas da geometria', () => {
    // O número é explícito de propósito: se alguém apagar metade do geometry.ts,
    // os dois testes acima continuariam passando de mãos vazias.
    expect(measurementExports).toHaveLength(29);
    expect(Object.keys(MEASUREMENTS)).toHaveLength(29);
  });

  it('descreve cada origem com rótulo e justificativa', () => {
    for (const [id, p] of [...Object.entries(MEASUREMENTS), ...Object.entries(ARRANGEMENTS)]) {
      expect(p.label.trim(), `rótulo vazio em ${id}`).not.toBe('');
      expect(p.note.trim(), `justificativa vazia em ${id}`).not.toBe('');
    }
  });

  it('dá origem à existência de cada ativo', () => {
    const válidas: Source[] = ['validated', 'assumed'];
    for (const asset of assets) {
      expect(válidas, `${asset.tag} sem origem`).toContain(asset.source);
    }
  });
});

describe('o que está confirmado', () => {
  it('são os diâmetros, o passo, as alturas, a linha do papel e o Speed Sizer', () => {
    const confirmadas = Object.entries(MEASUREMENTS)
      .filter(([, p]) => p.source === 'validated')
      .map(([id]) => id)
      .sort();

    expect(confirmadas).toEqual([
      'DRYER_BOTTOM_Y_M',
      'DRYER_PITCH_M',
      'DRYER_RADIUS_M',
      'DRYER_TOP_Y_M',
      'DRY_SECTION_WEB_Y_M',
      'SIZER_ROLL_RADIUS_M',
    ]);
  });

  it('inclui a ordem das seções', () => {
    expect(ARRANGEMENTS.SECTION_ORDER.source).toBe('validated');
  });
});

describe('o que ainda é suposição', () => {
  it('inclui o nº de cilindros, os grupos de acionamento e a calandra', () => {
    const supostas = assumptions().map((a) => a.id);

    expect(supostas).toContain('PRE_DRYER_PAIRS');
    expect(supostas).toContain('POST_DRYER_PAIRS');
    expect(supostas).toContain('DRYER_DRIVE_GROUPS');
    expect(supostas).toContain('CALENDER_NIP_COUNT');
    expect(supostas).toContain('CALENDER_THERMAL_POSITION');
  });

  it('marca os cilindros secadores e os rolos da calandra como supostos', () => {
    for (const asset of assets) {
      if (asset.kind === 'dryer-cylinder' || asset.tag.startsWith('MP1-CAL-')) {
        expect(asset.source, `${asset.tag} deveria estar como suposto`).toBe('assumed');
      }
    }
  });

  it('não marca como suposto o que o Felipe confirmou', () => {
    for (const tag of ['MP1-QCS-SC1', 'MP1-QCS-SC2', 'MP1-SZR-RS', 'MP1-SZR-NIP', 'MP1-POP-TBR']) {
      expect(assets.find((a) => a.tag === tag)?.source, tag).toBe('validated');
    }
  });

  it('faz o mancal herdar a origem do corpo que sustenta', () => {
    for (const bearing of assets.filter((a) => a.kind === 'bearing')) {
      const parent = assets.find((a) => a.tag === bearing.parentTag);
      expect(bearing.source, bearing.tag).toBe(parent?.source);
    }
  });
});
