import type { LabResult } from '../operations/lab-result';
import { relationsForOutput } from '../process/relations';
import { operatingPoint } from '../simulation/operating-point';

/**
 * O sensor virtual: estimar um ensaio entre duas análises.
 *
 * O laboratório mede a tração MD numa amostra por bobina, e o laudo demora.
 * Entre um resultado e o próximo a operação fica sem medida — e é aí que a
 * pergunta "o papel que está saindo agora está dentro?" não tem resposta.
 *
 * ## O modelo é o que a pesquisa mediu, não um ajuste cego
 *
 * A primeira ideia foi regressão: ajustar tração contra as variáveis de
 * processo dos últimos laudos. Ela não serve aqui, e a razão é do processo, não
 * do método — a energia de refino é **malha**, fica no setpoint, e uma variável
 * que não varia não sustenta regressão nenhuma. O ajuste daria uma inclinação
 * inventada em cima de ruído.
 *
 * O que existe é melhor que isso: o ganho da relação 9 (`JIC-101 → LAB-1206`,
 * 0,0425 kN/m por kWh/t) foi **medido num teste de degrau** e está declarado no
 * CSV de relações, que é a mesma fonte que o motor integra. O sensor usa esse
 * ganho em regime:
 *
 *     estimativa = ponto de operação + Σ kp × (entrada − ponto de operação dela)
 *
 * ## E o laboratório corrige o que o modelo não sabe
 *
 * Um modelo de regime erra por motivos conhecidos: a planta tem dinâmica (270 s
 * de tempo morto e τ de 450 s na relação 9), o ensaio tem repetibilidade, e a
 * folha tem o que ninguém mediu. A correção vem do próprio laboratório:
 *
 * - o **viés** é a média dos resíduos (laudo − modelo) dos últimos resultados,
 *   e é somado à estimativa até o próximo laudo chegar;
 * - a **faixa** é duas vezes o desvio padrão desses resíduos.
 *
 * É por isso que a estimativa **pula** quando um laudo entra: o viés muda. O
 * pulo não é defeito — é a única coisa honesta a fazer quando chega uma medida
 * que diz que o modelo estava deslocado.
 *
 * ## O que ele não promete
 *
 * Não promete acertar num transiente: o modelo é de regime, então numa mudança
 * de refino a estimativa chega **antes** do papel, pelo tempo morto da relação.
 * Com menos de três laudos não há faixa, e a resposta diz isso em vez de
 * inventar uma incerteza.
 */

/** Quantos resíduos entram no viés e na faixa. */
export const SOFT_SENSOR_WINDOW = 8;

/** Mínimo de laudos para haver faixa. O mesmo piso do `rul.ts`, e pelo mesmo motivo. */
export const SOFT_SENSOR_MIN_RESULTS = 3;

/** Quantos desvios padrão a faixa cobre. */
export const SOFT_SENSOR_SIGMAS = 2;

/** Uma entrada do modelo: a variável de processo e o valor dela. */
export interface SoftSensorInput {
  readonly tag: string;
  readonly value: number;
}

/** O modelo de regime de um ensaio: de quais entradas ele depende, e com que ganho. */
export interface SoftSensorModel {
  readonly tag: string;
  readonly base: number;
  readonly terms: readonly {
    readonly tag: string;
    readonly kp: number;
    readonly at: number;
    readonly unit: string;
  }[];
}

/**
 * O modelo de um ensaio, montado do grafo de relações.
 *
 * Devolve `null` para um ensaio sem relação declarada: sem teste de degrau não
 * há ganho, e sem ganho não há estimativa — o que é diferente de estimar zero.
 */
export function softSensorModel(tag: string): SoftSensorModel | null {
  const base = operatingPoint(tag);
  if (base === null) return null;

  const terms = relationsForOutput(tag)
    .map((relation) => {
      const at = operatingPoint(relation.input);
      return at === null
        ? null
        : { tag: relation.input, kp: relation.kp, at, unit: relation.kpUnit };
    })
    .filter((term): term is NonNullable<typeof term> => term !== null);

  return terms.length === 0 ? null : { tag, base, terms };
}

/** O valor que o modelo dá para um conjunto de entradas, sem viés. */
export function modelValue(
  model: SoftSensorModel,
  inputs: readonly SoftSensorInput[],
): number | null {
  let value = model.base;

  for (const term of model.terms) {
    const input = inputs.find((item) => item.tag === term.tag);
    if (!input) return null;
    value += term.kp * (input.value - term.at);
  }

  return value;
}

/** O resíduo de um laudo: o que o laboratório viu menos o que o modelo dava. */
export interface SoftSensorResidual {
  readonly result: LabResult;
  readonly modelled: number;
  readonly residual: number;
}

export interface SoftSensorCalibration {
  /** Quanto somar à estimativa, da média dos resíduos. */
  readonly bias: number;
  /** Desvio padrão dos resíduos; `null` com menos de três laudos. */
  readonly sd: number | null;
  /** Quantos laudos entraram. */
  readonly samples: number;
  /** Quando foi o laudo mais recente que entrou. */
  readonly lastAt: string | null;
}

/**
 * A calibração, dos resíduos dos últimos laudos.
 *
 * Os resíduos entram na ordem do tempo e só os `SOFT_SENSOR_WINDOW` últimos
 * contam: um viés que carregasse o turno inteiro demoraria a reagir a uma
 * mudança de fibra ou de refino, que é justamente quando ele importa.
 */
export function calibrate(
  residuals: readonly SoftSensorResidual[],
  window = SOFT_SENSOR_WINDOW,
): SoftSensorCalibration {
  const últimos = [...residuals]
    .sort((a, b) => Date.parse(a.result.sampledAt) - Date.parse(b.result.sampledAt))
    .slice(-window);

  if (últimos.length === 0) {
    return { bias: 0, sd: null, samples: 0, lastAt: null };
  }

  const valores = últimos.map((item) => item.residual);
  const bias = valores.reduce((sum, value) => sum + value, 0) / valores.length;

  /**
   * O desvio padrão é **amostral** (divide por n − 1).
   *
   * Com três laudos a diferença para o populacional é de 22 %, e ela está do
   * lado certo: a faixa fica maior quando há menos medida para sustentá-la.
   */
  const sd =
    valores.length < SOFT_SENSOR_MIN_RESULTS
      ? null
      : Math.sqrt(
          valores.reduce((sum, value) => sum + (value - bias) ** 2, 0) / (valores.length - 1),
        );

  return {
    bias,
    sd,
    samples: últimos.length,
    lastAt: últimos.at(-1)?.result.sampledAt ?? null,
  };
}

export interface SoftSensorEstimate {
  /** O valor estimado, com o viés já somado. */
  readonly value: number;
  /** O que o modelo deu antes do viés. */
  readonly modelled: number;
  readonly bias: number;
  /** Metade da faixa; `null` quando não há laudos suficientes. */
  readonly band: number | null;
  readonly lo: number | null;
  readonly hi: number | null;
}

/** A estimativa para um conjunto de entradas, já corrigida. */
export function estimate(
  model: SoftSensorModel,
  inputs: readonly SoftSensorInput[],
  calibration: SoftSensorCalibration,
): SoftSensorEstimate | null {
  const modelled = modelValue(model, inputs);
  if (modelled === null) return null;

  const value = modelled + calibration.bias;
  const band = calibration.sd === null ? null : SOFT_SENSOR_SIGMAS * calibration.sd;

  return {
    value,
    modelled,
    bias: calibration.bias,
    band,
    lo: band === null ? null : value - band,
    hi: band === null ? null : value + band,
  };
}

/**
 * Os resíduos de uma lista de laudos, dadas as entradas de cada um.
 *
 * As entradas vêm de fora porque elas são uma consulta ao arquivo — a média das
 * variáveis de processo na janela da bobina de onde a amostra saiu. Quem tem o
 * arquivo é a API; o que mora aqui é a conta.
 */
export function residualsOf(
  model: SoftSensorModel,
  results: readonly LabResult[],
  inputsOf: (result: LabResult) => readonly SoftSensorInput[] | null,
): SoftSensorResidual[] {
  const residuals: SoftSensorResidual[] = [];

  for (const result of results) {
    const inputs = inputsOf(result);
    if (!inputs) continue;

    const modelled = modelValue(model, inputs);
    if (modelled === null) continue;

    residuals.push({ result, modelled, residual: result.value - modelled });
  }

  return residuals;
}
