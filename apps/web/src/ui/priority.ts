import type { AlarmPriority } from '@mp1/shared';

/**
 * Prioridade de alarme no vocabulário do design: 1 alta, 2 média, 3 baixa.
 *
 * A API tem quatro níveis (baixa, média, alta, crítica) e o design, três. A
 * crítica entra junto da alta, na 1: as duas pedem resposta imediata, e o que
 * as separa na API é a consequência, não o que o operador faz agora.
 */
export type DesignPriority = 1 | 2 | 3;

export function designPriority(priority: AlarmPriority): DesignPriority {
  switch (priority) {
    case 'crítica':
    case 'alta':
      return 1;
    case 'média':
      return 2;
    case 'baixa':
      return 3;
  }
}

export const PRIORITY_LABEL: Readonly<Record<DesignPriority, string>> = {
  1: 'Alta',
  2: 'Média',
  3: 'Baixa',
};

/** Classes Tailwind de cada prioridade: texto, fundo cheio, borda, fundo tênue. */
export const PRIORITY_CLASS: Readonly<
  Record<DesignPriority, { text: string; fill: string; border: string; tint: string }>
> = {
  1: { text: 'text-alarm-1', fill: 'bg-alarm-1', border: 'border-alarm-1', tint: 'bg-alarm-1/12' },
  2: { text: 'text-alarm-2', fill: 'bg-alarm-2', border: 'border-alarm-2', tint: 'bg-alarm-2/10' },
  3: { text: 'text-alarm-3', fill: 'bg-alarm-3', border: 'border-alarm-3', tint: 'bg-alarm-3/10' },
};

/** A cor de cada prioridade em valor CSS, para SVG. */
export const PRIORITY_COLOR: Readonly<Record<DesignPriority, string>> = {
  1: 'var(--color-alarm-1)',
  2: 'var(--color-alarm-2)',
  3: 'var(--color-alarm-3)',
};

/** A prioridade mais alta de uma lista (o menor número), ou `null` se vazia. */
export function worst(priorities: readonly DesignPriority[]): DesignPriority | null {
  if (priorities.length === 0) return null;
  return Math.min(...priorities) as DesignPriority;
}
