import type { VariableSource } from './types';

/**
 * Vocabulário das relações causa-efeito do simulador.
 *
 * A fonte da verdade é `reference/research/relacoes-fopdt.csv`: as 15 relações
 * da pesquisa B (23 linhas, contando os desdobramentos `b`/`c`) escritas como
 * modelos de primeira ordem com tempo morto.
 */

/**
 * Um degrau de referência, como a pesquisa mediu a relação.
 *
 * O `kp` do CSV já é por unidade de entrada, então o degrau não entra na conta
 * — ele fica registrado porque é o degrau em que o ganho foi medido, e um ganho
 * medido com +50 kN/m não vale necessariamente para +500.
 */
export interface ReferenceStep {
  readonly value: number;
  /** Unidade do degrau; vazia nas variáveis adimensionais. */
  readonly unit: string;
}

/**
 * Uma relação de primeira ordem com tempo morto.
 *
 * A saída é **desvio do ponto de operação**, não valor absoluto: a relação diz
 * quanto a saída se afasta de onde estava, e várias relações sobre a mesma
 * saída se somam por superposição — a gramatura (`AIC-902`) tem quatro.
 */
export interface FopdtRelation {
  /** Id da pesquisa, ex.: `6c`. Único no conjunto. */
  readonly id: string;
  /** TAG da entrada, sem o `[k]` das relações por zona. */
  readonly input: string;
  /** TAG da saída, sem o `[k]`. Pode ser uma variável de laboratório. */
  readonly output: string;
  /**
   * Se a relação é zona a zona, como o controle CD de gramatura.
   *
   * No CSV ela aparece com `[k]` nas duas pontas: um degrau na zona k da
   * diluição mexe na gramatura medida na zona k, e nas vizinhas pelo
   * espalhamento lateral.
   */
  readonly zoned: boolean;
  readonly step: ReferenceStep;
  /** Ganho estacionário, por unidade de entrada. */
  readonly kp: number;
  /**
   * Unidade do ganho como a pesquisa escreve, ex.: `g/m² por m³/h`.
   *
   * É prosa, não campo de máquina: quatro linhas não têm forma regular
   * (`razão MD/CD por unidade`, `g/m² por % (zona k)`, `g/m² por % (por lado)`,
   * `mm de curl por kPa`). O que o gerador valida de verdade é a unidade do
   * degrau contra a unidade da entrada no catálogo.
   */
  readonly kpUnit: string;
  /** Tempo morto, em segundos. */
  readonly deadTimeS: number;
  /** Constante de tempo, em segundos. */
  readonly tauS: number;
  readonly note: string | null;
  /**
   * Id da relação de onde esta foi herdada; `null` nas que vêm do CSV.
   *
   * A pesquisa deixa uma relação implícita na observação da nº 5 ("aplicar
   * também a PIC-712"). Herdá-la explicitamente é o que faz o simulador
   * responder ao vapor do G6 — se ficasse só na prosa, não responderia.
   */
  readonly derivedFrom: string | null;
  /** `B` nas linhas do CSV, `assumed` nas herdadas. */
  readonly source: VariableSource;
}

/**
 * Uma variável de laboratório da seção 12.2 da pesquisa B.
 *
 * Não é malha e não tem compressão: é ensaio de bancada, com norma, instrumento
 * e frequência de amostragem.
 *
 * **O que o simulador calcula é o valor real, contínuo.** As relações FOPDT que
 * terminam numa tag `LAB-` produzem o valor que a folha tem naquele instante —
 * o valor que o laboratório *conheceria* se medisse agora. Na operação de
 * verdade esse número só aparece quando o ensaio é feito, na frequência de
 * `sampling`: a tração MD a cada 1–2 bobinas, as cinzas 2x por turno. Separar o
 * valor real da sua visibilidade é o que torna o simulador honesto — quem opera
 * passa horas sem saber o que a folha está fazendo. A amostragem em si fica
 * para depois; por ora `sampling` é a frequência registrada, em prosa.
 */
export interface LabVariable {
  /** TAG do ensaio, ex.: `LAB-1206`. */
  readonly tag: string;
  readonly name: string;
  readonly unit: string;
  /** Faixa típica para 75 g/m², como a §12.2 escreve. */
  readonly range: string;
  /** Norma do ensaio, ex.: `ISO 1924-2 / TAPPI T 494`. */
  readonly standard: string;
  readonly instrument: string;
  /** Com que frequência o ensaio é feito — quando o valor fica visível. */
  readonly sampling: string;
  /** Variável de processo usada para corrigir o ensaio. */
  readonly correction: string;
  /** TAG de onde esta é derivada; `null` nas medidas direto. */
  readonly derivedFrom: string | null;
}
