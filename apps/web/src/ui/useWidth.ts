import { useCallback, useLayoutEffect, useState } from 'react';

/**
 * A largura de um elemento, acompanhando o redimensionamento.
 *
 * Os gráficos em SVG próprio desenham em pixels reais, e não esticados por um
 * `viewBox`: esticar engrossa a linha e deforma o texto. Sem `ResizeObserver`
 * (o ambiente de teste não tem) fica a largura de partida.
 *
 * ## Por que o retorno é uma função, e não um `useRef`
 *
 * O elemento que se quer medir quase nunca existe no instante em que o
 * componente monta. Ele está dentro do `ResourceState`, que só desenha o
 * gráfico quando a resposta chega, ou atrás de um `if` que depende dos dados.
 * Com `useRef` + `useLayoutEffect([])`, o efeito roda uma vez, no mount, acha
 * `ref.current === null`, desiste — e **nunca mais roda**. A largura fica para
 * sempre no valor de partida.
 *
 * O estrago é silencioso: numa coluna larga o valor de partida cabe e ninguém
 * nota; numa estreita, o excesso é cortado pela borda do painel, sem barra de
 * rolagem e sem erro no console. Foi o que aconteceu com o "Efeito do refino"
 * em 1440 × 900 — 560 px de SVG num painel de 527, com o container medindo os
 * 381 px certos que ninguém leu.
 *
 * Com a função de ref, quem avisa que o elemento chegou é o React, no instante
 * em que ele entra na árvore. O nó vira estado, o efeito depende dele, e medir
 * passa a acontecer sempre — tarde, cedo, ou de novo se o elemento for trocado.
 *
 * `e2e/largura.spec.ts` é a rede embaixo: nenhum SVG passa da borda do painel
 * em 1440 × 900.
 */
export function useWidth<T extends HTMLElement>(initial = 1000) {
  const [node, setNode] = useState<T | null>(null);
  const [width, setWidth] = useState(initial);

  const ref = useCallback((element: T | null) => {
    setNode(element);
  }, []);

  useLayoutEffect(() => {
    if (!node) return;

    const measure = () => {
      const next = Math.round(node.getBoundingClientRect().width);
      if (next > 0) setWidth(next);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [node]);

  return [ref, width] as const;
}
