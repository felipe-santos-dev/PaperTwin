/**
 * O relógio da simulação: uma grade de passos ancorada num instante absoluto.
 *
 * ## O problema
 *
 * O host gratuito dorme sem tráfego. Quando a API acorda, pode ter passado meia
 * hora ou um dia, e o processo precisa estar onde estaria se ninguém tivesse
 * desligado nada — porque é uma máquina de papel, e máquina de papel não para
 * porque o servidor dormiu.
 *
 * A rede de primeira ordem com tempo morto **tem estado**: integradores, linhas
 * de atraso, termos integrais das malhas. Não existe forma fechada para
 * "o valor em t"; a única maneira honesta de chegar ao instante t é executar os
 * passos até ele. Então a retomada **reexecuta** o intervalo que faltou.
 *
 * ## Por que a grade é absoluta
 *
 * Para reexecutar dar o mesmo resultado que ter rodado contínuo, a sequência de
 * passos tem de ser a mesma nos dois casos. Se o passo 0 fosse "quando o
 * processo subiu", duas execuções com arranques diferentes cairiam em instantes
 * diferentes, com ruído diferente, e nunca coincidiriam.
 *
 * Aqui o passo `k` é sempre o instante `SIM_EPOCH + k · TICK_MS`, qualquer que
 * seja o arranque. Rodar de 100 a 200 e depois de 200 a 300 dá exatamente o
 * mesmo que rodar de 100 a 300 — e é isso que o teste de propriedade cobra.
 *
 * Junto com o ruído por posição (`noise.ts`), isso é o que torna a simulação
 * reproduzível a partir de (semente, tempo).
 */

/**
 * O instante zero da simulação.
 *
 * Um valor fixo e escrito, não `Date.now()` do primeiro arranque: a grade
 * precisa ser a mesma em qualquer máquina e em qualquer deploy, senão o
 * instantâneo do modo de demonstração — gerado numa máquina, servido de outra —
 * cairia numa grade diferente da API ao vivo.
 */
export const SIM_EPOCH_MS = Date.UTC(2026, 0, 1, 0, 0, 0);

/**
 * O passo da simulação, em milissegundos.
 *
 * Um segundo. Vem de baixo e de cima: o catálogo tem τ de 4,5 s na calandra, e
 * um passo que não resolva isso perderia a dinâmica mais rápida do processo; e
 * recalcular um dia de 86.400 passos custa frações de segundo, o que caberia
 * mesmo num host mais apertado que este.
 */
export const TICK_MS = 1000;

/** Passos por segundo, minuto e hora — para quem lê a conta em prosa. */
export const TICKS_PER_MINUTE = 60_000 / TICK_MS;
export const TICKS_PER_HOUR = TICKS_PER_MINUTE * 60;

/**
 * Teto de passos numa retomada: quatro horas.
 *
 * É o limite da garantia de "recalcular = rodar contínuo", e precisa estar
 * escrito — junto com a razão, que é de orçamento e não de elegância.
 *
 * A retomada roda **dentro de uma requisição HTTP**, porque não há processo de
 * fundo: o host gratuito dorme sem tráfego, e quem acorda a API é quem abriu a
 * tela. Reexecutar quatro horas são 14.400 passos, o que custa cerca de um
 * segundo de CPU — já é o que alguém espera de uma página que estava dormindo.
 * Um dia seriam 86.400 passos e uns vinte segundos, o que passa de qualquer
 * tempo limite razoável e deixaria a primeira visita do dia pendurada.
 *
 * Acima do teto, a retomada **reancora**: começa quatro horas antes do instante
 * pedido, em regime, e diz que reancorou. É uma descontinuidade, e dizer isso é
 * melhor que fingir que a máquina rodou a noite inteira.
 *
 * **A consequência é um buraco no histórico**, e ela é inerente ao desenho: se
 * ninguém abrir a tela por um dia, não houve quem rodasse a simulação daquele
 * dia. O arquivo guarda os períodos em que alguém esteve olhando, mais a janela
 * da reancoragem. Quem quiser histórico contínuo precisa de alguém batendo na
 * API de tempos em tempos — é decisão de deploy, e está no checklist.
 */
export const MAX_CATCHUP_TICKS = 4 * TICKS_PER_HOUR;

/** O passo que contém um instante. */
export function tickAt(instant: Date): number {
  return Math.floor((instant.getTime() - SIM_EPOCH_MS) / TICK_MS);
}

/** O instante em que um passo acontece. */
export function tickTime(tick: number): Date {
  return new Date(SIM_EPOCH_MS + tick * TICK_MS);
}

/** Quantos passos há entre dois instantes. */
export function ticksBetween(from: Date, to: Date): number {
  return tickAt(to) - tickAt(from);
}

/** Segundos que um nº de passos representa. */
export function ticksToSeconds(ticks: number): number {
  return (ticks * TICK_MS) / 1000;
}

/** Passos que um nº de segundos representa, arredondado. */
export function secondsToTicks(seconds: number): number {
  return Math.round((seconds * 1000) / TICK_MS);
}

/**
 * O trecho de passos que uma retomada vai executar.
 *
 * `reanchored` diz que o intervalo pedido era maior que o teto e que o trecho
 * foi cortado pela frente. Quem chama precisa dessa informação para registrar a
 * descontinuidade, e não para esconder.
 */
export interface CatchupRange {
  readonly fromTick: number;
  readonly toTick: number;
  readonly ticks: number;
  readonly reanchored: boolean;
}

/**
 * O trecho a executar para sair de `fromTick` e chegar ao instante `to`.
 *
 * `fromTick` nulo significa "nunca rodou": aí o trecho é um dia antes do
 * instante pedido, o que dá à rede tempo de sair do transiente de arranque
 * antes do que alguém vai olhar.
 */
export function catchupRange(fromTick: number | null, to: Date): CatchupRange {
  const toTick = tickAt(to);

  if (fromTick === null) {
    const start = toTick - MAX_CATCHUP_TICKS;
    return { fromTick: start, toTick, ticks: toTick - start, reanchored: true };
  }

  if (toTick <= fromTick) {
    return { fromTick: toTick, toTick, ticks: 0, reanchored: false };
  }

  const gap = toTick - fromTick;
  if (gap > MAX_CATCHUP_TICKS) {
    const start = toTick - MAX_CATCHUP_TICKS;
    return { fromTick: start, toTick, ticks: MAX_CATCHUP_TICKS, reanchored: true };
  }

  return { fromTick, toTick, ticks: gap, reanchored: false };
}

/**
 * A semente da simulação.
 *
 * Um número só, e dele saem todas as séries: o ruído de cada tag é função de
 * (semente, passo, canal da tag). Trocar a semente dá outra máquina — mesma
 * dinâmica, outro ruído e outras assinaturas de mancal.
 *
 * O valor padrão é escrito, e não sorteado no arranque: o instantâneo do modo
 * de demonstração tem de bater com a API ao vivo.
 */
export const DEFAULT_SEED = 20_260_101;
