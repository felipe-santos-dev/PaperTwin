/**
 * As entidades de operação da MP1.
 *
 * Oito entidades, da seção "Entidades de operação" da LISTA-BASE: turno, bobina
 * jumbo, quebra de folha, troca de gramatura, ronda, nota de manutenção,
 * alteração de setpoint e alarme.
 *
 * São o que distingue um gêmeo digital de um gráfico de tendência. As tags
 * dizem o que o processo está fazendo; estas entidades dizem o que aconteceu no
 * turno — qual bobina foi rebaixada, por que a folha quebrou, quem mexeu no
 * setpoint e por quê, o que a ronda viu que o instrumento não vê.
 *
 * Cada módulo carrega a sua proveniência: o que veio da lista e o que é
 * suposição nossa, com a razão.
 */

export * from './alarm';
export * from './grade-change';
export * from './maintenance';
export * from './provenance';
export * from './reel';
export * from './round';
export * from './setpoint';
export * from './shift';
export * from './web-break';
