/**
 * Número em português, para o texto que o servidor escreve.
 *
 * A interface tem o `format.ts` dela, e a regra do projeto é que todo número
 * que aparece na tela passa por lá. Só que parte do texto que a tela mostra não
 * é formatada pela tela: o sintoma de uma nota de manutenção é uma frase que o
 * servidor escreve e grava, e a tela só a lê. `toFixed` e `String` deixavam
 * essa frase em formato inglês no meio de uma tela em português — "limite HH
 * (4.5), pior valor 5.85" numa coluna onde todo o resto usa vírgula.
 *
 * Então o pacote compartilhado tem a vírgula decimal, e quem escreve frase com
 * número usa esta função: a regra de apresentação continua num lugar só por
 * camada, e as duas camadas concordam.
 *
 * O ponto de milhar fica de fora de propósito. Aqui só passam grandezas de
 * processo — milímetros por segundo, graus, quilopascals — que não chegam aos
 * milhares; e um `Intl.NumberFormat` por chamada custaria mais que a conta.
 */
export function ptNumber(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '—';
  const fixed = Math.abs(value).toFixed(digits);
  // arredondar antes do sinal: −0,004 em duas casas é "0,00", nunca "−0,00"
  const zero = Number(fixed) === 0;
  const sign = value < 0 && !zero ? '−' : '';
  return `${sign}${fixed.replace('.', ',')}`;
}
