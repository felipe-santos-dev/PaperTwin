import { processVariable } from '@mp1/shared';
import type { WhatIfResult, WhatIfVariable } from '@mp1/shared/simulation';

import { num } from '../../ui/format';

/**
 * A leitura em palavras do que a previsão calculou.
 *
 * Fica separada da tela por dois motivos: é a parte que um teste consegue
 * cobrar sem montar um componente, e é a parte que diz a mesma coisa que o
 * gráfico — se as duas discordarem, uma das duas está errada, e é melhor
 * descobrir num teste do que num turno.
 */

/**
 * O quanto a variável se mexeu, medido na régua dela.
 *
 * A régua é a banda L–H quando existe — é nela que a mudança importa para quem
 * opera — e a faixa de operação do catálogo quando não existe. Sem isso, uma
 * variável sem limites ganharia a comparação por acidente: a conta cairia num
 * divisor de 1 e qualquer casa decimal pareceria grande.
 */
export function relativo(item: WhatIfVariable): number {
  const variable = processVariable(item.tag);
  const banda =
    item.limits.l !== null && item.limits.h !== null
      ? item.limits.h - item.limits.l
      : (variable?.max ?? 1) - (variable?.min ?? 0);

  // o pico, e não o fim: em automático a malha devolve a variável ao setpoint
  return Math.max(Math.abs(item.finalDelta), Math.abs(item.peakDelta)) / (Math.abs(banda) || 1);
}

/**
 * A ordem de leitura: a causa primeiro, depois quem mais se desviou.
 *
 * As mexidas vêm no topo porque são a entrada — a pilha de gráficos se lê de
 * cima para baixo como a cadeia se lê: mexeu aqui, chegou ali. Depois delas, a
 * ordem é o tamanho do desvio na régua de cada uma.
 */
export function ordenar(variables: readonly WhatIfVariable[]): WhatIfVariable[] {
  return [...variables].sort((a, b) => {
    if (a.manipulated !== b.manipulated) return Number(b.manipulated) - Number(a.manipulated);
    return relativo(b) - relativo(a);
  });
}

/** Os efeitos, sem as malhas que a pessoa mexeu, do maior desvio para o menor. */
export function efeitos(variables: readonly WhatIfVariable[]): WhatIfVariable[] {
  return ordenar(variables.filter((item) => !item.manipulated));
}

/**
 * A frase, gerada dos números.
 *
 * Ela diz três coisas, nesta ordem: o que muda, em quanto tempo, e o que isso
 * atravessa. É o resumo que alguém repetiria para o colega do lado — e se o
 * gráfico some, a frase ainda responde.
 */
export function frase(result: WhatIfResult): string {
  const efeito = efeitos(result.variables)[0];

  if (!efeito) return 'A mudança não move nenhuma outra variável neste horizonte.';

  const cruzamento = efeito.crossings[0];
  const limite = cruzamento ? `; cruza ${cruzamento.limit} em ${minutos(cruzamento.atS)}` : '';
  const satura = result.variables.some((item) => item.manipulated && item.saturated)
    ? '; a válvula satura'
    : '';

  /**
   * Em automático a malha costuma devolver a variável ao setpoint, e aí o
   * desvio final é quase zero. Dizer "cai 0,00" seria dizer que não aconteceu
   * nada — quando o que aconteceu foi uma perturbação e uma correção.
   */
  const volta = Math.abs(efeito.finalDelta) < Math.abs(efeito.peakDelta) * 0.4;

  if (volta && Math.abs(efeito.peakDelta) > 0) {
    const direção = efeito.peakDelta > 0 ? 'sobe' : 'cai';
    const pico = `${num(Math.abs(efeito.peakDelta), 2)} ${efeito.unit}`;
    const quando = efeito.peakAtS === null ? '' : ` em ${minutos(efeito.peakAtS)}`;
    return `${efeito.name} ${direção} ${pico} no pico${quando} e a malha traz de volta${limite}${satura}.`;
  }

  const direção = efeito.finalDelta > 0 ? 'sobe' : 'cai';
  const quanto = `${num(Math.abs(efeito.finalDelta), 2)} ${efeito.unit}`;
  const quando =
    efeito.t63S === null
      ? 'e ainda está indo no fim do horizonte'
      : `em cerca de ${minutos(efeito.t63S)}`;

  return `${efeito.name} ${direção} ${quanto} ${quando}${limite}${satura}.`;
}

export function minutos(segundos: number): string {
  if (segundos < 90) return `${String(Math.round(segundos))} s`;
  return `${num(segundos / 60, 1)} min`;
}
