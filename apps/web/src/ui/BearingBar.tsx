import { classifyIsoZone, type IsoLimits, type IsoZone } from '@mp1/shared';

import { fraction } from './chart/scale';

/** Até onde a escala vai: 40 % além da fronteira C→D, para a zona D ter largura. */
export function isoScaleMax(limits: IsoLimits): number {
  return limits.cToD * 1.4;
}

const ZONE_BG: Readonly<Record<IsoZone, string>> = {
  A: 'bg-iso-a',
  B: 'bg-iso-b',
  C: 'bg-iso-c',
  D: 'bg-iso-d',
};

const VALUE_COLOR: Readonly<Record<IsoZone, string>> = {
  A: 'var(--color-fg-3)',
  B: 'var(--color-fg-3)',
  C: 'var(--color-iso-c-line)',
  D: 'var(--color-iso-d-line)',
};

export interface BearingBarProps {
  readonly value: number | null;
  readonly limits: IsoLimits;
  /** O valor de sete dias atrás, quando a série tem. */
  readonly weekAgo?: number | null;
  readonly className?: string;
  readonly label?: string;
}

/**
 * Barra de mancal sobre as zonas da ISO 20816-3.
 *
 * O fundo são as quatro zonas, A a D, na largura de cada uma. A barra do valor
 * é cinza em A e B e só assume a cor da zona a partir de C — âmbar em C,
 * vermelha em D. Um tracinho branco marca o valor de sete dias atrás, para a
 * tendência aparecer sem gráfico.
 */
export function BearingBar({
  value,
  limits,
  weekAgo = null,
  className = '',
  label,
}: BearingBarProps) {
  const max = isoScaleMax(limits);
  const edges = [0, limits.aToB, limits.bToC, limits.cToD, max];
  const zones: IsoZone[] = ['A', 'B', 'C', 'D'];
  // leitura negativa não existe em RMS; trata como sem leitura em vez de quebrar a tela
  const zone = value === null || value < 0 ? null : classifyIsoZone(value, limits);

  return (
    <div
      role="img"
      aria-label={label ?? (value === null ? 'sem leitura' : `zona ${zone ?? ''}`)}
      className={`relative h-5 ${className}`}
    >
      <div className="absolute inset-0 flex">
        {zones.map((name, index) => (
          <div
            key={name}
            className={ZONE_BG[name]}
            style={{
              width: `${((fraction(edges[index + 1] ?? max, 0, max) - fraction(edges[index] ?? 0, 0, max)) * 100).toFixed(2)}%`,
            }}
          />
        ))}
      </div>
      {value !== null && zone ? (
        <div
          className="absolute top-1.5 left-0 h-2"
          style={{
            width: `${(fraction(value, 0, max) * 100).toFixed(2)}%`,
            background: VALUE_COLOR[zone],
          }}
        />
      ) : null}
      {weekAgo !== null ? (
        <div
          className="absolute top-0.5 -ml-px h-4 w-0.5 bg-fg"
          style={{ left: `${(fraction(weekAgo, 0, max) * 100).toFixed(2)}%` }}
        />
      ) : null}
    </div>
  );
}

/**
 * Temperatura do mancal numa escala de 40 a 100 °C, com marcas em 80 e 90 °C.
 *
 * Do sistema visual: a mesma linguagem da barra de faixa, em miniatura.
 */
export function TemperatureBar({
  value,
  className = '',
}: {
  readonly value: number | null;
  readonly className?: string;
}) {
  const at = (v: number) => `${(fraction(v, 40, 100) * 100).toFixed(2)}%`;
  const hot = value !== null && value >= 80;
  return (
    <div
      role="img"
      aria-label={value === null ? 'sem leitura' : `${String(value)} °C`}
      className={`relative h-3.5 ${className}`}
    >
      <div className="absolute inset-x-0 top-[5px] h-1 bg-track" />
      <div className="absolute top-[3px] h-2 w-px bg-tick" style={{ left: at(80) }} />
      <div className="absolute top-[2px] h-2.5 w-px bg-fg-3" style={{ left: at(90) }} />
      {value !== null ? (
        <div
          className="absolute top-0 -ml-px h-3.5 w-[3px]"
          style={{ left: at(value), background: hot ? 'var(--color-alarm-2)' : 'var(--color-fg)' }}
        />
      ) : null}
    </div>
  );
}
