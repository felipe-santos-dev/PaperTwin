import { WEB_WIDTH_M } from '../machine/geometry';
import type { FopdtRelation } from './relation-types';
import { CSV_RELATIONS } from './relations.generated';

/**
 * As relações causa-efeito do simulador.
 *
 * Os coeficientes vêm da lista base (`relations.generated.ts`). Este arquivo é
 * a parte escrita à mão: herda as relações que a pesquisa deixou implícitas,
 * guarda a geometria do controle CD e responde as consultas.
 */

/**
 * Nº de zonas do controle CD.
 *
 * **Suposição.** O catálogo diz `vetor de 120–160 zonas` para a `ZIC-205`, uma
 * faixa e não um número — então este 140 é escolha nossa, e não sai da pesquisa
 * B. Ele importa porque converte o espalhamento lateral de milímetros para
 * zonas: com os 8 m de folha, 140 zonas dão ~57 mm cada, e o σ de 45 mm fica
 * em ~0,79 zona. Um nº de zonas diferente muda o quanto o vizinho sente.
 */
export const CD_ZONE_COUNT = 140;

/**
 * Espalhamento lateral do jato de diluição, em milímetros.
 *
 * Da observação da relação 11: a correção numa zona não fica contida nela,
 * vaza para os lados com forma gaussiana de σ ≈ 45 mm.
 */
export const CD_SIGMA_MM = 45;

/** Largura de uma zona CD, em milímetros. */
export const CD_ZONE_WIDTH_MM = (WEB_WIDTH_M * 1000) / CD_ZONE_COUNT;

/**
 * Relações que a pesquisa deixou na observação em vez de numa linha.
 *
 * A relação 5 mede `PIC-711 → AIC-903` e a observação manda aplicar o mesmo a
 * `PIC-712`. Herdar explicitamente é o que faz o simulador responder ao vapor
 * do G6: se ficasse só na prosa, mexer na PIC-712 não mudaria a umidade final.
 *
 * Os coeficientes são copiados da relação de origem em tempo de carga, e não
 * escritos aqui, para não haver dois números para manter. A fonte cai para
 * `assumed`: a pesquisa mediu o degrau na PIC-711, não na PIC-712.
 */
const INHERITED: readonly { readonly id: string; readonly from: string; readonly input: string }[] =
  [{ id: '5d', from: '5', input: 'PIC-712' }];

function inherit(): FopdtRelation[] {
  return INHERITED.map(({ id, from, input }) => {
    const origin = CSV_RELATIONS.find((relation) => relation.id === from);
    if (!origin) {
      throw new Error(
        `Relação ${id} herda da ${from}, que não existe mais em relacoes-fopdt.csv. ` +
          'Ou a linha de origem voltou, ou esta herança sai.',
      );
    }

    return {
      ...origin,
      id,
      input,
      note: `Herdada da relação ${from} (${origin.input}), como manda a observação dela.`,
      derivedFrom: from,
      source: 'assumed',
    };
  });
}

/** Todas as relações: as do CSV e as herdadas. */
export const PROCESS_RELATIONS: readonly FopdtRelation[] = Object.freeze([
  ...CSV_RELATIONS,
  ...inherit(),
]);

const BY_ID = new Map(PROCESS_RELATIONS.map((relation) => [relation.id, relation]));

/** Busca uma relação pelo id, ou `null`. */
export function relation(id: string): FopdtRelation | null {
  return BY_ID.get(id) ?? null;
}

/**
 * As relações que chegam numa saída.
 *
 * É esta lista que o simulador soma por superposição: a gramatura (`AIC-902`)
 * recebe quatro — vazão de massa, consistência, velocidade e as zonas de
 * diluição.
 */
export function relationsForOutput(tag: string): FopdtRelation[] {
  return PROCESS_RELATIONS.filter((item) => item.output === tag);
}

/** As relações que saem de uma entrada. */
export function relationsForInput(tag: string): FopdtRelation[] {
  return PROCESS_RELATIONS.filter((item) => item.input === tag);
}

/** As relações zona a zona, do controle CD. */
export function zonedRelations(): FopdtRelation[] {
  return PROCESS_RELATIONS.filter((item) => item.zoned);
}

/** As saídas que alguma relação move, sem repetição. */
export function drivenOutputs(): string[] {
  return [...new Set(PROCESS_RELATIONS.map((item) => item.output))];
}
