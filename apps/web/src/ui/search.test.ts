import { describe, expect, it } from 'vitest';
import type { MaintenanceNote } from '@mp1/shared';

import type { ReelView } from '../api/process';
import { dynamicIndex, fold, search, staticIndex } from './search';

/**
 * A busca é prometida como "acha o que eu sei de cabeça". O que um operador
 * sabe de cabeça é a TAG, ou o nome, ou nem um nem outro — "vapor do G4". Os
 * testes aqui são esses três jeitos de procurar a mesma coisa.
 */

const items = staticIndex();
const ids = (query: string, limit = 12) => search(items, query, limit).map((hit) => hit.id);

const BOBINA: ReelView = {
  number: 412,
  shiftId: 'T-2026-06-15-B',
  startedAt: '2026-06-15T17:05:00Z',
  endedAt: '2026-06-15T17:58:00Z',
  weightT: 39.9,
  lengthM: 66_540,
  finalDiameterMm: 3000,
  basisWeightGsm: 75.1,
  moisturePct: 4.79,
  caliperUm: 101.8,
  cdSpread: null,
  splices: 0,
  disposition: 'segregada',
  dispositionReason: 'gramatura fora',
};

const NOTA: MaintenanceNote = {
  number: 'NM-000123',
  assetTag: 'MP1-SEC-G4-CS23-MLC',
  symptom: 'Vibração em tendência de alta',
  priority: 2,
  origin: 'alarme',
  originRef: 'AL-1',
  status: 'aberta',
  requiresShutdown: false,
  evidence: [],
  createdAt: '2026-06-15T12:00:00Z',
  closedAt: null,
};

describe('índice', () => {
  it('tem as cinco origens que a fase pede', () => {
    const kinds = new Set(items.map((item) => item.kind));
    expect(kinds).toContain('tela');
    expect(kinds).toContain('tag');
    expect(kinds).toContain('mancal');

    const extra = dynamicIndex([BOBINA], [NOTA]);
    expect(new Set(extra.map((item) => item.kind))).toEqual(new Set(['bobina', 'nota']));
  });

  it('traz as oito telas, o catálogo com as fixas e os 98 mancais', () => {
    expect(items.filter((item) => item.kind === 'tela')).toHaveLength(8);
    // 356 do catálogo + a fixa que sobrou no preparo depois da Fase 3
    expect(items.filter((item) => item.kind === 'tag')).toHaveLength(357);
    expect(items.filter((item) => item.kind === 'mancal')).toHaveLength(98);
  });
});

describe('busca', () => {
  it('a TAG exata vem primeiro', () => {
    expect(ids('PIC-514')[0]).toBe('PIC-514');
    expect(ids('AIC-902')[0]).toBe('AIC-902');
  });

  it('acha pelo nome, sem saber a TAG', () => {
    expect(ids('gramatura')).toContain('AIC-902');
    expect(ids('espessura')).toContain('AIC-905');
  });

  it('acha sem acento e sem caixa', () => {
    expect(fold('Pré-secagem')).toBe('pre-secagem');
    expect(ids('pre-secagem').length).toBeGreaterThan(0);
    expect(ids('VAPOR G4')).toContain('PIC-514');
  });

  it('exige todos os pedaços da consulta', () => {
    // "vapor" sozinho traz muita coisa; com "g4" sobram as duas do grupo principal
    expect(ids('vapor').length).toBeGreaterThan(1);
    expect(ids('vapor g4')).toEqual(['PIC-514', 'TI-544']);
  });

  it('acha o mancal pelo cilindro', () => {
    const hits = ids('CS23', 20);
    expect(hits).toContain('MP1-SEC-G4-CS23-MLC');
    expect(hits).toContain('MP1-SEC-G4-CS23-MLA');
  });

  it('acha a tela pelo nome', () => {
    expect(ids('mancais')[0]).toBe('mancais');
    expect(ids('laborat')[0]).toBe('laboratorio');
  });

  it('acha a bobina e a nota pelo número', () => {
    const todos = [...items, ...dynamicIndex([BOBINA], [NOTA])];
    expect(search(todos, '412').map((hit) => hit.id)).toContain('412');
    expect(search(todos, 'NM-000123')[0]?.id).toBe('NM-000123');
    expect(search(todos, 'segregada').map((hit) => hit.id)).toContain('412');
  });

  it('consulta vazia não devolve nada', () => {
    expect(search(items, '')).toEqual([]);
    expect(search(items, '   ')).toEqual([]);
  });

  it('respeita o teto de resultados', () => {
    expect(search(items, 'a', 5)).toHaveLength(5);
  });

  it('não inventa resultado', () => {
    expect(search(items, 'zzzzz')).toEqual([]);
  });
});
