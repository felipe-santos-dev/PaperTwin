import type { ReelView } from '../process';

/**
 * O cenário da demonstração: cola AKD abaixo do SP → Cobb alto → bobina retida.
 *
 * A dosagem de cola de colagem interna (`FIC-107`) cai abaixo do limite baixo;
 * o papel perde resistência à água e o Cobb₆₀ das bobinas seguintes sobe acima
 * de 28 g/m². A penúltima bobina fechada fica em avaliação; a última, retida
 * para reteste.
 *
 * **A queda da cola não mora mais aqui.** Desde a Fase 3 ela acontece no
 * simulador: `FIC-107` é malha de verdade, o alarme de `L` é do motor de
 * alarmes e o Cobb sobe pela relação 17. O que sobrou neste arquivo é a parte
 * que ainda não tem rota — qual bobina a Qualidade reteve —, e ela agora se
 * ancora no **instante do alarme real**, não num número inventado.
 *
 * Sem alarme de cola, não há retenção: é o que faz o cenário desaparecer
 * sozinho quando a simulação não o produz.
 */
export interface Scenario {
  /** A bobina retida para reteste: a última fechada depois da queda. */
  readonly held: ReelView;
  /** A bobina em avaliação: a anterior a ela. */
  readonly evaluated: ReelView;
  /** Quando a cola caiu: o instante em que o alarme de `L` subiu. */
  readonly akdSince: string;
}

export function closedReels(reels: readonly ReelView[]): ReelView[] {
  return reels
    .filter((reel) => reel.endedAt !== null)
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
}

/**
 * As bobinas afetadas pela queda da cola, se houve queda.
 *
 * Afetada é a bobina que **estava sendo formada depois** de a cola cair: o
 * papel que já estava enrolado antes disso foi feito com cola no alvo. Entre as
 * afetadas, a última fechada é a retida e a anterior fica em avaliação — é a
 * ordem em que o laboratório chega aos resultados.
 */
export function scenarioOf(reels: readonly ReelView[], akdSince: string | null): Scenario | null {
  if (akdSince === null) return null;
  const desde = Date.parse(akdSince);
  const afetadas = closedReels(reels).filter((reel) => Date.parse(reel.endedAt ?? '') > desde);
  const [held, evaluated] = afetadas;
  if (!held || !evaluated) return null;
  return { held, evaluated, akdSince };
}
