import { processVariable } from '@mp1/shared';

import { FIXED_VARIABLES, LAB_SPECS } from '../api/fixtures';
import { num } from './format';

/**
 * A escala de uma TAG para a barra de faixa, venha ela de onde vier.
 *
 * Três fontes: o catálogo de processo, as variáveis fixas do preparo e os
 * ensaios de laboratório. As duas últimas são dado fixo e vêm marcadas.
 */
export interface TagScale {
  readonly min: number;
  readonly max: number;
  readonly ll: number | null;
  readonly l: number | null;
  readonly h: number | null;
  readonly hh: number | null;
  readonly target: number | null;
  readonly unit: string;
  readonly name: string;
  /** Texto curto da especificação ou da faixa, para a legenda da barra. */
  readonly range: string;
  readonly illustrative: boolean;
}

export function tagScale(tag: string): TagScale | null {
  const variable = processVariable(tag) ?? FIXED_VARIABLES.find((item) => item.tag === tag);
  if (variable) {
    const { l, h, ll, hh } = variable.limits;
    const lo = l ?? ll;
    const hi = h ?? hh;
    const range =
      lo !== null && hi !== null
        ? `faixa ${num(lo, digits(lo))}–${num(hi, digits(hi))}`
        : hi !== null
          ? `limite ${num(hi, digits(hi))}`
          : lo !== null
            ? `mínimo ${num(lo, digits(lo))}`
            : `escala ${num(variable.min, digits(variable.min))}–${num(variable.max, digits(variable.max))}`;
    return {
      min: variable.min,
      max: variable.max,
      ll,
      l,
      h,
      hh,
      target: variable.target,
      unit: variable.unit,
      name: variable.name,
      range:
        variable.target === null
          ? range
          : `${range} · alvo ${num(variable.target, digits(variable.target))}`,
      illustrative: variable.source === 'assumed' && !processVariable(tag),
    };
  }

  const spec = LAB_SPECS.find((item) => item.tag === tag);
  if (spec) {
    const pad = (spec.hi - spec.lo) * 0.5;
    return {
      min: spec.lo - pad,
      max: spec.hi + pad,
      ll: null,
      l: spec.lo,
      h: spec.hi,
      hh: null,
      target: spec.target,
      unit: spec.unit,
      name: spec.label,
      range: `espec. ${num(spec.lo, digits(spec.lo))}–${num(spec.hi, digits(spec.hi))}${
        spec.target === null ? '' : ` · alvo ${num(spec.target, digits(spec.target))}`
      }`,
      illustrative: true,
    };
  }
  return null;
}

/** Fora da faixa L–H (ou LL–HH, quando é o que há)? */
export function isOut(scale: TagScale, value: number): boolean {
  const lo = scale.l ?? scale.ll;
  const hi = scale.h ?? scale.hh;
  return (lo !== null && value < lo) || (hi !== null && value > hi);
}

/** Casas decimais que um número de escala pede: 1.250 nenhuma, 1,4 uma, 0,38 duas. */
export function digits(value: number): number {
  const abs = Math.abs(value);
  if (abs >= 100 || Number.isInteger(value)) return 0;
  if (abs >= 10) return 1;
  return Number.isInteger(value * 10) ? 1 : 2;
}
