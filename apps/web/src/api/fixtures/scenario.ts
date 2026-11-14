import type { ReelView } from '../process';

/**
 * O cenário da demonstração: cola AKD abaixo do SP → Cobb alto → bobina retida.
 *
 * A dosagem de cola de colagem interna (`FIC-107`) cai abaixo do setpoint; o
 * papel perde resistência à água e o Cobb₆₀ das bobinas seguintes sobe acima de
 * 28 g/m². A penúltima bobina fechada fica em avaliação; a última, retida para
 * reteste.
 *
 * Tudo se ancora nas bobinas **reais**: o cenário não inventa bobina, escolhe
 * quais das que a API devolveu ele afeta. Com menos de duas bobinas fechadas
 * não há cenário.
 */
export interface Scenario {
  /** A bobina retida para reteste: a última fechada. */
  readonly held: ReelView;
  /** A bobina em avaliação: a penúltima fechada. */
  readonly evaluated: ReelView;
  /** Quando a cola caiu abaixo do SP: um pouco antes da bobina em avaliação começar. */
  readonly akdSince: string;
}

/** Antecedência da queda da cola em relação à bobina em avaliação. */
const AKD_LEAD_MS = 38 * 60 * 1000;

export function closedReels(reels: readonly ReelView[]): ReelView[] {
  return reels
    .filter((reel) => reel.endedAt !== null)
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
}

export function scenarioOf(reels: readonly ReelView[]): Scenario | null {
  const [held, evaluated] = closedReels(reels);
  if (!held || !evaluated) return null;
  return {
    held,
    evaluated,
    akdSince: new Date(Date.parse(evaluated.startedAt) - AKD_LEAD_MS).toISOString(),
  };
}
