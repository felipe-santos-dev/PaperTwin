/**
 * O núcleo de primeira ordem com tempo morto do simulador.
 *
 * As relações da pesquisa B (`@mp1/shared` → `PROCESS_RELATIONS`) são modelos
 * de primeira ordem com tempo morto: um ganho, um atraso puro e uma constante
 * de tempo. Este módulo as integra.
 *
 * Três decisões sustentam isso:
 *
 * 1. **Discretização exata (ZOH), não Euler.** Com entrada constante entre
 *    amostras, a solução da equação de primeira ordem é fechada:
 *    `a = exp(−dt/τ)` e `y ← a·y + (1−a)·kp·u`. Isso é exato nos instantes de
 *    amostragem, não uma aproximação, e é estável para qualquer `dt` — `a` fica
 *    sempre em (0, 1). O Euler `y ← y + (dt/τ)(kp·u − y)` divergiria com
 *    `dt > 2τ`, e o catálogo tem τ de 4,5 s: um passo de 10 s já explodiria.
 * 2. **Tudo em desvio do ponto de operação.** A saída diz quanto a variável se
 *    afastou de onde estava, não o valor absoluto. É o que permite somar.
 * 3. **Superposição.** Várias entradas na mesma saída se somam — a gramatura
 *    recebe quatro relações. Só vale porque os modelos são lineares, o que é a
 *    hipótese da própria pesquisa ao dar um `kp` por unidade.
 */

/** Os três coeficientes de uma relação. */
export interface FopdtModel {
  /** Ganho estacionário, por unidade de entrada. */
  readonly kp: number;
  /** Tempo morto, em segundos. */
  readonly deadTimeS: number;
  /** Constante de tempo, em segundos. Maior que zero. */
  readonly tauS: number;
}

/**
 * O estado de um integrador, serializável.
 *
 * A linha de atraso é o estado que não dá para recalcular: ela guarda o que
 * entrou nos últimos `θ` segundos, e sem ela a retomada perderia tudo que está
 * no caminho entre a válvula e a medida. Numa relação com 270 s de tempo morto,
 * isso é quatro minutos e meio de processo que já aconteceu e ainda não
 * apareceu.
 */
export interface FopdtState {
  readonly line: readonly number[];
  readonly step: number;
  readonly output: number;
}

/** Um integrador em andamento, com a sua linha de atraso. */
export interface FopdtRunner {
  /**
   * Avança um passo com o desvio de entrada e devolve o desvio de saída
   * depois de `dt` segundos.
   */
  advance(inputDeviation: number): number;
  /** O estado atual, para gravar e retomar. */
  snapshot(): FopdtState;
}

function assertUsable(model: FopdtModel, dtS: number): void {
  if (!(dtS > 0)) throw new Error(`dt precisa ser maior que zero: ${String(dtS)}`);
  if (!(model.tauS > 0)) throw new Error(`τ precisa ser maior que zero: ${String(model.tauS)}`);
  if (model.deadTimeS < 0) {
    throw new Error(`tempo morto não pode ser negativo: ${String(model.deadTimeS)}`);
  }
}

/** Quanto do desvio anterior sobrevive a um passo de `dt`. */
export function decayPerStep(tauS: number, dtS: number): number {
  return Math.exp(-dtS / tauS);
}

/**
 * O tempo morto em passos.
 *
 * Arredondado: com `dt` grosseiro o atraso não cai num múltiplo exato, e
 * arredondar erra no máximo meio passo — truncar sempre adiantaria a resposta.
 */
export function delaySteps(deadTimeS: number, dtS: number): number {
  return Math.round(deadTimeS / dtS);
}

/**
 * Um integrador para uma relação.
 *
 * A linha de atraso é um anel de `d + 1` posições: o passo `n` escreve em
 * `n % L` e lê em `(n + 1) % L`, que é exatamente a entrada de `d` passos
 * atrás. Antes de a janela encher, o que se lê é zero — nenhum desvio.
 */
export function fopdtRunner(model: FopdtModel, dtS: number, state?: FopdtState): FopdtRunner {
  assertUsable(model, dtS);

  const decay = decayPerStep(model.tauS, dtS);
  const length = delaySteps(model.deadTimeS, dtS) + 1;

  const line = new Array<number>(length).fill(0);
  if (state) {
    if (state.line.length !== length) {
      throw new Error(
        `A linha de atraso gravada tem ${String(state.line.length)} posições e esta relação ` +
          `precisa de ${String(length)}. O tempo morto ou o passo mudaram desde a gravação, ` +
          'e continuar daí misturaria dois modelos.',
      );
    }
    for (const [index, value] of state.line.entries()) line[index] = value;
  }

  let step = state?.step ?? 0;
  let output = state?.output ?? 0;

  return {
    advance(inputDeviation: number): number {
      line[step % length] = inputDeviation;
      const delayed = line[(step + 1) % length] ?? 0;
      step += 1;

      output = decay * output + (1 - decay) * model.kp * delayed;
      return output;
    },

    snapshot(): FopdtState {
      return { line: [...line], step, output };
    },
  };
}

/**
 * A resposta a uma série de entrada.
 *
 * Devolve `inputs.length + 1` pontos: o primeiro é o desvio zero de antes do
 * primeiro passo, para o índice `k` ser o instante `k · dt`.
 */
export function simulateFopdt(model: FopdtModel, inputs: readonly number[], dtS: number): number[] {
  const runner = fopdtRunner(model, dtS);
  const series = [0];

  for (const input of inputs) series.push(runner.advance(input));

  return series;
}

/**
 * A resposta a um degrau aplicado em `t = 0` e mantido.
 *
 * O índice `k` do resultado é o instante `k · dt`, então a resposta vale zero
 * até `k = θ/dt` e chega a `kp · degrau · (1 − 1/e)` em `k = (θ + τ)/dt`.
 */
export function stepResponse(
  model: FopdtModel,
  stepValue: number,
  dtS: number,
  samples: number,
): number[] {
  return simulateFopdt(model, new Array<number>(samples).fill(stepValue), dtS);
}

/**
 * Soma as respostas que chegam na mesma saída.
 *
 * As séries precisam ter o mesmo comprimento: são o mesmo eixo de tempo visto
 * por relações diferentes.
 */
export function superpose(responses: readonly (readonly number[])[]): number[] {
  const first = responses[0];
  if (!first) return [];

  for (const response of responses) {
    if (response.length !== first.length) {
      throw new Error(
        'Superposição exige séries do mesmo comprimento: ' +
          `${String(first.length)} ≠ ${String(response.length)}`,
      );
    }
  }

  return first.map((_, index) =>
    responses.reduce((total, response) => total + (response[index] ?? 0), 0),
  );
}
