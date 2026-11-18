import { PROCESS_CATALOG, processVariable } from './catalog';
import { STEAM_GROUPS } from './steam-groups';

/**
 * As variáveis que são conta, e não medição.
 *
 * Duas famílias moram aqui, e a diferença entre elas é só se a conta vai para o
 * arquivo (`calculada`) ou é refeita na leitura (`calculada-na-leitura`). A
 * fórmula é a mesma nos dois casos, e é esta tabela.
 *
 * ## Por que quase toda fórmula é linear em torno do ponto de operação
 *
 * Porque é o que se pode sustentar. Dizer que o teor seco depois do G2 é
 * "o da prensa mais 35 % do que falta secar" é uma aproximação declarada, com
 * um coeficiente `assumed` que alguém pode discutir. Escrever um modelo de
 * secagem de verdade daria números com três casas e a mesma procedência:
 * nenhuma. A forma é a das relações FOPDT — desvio da entrada vezes ganho —
 * sem tempo morto nem constante de tempo, porque estas contas são do instante.
 *
 * As exceções são as que têm fórmula exata: a temperatura do vapor sai da
 * saturação da pressão do grupo, e a receita é uma soma que fecha em 100.
 *
 * ## Por que a dependência é declarada
 *
 * `inputs` não é documentação: é o que deixa a rota de tendência reconstruir a
 * série de quem não grava. Ela resolve a cadeia até chegar em quem tem arquivo
 * (ou em quem é autônoma, que se recalcula sozinha), e aplica a fórmula ponto a
 * ponto. Uma fórmula que lesse uma tag fora de `inputs` daria série errada no
 * gráfico e certa no instante — o pior dos dois mundos.
 */

export interface DerivedVariable {
  readonly tag: string;
  /** As TAGs que a fórmula lê. A rota de tendência resolve a cadeia por aqui. */
  readonly inputs: readonly string[];
  /** A conta, sobre a **verdade** das entradas. */
  readonly compute: (get: (tag: string) => number) => number;
}

/**
 * Temperatura de saturação do vapor, em °C, para a pressão relativa em kPa.
 *
 * A mesma aproximação que a superfície do cilindro usa — `T = 100 ·
 * (p_abs/101,325)^0,25` —, que erra até ~1,5 % na faixa da secagem. Aqui ela
 * aparece sem o desconto de 8 °C da superfície: o que se quer é o vapor, não a
 * chapa.
 */
export function steamSaturationC(relativeKPa: number): number {
  const absolute = Math.max(1, relativeKPa + 101.325);
  return 100 * Math.pow(absolute / 101.325, 0.25);
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

/** A faixa do catálogo, para prender a conta no que a TAG admite. */
function range(tag: string): { min: number; max: number } {
  const variable = processVariable(tag);
  if (!variable) throw new Error(`Derivada declarada para ${tag}, que não está no catálogo.`);
  return { min: variable.min, max: variable.max };
}

/** Vazão total do circuito curto, em m³/h. `assumed`. */
const SHORT_LOOP_FLOW_M3_H = 3600;

/** Quanto da secagem que falta já aconteceu na saída do G2. `assumed`. */
const G2_DRYING_SHARE = 0.35;

/** Toneladas de vapor por tonelada de papel, no ponto de operação. `assumed`. */
const STEAM_PER_PAPER = 0.84;

/** Quanto do vapor volta como condensado; o resto sai pela capota. `assumed`. */
const CONDENSATE_SHARE = 0.95;

/** Quantas vezes o refugo volta ao pulper vira massa recuperada. `assumed`. */
const BROKE_TO_RECIPE = 4;

function build(): DerivedVariable[] {
  const derived: DerivedVariable[] = [];

  // --- temperatura do vapor, uma por grupo: saturação da pressão do grupo
  for (const group of STEAM_GROUPS) {
    const tag = group.section === 'pre-dryer' ? steamTempTag(group.id) : steamTempTag(group.id);
    if (!processVariable(tag)) continue;
    const pressure = group.pressure.tag;
    derived.push({
      tag,
      inputs: [pressure],
      compute: (get) => steamSaturationC(get(pressure)),
    });
  }

  // --- consumo de vapor e condensado
  derived.push({
    tag: 'FI-1110',
    inputs: ['XI-0001'],
    compute: (get) => clamp(get('XI-0001') * STEAM_PER_PAPER, ...bounds('FI-1110')),
  });
  derived.push({
    tag: 'FI-1111',
    inputs: ['FI-1110'],
    compute: (get) => clamp(get('FI-1110') * CONDENSATE_SHARE, ...bounds('FI-1111')),
  });

  // --- refugo e receita
  derived.push({
    tag: 'XI-1005',
    inputs: ['AIC-903'],
    compute: (get) => clamp(1.2 + 2.5 * Math.abs(get('AIC-903') - 4.8), ...bounds('XI-1005')),
  });
  derived.push({
    tag: 'XI-0003',
    inputs: ['XI-1005', 'AIC-902'],
    compute: (get) =>
      clamp(get('XI-1005') + 3.3 + 1.5 * Math.abs(get('AIC-902') - 75), ...bounds('XI-0003')),
  });
  derived.push({
    tag: 'XI-162',
    inputs: ['XI-0003'],
    compute: (get) => clamp(get('XI-0003') * BROKE_TO_RECIPE, ...bounds('XI-162')),
  });
  derived.push({
    tag: 'XI-161',
    inputs: ['XI-162'],
    compute: (get) => clamp(100 - get('XI-162'), ...bounds('XI-161')),
  });

  /**
   * A dispersão do perfil CD piora quando a MD sai do alvo.
   *
   * Estas três continuam arquivadas, e o motivo é concreto: a média de 2σ de
   * **uma bobina** é colhida do arquivo, como a gramatura e a umidade dela. Uma
   * medida que alimenta entidade colhida do arquivo precisa ter arquivo.
   *
   * O coeficiente é `assumed`, e a ideia por trás dele é a de sempre: quando a
   * máquina está fora do alvo em MD, o perfil CD também costuma estar pior —
   * não porque um cause o outro, mas porque a mesma perturbação mexe nos dois.
   */
  derived.push({
    tag: 'AI-912',
    inputs: ['AIC-902'],
    compute: (get) => clamp(0.4 + 0.25 * Math.abs(get('AIC-902') - 75), ...bounds('AI-912')),
  });
  derived.push({
    tag: 'AI-913',
    inputs: ['AIC-903'],
    compute: (get) => clamp(0.25 + 0.3 * Math.abs(get('AIC-903') - 4.8), ...bounds('AI-913')),
  });
  derived.push({
    tag: 'AI-915',
    inputs: ['AIC-905'],
    compute: (get) => clamp(0.8 + 0.1 * Math.abs(get('AIC-905') - 102), ...bounds('AI-915')),
  });

  // --- água e teor seco
  derived.push({
    tag: 'AIC-203',
    inputs: ['AIC-104', 'FIC-105'],
    compute: (get) =>
      clamp((get('AIC-104') * get('FIC-105')) / SHORT_LOOP_FLOW_M3_H, ...bounds('AIC-203')),
  });
  derived.push({
    tag: 'FI-304',
    inputs: ['FIC-105', 'AIC-104'],
    compute: (get) =>
      clamp(520 + 0.5 * (get('FIC-105') - 920) + 60 * (get('AIC-104') - 3.5), ...bounds('FI-304')),
  });
  derived.push({
    tag: 'AI-305',
    inputs: ['PI-302', 'PI-303'],
    compute: (get) =>
      clamp(19 + 0.03 * (get('PI-302') + 45) + 0.02 * (get('PI-303') + 28), ...bounds('AI-305')),
  });
  derived.push({
    tag: 'AI-528',
    inputs: ['AI-407', 'AIC-901'],
    compute: (get) => {
      const press = get('AI-407');
      return clamp(press + G2_DRYING_SHARE * (100 - get('AIC-901') - press), ...bounds('AI-528'));
    },
  });

  return derived;
}

/** `TI-541` para o G1, `TI-741` para o G5, e assim por diante. */
function steamTempTag(groupId: string): string {
  const numero = Number(groupId.replace(/^G/, ''));
  return numero <= 4 ? `TI-54${String(numero)}` : `TI-74${String(numero - 4)}`;
}

function bounds(tag: string): [number, number] {
  const { min, max } = range(tag);
  return [min, max];
}

/**
 * Ordem de dependência: quem é entrada de outra vem antes.
 *
 * O motor calcula na ordem desta lista e pronto — sem isto, o condensado seria
 * calculado com o consumo de vapor do passo anterior, e a tela mostraria duas
 * contas que não fecham entre si.
 */
function inDependencyOrder(items: readonly DerivedVariable[]): DerivedVariable[] {
  const byTag = new Map(items.map((item) => [item.tag, item]));
  const ordered: DerivedVariable[] = [];
  const done = new Set<string>();
  const visiting = new Set<string>();

  const visit = (item: DerivedVariable): void => {
    if (done.has(item.tag)) return;
    if (visiting.has(item.tag)) {
      throw new Error(`Ciclo entre variáveis calculadas, passando por ${item.tag}.`);
    }
    visiting.add(item.tag);
    for (const input of item.inputs) {
      const dependency = byTag.get(input);
      if (dependency) visit(dependency);
    }
    visiting.delete(item.tag);
    done.add(item.tag);
    ordered.push(item);
  };

  for (const item of items) visit(item);
  return ordered;
}

const DERIVED = inDependencyOrder(build());
const BY_TAG = new Map(DERIVED.map((item) => [item.tag, item]));

export const DERIVED_VARIABLES: readonly DerivedVariable[] = Object.freeze(DERIVED);

/** A derivada de uma tag, ou `null` se ela não é conta. */
export function derivedVariable(tag: string): DerivedVariable | null {
  return BY_TAG.get(tag) ?? null;
}

/**
 * Toda variável de nível calculado tem fórmula, e toda fórmula tem variável.
 *
 * A checagem é na carga, e não em teste, pela mesma razão das invariantes dos
 * grupos de vapor: uma TAG marcada como calculada sem fórmula apareceria na
 * tela como um número parado no alvo, sem nada indicando que ninguém a calcula.
 */
const CALCULATED_LEVELS = new Set(['calculada', 'calculada-na-leitura']);

const semFormula = PROCESS_CATALOG.filter(
  (variable) =>
    CALCULATED_LEVELS.has(variable.level) &&
    !BY_TAG.has(variable.tag) &&
    // a produção, a largura e os modelos por cilindro são calculados pelo
    // motor, que tem o estado da máquina; aqui só mora conta sobre TAGs
    !['XI-0001', 'XI-0002'].includes(variable.tag) &&
    variable.cylinder === null &&
    variable.area !== 'mancais',
);

if (semFormula.length > 0) {
  throw new Error(
    `Variáveis de nível calculado sem fórmula em derived.ts: ${semFormula
      .map((variable) => variable.tag)
      .join(', ')}`,
  );
}

const foraDoCatalogo = DERIVED.filter((item) => !processVariable(item.tag));
if (foraDoCatalogo.length > 0) {
  throw new Error(
    `Fórmulas para TAGs fora do catálogo: ${foraDoCatalogo.map((item) => item.tag).join(', ')}`,
  );
}

/** As calculadas na ordem em que uma depende da outra. */
export const DERIVED_IN_ORDER: readonly DerivedVariable[] = DERIVED_VARIABLES;
