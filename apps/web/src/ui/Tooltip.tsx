import { useId, useState, type ReactNode } from 'react';

/**
 * A caixinha que explica o que está debaixo do cursor.
 *
 * É o `showTip`/`hideTip` do protótipo (linha 581), com duas diferenças que o
 * React cobra e que valem a pena:
 *
 * 1. **Não é um elemento global com `innerHTML`.** O protótipo tem uma `div`
 *    única no `body` e joga HTML dentro dela. Aqui o conteúdo é `ReactNode`, o
 *    que significa que ele é escapado, pode levar componente dentro e não
 *    precisa de uma folha de estilos à parte.
 * 2. **Aparece no foco, não só no cursor.** Quem navega pelo teclado também
 *    precisa da explicação, e `onFocus` custa uma linha.
 *
 * ## Por que seguir o cursor, e não ancorar no elemento
 *
 * Nas faixas e nos mapas o alvo é uma barra de 6 px ou um retângulo de 300 px
 * de largura: ancorado no canto do elemento, o texto cai longe do que a pessoa
 * está olhando. O protótipo põe a caixa a 14 px do ponteiro, e é o certo —
 * quem apontou sabe para onde apontou.
 *
 * A caixa é `position: fixed` e `pointer-events: none`: ela não entra na
 * rolagem da página (que é a única rolagem da casca nova) e nunca rouba o
 * cursor do elemento que a abriu, o que a faria piscar sem parar.
 */

/** Largura máxima da caixa, igual à do protótipo. */
const LARGURA = 320;
/** O respiro entre o ponteiro e a caixa. */
const OFFSET = 14;

export interface TooltipProps {
  /** O que explicar. `null` não abre caixa nenhuma. */
  readonly content: ReactNode;
  /** O que recebe o cursor. */
  readonly children: ReactNode;
  /** O elemento do invólucro; `span` por padrão, para caber dentro de texto. */
  readonly as?: 'span' | 'div';
  readonly className?: string;
}

export function Tooltip({ content, children, as = 'span', className = '' }: TooltipProps) {
  const [at, setAt] = useState<{ readonly x: number; readonly y: number } | null>(null);
  const id = useId();
  const Wrapper = as;

  const mover = (clientX: number, clientY: number): void => {
    // encostar na borda direita é o que o protótipo evita com innerWidth-340
    setAt({ x: Math.min(clientX + OFFSET, window.innerWidth - LARGURA - 20), y: clientY + OFFSET });
  };

  if (content === null || content === undefined || content === false) {
    return <Wrapper className={className}>{children}</Wrapper>;
  }

  return (
    <Wrapper
      className={className}
      aria-describedby={at ? id : undefined}
      onMouseEnter={(event) => {
        mover(event.clientX, event.clientY);
      }}
      onMouseMove={(event) => {
        mover(event.clientX, event.clientY);
      }}
      onMouseLeave={() => {
        setAt(null);
      }}
      onFocus={(event) => {
        const caixa = event.currentTarget.getBoundingClientRect();
        mover(caixa.left, caixa.bottom);
      }}
      onBlur={() => {
        setAt(null);
      }}
    >
      {children}
      {at ? (
        <span
          id={id}
          role="tooltip"
          className="pointer-events-none fixed z-50 block max-w-80 border border-line-strong bg-chrome px-2.5 py-2 text-[12px] leading-[1.45] text-fg-2 shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
          style={{ left: at.x, top: at.y }}
        >
          {content}
        </span>
      ) : null}
    </Wrapper>
  );
}
