import { PRIORITY_CLASS, type DesignPriority } from './priority';

/**
 * Bloco de seção: uma das dez seções da máquina na faixa do processo.
 *
 * Cinza quando tudo está dentro. Com algo fora, ganha a borda e o fundo tênue
 * da pior prioridade, a contagem num quadradinho e as TAGs do que está fora —
 * cada TAG na cor da sua própria prioridade. Clicar abre a seção em Processo.
 *
 * ## Por que as TAGs vinham cortadas
 *
 * São dez blocos dividindo a largura em partes iguais: em 1280 px cada um fica
 * com uns 110 px, e sobram uns 90 para texto. Duas TAGs de oito caracteres em
 * monoespaçada de 10 px não cabem — e a linha delas era um `flex` com
 * `truncate`, que não corta nada: `text-overflow` age sobre texto, e os filhos
 * de um flex são caixas. O resultado era a segunda TAG cortada no meio, sem
 * reticências e sem aviso.
 *
 * Então o bloco mostra as TAGs que couberem com certeza — uma, que é o caso de
 * quase todas as seções — e conta as outras num `+N`. A lista inteira continua
 * no `title`, e clicar abre a seção em Processo, que é onde ela cabe.
 */
export interface SectionBlockProps {
  readonly label: string;
  /** O que está fora, na ordem de prioridade. */
  readonly out: readonly { readonly tag: string; readonly priority: DesignPriority }[];
  readonly selected?: boolean;
  readonly onClick?: () => void;
}

/**
 * Quantas TAGs cabem na linha de baixo de um bloco.
 *
 * Uma. Em `piso` (1280 px) o bloco tem ~90 px de texto útil e uma TAG de
 * catálogo ocupa ~50 px; a segunda levaria o total a ~105. Mostrar uma e contar
 * o resto é honesto nas quatro larguras, e não depende de medir nada.
 */
const TAGS_VISIVEIS = 1;

export function SectionBlock({ label, out, selected = false, onClick }: SectionBlockProps) {
  const top = out[0]?.priority ?? null;
  const tone = top ? PRIORITY_CLASS[top] : null;
  const mostradas = out.slice(0, TAGS_VISIVEIS);
  const restantes = out.length - mostradas.length;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      title={out.length ? `${label}: ${out.map((item) => item.tag).join(', ')}` : label}
      /*
        Em 1280 px cada um dos dez blocos fica com ~110 px.

        Com `px-2.5` e o quadradinho da contagem ao lado, sobravam ~68 px para o
        rótulo — e "Pré-secagem" em 12 px pede ~72. O nome saía como "Pré-…",
        que é o "Pré-." da revisão. Um ponto de fonte e meio ponto de respiro de
        cada lado devolvem os 8 px que faltavam, e de `largo` para cima as
        medidas são as do desenho.
      */
      className={`flex h-12 min-w-0 flex-1 basis-0 flex-col justify-between border px-2 py-1.5 text-left transition-colors largo:px-2.5 ${
        tone ? `${tone.border} ${tone.tint} text-fg` : 'border-edge bg-cell text-fg-2'
      } ${selected ? 'outline-2 -outline-offset-2 outline-action' : ''} hover:border-action hover:text-fg`}
    >
      <span className="flex w-full min-w-0 items-start justify-between gap-1">
        <span
          className={`min-w-0 truncate text-[11px] largo:text-[12px] ${tone ? 'font-medium' : ''}`}
        >
          {label}
        </span>
        {tone ? (
          <span
            className={`h-4 min-w-4.5 shrink-0 px-1 text-center font-mono text-[11px] leading-4 font-semibold text-on-alarm ${tone.fill}`}
          >
            {out.length}
          </span>
        ) : null}
      </span>
      {out.length ? (
        <span className="flex w-full min-w-0 items-baseline gap-1.5 overflow-hidden font-mono text-[10px]">
          {mostradas.map((item) => (
            <span
              key={item.tag}
              className={`min-w-0 truncate ${PRIORITY_CLASS[item.priority].text}`}
            >
              {item.tag}
            </span>
          ))}
          {restantes > 0 ? <span className="shrink-0 text-fg-3">+{restantes}</span> : null}
        </span>
      ) : null}
    </button>
  );
}
