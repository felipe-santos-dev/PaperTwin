/**
 * A sala de máquinas em volta da MP1, em metros.
 *
 * Não é geometria da máquina — é o prédio — e por isso mora aqui, e não em
 * `machine/geometry.ts`, que é a fonte das tags e das medidas do equipamento.
 * Os valores são os do protótipo final.
 */

/**
 * Altura do teto.
 *
 * Trinta e quatro metros, que é o que uma sala de máquinas de papel tem: a
 * capota da secagem sobe 10 m, o formador sobe 11, e ainda precisa caber a
 * ponte rolante por cima de tudo. O valor importa para além da aparência —
 * é ele que decide de onde a câmera consegue olhar a máquina inteira.
 */
export const CEILING_Y_M = 34;

/** Altura da eletrocalha pendurada no teto, de onde descem os cabos. */
export const CABLE_TRAY_Y_M = 12.2;

/** Altura do piso do porão, onde o refugo cai quando a folha quebra. */
export const PIT_FLOOR_Y_M = -6;
