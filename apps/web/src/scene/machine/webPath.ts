import {
  CALENDER_NIP_Y_M,
  CALENDER_X_M,
  DRY_SECTION_WEB_Y_M,
  DRYER_BOTTOM_Y_M,
  DRYER_PITCH_M,
  DRYER_RADIUS_M,
  DRYER_TOP_Y_M,
  dryerPairX,
  POPE_DRUM_RADIUS_M,
  POPE_DRUM_Y_M,
  POPE_X_M,
  POST_DRYER_HOOD,
  POST_DRYER_PAIRS,
  POST_DRYER_X0_M,
  PRE_DRYER_HOOD,
  PRE_DRYER_PAIRS,
  PRE_DRYER_X0_M,
  PRESS_X_M,
  SCANNER_2_X_M,
  SIZER_X_M,
} from '@mp1/shared';
import { BufferGeometry, Float32BufferAttribute, Vector2 } from 'three';

/**
 * O caminho da folha pela máquina, gerado a partir do modelo.
 *
 * O papel não corre reto: ele abraça cada cilindro secador por cerca de 220°,
 * alternando entre a fileira de cima e a de baixo, e é esse serpenteio que seca
 * os dois lados. O caminho é uma polilinha no plano XY, depois esticada em Z
 * para virar a folha.
 */

/** Rolo guia na saída da pré-secagem, que leva a folha até a linha do papel. */
const PRE_EXIT_GUIDE = {
  x: PRE_DRYER_HOOD.to + 1.6,
  y: DRY_SECTION_WEB_Y_M - 0.32,
  radius: 0.32,
};

/** Rolo guia antes da calandra. */
const CALENDER_GUIDE = {
  x: CALENDER_X_M - 2.4,
  y: CALENDER_NIP_Y_M - 0.3,
  radius: 0.32,
};

/** Folga entre a superfície do cilindro e a folha, para ela não entrar no metal. */
const WEB_CLEARANCE_M = 0.02;

function arc(
  into: Vector2[],
  cx: number,
  cy: number,
  radius: number,
  fromDeg: number,
  toDeg: number,
  steps = 18,
): void {
  for (let i = 0; i <= steps; i += 1) {
    const deg = fromDeg + ((toDeg - fromDeg) * i) / steps;
    const rad = (deg * Math.PI) / 180;
    into.push(new Vector2(cx + Math.cos(rad) * radius, cy + Math.sin(rad) * radius));
  }
}

/** Serpenteia a folha por uma secagem, alternando cilindro de cima e de baixo. */
function serpentine(
  into: Vector2[],
  x0: number,
  pairs: number,
  { lastTopExitDeg }: { lastTopExitDeg: number },
): void {
  const wrapRadius = DRYER_RADIUS_M + WEB_CLEARANCE_M;

  for (let pair = 0; pair < pairs; pair += 1) {
    const x = dryerPairX(x0, pair);
    const isLast = pair === pairs - 1;

    arc(into, x.top, DRYER_TOP_Y_M, wrapRadius, 200, isLast ? lastTopExitDeg : -20);
    if (!isLast) arc(into, x.bottom, DRYER_BOTTOM_Y_M, wrapRadius, 160, 380);
  }
}

/**
 * O caminho completo da folha, da saída das prensas até o jumbo na enroladeira.
 */
export function dryWebPath(): Vector2[] {
  const path: Vector2[] = [];
  const at = (x: number, y: number) => path.push(new Vector2(x, y));

  // saída das prensas
  at(PRESS_X_M - 4, 5.0);
  at(PRESS_X_M, 5.15);

  // pré-secagem: sai do último cilindro superior subindo, para cair no rolo guia
  serpentine(path, PRE_DRYER_X0_M, PRE_DRYER_PAIRS, { lastTopExitDeg: 15 });

  // rolo guia → linha horizontal do papel, a 4,8 m
  arc(path, PRE_EXIT_GUIDE.x, PRE_EXIT_GUIDE.y, PRE_EXIT_GUIDE.radius, 160, 90, 6);

  // trecho reto: scanner 1 e nip do Speed Sizer
  at(SIZER_X_M - 1.2, DRY_SECTION_WEB_Y_M);
  at(SIZER_X_M + 1.2, DRY_SECTION_WEB_Y_M);
  at(POST_DRYER_X0_M - 1.6, DRY_SECTION_WEB_Y_M);

  serpentine(path, POST_DRYER_X0_M, POST_DRYER_PAIRS, { lastTopExitDeg: -20 });

  // descida para a calandra
  at(POST_DRYER_HOOD.to - 0.6, DRYER_BOTTOM_Y_M - 1.1);
  arc(path, CALENDER_GUIDE.x, CALENDER_GUIDE.y, CALENDER_GUIDE.radius, 250, 90, 8);
  at(CALENDER_X_M, CALENDER_NIP_Y_M);

  // scanner final → enroladeira
  at(SCANNER_2_X_M + 2.2, CALENDER_NIP_Y_M + 0.02);
  arc(path, POPE_X_M, POPE_DRUM_Y_M, POPE_DRUM_RADIUS_M + 0.02, 200, 90, 14);

  return path;
}

/**
 * As duas telas secadoras, que prensam a folha contra o cilindro.
 *
 * A de cima passa pelos cilindros superiores, a de baixo pelos inferiores, e
 * cada uma volta por um rolo esticador entre um cilindro e o seguinte.
 */
export function dryerFabricPaths(
  x0: number,
  pairs: number,
): {
  upper: Vector2[];
  lower: Vector2[];
} {
  const upper: Vector2[] = [];
  const lower: Vector2[] = [];
  const wrapRadius = DRYER_RADIUS_M + 0.07;

  for (let pair = 0; pair < pairs; pair += 1) {
    const x = dryerPairX(x0, pair);
    arc(upper, x.top, DRYER_TOP_Y_M, wrapRadius, 200, -20, 22);
    upper.push(new Vector2(x.top + DRYER_PITCH_M / 2, DRYER_TOP_Y_M + 1.65));
  }

  for (let pair = 0; pair < pairs; pair += 1) {
    const x = dryerPairX(x0, pair);
    arc(lower, x.bottom, DRYER_BOTTOM_Y_M, wrapRadius, 160, 380, 22);
    lower.push(new Vector2(x.bottom + DRYER_PITCH_M / 2, DRYER_BOTTOM_Y_M - 1.65));
  }

  return { upper, lower };
}

/**
 * Estica uma polilinha do plano XY em uma fita de largura constante.
 *
 * A coordenada U acompanha o comprimento percorrido, e não o índice do ponto,
 * para a textura do papel não esticar nas curvas em volta dos cilindros.
 */
export function ribbonGeometry(points: Vector2[], width: number, uScale = 4): BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let travelled = 0;

  points.forEach((point, i) => {
    const previous = points[i - 1];
    if (previous) travelled += point.distanceTo(previous);

    positions.push(point.x, point.y, -width / 2, point.x, point.y, width / 2);
    uvs.push(travelled / uScale, 0, travelled / uScale, 1);

    if (i > 0) {
      const base = (i - 1) * 2;
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
  });

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
