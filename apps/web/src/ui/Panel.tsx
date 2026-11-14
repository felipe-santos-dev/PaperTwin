import type { ReactNode } from 'react';

import { PRIORITY_CLASS, type DesignPriority } from './priority';

/**
 * Bloco de painel: o retângulo que agrupa um assunto da tela.
 *
 * Título em Inter 600 · 14, contexto ao lado em cinza e, à direita, o que o
 * bloco oferece (filtro, janela de tempo, legenda). Sem sombra e sem relevo:
 * o que separa um bloco do outro é a borda de 1 px e o fundo do painel.
 */
export interface PanelProps {
  readonly title: ReactNode;
  /** Contexto curto ao lado do título: contagem, recorte, período. */
  readonly context?: ReactNode;
  /** O que fica à direita do título. */
  readonly aside?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
  /** Classe do corpo, abaixo do título. */
  readonly bodyClassName?: string;
  /** Rótulo acessível, quando o título não é texto simples. */
  readonly label?: string;
}

export function Panel({
  title,
  context,
  aside,
  children,
  className = '',
  bodyClassName = '',
  label,
}: PanelProps) {
  return (
    <section
      aria-label={label ?? (typeof title === 'string' ? title : undefined)}
      className={`flex min-h-0 min-w-0 flex-col border border-line bg-panel px-5 pt-4 pb-4 ${className}`}
    >
      <header className="mb-3 flex min-h-6 items-baseline gap-3">
        <h2 className="shrink-0 text-[14px] font-semibold text-fg">{title}</h2>
        {context ? <div className="min-w-0 truncate text-[12px] text-fg-2">{context}</div> : null}
        {aside ? (
          <div className="ml-auto flex shrink-0 items-center gap-2 text-[11px] text-fg-3">
            {aside}
          </div>
        ) : null}
      </header>
      <div className={`min-h-0 flex-1 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

/**
 * O selo "ilustrativo": este bloco mostra dado fixo, não leitura da API.
 *
 * Discreto de propósito — tracejado e cinza, como o selo de demonstração. Ele
 * não pede atenção; ele impede que alguém tome o número por medição.
 */
export function Illustrative({ title }: { readonly title?: string }) {
  return (
    <span
      title={title ?? 'Dado fixo de demonstração: a API ainda não tem esta fonte.'}
      className="inline-flex h-4.5 items-center border border-dashed border-tick px-1.5 font-mono text-[10px] tracking-[0.04em] text-fg-3"
    >
      ilustrativo
    </span>
  );
}

/** O quadradinho da prioridade de alarme, com o número dentro. */
export function PriorityBadge({ priority }: { readonly priority: DesignPriority }) {
  return (
    <span
      aria-label={`prioridade ${String(priority)}`}
      className={`inline-flex h-4 min-w-4.5 items-center justify-center px-1 font-mono text-[11px] leading-4 font-semibold text-on-alarm ${PRIORITY_CLASS[priority].fill}`}
    >
      {priority}
    </span>
  );
}

/** Chip de modo do controlador: AUT, MAN, CAS. MAN em destaque neutro. */
export function ModeChip({ mode }: { readonly mode: string | null }) {
  const manual = mode === 'MAN';
  return (
    <span
      className={`inline-flex h-4.5 min-w-11 items-center justify-center border px-1.5 font-mono text-[10px] ${
        manual ? 'border-fg-3 bg-band text-fg' : 'border-line-strong text-fg-2'
      }`}
    >
      {mode ?? '–'}
    </span>
  );
}
