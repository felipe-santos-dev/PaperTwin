import {
  controlledVariables,
  dryerCylinders,
  MP1,
  PROCESS_CATALOG,
  PROCESS_RELATIONS,
  processVariable,
  relation,
  steamGroup,
  WEB_WIDTH_M,
  type FopdtRelation,
} from '@mp1/shared';

import { DEFAULT_SEED, TICK_MS } from './clock';
import { fopdtRunner, type FopdtRunner, type FopdtState } from './fopdt';
import { correlatedNoise, streamOf } from './noise';
import { cylinderSurfaceTempC, piController, simcTuning, type PiController } from './pi';
import { instrumentNoiseSd, requireOperatingPoint } from './operating-point';

/**
 * A rede de processo da MP1.
 *
 * Junta o que as fases anteriores prepararam: o catálogo diz quais variáveis
 * existem e em que faixa, as relações dizem como uma mexe na outra, o núcleo de
 * primeira ordem integra, o relógio dá a grade de passos e o ruído por posição
 * torna tudo reproduzível.
 *
 * ## Verdade e medida são coisas diferentes
 *
 * O motor guarda **dois** valores por tag:
 *
 * - a **verdade**, que é o valor físico — é ela que as relações leem, porque o
 *   processo responde ao que a válvula fez, não ao que o transmissor relatou;
 * - a **medida**, que é a verdade mais o ruído do instrumento — é ela que as
 *   malhas leem, que o historiador grava e que a tela mostra.
 *
 * A distinção não é preciosismo. Uma malha PI que lesse o valor sem ruído ficaria
 * irrealmente quieta, e é o ruído na medida que faz a válvula se mexer de leve
 * todo o tempo, como numa máquina de verdade.
 *
 * ## O que é clampeado e o que não é
 *
 * A **MV é clampeada** na faixa do catálogo: a válvula tem fim de curso, e é
 * por isso que o PI precisa de trava de integral.
 *
 * A **medida não é clampeada**. Prender a umidade final à faixa 3,8–6,0 do
 * catálogo apagaria todo alarme de `H`/`HH` que mora fora dela — e a razão de a
 * faixa existir é justamente dizer onde é normal, não onde é possível.
 */

/**
 * Constante de tempo de uma malha seguindo o próprio setpoint, em segundos.
 *
 * **Suposição.** É a dinâmica da válvula mais a da malha escrava: uma malha de
 * vazão ou de pressão bem ajustada chega ao novo setpoint em alguns segundos.
 * 6 s é conservador para 1 s de passo — rápido o bastante para não atrasar a
 * cascata, lento o bastante para a MV não pular em degrau, o que daria à rede
 * de primeira ordem um degrau que nenhuma válvula faz.
 */
export const MV_LAG_S = 6;

/**
 * Constante de correlação do ruído de processo, em passos.
 *
 * **Suposição.** 10 s de memória: o ruído de um instante parece com o do
 * anterior, como a turbulência de uma caixa de entrada, e não como erro de
 * quantização.
 */
export const NOISE_TAU_TICKS = 10;

/**
 * As cascatas: a medida de qualidade que manda na malha de campo.
 *
 * Cada linha sai da coluna `mv` do catálogo — "MD: FV-105", "MD: PIC-711/712" —
 * cruzada com a relação que mede aquele par. O ajuste do PI **não é escolhido**:
 * sai por SIMC dos coeficientes dessa relação (veja `pi.ts`).
 *
 * A coluna `mv` é prosa em português e não é lida por expressão regular. Seis
 * linhas não justificam um analisador, e um analisador erraria quieto quando a
 * prosa mudasse — enquanto uma tabela errada aqui falha na carga, porque as
 * tags são resolvidas contra o catálogo e as relações.
 */
const CASCADES: readonly {
  readonly pv: string;
  readonly mv: string;
  readonly relationId: string;
}[] = [
  { pv: 'AIC-901', mv: 'PIC-514', relationId: '4' },
  { pv: 'AIC-902', mv: 'FIC-105', relationId: '1' },
  { pv: 'AIC-903', mv: 'PIC-711', relationId: '5' },
  { pv: 'AIC-904', mv: 'FIC-106', relationId: '7' },
  { pv: 'AIC-905', mv: 'WIC-801', relationId: '14' },
  { pv: 'AIC-306', mv: 'FIC-109', relationId: '8' },
];

/**
 * As relações que entram na rede MD.
 *
 * As zonadas ficam de fora: a relação 11 é zona a zona, e o seu efeito no
 * sentido da máquina é a média das 140 zonas — que é zero quando o perfil está
 * equilibrado, que é o caso em operação normal. O perfil CD em si é resolvido
 * por `cd-profile.ts`, com o kernel gaussiano, e não por esta rede.
 */
function mdRelations(): FopdtRelation[] {
  return PROCESS_RELATIONS.filter((item) => !item.zoned);
}

/** Uma tag movida por relações, com os integradores de cada uma. */
interface DrivenOutput {
  readonly tag: string;
  readonly base: number;
  readonly runners: readonly {
    readonly relation: FopdtRelation;
    /** Ponto de operação da entrada, para o desvio não ser recalculado a cada passo. */
    readonly inputBase: number;
    readonly runner: FopdtRunner;
  }[];
}

/** Uma malha que segue o próprio setpoint. */
interface TrackingLoop {
  readonly tag: string;
  readonly base: number;
  readonly min: number;
  readonly max: number;
}

/** Uma cascata montada: o PI e as tags das duas pontas. */
interface Cascade {
  readonly pv: string;
  readonly mv: string;
  readonly controller: PiController;
}

/**
 * O estado da rede, serializável.
 *
 * Isto existe porque a rede **tem** estado, e fingir que não tem foi um erro que
 * um teste pegou: cada retomada montava um motor novo no ponto de operação, e
 * acordar no meio de uma troca de gramatura perderia a transição inteira. O
 * valor de uma tag não é função só de (semente, passo) — é função disso e do que
 * já estava no caminho.
 *
 * O que precisa ser gravado é o que não dá para recalcular:
 *
 * - **as linhas de atraso** das relações, que guardam o que entrou nos últimos
 *   θ segundos (270 s na mais lenta);
 * - **os termos integrais** das cascatas, que são a memória das malhas;
 * - **a verdade** de cada tag, de onde a próxima integração parte;
 * - **os setpoints**, que o operador pode ter mudado.
 *
 * A **medida** não é gravada: ela é a verdade mais o ruído do passo, e o ruído é
 * função da posição. Recalculá-la dá exatamente o mesmo valor.
 *
 * São cerca de 1.300 números, ~25 KB em JSON. `version` existe para uma
 * mudança de formato ser detectada em vez de produzir um motor meio retomado.
 */
export interface EngineState {
  readonly version: 1;
  readonly tick: number;
  readonly seed: number;
  readonly truth: Readonly<Record<string, number>>;
  readonly setpoints: Readonly<Record<string, number>>;
  /** Termo integral de cada cascata, pela tag da PV. */
  readonly integrals: Readonly<Record<string, number>>;
  /** Estado de cada relação, pelo id dela. */
  readonly runners: Readonly<Record<string, FopdtState>>;
}

export const ENGINE_STATE_VERSION = 1 as const;

export interface ProcessEngineOptions {
  readonly seed?: number;
  /** Setpoints iniciais. O que faltar vem do ponto de operação. */
  readonly setpoints?: Readonly<Record<string, number>>;
  /**
   * Estado gravado, para retomar exatamente de onde parou.
   *
   * Quando vem, `startTick` tem de ser o passo gravado e a semente a mesma: um
   * estado de outra semente ou de outro instante não é continuação, é mistura.
   */
  readonly state?: EngineState;
}

export interface ProcessEngine {
  readonly tick: number;
  readonly seed: number;

  /** Avança um passo. */
  advance(): void;
  /** Avança até o passo pedido. Não volta atrás. */
  runTo(tick: number): void;

  /** O valor medido de uma tag — o que o historiador gravaria. */
  measured(tag: string): number | null;
  /** O valor físico de uma tag, sem ruído de instrumento. */
  truth(tag: string): number | null;
  /** Todas as medidas do passo atual. */
  snapshot(): Map<string, number>;
  /** O estado da rede, para gravar e retomar exatamente daqui. */
  snapshotState(): EngineState;

  /** O setpoint de uma malha, ou `null` se a tag não tem setpoint. */
  setpoint(tag: string): number | null;
  /**
   * Move o setpoint de uma malha.
   *
   * Nas cascatas, a tag com setpoint é a **medida de qualidade** (`AIC-902`), e
   * não a malha de campo: é assim que se opera uma cascata, e deixar o operador
   * escrever na escrava enquanto o mestre está em automático daria uma briga
   * entre os dois que nenhuma tela explicaria.
   */
  setSetpoint(tag: string, value: number): void;
  /**
   * Devolve a malha ao ponto de operação.
   *
   * É o que fecha uma perturbação: o cenário mexe num setpoint, e quando o
   * evento passa a malha volta para onde estava. Guardar o valor anterior em
   * quem chama daria um lugar a mais para esquecer de restaurar.
   */
  resetSetpoint(tag: string): void;
  /** As tags que aceitam setpoint. */
  settableTags(): string[];
}

const DT_S = TICK_MS / 1000;

/**
 * Monta a rede e devolve o motor, posicionado em `startTick`.
 *
 * O estado inicial é o ponto de operação de tudo: a máquina em regime, sem
 * desvio nenhum. Quem precisa de uma rede já "quente" roda alguns minutos de
 * passos antes de olhar — é o que a retomada faz ao reancorar.
 */
export function processEngine(
  startTick: number,
  options: ProcessEngineOptions = {},
): ProcessEngine {
  const seed = options.seed ?? DEFAULT_SEED;
  const restored = options.state;

  if (restored) {
    if (restored.version !== ENGINE_STATE_VERSION) {
      throw new Error(
        `Estado da rede na versão ${String(restored.version)}; esta build lê a ` +
          `${String(ENGINE_STATE_VERSION)}. Reancore em vez de retomar.`,
      );
    }
    if (restored.seed !== seed) {
      throw new Error(
        `O estado gravado é da semente ${String(restored.seed)} e esta execução usa ` +
          `${String(seed)}. Semente diferente é outra máquina.`,
      );
    }
    if (restored.tick !== startTick) {
      throw new Error(
        `O estado gravado é do passo ${String(restored.tick)} e a retomada pede ` +
          `${String(startTick)}. Retomar de outro passo salta ou repete processo.`,
      );
    }
  }

  let tick = startTick;

  const truth = new Map<string, number>();
  const measured = new Map<string, number>();
  const streams = new Map<string, number>();

  const stream = (tag: string): number => {
    const cached = streams.get(tag);
    if (cached !== undefined) return cached;
    const value = streamOf(tag);
    streams.set(tag, value);
    return value;
  };

  // --- quem é quem ---

  const relations = mdRelations();
  const cascadedPvs = new Set(CASCADES.map((item) => item.pv));
  const cascadedMvs = new Set(CASCADES.map((item) => item.mv));

  /** Saídas movidas por relação, com um integrador por relação que chega nelas. */
  const outputs: DrivenOutput[] = [...new Set(relations.map((item) => item.output))].map((tag) => ({
    tag,
    base: requireOperatingPoint(tag),
    runners: relations
      .filter((item) => item.output === tag)
      .map((item) => ({
        relation: item,
        inputBase: requireOperatingPoint(item.input),
        runner: fopdtRunner(
          { kp: item.kp, deadTimeS: item.deadTimeS, tauS: item.tauS },
          DT_S,
          restored?.runners[item.id],
        ),
      })),
  }));

  const outputTags = new Set(outputs.map((item) => item.tag));

  /**
   * Malhas que seguem o próprio setpoint.
   *
   * São todas as controladas menos as PV de cascata, que não têm setpoint
   * próprio — quem move a escrava é o mestre.
   */
  const loops: TrackingLoop[] = controlledVariables()
    .filter((variable) => !cascadedPvs.has(variable.tag))
    .map((variable) => ({
      tag: variable.tag,
      base: requireOperatingPoint(variable.tag),
      min: variable.min,
      max: variable.max,
    }));

  const loopTags = new Set(loops.map((item) => item.tag));

  /** Cilindros secadores, para a temperatura de superfície. */
  const cylinders = dryerCylinders(MP1).map(({ number, asset }) => {
    const group = asset.steamGroup === null ? null : steamGroup(asset.steamGroup);
    if (!group) {
      throw new Error(
        `O cilindro ${String(number)} (${asset.tag}) não aponta para um grupo de vapor conhecido.`,
      );
    }
    return {
      tag: `TI-52${String(number).padStart(2, '0')}`,
      pressureTag: group.pressure.tag,
    };
  });

  const surfaceTags = new Set(cylinders.map((item) => item.tag));

  /**
   * O que a rede não move.
   *
   * São as variáveis sem relação que chegue nelas e sem setpoint: viscosidade
   * do amido, dispersão 2σ do perfil CD, pressão do ar de instrumentação,
   * temperatura da capa do rolo macio. Elas oscilam em torno do ponto de
   * operação, e o simulador não finge saber mais do que isso.
   *
   * As tags por cilindro de vibração, envelope e temperatura de mancal ficam de
   * fora daqui: quem as produz é o simulador de mancal, que tem a sua própria
   * dinâmica de degradação.
   */
  const freeTags = PROCESS_CATALOG.filter(
    (variable) =>
      !outputTags.has(variable.tag) &&
      !loopTags.has(variable.tag) &&
      !cascadedPvs.has(variable.tag) &&
      !surfaceTags.has(variable.tag) &&
      variable.area !== 'mancais' &&
      variable.tag !== 'XI-0001' &&
      variable.tag !== 'XI-0002',
  ).map((variable) => variable.tag);

  // --- setpoints ---

  /**
   * Tags que aceitam setpoint.
   *
   * As malhas próprias e as PV de cascata — **não** as escravas. Numa cascata o
   * setpoint da escrava pertence ao mestre: deixar o operador escrever nele com
   * o mestre em automático daria uma briga entre os dois que nenhuma tela
   * explicaria, e a escrita seria sobrescrita no passo seguinte sem aviso.
   */
  const settable = [...[...loopTags].filter((tag) => !cascadedMvs.has(tag)), ...cascadedPvs];
  const setpoints = new Map<string, number>(
    settable.map((tag) => [tag, requireOperatingPoint(tag)]),
  );

  for (const [tag, value] of Object.entries(restored?.setpoints ?? {})) {
    if (setpoints.has(tag)) setpoints.set(tag, value);
  }

  for (const [tag, value] of Object.entries(options.setpoints ?? {})) {
    if (!setpoints.has(tag)) {
      throw new Error(
        `${tag} não aceita setpoint: ou não é malha de controle, ou é a escrava de uma cascata ` +
          '— nesse caso o setpoint pertence ao mestre.',
      );
    }
    setpoints.set(tag, value);
  }

  // --- cascatas ---

  const cascades: Cascade[] = CASCADES.map(({ pv, mv, relationId }) => {
    const model = relation(relationId);
    if (!model) {
      throw new Error(`A cascata ${pv} → ${mv} cita a relação ${relationId}, que não existe mais.`);
    }
    if (model.input !== mv || model.output !== pv) {
      throw new Error(
        `A cascata ${pv} → ${mv} cita a relação ${relationId}, que mede ` +
          `${model.input} → ${model.output}. O ajuste do PI sai dela, então o par tem de bater.`,
      );
    }

    const mvVariable = processVariable(mv);
    if (!mvVariable)
      throw new Error(`A cascata ${pv} → ${mv} aponta para uma MV fora do catálogo.`);

    return {
      pv,
      mv,
      controller: piController({
        tuning: simcTuning({ kp: model.kp, deadTimeS: model.deadTimeS, tauS: model.tauS }),
        bias: requireOperatingPoint(mv),
        min: mvVariable.min,
        max: mvVariable.max,
        ...(restored ? { integral: restored.integrals[pv] ?? 0 } : {}),
      }),
    };
  });

  /** O setpoint efetivo de cada malha escrava, escrito pelo PI da cascata. */
  const slaveSetpoints = new Map<string, number>(
    cascades.map(({ mv }) => [mv, requireOperatingPoint(mv)]),
  );

  // --- estado inicial: tudo no ponto de operação ---

  function publish(tag: string, value: number): void {
    truth.set(tag, value);
    const sd = instrumentNoiseSd(tag);
    measured.set(
      tag,
      sd === 0 ? value : value + sd * correlatedNoise(seed, tick, stream(tag), NOISE_TAU_TICKS),
    );
  }

  for (const variable of PROCESS_CATALOG) {
    if (variable.area === 'mancais') continue;
    publish(variable.tag, requireOperatingPoint(variable.tag));
  }
  for (const output of outputs) publish(output.tag, output.base);

  /** Produção instantânea, da nota do catálogo em `XI-0001`. */
  function production(): number {
    const speed = truth.get('SIC-1104') ?? 0;
    const basisWeight = truth.get('AIC-902') ?? 0;
    return (WEB_WIDTH_M * speed * basisWeight * 60) / 1e6;
  }

  /**
   * A superfície dos cilindros arranca da fórmula, não do alvo do catálogo.
   *
   * `TI-52nn` é um padrão por cilindro, então o catálogo dá **um** alvo (125 °C)
   * para os 36 — e não poderia ser diferente, porque é uma linha só no CSV. Mas
   * a superfície segue a saturação do vapor do grupo, e os seis grupos operam em
   * pressões diferentes: o G4, em 230 kPa rel, cai perto dos 125; o G1, em 15,
   * fica em ~95; o G5, em 120, em ~114. Todos dentro da faixa 80–150 do
   * catálogo.
   *
   * Iniciar pelo alvo e só depois aplicar a fórmula daria um salto de dez graus
   * no primeiro passo — degrau que nenhum cilindro dá, e que a porta oscilante
   * gravaria como se fosse processo.
   */
  for (const cylinder of cylinders) {
    publish(cylinder.tag, cylinderSurfaceTempC(truth.get(cylinder.pressureTag) ?? 0));
  }

  publish('XI-0002', WEB_WIDTH_M);
  publish('XI-0001', production());

  /**
   * A verdade gravada substitui o ponto de operação, e a medida é recalculada.
   *
   * Vem depois de tudo porque sobrescreve: o arranque põe a rede em regime, e o
   * estado gravado diz onde ela realmente estava.
   */
  if (restored) {
    for (const [tag, value] of Object.entries(restored.truth)) publish(tag, value);
  }

  const clamp = (value: number, min: number, max: number): number =>
    Math.min(Math.max(value, min), max);

  /** Quanto do desvio anterior sobrevive a um passo, na dinâmica da MV. */
  const mvDecay = Math.exp(-DT_S / MV_LAG_S);

  function advance(): void {
    tick += 1;

    // 1. as cascatas escrevem o setpoint das escravas, lendo a MEDIDA da PV
    for (const cascade of cascades) {
      const pv = measured.get(cascade.pv) ?? 0;
      const sp = setpoints.get(cascade.pv) ?? 0;
      slaveSetpoints.set(cascade.mv, cascade.controller.step(sp, pv, DT_S));
    }

    // 2. as malhas caminham para o seu setpoint
    for (const loop of loops) {
      const target = slaveSetpoints.get(loop.tag) ?? setpoints.get(loop.tag) ?? loop.base;
      const current = truth.get(loop.tag) ?? loop.base;
      const next = clamp(target + (current - target) * mvDecay, loop.min, loop.max);
      publish(loop.tag, next);
    }

    // 3. as relações integram o desvio da VERDADE da entrada
    for (const output of outputs) {
      let deviation = 0;
      for (const { relation: item, inputBase, runner } of output.runners) {
        deviation += runner.advance((truth.get(item.input) ?? inputBase) - inputBase);
      }
      // a medida NÃO é presa à faixa: é fora dela que o alarme vive
      publish(output.tag, output.base + deviation);
    }

    // 4. a superfície do cilindro segue a saturação do vapor do seu grupo
    for (const cylinder of cylinders) {
      const pressure = truth.get(cylinder.pressureTag) ?? 0;
      publish(cylinder.tag, cylinderSurfaceTempC(pressure));
    }

    // 5. derivadas
    publish('XI-0001', production());
    publish('XI-0002', WEB_WIDTH_M);

    // 6. o que a rede não move oscila em torno do ponto de operação
    for (const tag of freeTags) {
      publish(tag, requireOperatingPoint(tag));
    }
  }

  return {
    get tick(): number {
      return tick;
    },
    seed,

    advance,

    runTo(target: number): void {
      for (let k = tick; k < target; k += 1) advance();
    },

    measured(tag: string): number | null {
      return measured.get(tag) ?? null;
    },

    truth(tag: string): number | null {
      return truth.get(tag) ?? null;
    },

    snapshot(): Map<string, number> {
      return new Map(measured);
    },

    snapshotState(): EngineState {
      const runners: Record<string, FopdtState> = {};
      for (const output of outputs) {
        for (const { relation: item, runner } of output.runners) {
          runners[item.id] = runner.snapshot();
        }
      }

      const integrals: Record<string, number> = {};
      for (const cascade of cascades) integrals[cascade.pv] = cascade.controller.integral;

      return {
        version: ENGINE_STATE_VERSION,
        tick,
        seed,
        truth: Object.fromEntries(truth),
        setpoints: Object.fromEntries(setpoints),
        integrals,
        runners,
      };
    },

    setpoint(tag: string): number | null {
      return setpoints.get(tag) ?? null;
    },

    setSetpoint(tag: string, value: number): void {
      if (!setpoints.has(tag)) {
        throw new Error(
          `${tag} não aceita setpoint: ou não é malha de controle, ou é a escrava de uma ` +
            'cascata — nesse caso o setpoint pertence ao mestre.',
        );
      }
      setpoints.set(tag, value);
    },

    resetSetpoint(tag: string): void {
      if (!setpoints.has(tag)) {
        throw new Error(`${tag} não aceita setpoint, então não há o que devolver.`);
      }
      setpoints.set(tag, requireOperatingPoint(tag));
    },

    settableTags(): string[] {
      return [...setpoints.keys()].sort();
    },
  };
}

/** Os pares de cascata montados, para quem precisa saber quem manda em quem. */
export function cascadePairs(): { pv: string; mv: string }[] {
  return CASCADES.map(({ pv, mv }) => ({ pv, mv }));
}

/** Se a tag é a entrada manipulada de alguma cascata. */
export function isCascadeSlave(tag: string): boolean {
  return CASCADES.some((item) => item.mv === tag);
}

/** As relações que a rede MD usa — as não zonadas. */
export function networkRelations(): FopdtRelation[] {
  return mdRelations();
}

/** As tags que alguma relação move. */
export function drivenTags(): string[] {
  return [...new Set(mdRelations().map((item) => item.output))].sort();
}

/** Se a tag é entrada de alguma relação da rede. */
export function isNetworkInput(tag: string): boolean {
  return new Set(mdRelations().map((item) => item.input)).has(tag);
}

/** Exposto para o teste: quais tags a rede considera entrada. */
export function networkInputs(): string[] {
  return [...new Set(mdRelations().map((item) => item.input))].sort();
}
