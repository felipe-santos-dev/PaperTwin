import { fraction } from './chart/scale';
import { PRIORITY_COLOR, type DesignPriority } from './priority';

/**
 * Barra de faixa: onde o valor está entre os limites do instrumento.
 *
 * Do sistema visual: trilho escuro, faixa L–H mais clara, marcas altas em LL e
 * HH, marcas baixas em L e H, um tracinho no alvo, o PV como barra vertical e o
 * SP como triângulo por cima. O PV é cinza-claro quando está dentro e assume a
 * cor da prioridade do alarme quando sai — a barra inteira continua cinza.
 *
 * A escala vai de `min` a `max` do catálogo. Um PV fora dela encosta na ponta,
 * para continuar visível e mostrar o lado para onde saiu.
 */
export interface RangeBarProps {
  readonly min: number;
  readonly max: number;
  readonly ll?: number | null;
  readonly l?: number | null;
  readonly h?: number | null;
  readonly hh?: number | null;
  readonly target?: number | null;
  readonly pv: number | null;
  readonly sp?: number | null;
  /** Prioridade do alarme ativo na TAG; `null` quando está dentro. */
  readonly priority?: DesignPriority | null;
  /** `sm` para a barra do cabeçalho e de alarme; `md` para linha de instrumento. */
  readonly size?: 'sm' | 'md';
  readonly className?: string;
  readonly label?: string;
}

const pct = (value: number): string => `${(value * 100).toFixed(2)}%`;

export function RangeBar({
  min,
  max,
  ll = null,
  l = null,
  h = null,
  hh = null,
  target = null,
  pv,
  sp = null,
  priority = null,
  size = 'md',
  className = '',
  label,
}: RangeBarProps) {
  const at = (value: number) => pct(fraction(value, min, max));
  const md = size === 'md';
  // alturas do sistema visual: trilho 6, marcas 16/12, PV 24 (md); a metade em sm
  const track = md ? 'top-[11px] h-1.5' : 'top-[5px] h-1';
  const outer = md ? 'h-7' : 'h-3.5';
  const pvColor = priority ? PRIORITY_COLOR[priority] : 'var(--color-fg)';

  return (
    <div
      role="img"
      aria-label={label ?? (pv === null ? 'sem leitura' : `PV ${String(pv)}`)}
      className={`relative ${outer} ${className}`}
    >
      <div className={`absolute inset-x-0 bg-track ${track}`} />
      {l !== null && h !== null ? (
        <div
          className={`absolute bg-band ${track}`}
          style={{ left: at(l), width: pct(fraction(h, min, max) - fraction(l, min, max)) }}
        />
      ) : null}
      {[ll, hh].map((value, index) =>
        value === null ? null : (
          <div
            key={`x${String(index)}`}
            className={`absolute w-px bg-fg-3 ${md ? 'top-[6px] h-4' : 'top-[2px] h-2.5'}`}
            style={{ left: at(value) }}
          />
        ),
      )}
      {[l, h].map((value, index) =>
        value === null ? null : (
          <div
            key={`n${String(index)}`}
            className={`absolute w-px bg-tick ${md ? 'top-[8px] h-3' : 'top-[3px] h-2'}`}
            style={{ left: at(value) }}
          />
        ),
      )}
      {target !== null ? (
        <div
          className={`absolute -ml-px w-0.5 bg-fg-2 ${md ? 'top-[9px] h-2.5' : 'top-[3px] h-2'}`}
          style={{ left: at(target) }}
        />
      ) : null}
      {sp !== null ? (
        <svg
          aria-hidden="true"
          viewBox="0 0 8 6"
          className={`absolute -ml-1 w-2 ${md ? 'top-0 h-1.5' : '-top-1 h-1.5'}`}
          style={{ left: at(sp) }}
        >
          <path d="M0 0 L8 0 L4 6 Z" fill="var(--color-fg-2)" />
        </svg>
      ) : null}
      {pv !== null ? (
        <div
          className={`absolute ${md ? 'top-[2px] -ml-0.5 h-6 w-1' : 'top-0 -ml-px h-3.5 w-[3px]'}`}
          style={{ left: at(pv), background: pvColor }}
        />
      ) : null}
    </div>
  );
}
