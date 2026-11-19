import type { ReactNode } from 'react';

import { PRIORITY_CLASS, PRIORITY_LABEL, type DesignPriority } from './priority';
import { RangeBar } from './RangeBar';
import { SCREENS, type ScreenId } from './screens';
import { SectionBlock } from './SectionBlock';
import type { SectionState } from './sections';

/**
 * A moldura das nove telas: barra superior, navegação 1–9 e faixa do processo.
 *
 * Medidas do design (fonte/Main.dc.html): navegação de 56 px à esquerda, barra
 * de 48 px no alto e, logo abaixo, a faixa de 64 px com as dez seções. O resto
 * é da tela, com 16 px de respiro. A moldura não rola; quem rola, se precisar,
 * é o conteúdo — e nunca na horizontal.
 *
 * Nada aqui é `<aside>`: o painel do ativo na tela de Máquina é o único
 * complementar da página, e o e2e o encontra por esse papel.
 */

export interface FrameTop {
  /** Turno em curso: letra, janela e operador. */
  readonly shift: {
    readonly letter: string;
    readonly window: string;
    readonly operator: string;
  } | null;
  readonly gramatura: { readonly text: string; readonly unit: string } | null;
  readonly speed: {
    readonly text: string;
    readonly unit: string;
    readonly value: number | null;
    readonly bar: {
      readonly min: number;
      readonly max: number;
      readonly l: number | null;
      readonly h: number | null;
      readonly target: number | null;
    };
  } | null;
  readonly alarms: Readonly<Record<DesignPriority, number>>;
  /** Hora da leitura (`HH:MM:SS`) e o dia (`seg 09/11`). */
  readonly clock: { readonly time: string; readonly date: string } | null;
}

export interface ShellProps {
  readonly screen: ScreenId;
  readonly go: (id: ScreenId) => void;
  readonly top: FrameTop;
  /** O selo da fonte de dados. */
  readonly source: ReactNode;
  /**
   * O campo de busca, no meio da barra.
   *
   * Entra como nó pronto, como o selo da fonte: a moldura não sabe de onde os
   * resultados saem nem para onde cada um leva — quem sabe disso é a aplicação,
   * que já tem os abridores de tela.
   */
  readonly search?: ReactNode;
  readonly sections: readonly SectionState[];
  /** A seção aberta em Processo, para marcar na faixa. */
  readonly area: string | null;
  readonly onArea: (area: string) => void;
  /** Um aviso que pede ação (a API voltou, por exemplo). */
  readonly banner?: ReactNode;
  readonly children: ReactNode;
}

export function Shell({
  screen,
  go,
  top,
  source,
  search,
  sections,
  area,
  onArea,
  banner,
  children,
}: ShellProps) {
  return (
    <div className="grid h-full grid-cols-[56px_minmax(0,1fr)] grid-rows-[48px_64px_auto_minmax(0,1fr)] bg-base">
      <NavRail screen={screen} go={go} />
      <TopBar
        top={top}
        source={source}
        search={search}
        onAlarms={() => {
          go('turno');
        }}
      />

      <div
        role="navigation"
        aria-label="Seções do processo"
        className="col-start-2 flex min-w-0 gap-1 border-b border-line px-4 py-2"
      >
        {sections.map((section) => (
          <SectionBlock
            key={section.id}
            label={section.label}
            out={section.out}
            selected={screen === 'processo' && area === section.id}
            onClick={() => {
              onArea(section.id);
            }}
          />
        ))}
      </div>

      <div className="col-start-2">{banner}</div>

      <main className="col-start-2 flex min-h-0 min-w-0 flex-col gap-4 overflow-x-hidden overflow-y-auto p-4">
        {children}
      </main>
    </div>
  );
}

function NavRail({
  screen,
  go,
}: {
  readonly screen: ScreenId;
  readonly go: (id: ScreenId) => void;
}) {
  return (
    <nav
      aria-label="Telas"
      className="row-span-4 flex flex-col items-center border-r border-line bg-chrome"
    >
      <div className="flex h-12 w-14 shrink-0 items-center justify-center border-b border-line text-[13px] font-semibold tracking-[0.02em] text-fg">
        PT
      </div>
      {SCREENS.map((item) => {
        const active = item.id === screen;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              go(item.id);
            }}
            aria-current={active ? 'page' : undefined}
            aria-label={item.label}
            aria-keyshortcuts={item.key}
            title={`${item.label} (tecla ${item.key})`}
            className={`flex h-13 w-14 shrink-0 flex-col items-center justify-center gap-0.5 border-l-2 transition-colors ${
              active
                ? 'border-action bg-hover text-fg'
                : 'border-transparent text-fg-3 hover:bg-hover hover:text-fg'
            }`}
          >
            <span aria-hidden="true" className="text-[16px] leading-none font-semibold">
              {item.key}
            </span>
            <span aria-hidden="true" className="text-[10px]">
              {item.short}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function Divider() {
  return <div aria-hidden="true" className="h-6 w-px shrink-0 bg-line-strong" />;
}

function TopBar({
  top,
  source,
  search,
  onAlarms,
}: {
  readonly top: FrameTop;
  readonly source: ReactNode;
  readonly search: ReactNode;
  readonly onAlarms: () => void;
}) {
  return (
    <header className="col-start-2 flex min-w-0 items-center gap-6 border-b border-line bg-chrome px-4 max-xl:gap-4">
      <div className="flex shrink-0 items-baseline gap-2.5">
        <span className="text-[15px] font-semibold">MP1</span>
        <span className="text-[12px] text-fg-3">PaperTwin</span>
      </div>
      <Divider />
      {top.shift ? (
        <div className="flex min-w-0 shrink items-baseline gap-2 overflow-hidden whitespace-nowrap">
          <span className="text-[13px] font-semibold">Turno {top.shift.letter}</span>
          <span className="font-mono text-[12px] text-fg-2">{top.shift.window}</span>
          <span className="truncate text-[12px] text-fg-2">{top.shift.operator}</span>
        </div>
      ) : null}
      <Divider />
      <div className="flex shrink-0 items-baseline gap-1.5">
        <span className="text-[11px] text-fg-3">Gramatura</span>
        <span className="font-mono text-[14px] font-medium">{top.gramatura?.text ?? '—'}</span>
        <span className="text-[11px] text-fg-2">{top.gramatura?.unit ?? ''}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2 max-lg:hidden">
        <span className="text-[11px] text-fg-3">Velocidade</span>
        <span className="font-mono text-[14px] font-medium">{top.speed?.text ?? '—'}</span>
        <span className="text-[11px] text-fg-2">{top.speed?.unit ?? ''}</span>
        {top.speed ? (
          <RangeBar
            size="sm"
            min={top.speed.bar.min}
            max={top.speed.bar.max}
            l={top.speed.bar.l}
            h={top.speed.bar.h}
            target={top.speed.bar.target}
            pv={top.speed.value}
            className="w-18"
            label="Velocidade na faixa"
          />
        ) : null}
      </div>

      {search ?? <div className="flex-1" />}

      <div className="flex shrink-0 items-center gap-1.5">
        <span className="mr-1 text-[11px] text-fg-3 max-xl:hidden">Alarmes</span>
        {([1, 2, 3] as const).map((priority) => {
          const count = top.alarms[priority];
          const tone = PRIORITY_CLASS[priority];
          const on = count > 0;
          return (
            <button
              key={priority}
              type="button"
              onClick={onAlarms}
              aria-label={`${String(count)} alarmes de prioridade ${PRIORITY_LABEL[priority].toLowerCase()}`}
              className={`flex h-7 items-center gap-1.5 border px-2 hover:border-action ${
                on ? `${tone.border} ${tone.tint}` : 'border-line-strong bg-cell'
              }`}
            >
              <span aria-hidden="true" className={`size-2 ${on ? tone.fill : 'bg-band'}`} />
              <span
                className={`font-mono text-[13px] ${on ? `font-semibold ${tone.text}` : 'text-fg-3'}`}
              >
                {count}
              </span>
              <span className={`text-[11px] ${on ? 'text-fg' : 'text-fg-3'}`}>
                {PRIORITY_LABEL[priority]}
              </span>
            </button>
          );
        })}
      </div>
      <Divider />
      {source}
      {top.clock ? (
        <div className="flex shrink-0 items-baseline gap-2 max-lg:hidden">
          <span className="font-mono text-[15px] font-medium">{top.clock.time}</span>
          <span className="font-mono text-[11px] text-fg-3">{top.clock.date}</span>
        </div>
      ) : null}
    </header>
  );
}
