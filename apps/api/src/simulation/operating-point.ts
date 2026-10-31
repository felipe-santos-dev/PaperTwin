import { LAB_VARIABLES, PROCESS_CATALOG, processVariable, type ProcessVariable } from '@mp1/shared';

/**
 * O ponto de operação: o valor de cada variável quando nada está sendo mexido.
 *
 * A rede de relações trabalha em **desvio** — cada relação diz quanto a saída se
 * afasta de onde estava — então todo valor absoluto do simulador é
 * `ponto de operação + desvio`. Sem um ponto de operação por tag, o simulador
 * saberia como o processo reage e não saberia onde ele está.
 *
 * A fonte é o catálogo: a coluna `alvo`. Onde ela está vazia, o ponto é o meio
 * da faixa de operação — não há alvo porque a variável não é operada contra um
 * valor (o diâmetro da bobina cresce e volta, a largura é constante), e o meio
 * da faixa é a escolha neutra.
 */

/** O ponto de operação de uma variável do catálogo. */
export function operatingPointOf(variable: ProcessVariable): number {
  return variable.target ?? (variable.min + variable.max) / 2;
}

/**
 * Pontos de operação dos ensaios de laboratório que alguma relação move.
 *
 * Três relações terminam numa tag `LAB-`, e `LabVariable` não tem campo
 * numérico de alvo: a faixa dela é a prosa da §12.2 da pesquisa ("5,2 MD /
 * 2,4 CD"). Os três números abaixo são **lidos dessa prosa**, e a citação fica
 * ao lado para a conferência ser possível sem abrir a pesquisa.
 *
 * Fonte `B`: são os valores que a pesquisa dá. O que é nosso é só tê-los
 * transcrito para número.
 */
const LAB_OPERATING_POINTS: readonly { readonly tag: string; readonly value: number }[] = [
  // "5,2 MD / 2,4 CD" — tração MD de uma folha de 75 g/m²
  { tag: 'LAB-1206', value: 5.2 },
  // "≈ 2,17 (5,2 MD / 2,4 CD)"
  { tag: 'LAB-1206R', value: 2.17 },
  // "−10 a +10 (alvo 0)" — curl nulo é folha plana
  { tag: 'LAB-1212', value: 0 },
];

/**
 * Todos os pontos de operação, por tag.
 *
 * Inclui as 320 do catálogo e os três ensaios que as relações movem. Os outros
 * dez ensaios ficam de fora: nenhuma relação chega neles, então o simulador não
 * tem o que dizer sobre eles além do que a pesquisa já diz.
 */
function build(): Map<string, number> {
  const points = new Map<string, number>();

  for (const variable of PROCESS_CATALOG) {
    points.set(variable.tag, operatingPointOf(variable));
  }

  for (const { tag, value } of LAB_OPERATING_POINTS) {
    if (!LAB_VARIABLES.some((lab) => lab.tag === tag)) {
      throw new Error(
        `Ponto de operação declarado para ${tag}, que não é ensaio de laboratório. ` +
          'Ou a tag saiu da §12.2 da pesquisa, ou o ponto está no lugar errado.',
      );
    }
    points.set(tag, value);
  }

  return points;
}

const POINTS = build();

/** O ponto de operação de uma tag, ou `null` se ela não tem um. */
export function operatingPoint(tag: string): number | null {
  return POINTS.get(tag) ?? null;
}

/**
 * O ponto de operação, ou falha.
 *
 * A rede é montada na carga, e uma relação apontando para uma tag sem ponto de
 * operação é erro de edição — melhor falhar na importação do que simular um
 * processo em que uma variável não sabe onde está.
 */
export function requireOperatingPoint(tag: string): number {
  const point = operatingPoint(tag);
  if (point === null) {
    throw new Error(
      `A tag ${tag} não tem ponto de operação: não está no catálogo nem na lista dos ensaios ` +
        'que as relações movem.',
    );
  }
  return point;
}

/**
 * Amplitude do ruído de instrumento de uma tag, como desvio padrão.
 *
 * **Sai do `excDev` do catálogo**, e isto é o fecho de um ciclo. O `excDev` é o
 * filtro de exceção do historiador: o quanto o valor precisa mudar para ser
 * considerado novidade. Ele existe porque todo instrumento tremelica, e foi
 * escolhido por tag justamente para separar o tremelique do sinal.
 *
 * Então dimensionar o ruído pelo `excDev` — metade dele como desvio, o que põe
 * ~95 % do ruído dentro da banda — faz o simulador e o historiador concordarem
 * por construção: o filtro descarta o ruído e passa o que é movimento de
 * verdade. Com um ruído escolhido à parte, uma das duas coisas estaria errada e
 * a taxa de compressão não significaria nada.
 *
 * Sem `excDev` no catálogo, o ruído é 0,1 % da faixa — pequeno o bastante para
 * não inventar alarme.
 */
export function instrumentNoiseSd(tag: string): number {
  const variable = processVariable(tag);
  if (!variable) return 0;

  const excDev = variable.compression.excDev;
  if (excDev !== null && excDev > 0) return excDev / 2;

  return (variable.max - variable.min) * 0.001;
}
