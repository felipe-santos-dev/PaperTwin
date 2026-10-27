import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { HoodSpan } from '@mp1/shared';
import type { Group } from 'three';
import { materials } from '../materials';
import { useScene } from '../sceneState';

/**
 * A capota de uma secagem: teto, parede de trás, fechamento das pontas e a
 * fileira de portas do lado operação.
 *
 * As portas abrem para cima, com o pivô no topo, e não todas ao mesmo tempo —
 * cada uma atrasa um pouco em relação à anterior ao longo da máquina, o que dá
 * a impressão de peso.
 */

export interface HoodProps {
  readonly span: HoodSpan;
  readonly halfWidth: number;
  /** Largura alvo de cada porta; o vão é dividido no inteiro mais próximo. */
  readonly doorWidth?: number;
}

const HOOD_HEIGHT = 10.5;
const HOOD_CENTER_Y = 5.25;
const ROOF_Y = 10.3;
const DOOR_PIVOT_Y = 8.5;
const DOOR_HEIGHT = 8.1;

export function Hood({ span, halfWidth, doorWidth = 3.6 }: HoodProps) {
  const m = materials();
  const { doorsOpen, playing } = useScene();

  const length = span.to - span.from;
  const centerX = (span.from + span.to) / 2;
  const z = halfWidth + 1.1;

  const doors = useMemo(() => {
    const count = Math.max(1, Math.round(length / doorWidth));
    const width = length / count;
    return Array.from({ length: count }, (_, i) => ({
      x: span.from + width / 2 + i * width,
      width,
    }));
  }, [length, doorWidth, span.from]);

  const pivots = useRef<(Group | null)[]>([]);
  const opening = useRef(doorsOpen ? 1 : 0);

  useFrame((_, delta) => {
    const target = doorsOpen ? 1 : 0;
    if (playing || opening.current !== target) {
      opening.current += (target - opening.current) * Math.min(1, delta * 2.2);
    }

    pivots.current.forEach((pivot, i) => {
      const door = doors[i];
      if (!pivot || !door) return;
      // atraso ao longo da máquina, para as portas não se moverem em bloco
      const lag = (door.x - span.from) * 0.004;
      const k = Math.max(0, Math.min(1, opening.current * 1.15 - lag));
      const eased = k * k * (3 - 2 * k);
      pivot.rotation.x = -eased * 1.85;
    });
  });

  return (
    <group>
      <mesh material={m.hoodWall} position={[centerX, ROOF_Y, 0]} castShadow receiveShadow>
        <boxGeometry args={[length, 0.4, 2 * z]} />
      </mesh>
      <mesh material={m.hoodWall} position={[centerX, HOOD_CENTER_Y, -z]} castShadow receiveShadow>
        <boxGeometry args={[length, HOOD_HEIGHT, 0.3]} />
      </mesh>
      {/* viga acima das portas */}
      <mesh material={m.hoodWall} position={[centerX, 9.4, z]} castShadow>
        <boxGeometry args={[length, 1.8, 0.3]} />
      </mesh>
      {[span.from, span.to].map((x) => (
        <mesh key={x} material={m.hoodWall} position={[x, HOOD_CENTER_Y, 0]} castShadow>
          <boxGeometry args={[0.3, HOOD_HEIGHT, 2 * z]} />
        </mesh>
      ))}

      {doors.map((door, i) => (
        <group
          key={door.x}
          ref={(node) => {
            pivots.current[i] = node;
          }}
          position={[door.x, DOOR_PIVOT_Y, z + 0.05]}
        >
          <mesh material={m.hoodDoor} position={[0, -DOOR_HEIGHT / 2, 0]} castShadow>
            <boxGeometry args={[door.width - 0.08, DOOR_HEIGHT, 0.12]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
