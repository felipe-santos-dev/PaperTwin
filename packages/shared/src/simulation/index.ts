/**
 * O núcleo puro do simulador, fora da API.
 *
 * Aqui mora o que calcula processo e não sabe nada de servidor: a grade de
 * passos, o modelo de primeira ordem com tempo morto, o ruído por posição, o
 * ponto de operação, o PI com trava de integral, o espalhamento do controle CD
 * e o motor que junta tudo.
 *
 * ## Por que num subcaminho, e não no barril do pacote
 *
 * `@mp1/shared` é importado por todas as telas, e o que entra no barril entra
 * no pedaço inicial da web. O motor não tem o que fazer lá: quem o usa é a API
 * e, desde a Fase 4, um Web Worker — os dois importam `@mp1/shared/simulation`
 * de propósito, e o empacotador mantém o motor no pedaço de quem pediu.
 *
 * ## Por que ele saiu da API
 *
 * Porque o "e se" roda nos dois lados. Com a API no ar, a previsão é calculada
 * no servidor; no modo de demonstração, no navegador, a partir do estado do
 * instantâneo. Duas implementações do mesmo cálculo divergiriam na terceira
 * casa decimal e depois na primeira — então é um núcleo só, e um teste compara
 * as duas trajetórias.
 */

export * from './autonomous';
export * from './cd-profile';
export * from './clock';
export * from './fopdt';
export * from './noise';
export * from './operating-point';
export * from './pi';
export * from './process-engine';
export * from './what-if';
