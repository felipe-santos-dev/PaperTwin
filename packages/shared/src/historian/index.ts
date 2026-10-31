/**
 * O historiador, no modelo do PI.
 *
 * Um ponto por tag, com o id numérico que o arquivo guarda no lugar da tag; um
 * filtro de exceção na coleta e uma porta oscilante no arquivamento, com os
 * parâmetros (`excDev` e `compDev`) saindo coluna por coluna do catálogo da
 * lista base; e uma retenção dimensionada para os ~0,5 GB do banco gratuito.
 *
 * O que está aqui é o que a API e a web precisam saber em comum: os tipos, a
 * lista de pontos, os algoritmos e a conta da retenção. A gravação e as
 * consultas ficam na API.
 */

export * from './compression';
export * from './interpolation';
export * from './points';
export * from './retention';
export * from './types';
