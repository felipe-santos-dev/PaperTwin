import { readFile } from 'node:fs/promises';

import { readRelations } from '../../scripts/relations-csv';
import { isCatalogTag, processVariable } from './catalog';
import { isLabTag, LAB_VARIABLES, labVariable, measuredLabVariables } from './lab';
import { CSV_RELATIONS } from './relations.generated';
import {
  CD_SIGMA_MM,
  CD_ZONE_COUNT,
  CD_ZONE_WIDTH_MM,
  drivenOutputs,
  PROCESS_RELATIONS,
  relation,
  relationsForInput,
  relationsForOutput,
  zonedRelations,
} from './relations';

const GENERATED = new URL('./relations.generated.ts', import.meta.url);
const PESQUISA_B = new URL(
  '../../../../reference/research/pesquisa-B-manual-processo.md',
  import.meta.url,
);

/**
 * As TAGs da coluna 2 da tabela da §12.2.
 *
 * Lê a célula da tabela, e não o texto todo da seção: assim uma TAG citada na
 * prosa em volta não entra na lista por acidente.
 */
async function labTagsFromSection122(): Promise<string[]> {
  const content = await readFile(PESQUISA_B, 'utf8');
  const start = content.indexOf('### 12.2');

  expect(start, 'seção 12.2 não encontrada na pesquisa B').toBeGreaterThan(-1);

  const section = content.slice(start, content.indexOf('\n---', start));

  return section
    .split('\n')
    .filter((line) => line.trimStart().startsWith('|'))
    .map((line) => line.split('|')[2] ?? '')
    .map((cell) => /`(LAB-\d+)`/.exec(cell)?.[1])
    .filter((tag): tag is string => tag !== undefined);
}

describe('relations.generated.ts bate com o CSV', () => {
  it('tem exatamente as relações do relacoes-fopdt.csv', async () => {
    const relations = await readRelations();

    // Se isto quebrar, o CSV mudou e o gerador não rodou:
    //   npm run generate --workspace @mp1/shared
    expect(CSV_RELATIONS).toEqual(relations);
  });

  it('traz as 23 linhas das 15 relações da pesquisa', () => {
    expect(CSV_RELATIONS).toHaveLength(23);

    const baseIds = new Set(CSV_RELATIONS.map((item) => /^\d+/.exec(item.id)?.[0]));
    expect(baseIds.size).toBe(15);
  });

  it('avisa que é gerado, para ninguém editar à mão', async () => {
    const content = await readFile(GENERATED, 'utf8');

    expect(content).toContain('GERADO — não edite à mão');
  });

  it('não tem id repetido', () => {
    const ids = PROCESS_RELATIONS.map((item) => item.id);

    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('integridade referencial', () => {
  it('resolve toda entrada contra o catálogo de processo', () => {
    for (const { id, input } of PROCESS_RELATIONS) {
      expect(isCatalogTag(input), `${id}: entrada ${input}`).toBe(true);
    }
  });

  it('resolve toda saída contra o catálogo ou o laboratório', () => {
    for (const { id, output } of PROCESS_RELATIONS) {
      expect(isCatalogTag(output) || isLabTag(output), `${id}: saída ${output}`).toBe(true);
    }
  });

  it('não deixa um ensaio de laboratório ser entrada', () => {
    // Um resultado de bancada é consequência, não algo que se manipule.
    for (const { id, input } of PROCESS_RELATIONS) {
      expect(isLabTag(input), `${id}: entrada ${input}`).toBe(false);
    }
  });

  it('usa só as tags LAB que existem na lista', () => {
    const labOutputs = PROCESS_RELATIONS.map((item) => item.output).filter((tag) =>
      tag.startsWith('LAB-'),
    );

    expect([...new Set(labOutputs)].sort()).toEqual(['LAB-1206', 'LAB-1206R', 'LAB-1212']);
    for (const tag of labOutputs) {
      expect(labVariable(tag)).not.toBeNull();
    }
  });

  it('mantém τ positivo e tempo morto não negativo', () => {
    for (const { id, tauS, deadTimeS, kp } of PROCESS_RELATIONS) {
      expect(tauS, id).toBeGreaterThan(0);
      expect(deadTimeS, id).toBeGreaterThanOrEqual(0);
      expect(kp, id).not.toBe(0);
    }
  });

  it('casa a unidade do degrau com a unidade da entrada no catálogo', () => {
    // A tabela de equivalências do parser: kPa ↔ kPa rel, sem unidade ↔ adim.
    const equivalent = new Set(['kPa|kPa rel', '|adim.']);

    for (const { id, input, step } of PROCESS_RELATIONS) {
      const unit = processVariable(input)?.unit ?? '';
      const ok = step.unit === unit || equivalent.has(`${step.unit}|${unit}`);

      expect(ok, `${id}: degrau '${step.unit}' vs catálogo '${unit}'`).toBe(true);
    }
  });
});

describe('laboratório · seção 12.2 da pesquisa B', () => {
  it('tem exatamente os ensaios da tabela da §12.2', async () => {
    const fromSection = await labTagsFromSection122();

    expect(fromSection).toHaveLength(12);
    expect(measuredLabVariables().map((item) => item.tag)).toEqual(fromSection);
  });

  it('marca a LAB-1206R como derivada, fora da lista medida', () => {
    const ratio = labVariable('LAB-1206R');

    expect(ratio?.derivedFrom).toBe('LAB-1206');
    expect(measuredLabVariables().map((item) => item.tag)).not.toContain('LAB-1206R');
    // Herda a frequência do ensaio que a origina: não se mede a razão sozinha.
    expect(ratio?.sampling).toBe(labVariable('LAB-1206')?.sampling);
  });

  it('não tem malha nem compressão — só norma, instrumento e frequência', () => {
    for (const item of LAB_VARIABLES) {
      expect(item.standard, item.tag).not.toBe('');
      expect(item.instrument, item.tag).not.toBe('');
      expect(item.sampling, item.tag).not.toBe('');
      // O tipo não tem campo de malha nem de compressão, de propósito.
      expect(item).not.toHaveProperty('controlled');
      expect(item).not.toHaveProperty('compression');
    }
  });
});

describe('relações herdadas', () => {
  it('herda a relação 5 para a PIC-712, com fonte assumed', () => {
    const origin = relation('5');
    const inherited = relation('5d');

    expect(origin?.input).toBe('PIC-711');
    expect(origin?.source).toBe('B');

    expect(inherited?.input).toBe('PIC-712');
    expect(inherited?.output).toBe('AIC-903');
    expect(inherited?.derivedFrom).toBe('5');
    expect(inherited?.source).toBe('assumed');
  });

  it('copia os coeficientes da origem, sem um segundo número para manter', () => {
    const origin = relation('5');
    const inherited = relation('5d');

    expect(inherited?.kp).toBe(origin?.kp);
    expect(inherited?.deadTimeS).toBe(origin?.deadTimeS);
    expect(inherited?.tauS).toBe(origin?.tauS);
  });

  it('faz o vapor dos dois grupos da pós-secagem mexer na umidade final', () => {
    const inputs = relationsForOutput('AIC-903').map((item) => item.input);

    expect(inputs).toContain('PIC-711');
    expect(inputs).toContain('PIC-712');
  });

  it('não marca as linhas do CSV como derivadas', () => {
    for (const item of CSV_RELATIONS) {
      expect(item.derivedFrom, item.id).toBeNull();
      expect(item.source, item.id).toBe('B');
    }
  });
});

describe('geometria do controle CD', () => {
  it('converte o σ de milímetros para zonas pela largura do modelo', () => {
    expect(CD_ZONE_COUNT).toBe(140);
    expect(CD_ZONE_WIDTH_MM).toBeCloseTo(8000 / 140, 6);
    expect(CD_SIGMA_MM / CD_ZONE_WIDTH_MM).toBeCloseTo(0.7875, 4);
  });

  it('tem uma relação por zona, da diluição para a gramatura', () => {
    const zoned = zonedRelations();

    expect(zoned).toHaveLength(1);
    expect(zoned[0]?.id).toBe('11');
    expect(zoned[0]?.input).toBe('ZIC-205');
    expect(zoned[0]?.output).toBe('AIC-902');
    expect(zoned[0]?.kp).toBe(-0.08);
  });
});

describe('consultas', () => {
  it('soma as quatro entradas que chegam na gramatura', () => {
    const inputs = relationsForOutput('AIC-902').map((item) => item.input);

    expect(inputs.sort()).toEqual(['AIC-104', 'FIC-105', 'SIC-1104', 'ZIC-205']);
  });

  it('dá as três saídas que a carga da prensa move', () => {
    const outputs = relationsForInput('WIC-401').map((item) => item.output);

    expect(outputs.sort()).toEqual(['AI-407', 'AIC-901', 'AIC-905']);
  });

  it('lista as saídas movidas sem repetição', () => {
    const outputs = drivenOutputs();

    expect(new Set(outputs).size).toBe(outputs.length);
    expect(outputs).toContain('AIC-903');
  });

  it('devolve null no id que não existe', () => {
    expect(relation('99')).toBeNull();
  });
});
