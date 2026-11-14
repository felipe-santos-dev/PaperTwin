import { PRIORITY_CLASS, type DesignPriority } from './priority';

/**
 * Bloco de seção: uma das dez seções da máquina na faixa do processo.
 *
 * Cinza quando tudo está dentro. Com algo fora, ganha a borda e o fundo tênue
 * da pior prioridade, a contagem num quadradinho e as TAGs do que está fora —
 * cada TAG na cor da sua própria prioridade. Clicar abre a seção em Processo.
 */
export interface SectionBlockProps {
  readonly label: string;
  /** O que está fora, na ordem de prioridade. */
  readonly out: readonly { readonly tag: string; readonly priority: DesignPriority }[];
  readonly selected?: boolean;
  readonly onClick?: () => void;
}

export function SectionBlock({ label, out, selected = false, onClick }: SectionBlockProps) {
  const top = out[0]?.priority ?? null;
  const tone = top ? PRIORITY_CLASS[top] : null;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      title={out.length ? `${label}: ${out.map((item) => item.tag).join(', ')}` : label}
      className={`flex h-12 min-w-0 flex-1 basis-0 flex-col justify-between border px-2.5 py-1.5 text-left transition-colors ${
        tone ? `${tone.border} ${tone.tint} text-fg` : 'border-edge bg-cell text-fg-2'
      } ${selected ? 'outline-2 -outline-offset-2 outline-action' : ''} hover:border-action hover:text-fg`}
    >
      <span className="flex w-full items-start justify-between gap-1">
        <span className={`truncate text-[12px] ${tone ? 'font-medium' : ''}`}>{label}</span>
        {tone ? (
          <span
            className={`h-4 min-w-4.5 shrink-0 px-1 text-center font-mono text-[11px] leading-4 font-semibold text-on-alarm ${tone.fill}`}
          >
            {out.length}
          </span>
        ) : null}
      </span>
      {out.length ? (
        <span className="flex min-w-0 gap-1.5 truncate font-mono text-[10px]">
          {out.map((item) => (
            <span key={item.tag} className={PRIORITY_CLASS[item.priority].text}>
              {item.tag}
            </span>
          ))}
        </span>
      ) : null}
    </button>
  );
}
