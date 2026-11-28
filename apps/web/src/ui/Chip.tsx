import { PRIORITY_CLASS, PRIORITY_COLOR, type DesignPriority } from './priority';

/**
 * Chip: um filtro ou uma seção, com o ponto de estado ao lado do nome.
 *
 * É o `.chip` do protótipo, e é a generalização do `ui/SectionBlock.tsx` — que
 * já era exatamente isto, só preso à faixa de dez seções do topo. Com a faixa
 * fora da casca, a escolha de seção passa a ser um filtro dentro do Processo, e
 * um filtro é um chip: ligado ou desligado, com o nome inteiro.
 *
 * ## O nome vem inteiro, sempre
 *
 * `SectionBlock` tinha de cortar: dez blocos dividindo 1280 px dão 110 px cada,
 * e "Pré-secagem" não cabia. O chip não divide largura com ninguém — ele ocupa o
 * que o nome pede e quebra para a linha de baixo quando a fila acaba. É a regra
 * "nomes de variável sempre inteiros" aplicada ao caso mais fácil dela: quando
 * não cabe na linha, a linha dobra.
 *
 * ## Três maneiras de dizer o estado, e só uma por chip
 *
 * - `priority` pinta o ponto com a cor da prioridade do alarme e dá ao chip a
 *   borda dela: é o uso de seção, "tem coisa fora aqui dentro".
 * - `dot` pinta o ponto com uma cor dada: é o uso de legenda viva, como os
 *   tipos de evento do registro do Turno (alarme âmbar, bobina rosa).
 * - sem nenhum dos dois, o chip é só um filtro ligado ou desligado.
 *
 * `count` é o número no fim, quando a contagem importa mais que a lista.
 */

export interface ChipProps {
  readonly label: string;
  /** A prioridade do pior alarme dentro do que o chip representa. */
  readonly priority?: DesignPriority | null;
  /** Uma cor de ponto própria, para legenda viva. */
  readonly dot?: string | null;
  readonly count?: number | null;
  readonly selected?: boolean;
  readonly onClick?: () => void;
  /** O texto do `title`: a lista inteira, quando o chip resume uma. */
  readonly title?: string;
  readonly className?: string;
}

export function Chip({
  label,
  priority = null,
  dot = null,
  count = null,
  selected = false,
  onClick,
  title,
  className = '',
}: ChipProps) {
  const tone = priority ? PRIORITY_CLASS[priority] : null;
  const cor = priority ? PRIORITY_COLOR[priority] : dot;

  /**
   * Sem `onClick` o chip não é botão.
   *
   * Um `button` que não faz nada é uma promessa falsa para quem navega pelo
   * teclado: o foco para nele e nada acontece. O chip de legenda — o que só
   * explica uma cor — sai como `span`.
   */
  const Element = onClick ? 'button' : 'span';

  return (
    <Element
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      aria-pressed={onClick ? selected : undefined}
      title={title ?? label}
      className={`inline-flex h-6.5 min-w-0 shrink-0 items-center gap-1.5 border px-2.5 text-[12px] ${
        tone ? `${tone.border} ${tone.tint} text-fg` : 'border-line-strong text-fg-2'
      } ${selected ? 'border-action bg-hover text-fg' : ''} ${
        onClick ? 'hover:border-action hover:text-fg' : ''
      } ${className}`}
    >
      {cor ? (
        <span aria-hidden="true" className="size-1.5 shrink-0" style={{ background: cor }} />
      ) : null}
      <span className="whitespace-nowrap">{label}</span>
      {count !== null ? (
        <span
          className={`font-mono text-[11px] ${tone ? `font-semibold ${tone.text}` : 'text-fg-3'}`}
        >
          {count}
        </span>
      ) : null}
    </Element>
  );
}
