import { processVariable } from '../process/catalog';
import { upstreamOf } from '../process/graph';
import { PRECURSOR_WINDOW_S } from './web-break';

/**
 * O replay de uma quebra: o que cada tag fez nos 10 min anteriores.
 *
 * Uma lista de quebras com hora e causa é um livro de ocorrências. O que
 * transforma isso em diagnóstico é a pergunta "o que se mexeu primeiro" — e
 * essa pergunta só tem resposta honesta se "mexeu" tiver uma régua.
 *
 * ## A régua: duas, e vale a maior
 *
 * O desvio é medido contra a **hora anterior à janela**, não contra o alvo do
 * catálogo: uma máquina que já estava rodando acima do alvo não está
 * "desviando", está onde estava. E o tamanho que conta como desvio sai do maior
 * entre duas réguas:
 *
 * - o `excDev` do catálogo, que é a banda em que o instrumento tremelica;
 * - o desvio-padrão da própria hora anterior, que é o quanto aquela tag andava
 *   naquele turno.
 *
 * Só o `excDev` deixaria qualquer tag agitada parecer precursora de tudo. Só a
 * dispersão da base deixaria uma tag parada demais disparar com um décimo de
 * ruído. A maior das duas é a que não mente nos dois casos.
 *
 * ## Origem e consequência
 *
 * Numa rede de relações, quase tudo se mexe quando qualquer coisa se mexe. A
 * lista ordenada por tempo não basta: a gramatura desviar depois da velocidade
 * é a velocidade chegando na gramatura, não um segundo problema. Então uma tag
 * que desvia **depois** de outra da qual ela depende no grafo é marcada como
 * consequência, e sai da disputa pela origem.
 *
 * O que fica é uma afirmação pequena e verdadeira: "esta foi a primeira que se
 * mexeu, e nada do que ela depende tinha se mexido antes". Não é a causa — a
 * causa pode estar fora do catálogo, num rolo sujo ou numa emenda mal feita. A
 * tela diz "primeiro desvio", e não "causa", de propósito.
 */

/** Quanto tempo de linha de base, em segundos: a hora anterior à janela. */
export const BASELINE_WINDOW_S = 3600;

/**
 * Quantas réguas um sinal precisa andar para contar como desvio.
 *
 * **Suposição**, e a mesma que a colheita de precursores já usava: três vezes a
 * banda de ruído é movimento que não é ruído. Abaixo disso, metade do turno
 * apareceria na lista.
 */
export const DEVIATION_SIGMAS = 3;

/**
 * As tags que a investigação de uma quebra olha.
 *
 * Não é o catálogo inteiro: trezentas séries por quebra é consulta demais para
 * uma tela, e a maioria delas não tem relação com a folha arrebentar. É a
 * cadeia que importa — as malhas que os cenários de quebra perturbam, a
 * umidade nos três pontos em que ela é medida, a gramatura, o estiramento entre
 * seções e a velocidade.
 *
 * A lista é **declarada e fixa**, e isso é de propósito: ela não pode depender
 * de qual malha o cenário perturbou, senão o diagnóstico estaria olhando a
 * resposta antes de fazer a conta.
 */
export const BREAK_WATCH_TAGS: readonly string[] = [
  'SIC-1104',
  'AIC-902',
  'AIC-901',
  'AIC-903',
  'AI-407',
  'WIC-401',
  'PDIC-524',
  'PDIC-721',
  'PIC-604A',
  'SDIC-703',
];

/** Uma amostra lida do arquivo: instante em ms e valor. */
export interface ReplaySample {
  readonly t: number;
  readonly v: number;
}

/** O que o historiador devolveu para uma tag, nas duas janelas. */
export interface TagWindow {
  readonly tag: string;
  /** A hora anterior à janela da quebra. */
  readonly baseline: readonly ReplaySample[];
  /** Os 10 min anteriores à quebra, do mais antigo para o mais recente. */
  readonly window: readonly ReplaySample[];
}

export interface BreakDeviation {
  readonly tag: string;
  readonly name: string;
  readonly unit: string;
  /** Segundos antes da quebra em que o desvio apareceu. */
  readonly leadTimeS: number;
  readonly direction: 'subiu' | 'caiu';
  /** O desvio no instante em que passou da régua, na unidade da tag. */
  readonly size: number;
  /** O maior desvio da janela inteira, com sinal. */
  readonly peak: number;
  /** Quantas réguas o desvio do instante andou. */
  readonly sigmas: number;
  /** A média da hora anterior, de onde o desvio é contado. */
  readonly baseline: number;
  /** A régua usada: a maior entre o `excDev` e a dispersão da base. */
  readonly ruler: number;
  /** De quem este desvio é consequência, se for de alguém. */
  readonly consequenceOf: string | null;
}

export interface BreakReplay {
  /** O instante da quebra, em ms. */
  readonly breakAt: number;
  readonly windowS: number;
  /** Quem saiu do normal, do primeiro ao último. */
  readonly deviations: readonly BreakDeviation[];
  /** Quem foi olhado e não saiu do normal. */
  readonly quiet: readonly string[];
  /** Quem foi olhado e não tinha série para julgar. */
  readonly unknown: readonly string[];
  /**
   * O primeiro desvio que não é consequência de outro.
   *
   * `null` quando nada saiu do normal — e aí a tela diz isso, em vez de eleger
   * o menos inocente da lista.
   */
  readonly first: BreakDeviation | null;
}

export interface DiagnoseOptions {
  readonly breakAt: number;
  readonly series: readonly TagWindow[];
  /** O tamanho da janela, em segundos. O padrão é a da LISTA-BASE. */
  readonly windowS?: number;
}

/** Média e desvio-padrão populacional de uma série. */
function estatística(amostras: readonly ReplaySample[]): { média: number; sd: number } | null {
  if (amostras.length === 0) return null;
  const média = amostras.reduce((total, item) => total + item.v, 0) / amostras.length;
  if (amostras.length < 2) return { média, sd: 0 };
  const variância =
    amostras.reduce((total, item) => total + (item.v - média) ** 2, 0) / amostras.length;
  return { média, sd: Math.sqrt(variância) };
}

export function diagnoseBreak(options: DiagnoseOptions): BreakReplay {
  const windowS = options.windowS ?? PRECURSOR_WINDOW_S;
  const desvios: BreakDeviation[] = [];
  const quietos: string[] = [];
  const semSérie: string[] = [];

  for (const série of options.series) {
    const variable = processVariable(série.tag);
    const base = estatística(série.baseline);

    if (!variable || base === null || série.window.length === 0) {
      semSérie.push(série.tag);
      continue;
    }

    const ruler = Math.max(variable.compression.excDev ?? 0, base.sd);
    if (!(ruler > 0)) {
      semSérie.push(série.tag);
      continue;
    }

    const limiar = ruler * DEVIATION_SIGMAS;
    const primeiro = série.window.find((amostra) => Math.abs(amostra.v - base.média) > limiar);

    if (!primeiro) {
      quietos.push(série.tag);
      continue;
    }

    let pico = 0;
    for (const amostra of série.window) {
      const diferença = amostra.v - base.média;
      if (Math.abs(diferença) > Math.abs(pico)) pico = diferença;
    }

    const desvio = primeiro.v - base.média;

    desvios.push({
      tag: série.tag,
      name: variable.name,
      unit: variable.unit,
      leadTimeS: Math.round((options.breakAt - primeiro.t) / 1000),
      direction: desvio >= 0 ? 'subiu' : 'caiu',
      size: round(desvio),
      peak: round(pico),
      sigmas: round(Math.abs(desvio) / ruler),
      baseline: round(base.média),
      ruler: round(ruler),
      consequenceOf: null,
    });
  }

  // do primeiro que se mexeu para o último
  desvios.sort((a, b) => b.leadTimeS - a.leadTimeS);

  const comCausa = desvios.map((desvio) => {
    const antes = upstreamOf(desvio.tag);
    const origem = desvios.find(
      (candidato) => candidato.leadTimeS > desvio.leadTimeS && antes.has(candidato.tag),
    );
    return { ...desvio, consequenceOf: origem?.tag ?? null };
  });

  return {
    breakAt: options.breakAt,
    windowS,
    deviations: comCausa,
    quiet: quietos,
    unknown: semSérie,
    first: comCausa.find((desvio) => desvio.consequenceOf === null) ?? null,
  };
}

/**
 * A origem de uma lista de tags já ordenada do mais antigo para o mais recente.
 *
 * É a mesma regra que `diagnoseBreak` aplica, sobre o que ficou gravado em vez
 * de sobre as séries: a primeira tag que não depende de nenhuma anterior. Serve
 * para comparar quebras passadas sem reler o arquivo de cada uma — e, por ser a
 * mesma regra, a comparação não discorda da tela.
 */
export function originOf(tagsInOrder: readonly string[]): string | null {
  for (const [índice, tag] of tagsInOrder.entries()) {
    const antes = upstreamOf(tag);
    const temPai = tagsInOrder.slice(0, índice).some((anterior) => antes.has(anterior));
    if (!temPai) return tag;
  }
  return null;
}

/** Três casas: a conta não é mais precisa que o instrumento. */
function round(value: number): number {
  return Number(value.toFixed(3));
}
