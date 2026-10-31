import type { ReactNode } from 'react';

import { SCREENS, type ScreenId } from './screens';

/**
 * A moldura das sete telas: cabeçalho, navegação e o conteúdo.
 *
 * O desenho é o do protótipo aprovado — cabeçalho de 52 px com os números que
 * importam, navegação de 180 px à esquerda, conteúdo no resto. O que mudou em
 * relação ao protótipo é que aqui ele **não** é um palco fixo de 1920×1080
 * escalado: a tela de verdade é fluida.
 *
 * A razão é prática. O palco escalado é certo para apresentar sete telas numa
 * página, porque garante que elas apareçam exatamente como foram desenhadas. Num
 * aplicativo, ele significaria texto de 9 px num laptop e de 20 px num monitor
 * grande, com o ponteiro caindo fora dos botões por causa do `transform`. O que
 * se preserva é a proporção e a hierarquia; o que se abandona é o pixel fixo.
 */

export interface ShellHeaderValue {
  readonly label: string;
  readonly value: string;
  /** Destaca o número quando ele é o que há de anormal. */
  readonly tone?: 'normal' | 'attention' | 'critical';
}

export interface ShellProps {
  readonly screen: ScreenId;
  readonly go: (id: ScreenId) => void;
  /** Os números do cabeçalho: velocidade, gramatura, bobina, vapor. */
  readonly headline: readonly ShellHeaderValue[];
  /** O selo da fonte de dados, à direita. */
  readonly source: ReactNode;
  /** O instante da simulação, em texto curto. */
  readonly stamp: string;
  /** A faixa de aviso, quando há. */
  readonly banner?: ReactNode;
  readonly children: ReactNode;
}

const TONE = {
  normal: 'text-mill-fg',
  attention: 'text-mill-attention',
  critical: 'text-mill-critical',
} as const;

export function Shell({ screen, go, headline, source, stamp, banner, children }: ShellProps) {
  return (
    <div className="flex h-full flex-col bg-mill-panel">
      <header className="flex h-13 shrink-0 items-center gap-6 border-b border-mill-line px-7 max-lg:gap-4">
        <div className="flex items-baseline gap-2.5">
          <span className="text-base font-bold tracking-[0.02em]">PaperTwin</span>
          <span className="font-mono text-[13px] text-mill-muted max-md:hidden">
            MP1 · parte seca
          </span>
        </div>

        <div className="flex min-w-0 flex-1 gap-8 overflow-hidden text-[13px] text-mill-muted max-xl:gap-5">
          {headline.map((item) => (
            <span key={item.label} className="truncate max-lg:hidden">
              {item.label}{' '}
              <b className={`font-mono font-medium ${TONE[item.tone ?? 'normal']}`}>{item.value}</b>
            </span>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-5 text-[13px] text-mill-muted">
          {source}
          <span className="font-mono text-mill-fg max-sm:hidden">{stamp}</span>
        </div>
      </header>

      {banner}

      <div className="flex min-h-0 flex-1">
        <nav
          aria-label="Seções"
          className="flex w-45 shrink-0 flex-col gap-0.5 border-r border-mill-line py-6 pl-7 text-sm max-md:w-14 max-md:items-center max-md:pl-0"
        >
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
                /**
                 * A tecla vai no rótulo acessível, e não só na dica do canto:
                 * quem navega por teclado precisa saber que a tecla existe sem
                 * ter de achar o texto de ajuda.
                 */
                aria-keyshortcuts={item.key}
                title={`${item.label} (tecla ${item.key})`}
                className={`flex min-h-11 items-center justify-between gap-2 py-2.5 pr-5 text-left transition-colors max-md:justify-center max-md:pr-0 ${
                  active
                    ? 'border-r-2 border-mill-accent font-semibold text-mill-fg max-md:border-r-0'
                    : 'text-mill-muted hover:text-mill-fg'
                }`}
              >
                <span className="max-md:hidden">{item.label}</span>
                <span
                  aria-hidden="true"
                  className={`font-mono text-[11px] ${active ? 'text-mill-accent' : 'text-mill-dim'}`}
                >
                  {item.key}
                </span>
              </button>
            );
          })}
        </nav>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-auto px-7 py-5">
          {children}
        </main>
      </div>
    </div>
  );
}

/** O título de uma tela: etiqueta em maiúsculas e o nome grande, como no protótipo. */
export function ScreenTitle({
  eyebrow,
  title,
  aside,
  actions,
}: {
  readonly eyebrow: string;
  readonly title: ReactNode;
  readonly aside?: ReactNode;
  readonly actions?: ReactNode;
}) {
  return (
    <section className="flex flex-wrap items-end justify-between gap-5">
      <div>
        <div className="text-xs tracking-[0.12em] text-mill-muted uppercase">{eyebrow}</div>
        <h1 className="mt-1 text-[28px] leading-tight font-semibold tracking-[-0.01em]">
          {title}
          {aside && <span className="font-normal text-mill-muted"> {aside}</span>}
        </h1>
      </div>
      {actions}
    </section>
  );
}

/**
 * Uma faixa de números no alto da tela, com divisórias.
 *
 * Divisórias e não cartões: a regra do projeto pede poucos cartões, e um cartão
 * por número daria cinco caixas competindo com o gráfico que está embaixo.
 */
export function StatRow({
  stats,
}: {
  readonly stats: readonly {
    readonly label: string;
    readonly value: ReactNode;
    readonly hint?: ReactNode;
    readonly tone?: 'normal' | 'attention' | 'critical';
  }[];
}) {
  return (
    <section
      aria-label="Resumo"
      className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] border-y border-mill-line"
    >
      {stats.map((stat, index) => (
        <div
          key={stat.label}
          className={`px-4 py-3 ${index === 0 ? 'pl-0' : 'border-l border-mill-line'}`}
        >
          <div className="text-xs text-mill-muted">{stat.label}</div>
          <div className={`mt-0.5 font-mono text-2xl ${TONE[stat.tone ?? 'normal']}`}>
            {stat.value}
          </div>
          {stat.hint !== undefined && (
            <div className="mt-0.5 text-xs text-mill-muted">{stat.hint}</div>
          )}
        </div>
      ))}
    </section>
  );
}

/** Um bloco com título, do jeito do protótipo: título pequeno, conteúdo colado. */
export function Block({
  title,
  aside,
  children,
}: {
  readonly title: string;
  readonly aside?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <section aria-label={title} className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {aside && <div className="text-xs text-mill-muted">{aside}</div>}
      </div>
      {children}
    </section>
  );
}
