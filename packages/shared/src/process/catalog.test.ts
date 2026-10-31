import { readFile } from 'node:fs/promises';

import { readCatalog } from '../../scripts/catalog-csv';
import { MP1 } from '../machine/mp1';
import { dryerCylinders } from '../machine/query';
import {
  controlledVariables,
  isCatalogTag,
  PROCESS_CATALOG,
  pendingVariables,
  processVariable,
  variablesOfArea,
  variablesOfCylinder,
} from './catalog';
import { CONCRETE_VARIABLES, PER_CYLINDER_PATTERNS } from './catalog.generated';
import {
  expandCylinderName,
  expandCylinderTag,
  isPerCylinderName,
  isPerCylinderTag,
} from './per-cylinder';

const GENERATED = new URL('./catalog.generated.ts', import.meta.url);

const cylinders = dryerCylinders(MP1);

describe('catalog.generated.ts bate com o CSV', () => {
  it('tem exatamente as variáveis concretas do catalogo-base.csv', async () => {
    const { concrete } = await readCatalog();

    // Se isto quebrar, o CSV mudou e o gerador não rodou:
    //   npm run generate --workspace @mp1/shared
    expect(CONCRETE_VARIABLES).toEqual(concrete);
  });

  it('tem exatamente os padrões por cilindro do catalogo-base.csv', async () => {
    const { patterns } = await readCatalog();

    expect(PER_CYLINDER_PATTERNS).toEqual(patterns);
  });

  it('avisa que é gerado, para ninguém editar à mão', async () => {
    const content = await readFile(GENERATED, 'utf8');

    expect(content).toContain('GERADO — não edite à mão');
  });
});

describe('marcador nn', () => {
  it('reconhece as tags de padrão por cilindro', () => {
    for (const pattern of PER_CYLINDER_PATTERNS) {
      expect(isPerCylinderTag(pattern.tagPattern)).toBe(true);
      expect(isPerCylinderName(pattern.namePattern)).toBe(true);
    }
  });

  it('não confunde o "nn" de "scanner" com o marcador', () => {
    // O catálogo tem AIC-901 'Umidade antes da colagem · scanner 1'. Um
    // includes('nn') classificaria essa linha como padrão por cilindro, e um
    // replace('nn', '7') escreveria 'sca7er 1'.
    expect(isPerCylinderTag('AIC-901')).toBe(false);
    expect(isPerCylinderName('Umidade antes da colagem · scanner 1')).toBe(false);
    expect(isPerCylinderName('Opacidade · scanner final')).toBe(false);
  });

  it('expande a tag com dois dígitos e o nome com o número falado', () => {
    expect(expandCylinderTag('VI-51nnA', 7)).toBe('VI-5107A');
    expect(expandCylinderTag('VI-51nnA', 23)).toBe('VI-5123A');
    expect(expandCylinderTag('TI-52nn', 1)).toBe('TI-5201');

    expect(expandCylinderName('Vibração RMS · mancal LA do cilindro nn', 7)).toBe(
      'Vibração RMS · mancal LA do cilindro 7',
    );
  });

  it('recusa expandir o que não é padrão', () => {
    expect(() => expandCylinderTag('AIC-901', 7)).toThrow(/fora do formato/);
    expect(() => expandCylinderName('Gramatura · scanner final', 7)).toThrow(/sem o marcador/);
  });
});

describe('expansão por cilindro', () => {
  it('usa os cilindros do modelo da máquina, não um número fixo', () => {
    expect(cylinders).toHaveLength(36);
    expect(cylinders.map((c) => c.number)).toEqual(
      Array.from({ length: 36 }, (_, index) => index + 1),
    );
  });

  it('gera uma variável por padrão por cilindro', () => {
    const expanded = PROCESS_CATALOG.filter((variable) => variable.cylinder !== null);

    expect(expanded).toHaveLength(PER_CYLINDER_PATTERNS.length * cylinders.length);
    expect(PROCESS_CATALOG).toHaveLength(CONCRETE_VARIABLES.length + expanded.length);
  });

  it('cobre os 36 cilindros em cada padrão', () => {
    for (const pattern of PER_CYLINDER_PATTERNS) {
      const tags = cylinders.map(({ number }) => expandCylinderTag(pattern.tagPattern, number));

      for (const tag of tags) {
        expect(isCatalogTag(tag)).toBe(true);
      }
    }
  });

  it('não deixa o marcador escapar para nenhuma tag ou nome', () => {
    for (const variable of PROCESS_CATALOG) {
      expect(isPerCylinderTag(variable.tag)).toBe(false);
      expect(isPerCylinderName(variable.name)).toBe(false);
    }
  });

  it('herda o grupo de vapor do cilindro no modelo da máquina', () => {
    const cs23 = processVariable('VI-5123A');

    expect(cs23?.cylinder).toBe(23);
    expect(cs23?.steamGroup).toBe('G4');

    // As faixas da lista base: G1 1–6, G4 19–26, G6 33–36.
    expect(processVariable('VI-5101A')?.steamGroup).toBe('G1');
    expect(processVariable('TI-5236')?.steamGroup).toBe('G6');
  });

  it('mantém os valores do padrão em cada cilindro', () => {
    const pattern = PER_CYLINDER_PATTERNS.find((p) => p.tagPattern === 'VI-51nnA');
    const expanded = processVariable('VI-5112A');

    expect(pattern).toBeDefined();
    expect(expanded?.unit).toBe(pattern?.unit);
    expect(expanded?.limits).toEqual(pattern?.limits);
    expect(expanded?.source).toBe('ISO 20816-3');
  });

  it('dá as 7 variáveis de um cilindro', () => {
    const variables = variablesOfCylinder(23);

    expect(variables.map((variable) => variable.tag).sort()).toEqual([
      'TI-5223',
      'TI-5323A',
      'TI-5323B',
      'VE-5123A',
      'VE-5123B',
      'VI-5123A',
      'VI-5123B',
    ]);
  });
});

describe('integridade do catálogo', () => {
  it('não tem tag repetida', () => {
    const tags = PROCESS_CATALOG.map((variable) => variable.tag);

    expect(new Set(tags).size).toBe(tags.length);
  });

  it('mantém min ≤ max e o alvo dentro da faixa', () => {
    for (const { tag, min, max, target } of PROCESS_CATALOG) {
      expect(min, tag).toBeLessThanOrEqual(max);
      if (target !== null) {
        expect(target, tag).toBeGreaterThanOrEqual(min);
        expect(target, tag).toBeLessThanOrEqual(max);
      }
    }
  });

  it('mantém LL ≤ L ≤ H ≤ HH entre os limites que existem', () => {
    for (const { tag, limits } of PROCESS_CATALOG) {
      const present = [limits.ll, limits.l, limits.h, limits.hh].filter(
        (value): value is number => value !== null,
      );

      expect(
        [...present].sort((a, b) => a - b),
        tag,
      ).toEqual(present);
    }
  });

  it('deixa os limites de alarme livres da faixa de operação', () => {
    // Não é descuido: o alarme crítico da vazão de óleo fica abaixo do mínimo
    // de operação de propósito.
    const oil = processVariable('FIC-1105');

    expect(oil?.min).toBe(1.5);
    expect(oil?.limits.ll).toBe(1.0);
  });
});

describe('consultas', () => {
  it('acha pela tag e devolve null no que não existe', () => {
    expect(processVariable('PIC-514')?.name).toBe('Pressão de vapor G4 (grupo principal)');
    expect(processVariable('PIC-999')).toBeNull();
  });

  it('separa malhas de medições', () => {
    expect(controlledVariables().every((variable) => variable.controlled)).toBe(true);
    expect(processVariable('XI-0001')?.controlled).toBe(false);
    expect(processVariable('FIC-105')?.controlled).toBe(true);
  });

  it('filtra por área', () => {
    const qcs = variablesOfArea('qcs');

    expect(qcs.map((variable) => variable.tag)).toContain('AIC-902');
    expect(qcs.every((variable) => variable.area === 'qcs')).toBe(true);
  });

  it('lista como pendência o que é assumed ou de confiança baixa', () => {
    const pending = pendingVariables().map((variable) => variable.tag);

    // assumed de tag própria
    expect(pending).toContain('PIC-512');
    expect(pending).toContain('PIC-513');
    // fonte B, mas confiança baixa
    expect(pending).toContain('PIC-507');
    // assumed vindo de padrão por cilindro
    expect(pending).toContain('VE-5101A');
    expect(pending).toContain('TI-5201');
    // conferido e de confiança alta não é pendência
    expect(pending).not.toContain('AIC-902');
    expect(pending).not.toContain('VI-5123A');
  });
});
