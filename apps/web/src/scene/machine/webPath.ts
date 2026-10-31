import {
  CALENDER_NIP_Y_M,
  CALENDER_X_M,
  DRY_SECTION_WEB_Y_M,
  DRYER_BOTTOM_Y_M,
  DRYER_PITCH_M,
  DRYER_RADIUS_M,
  DRYER_TOP_Y_M,
  dryerPairX,
  FORMING_ROLLS,
  FORMING_TRANSFER_INDEX,
  HEADBOX,
  POPE_DRUM_RADIUS_M,
  POPE_DRUM_Y_M,
  POPE_X_M,
  POST_DRYER_HOOD,
  POST_DRYER_PAIRS,
  POST_DRYER_X0_M,
  PRE_DRYER_HOOD,
  PRE_DRYER_PAIRS,
  PRE_DRYER_X0_M,
  PRESS_NIPS,
  SCANNER_2_X_M,
  SIZER_X_M,
  type WetRoll,
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

/** Passos do arco em volta do rolo de transferência, no formador. */
const WET_ARC_STEPS = 11;

/** Folga entre o rolo e o tecido que o abraça — feltro e tela correm por fora. */
const FABRIC_CLEARANCE_M = 0.03;

/** Pontos amostrados no contorno de cada rolo, ao montar a envoltória de um tecido. */
const HULL_SAMPLES = 64;

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
 * O caminho completo da folha, do jato na tela até o jumbo na enroladeira.
 *
 * É uma polilinha só, de ponta a ponta, e isso é de propósito: a folha é uma
 * folha. Cortá-la em "parte úmida" e "parte seca" daria duas fitas com uma
 * emenda visível e duas texturas correndo fora de fase.
 */
export function webPath(): Vector2[] {
  const path: Vector2[] = [];
  const at = (x: number, y: number) => path.push(new Vector2(x, y));

  // jato da caixa de entrada até o rolo de peito
  const breast = FORMING_ROLLS[0];
  const transfer = FORMING_ROLLS[FORMING_TRANSFER_INDEX];
  const second = FORMING_ROLLS[1];
  if (!breast || !transfer || !second) throw new Error('formador sem rolos no modelo');

  at(HEADBOX.jet.x, HEADBOX.jet.y);

  // entre as duas telas: a folha corre encostada na tela inferior
  at(breast.x, breast.y + breast.radiusM + WEB_CLEARANCE_M);
  at(second.x, second.y + second.radiusM + WEB_CLEARANCE_M);

  // abraça o rolo de transferência e sai para as prensas
  arc(path, transfer.x, transfer.y, transfer.radiusM + WEB_CLEARANCE_M, 270, 410, WET_ARC_STEPS);

  // pelos três nips de prensa, que é onde a água sai por compressão
  for (const press of PRESS_NIPS) at(press.x, press.nipY);
  at(PRE_DRYER_HOOD.from - 1.2, PRESS_NIPS[PRESS_NIPS.length - 1]?.nipY ?? 5.4);

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
 * O laço fechado que um tecido esticado descreve em volta de um grupo de rolos.
 *
 * Um feltro ou uma tela não é uma curva arbitrária: ele é puxado, e um tecido
 * puxado em volta de vários rolos assume exatamente a **envoltória convexa**
 * deles — corre reto entre dois rolos e se enrola no contorno de cada um. Então
 * em vez de desenhar o circuito à mão, rolo por rolo, basta amostrar o contorno
 * de cada um e ficar com a casca convexa de todos os pontos.
 *
 * A vantagem prática aparece ao mudar o modelo: mover um rolo guia reacomoda o
 * tecido inteiro sozinho, sem ninguém reescrever o caminho dele.
 */
export function fabricLoop(rolls: readonly WetRoll[], clearanceM = FABRIC_CLEARANCE_M): Vector2[] {
  const points: [number, number][] = [];

  for (const roll of rolls) {
    for (let i = 0; i < HULL_SAMPLES; i += 1) {
      const angle = (i / HULL_SAMPLES) * Math.PI * 2;
      points.push([
        roll.x + Math.cos(angle) * (roll.radiusM + clearanceM),
        roll.y + Math.sin(angle) * (roll.radiusM + clearanceM),
      ]);
    }
  }

  // varredura de Andrew: ordena por x e monta as duas cascas
  points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  const cross = (o: [number, number], a: [number, number], b: [number, number]): number =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

  const half = (ordered: [number, number][]): [number, number][] => {
    const chain: [number, number][] = [];
    for (const point of ordered) {
      while (chain.length > 1) {
        const last = chain[chain.length - 1];
        const previous = chain[chain.length - 2];
        if (!last || !previous || cross(previous, last, point) > 0) break;
        chain.pop();
      }
      chain.push(point);
    }
    return chain;
  };

  const lower = half(points);
  const upper = half([...points].reverse());
  const loop = [...lower.slice(0, -1), ...upper.slice(0, -1)];

  const first = loop[0];
  if (!first) return [];

  // fecha o laço: o tecido é um circuito, não uma tira com duas pontas
  return [...loop, first].map(([x, y]) => new Vector2(x, y));
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
