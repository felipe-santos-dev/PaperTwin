import { useLayoutEffect, useRef, useState } from 'react';

/**
 * A largura de um elemento, acompanhando o redimensionamento.
 *
 * Os gráficos em SVG próprio desenham em pixels reais, e não esticados por um
 * `viewBox`: esticar engrossa a linha e deforma o texto. Sem `ResizeObserver`
 * (o ambiente de teste não tem) fica a largura de partida.
 */
export function useWidth<T extends HTMLElement>(initial = 1000) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(initial);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const next = Math.round(element.getBoundingClientRect().width);
      if (next > 0) setWidth(next);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  return [ref, width] as const;
}
