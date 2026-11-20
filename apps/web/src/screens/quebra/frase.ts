import type { BreakDeviation, BreakReplay } from '@mp1/shared';

import { num } from '../../ui/format';

/**
 * O resumo da investigação, gerado dos números.
 *
 * Ela diz **o que se mexeu primeiro e quando**, e para aí. Não diz causa: a
 * causa pode estar fora do catálogo — um rolo sujo, uma emenda mal feita, uma
 * faca de ponta —, e uma frase que dissesse "causa: pressão diferencial no
 * sifão" seria uma afirmação que a conta não sustenta.
 *
 * A diferença entre "primeiro desvio" e "causa" parece sutil numa tela e não é:
 * a primeira convida a olhar, a segunda encerra o assunto.
 */
export function resumo(replay: BreakReplay): string {
  const origem = replay.first;

  if (!origem) {
    return (
      'Nenhuma das variáveis observadas saiu do normal nos 10 min anteriores. ' +
      'O que arrebentou a folha não está nesta lista.'
    );
  }

  const consequências = replay.deviations.filter((item) => item.consequenceOf !== null).length;

  const depois =
    consequências === 0
      ? ''
      : `; ${String(consequências)} ${consequências === 1 ? 'variável veio' : 'variáveis vieram'} atrás`;

  return `Primeiro desvio: ${origem.name}, ${quando(origem.leadTimeS)} antes${depois}.`;
}

/** Como a tela escreve um instante da janela: minutos, com segundos no fim. */
export function quando(segundos: number): string {
  if (segundos < 90) return `${String(Math.round(segundos))} s`;
  return `${num(segundos / 60, 1)} min`;
}

/** A linha de uma variável na lista: o que ela fez, em português. */
export function oQueFez(desvio: BreakDeviation): string {
  const tamanho = `${num(Math.abs(desvio.size), casasDe(desvio.size))} ${desvio.unit}`;
  return `${desvio.direction} ${tamanho} · ${num(desvio.sigmas, 1)}× a régua`;
}

function casasDe(value: number): number {
  const magnitude = Math.abs(value);
  return magnitude >= 100 ? 0 : magnitude >= 10 ? 1 : 2;
}
