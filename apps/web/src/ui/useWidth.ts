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
  const [ref, width] = useSize<T>(initial, 0);
  return [ref, width] as const;
}

/**
 * A largura **e a altura**, para o desenho que precisa ocupar o espaço que tem.
 *
 * O mapa da máquina é o caso: a largura dele é a posição real em metros, mas a
 * altura é escolhida — quanto mais alto o painel, mais as duas faixas podem se
 * separar. Sem saber a altura disponível, ou sobra espaço vazio embaixo, ou o
 * desenho estoura o painel.
 *
 * Mesma mecânica do `useWidth`, e pelas mesmas razões; veja acima.
 */
export function useSize<T extends HTMLElement>(initialWidth = 1000, initialHeight = 200) {
  const [node, setNode] = useState<T | null>(null);
  const [size, setSize] = useState({ width: initialWidth, height: initialHeight });

  const ref = useCallback((element: T | null) => {
    setNode(element);
  }, []);

  useLayoutEffect(() => {
    if (!node) return;

    const measure = () => {
      const caixa = node.getBoundingClientRect();
      const width = Math.round(caixa.width);
      const height = Math.round(caixa.height);
      setSize((atual) => {
        const proximo = {
          width: width > 0 ? width : atual.width,
          height: height > 0 ? height : atual.height,
        };
        // sem isto, cada medição cria um objeto novo e o React redesenha à toa
        return proximo.width === atual.width && proximo.height === atual.height ? atual : proximo;
      });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [node]);

  return [ref, size.width, size.height] as const;
}
