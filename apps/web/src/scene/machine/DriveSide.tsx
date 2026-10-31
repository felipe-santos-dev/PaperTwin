import { useLayoutEffect, useMemo, useRef } from 'react';
import { BoxGeometry, CylinderGeometry, type InstancedMesh, type Material, Object3D } from 'three';
import { DRIVEN_ROLL_MIN_RADIUS_M, type MachineAsset } from '@mp1/shared';
import { materials } from '../materials';

/**
 * O lado acionamento: cardã, redutor e motor de cada rolo principal.
 *
 * Esta é a metade da máquina que ninguém fotografa e por onde nada passa a pé.
 * Desenhá-la muda o que a cena diz: os cilindros deixam de ser tubos girando
 * sozinhos e passam a ser acionados por alguma coisa — que é de onde vem a
 * velocidade, e de onde vem a vibração que a tela de Mancais acompanha.
 *
 * Quem ganha acionamento sai do modelo, pelo raio: um rolo a partir de
 * `DRIVEN_ROLL_MIN_RADIUS_M` tem motor próprio, abaixo disso gira puxado pela
 * folha ou pela tela. Nenhuma lista escrita à mão — acrescentar um par de
 * cilindros no modelo acrescenta dois acionamentos aqui.
 *
 * ## As fileiras
 *
 * Trinta e seis cilindros secadores a 2,2 m de passo não cabem lado a lado:
 * um motor tem quase 1 m de diâmetro com a base. Então os acionamentos são
 * distribuídos em fileiras afastando-se da máquina, e um rolo só vai para a
 * fileira seguinte quando a sua já tem vizinho a menos de 1 m. É o que se vê
 * numa sala de acionamento de verdade, e cai naturalmente da geometria.
 *
 * Tudo vai em malha instanciada: são cerca de setecentas peças, e uma chamada
 * de desenho por tipo de peça em vez de uma por peça é a diferença entre a cena
 * rodar e a cena travar num laptop sem placa dedicada.
 */

export interface DriveSideProps {
  /** Todos os ativos da máquina; os acionados são escolhidos daqui. */
  readonly assets: readonly MachineAsset[];
  readonly halfWidth: number;
  readonly webWidth: number;
}

/** Altura da eletrocalha pendurada no teto, de onde descem os cabos. */
const CABLE_TRAY_Y_M = 12.2;

/** Afastamento entre uma fileira de acionamentos e a seguinte. */
const LANE_PITCH_M = 2.4;

/** Distância mínima em X entre dois acionamentos da mesma fileira. */
const LANE_CLEARANCE_M = 1;

type Piece = readonly [x: number, y: number, z: number, sx: number, sy: number, sz: number];

interface Drive {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  /** Centro do conjunto motor-redutor em Z, já afastado da máquina. */
  readonly z: number;
  /** Escala do conjunto: um cilindro secador puxa um motor maior que um rolo guia. */
  readonly scale: number;
  /** Altura da base do conjunto. */
  readonly baseY: number;
}

/**
 * Monta um conjunto por rolo acionado, distribuído em fileiras.
 *
 * Os rolos são ordenados por altura antes de receber fileira: assim os de baixo
 * ficam na fileira mais próxima da máquina e os de cima nas de trás, o que
 * deixa os cardãs cruzando menos uns com os outros.
 */
function layout(assets: readonly MachineAsset[], halfWidth: number): Drive[] {
  const driven = assets
    .filter((asset) => asset.radius !== null && asset.radius >= DRIVEN_ROLL_MIN_RADIUS_M)
    .map((asset) => ({ x: asset.position[0], y: asset.position[1], radius: asset.radius ?? 0 }))
    .sort((a, b) => a.y - b.y || a.x - b.x);

  const wall = -(halfWidth + 1.1);
  const placed: { x: number; lane: number }[] = [];

  return driven.map((roll) => {
    let lane = 0;
    while (placed.some((p) => p.lane === lane && Math.abs(p.x - roll.x) < LANE_CLEARANCE_M)) {
      lane += 1;
    }
    placed.push({ x: roll.x, lane });

    const scale = Math.min(1.15, 0.62 + roll.radius * 0.35);
    return {
      ...roll,
      scale,
      z: wall - 1.7 - lane * LANE_PITCH_M,
      baseY: roll.y - 0.47 * scale,
    };
  });
}

/** Uma malha instanciada: uma chamada de desenho para todas as peças iguais. */
function Pieces({
  geometry,
  material,
  pieces,
  castShadow = true,
}: {
  readonly geometry: 'cylinder' | 'box';
  readonly material: Material;
  readonly pieces: readonly Piece[];
  readonly castShadow?: boolean;
}) {
  const mesh = useRef<InstancedMesh>(null);

  /** Cilindro unitário deitado em Z, para a escala ser aplicada direto. */
  const shape = useMemo(
    () =>
      geometry === 'cylinder'
        ? new CylinderGeometry(1, 1, 1, 28).rotateX(Math.PI / 2)
        : new BoxGeometry(1, 1, 1),
    [geometry],
  );

  useLayoutEffect(() => {
    const target = mesh.current;
    if (!target) return;

    const dummy = new Object3D();
    pieces.forEach((piece, i) => {
      const [x, y, z, sx, sy, sz] = piece;
      dummy.position.set(x, y, z);
      dummy.scale.set(sx, sy, sz);
      dummy.updateMatrix();
      target.setMatrixAt(i, dummy.matrix);
    });
    target.instanceMatrix.needsUpdate = true;
    target.count = pieces.length;
  }, [pieces]);

  if (pieces.length === 0) return null;

  return (
    <instancedMesh
      ref={mesh}
      args={[shape, material, pieces.length]}
      castShadow={castShadow}
      receiveShadow
    />
  );
}

export function DriveSide({ assets, halfWidth, webWidth }: DriveSideProps) {
  const m = materials();
  const drives = useMemo(() => layout(assets, halfWidth), [assets, halfWidth]);

  const parts = useMemo(() => {
    const shaft: Piece[] = [];
    const yoke: Piece[] = [];
    const coupling: Piece[] = [];
    const gearbox: Piece[] = [];
    const motor: Piece[] = [];
    const ribs: Piece[] = [];
    const fan: Piece[] = [];
    const feet: Piece[] = [];
    const terminal: Piece[] = [];
    const plate: Piece[] = [];
    const cable: Piece[] = [];
    const column: Piece[] = [];
    const beam: Piece[] = [];
    const footing: Piece[] = [];

    /** Z da ponta do eixo junto ao mancal do lado acionamento. */
    const atBearing = -(webWidth / 2 + 0.5);
    const lanes = new Map<number, { from: number; to: number }>();

    for (const drive of drives) {
      const { x, y, z, scale, baseY } = drive;
      const motorRadius = 0.4 * scale;
      const couplingZ = z + 1.25;

      // cardã: do mancal até a proteção do acoplamento
      shaft.push([
        x,
        y,
        (atBearing + couplingZ) / 2,
        0.09 * scale,
        0.09 * scale,
        atBearing - couplingZ,
      ]);
      for (const zz of [atBearing - 0.2, couplingZ + 0.15]) {
        yoke.push([x, y, zz, 0.2 * scale, 0.2 * scale, 0.16]);
      }

      coupling.push([x, y, z + 1.02, 0.62 * scale, 0.62 * scale, 0.42]);

      // redutor: apoiado na base, encostado no acoplamento
      const gearTop = y + 0.42 * scale;
      gearbox.push([x, (gearTop + baseY) / 2, z + 0.5, 0.9 * scale, gearTop - baseY, 0.62]);

      motor.push([x, y, z - 0.32, motorRadius, motorRadius, 1.1]);
      for (let i = 0; i < 7; i += 1) {
        ribs.push([x, y, z + 0.14 - i * 0.15, motorRadius * 1.09, motorRadius * 1.09, 0.045]);
      }
      fan.push([x, y, z - 1, motorRadius * 0.94, motorRadius * 0.94, 0.26]);
      feet.push([
        x,
        (baseY + y - motorRadius * 0.55) / 2,
        z - 0.32,
        motorRadius * 1.5,
        y - motorRadius * 0.55 - baseY,
        0.95,
      ]);
      terminal.push([x, y + motorRadius + 0.12, z - 0.18, 0.32, 0.24, 0.36]);
      plate.push([x, baseY - 0.05, z - 0.1, 1.05 * scale, 0.1, 2.3]);

      // cabo subindo até a eletrocalha
      const cableFrom = y + motorRadius + 0.24;
      cable.push([
        x,
        (cableFrom + CABLE_TRAY_Y_M) / 2,
        z - 0.18,
        0.06,
        CABLE_TRAY_Y_M - cableFrom,
        0.06,
      ]);

      // pedestal: duas colunas em perfil I, travessa e sapata
      const height = baseY - 0.1;
      if (height > 0.4) {
        for (const columnZ of [z - 0.85, z + 0.65]) {
          column.push([x, height / 2, columnZ, 0.3, height, 0.08]);
          column.push([x - 0.13, height / 2, columnZ, 0.04, height, 0.3]);
          column.push([x + 0.13, height / 2, columnZ, 0.04, height, 0.3]);
          footing.push([x, 0.15, columnZ, 0.7, 0.3, 0.7]);
        }
        beam.push([x, height - 0.15, z - 0.1, 0.32, 0.3, 2.3]);
      }

      const lane = lanes.get(z);
      if (lane) {
        lanes.set(z, { from: Math.min(lane.from, x), to: Math.max(lane.to, x) });
      } else {
        lanes.set(z, { from: x, to: x });
      }
    }

    // eletrocalha de cada fileira, com os seus tirantes
    const tray: Piece[] = [];
    const hanger: Piece[] = [];
    for (const [z, span] of lanes) {
      const from = span.from - 1.5;
      const to = span.to + 1.5;
      tray.push([(from + to) / 2, CABLE_TRAY_Y_M, z - 0.08, to - from, 0.12, 0.7]);
      for (let x = from; x <= to; x += 9) {
        hanger.push([x, (CABLE_TRAY_Y_M + 19) / 2, z - 0.08, 0.08, 19 - CABLE_TRAY_Y_M, 0.08]);
      }
    }

    return {
      shaft,
      yoke,
      coupling,
      gearbox,
      motor,
      ribs,
      fan,
      feet,
      terminal,
      plate,
      cable,
      column,
      beam,
      footing,
      tray,
      hanger,
    };
  }, [drives, webWidth]);

  return (
    <group>
      <Pieces geometry="cylinder" material={m.steel} pieces={parts.shaft} />
      <Pieces geometry="cylinder" material={m.driveCoupling} pieces={parts.yoke} />
      <Pieces geometry="box" material={m.yellow} pieces={parts.coupling} />
      <Pieces geometry="box" material={m.gearbox} pieces={parts.gearbox} />
      <Pieces geometry="cylinder" material={m.motor} pieces={parts.motor} />
      <Pieces geometry="cylinder" material={m.motor} pieces={parts.ribs} castShadow={false} />
      <Pieces geometry="cylinder" material={m.hose} pieces={parts.fan} />
      <Pieces geometry="box" material={m.motor} pieces={parts.feet} />
      <Pieces geometry="box" material={m.motor} pieces={parts.terminal} castShadow={false} />
      <Pieces geometry="box" material={m.frameDark} pieces={parts.plate} />
      <Pieces geometry="box" material={m.hose} pieces={parts.cable} castShadow={false} />
      <Pieces geometry="box" material={m.driveSteel} pieces={parts.column} />
      <Pieces geometry="box" material={m.driveSteel} pieces={parts.beam} />
      <Pieces geometry="box" material={m.concreteBase} pieces={parts.footing} />
      <Pieces geometry="box" material={m.driveTray} pieces={parts.tray} castShadow={false} />
      <Pieces geometry="box" material={m.frameDark} pieces={parts.hanger} castShadow={false} />
    </group>
  );
}
