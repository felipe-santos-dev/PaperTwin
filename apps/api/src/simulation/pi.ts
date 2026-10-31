import type { FopdtModel } from './fopdt';

/**
 * As malhas de controle, com o ajuste tirado da própria relação medida.
 *
 * ## Por que o ajuste não é inventado
 *
 * Um simulador com ganho e tempo integral escolhidos a olho responde bem ou
 * mal por acaso, e quem olha não aprende nada. Aqui o ajuste sai de uma regra
 * publicada — SIMC, de Skogestad — aplicada aos coeficientes que a pesquisa B
 * mediu. Cada malha é ajustada pela relação que a governa:
 *
 * > `Kc = τ / (K · (λ + θ))` e `Ti = min(τ, 4 · (λ + θ))`
 *
 * com `λ = θ`, que é a escolha padrão do método e dá o compromisso usual entre
 * rapidez e robustez. Com isso, `Kc = τ / (2 · K · θ)` e `Ti = min(τ, 8 · θ)`.
 *
 * O resultado é que as malhas lentas ficam lentas porque **o processo é lento**:
 * a gramatura tem 75 s de tempo morto e responde em minutos, a espessura tem 6 s
 * e responde em segundos. Nenhum dos dois números foi escolhido para a tela
 * ficar bonita.
 *
 * ## O sinal se resolve sozinho
 *
 * Metade das relações tem ganho negativo — mais vapor, menos umidade. Como `K`
 * entra na fórmula com o seu sinal, `Kc` sai negativo nessas, e o controlador
 * baixa a saída para subir a medida sem nenhum `if`. Um campo `direta/inversa`
 * à parte seria um segundo lugar para errar.
 */

/** O ajuste de uma malha PI. */
export interface PiTuning {
  /** Ganho do controlador, em unidades de MV por unidade de PV. */
  readonly kc: number;
  /** Tempo integral, em segundos. */
  readonly tiS: number;
}

/**
 * O ajuste SIMC de uma malha, a partir do modelo do processo.
 *
 * `lambdaS` é a constante de tempo desejada em malha fechada. O padrão é o
 * tempo morto, que é a recomendação do método; valores maiores dão malha mais
 * lenta e mais robusta.
 */
export function simcTuning(model: FopdtModel, lambdaS?: number): PiTuning {
  if (model.kp === 0) {
    throw new Error('Uma malha com ganho de processo zero não tem ajuste: a MV não move a PV.');
  }
  if (!(model.tauS > 0)) {
    throw new Error(`τ precisa ser maior que zero: ${String(model.tauS)}`);
  }

  // com tempo morto zero, λ = θ daria divisão por zero; metade de τ é o
  // fallback conservador do próprio método
  const lambda = lambdaS ?? (model.deadTimeS > 0 ? model.deadTimeS : model.tauS / 2);
  const sum = lambda + model.deadTimeS;

  return {
    kc: model.tauS / (model.kp * sum),
    tiS: Math.min(model.tauS, 4 * sum),
  };
}

export interface PiOptions {
  readonly tuning: PiTuning;
  /** Saída quando o erro é zero — o ponto de operação da MV. */
  readonly bias: number;
  /** Faixa da MV, do catálogo. */
  readonly min: number;
  readonly max: number;
  /**
   * Termo integral inicial, para retomar uma malha gravada.
   *
   * É o estado de um PI: o proporcional se recalcula do erro de agora, o
   * integral é a memória. Retomar com integral zero depois de uma parada faria
   * a malha largar do bias e levar minutos para voltar — justamente o atraso
   * que a trava de saturação existe para evitar.
   */
  readonly integral?: number;
}

export interface PiController {
  /**
   * Avança um passo e devolve a nova saída, já dentro da faixa.
   *
   * O controlador é de passo fixo e **sem estado escondido além do integral**:
   * dois controladores com o mesmo integral e o mesmo erro dão a mesma saída.
   */
  step(setpoint: number, measured: number, dtS: number): number;
  /** A saída atual. */
  readonly output: number;
  /** O termo integral acumulado, em unidades de PV · s. */
  readonly integral: number;
}

/**
 * Um controlador PI com trava do integral na saturação.
 *
 * A trava é o detalhe que separa um PI que funciona de um que parece funcionar.
 * Sem ela, uma malha que bate no limite da válvula continua acumulando erro no
 * integral; quando o processo volta, o integral está enorme e a malha demora
 * minutos para sair da saturação, com a medida passando longe do setpoint no
 * caminho. É o "windup", e numa máquina de papel ele aparece exatamente depois
 * de uma quebra de folha — que é um dos cenários que este simulador roda.
 *
 * A trava usada é a condicional: o integral só acumula quando a saída sem
 * limite está dentro da faixa, **ou** quando o novo erro empurra de volta para
 * dentro dela. A segunda metade importa: sem ela, uma malha saturada ficaria
 * com o integral congelado e perderia a ação integral justamente na volta.
 */
export function piController(options: PiOptions): PiController {
  const { kc, tiS } = options.tuning;
  if (!(tiS > 0)) throw new Error(`Ti precisa ser maior que zero: ${String(tiS)}`);
  if (options.min >= options.max) {
    throw new Error(
      `Faixa da MV inválida: ${String(options.min)} a ${String(options.max)}. ` +
        'O mínimo precisa ser menor que o máximo.',
    );
  }

  let integral = options.integral ?? 0;
  let output = Math.min(Math.max(options.bias, options.min), options.max);

  const clamp = (value: number): number => Math.min(Math.max(value, options.min), options.max);

  return {
    step(setpoint: number, measured: number, dtS: number): number {
      if (!(dtS > 0)) throw new Error(`dt precisa ser maior que zero: ${String(dtS)}`);

      const error = setpoint - measured;
      const candidate = integral + error * dtS;
      const unclamped = options.bias + kc * (error + candidate / tiS);

      const saturatedHigh = unclamped > options.max;
      const saturatedLow = unclamped < options.min;
      // kc · error é a direção em que este erro empurra a saída
      const pushesBack = (saturatedHigh && kc * error < 0) || (saturatedLow && kc * error > 0);

      if ((!saturatedHigh && !saturatedLow) || pushesBack) {
        integral = candidate;
      }

      output = clamp(options.bias + kc * (error + integral / tiS));
      return output;
    },

    get output(): number {
      return output;
    },

    get integral(): number {
      return integral;
    },
  };
}

/**
 * A temperatura de saturação do vapor, em °C, a partir da pressão **relativa**
 * em kPa.
 *
 * Aproximação: `T = 100 · (p_abs / 101,325)^0,25`. Vale a pena dizer o erro, e
 * não só a fórmula — a 15 kPa rel ela dá 103,5 °C contra 103,3 reais, e a 230
 * kPa rel dá 134,5 contra ~136,5, ou seja, até ~1,5 % na faixa que a secagem
 * usa. Para mover a temperatura de superfície de um cilindro num gêmeo digital
 * isso é mais do que suficiente, e uma tabela de vapor seria um arquivo de
 * dados inteiro para ganhar dois graus.
 *
 * As tags de vapor do catálogo estão em kPa **relativos**, inclusive com valores
 * negativos no G1 (que opera em vácuo parcial, de −30 a 60 kPa rel) — daí somar
 * a pressão atmosférica antes de qualquer conta.
 */
export const ATMOSPHERIC_KPA = 101.325;

export function saturationTemperatureC(gaugeKpa: number): number {
  const absolute = Math.max(1, gaugeKpa + ATMOSPHERIC_KPA);
  return 100 * (absolute / ATMOSPHERIC_KPA) ** 0.25;
}

/**
 * Quanto a superfície do cilindro fica abaixo da saturação, em °C.
 *
 * **Suposição.** A queda real depende da espessura do ferro, do filme de
 * condensado e da sujeira. 8 °C é o que põe a superfície do grupo principal
 * (230 kPa rel → 134,5 °C de saturação) em ~126 °C, que é o alvo de 125 que o
 * catálogo dá para `TI-52nn`. Ou seja: o número foi escolhido para a fórmula
 * concordar com o catálogo, e não o contrário.
 */
export const SHELL_TEMPERATURE_DROP_C = 8;

/** Temperatura de superfície de um cilindro, pela pressão do seu grupo. */
export function cylinderSurfaceTempC(gaugeKpa: number): number {
  return saturationTemperatureC(gaugeKpa) - SHELL_TEMPERATURE_DROP_C;
}
