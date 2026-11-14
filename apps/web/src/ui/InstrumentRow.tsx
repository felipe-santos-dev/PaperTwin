import type { ReactNode } from 'react';

import { Sparkline } from './chart/Sparkline';
import { Num, Tag } from './Num';
import { ModeChip, PriorityBadge } from './Panel';
import { PRIORITY_COLOR, type DesignPriority } from './priority';
import { RangeBar } from './RangeBar';

/**
 * Linha de instrumento: nome e TAG, barra de faixa, PV, SP, modo e a última hora.
 *
 * É o átomo da tela de Processo. As colunas são fixas para o olho correr a
 * coluna de PV de cima a baixo sem procurar onde o número está. Fora da faixa,
 * a linha inteira ganha um fundo tênue e o PV assume a cor da prioridade — o
 * resto continua cinza.
 */
export interface InstrumentRowProps {
  readonly name: string;
  readonly tag: string;
  readonly unit: string;
  readonly pv: number | null;
  /** O PV já formatado; a linha não decide casas decimais. */
  readonly pvText: string;
  readonly sp: number | null;
  readonly spText: string;
  readonly mode: string | null;
  readonly limits: {
    readonly min: number;
    readonly max: number;
    readonly ll: number | null;
    readonly l: number | null;
    readonly h: number | null;
    readonly hh: number | null;
    readonly target: number | null;
  };
  readonly history: readonly number[];
  /** Prioridade do alarme ativo; `null` quando está dentro. */
  readonly priority: DesignPriority | null;
  /** Índices de ponto de laboratório no minigráfico. */
  readonly marks?: readonly number[];
  /** Selo ao lado da TAG (o "ilustrativo", por exemplo). */
  readonly badge?: ReactNode;
  readonly selected?: boolean;
  readonly onSelect?: () => void;
}

/** Colunas da linha; o cabeçalho da tabela usa as mesmas. */
export const INSTRUMENT_GRID =
  'grid grid-cols-[minmax(150px,190px)_minmax(160px,1fr)_96px_72px_56px_minmax(120px,0.75fr)] items-center gap-x-4';

export function InstrumentRow({
  name,
  tag,
  unit,
  pv,
  pvText,
  sp,
  spText,
  mode,
  limits,
  history,
  priority,
  marks = [],
  badge,
  selected = false,
  onSelect,
}: InstrumentRowProps) {
  const color = priority ? PRIORITY_COLOR[priority] : 'var(--color-fg)';
  const band = limits.l !== null && limits.h !== null ? { lo: limits.l, hi: limits.h } : null;

  return (
    <div
      role="row"
      aria-selected={selected}
      onClick={onSelect}
      className={`${INSTRUMENT_GRID} min-h-[62px] border-b border-line px-0 ${
        priority ? 'bg-alarm-2/[0.06]' : ''
      } ${selected ? 'outline outline-1 -outline-offset-1 outline-action' : ''} ${
        onSelect ? 'cursor-pointer hover:bg-hover' : ''
      }`}
    >
      <div role="cell" className="min-w-0">
        <div className="truncate text-[13px] text-fg">{name}</div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <Tag>{tag}</Tag>
          {priority ? <PriorityBadge priority={priority} /> : null}
          {badge}
        </div>
      </div>
      <div role="cell" className="min-w-0">
        <RangeBar
          min={limits.min}
          max={limits.max}
          ll={limits.ll}
          l={limits.l}
          h={limits.h}
          hh={limits.hh}
          target={limits.target}
          pv={pv}
          sp={sp}
          priority={priority}
          label={`${name}: faixa`}
        />
      </div>
      <div role="cell" className="text-right">
        <Num unit={unit} className="text-[16px]" unitClassName="">
          <span style={{ color }}>{pvText}</span>
        </Num>
      </div>
      <div role="cell" className="text-right font-mono text-[12px] text-fg-2">
        {spText}
      </div>
      <div role="cell">
        <ModeChip mode={mode} />
      </div>
      <div role="cell" className="min-w-0">
        <Sparkline
          values={history}
          band={band}
          marks={marks}
          lastColor={color}
          className="h-[22px] w-full"
          label={`${name}: última hora`}
        />
      </div>
    </div>
  );
}
