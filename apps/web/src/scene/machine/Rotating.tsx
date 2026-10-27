import { useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group, Material } from 'three';
import { materials } from '../materials';
import { useScene, WEB_SPEED_M_S } from '../sceneState';
import { rollGeometry } from './rollGeometry';

/**
 * Um corpo de revolução que gira: cilindro secador, rolo de prensa, rolo do
 * Speed Sizer, rolo da calandra, tambor da enroladeira.
 *
 * A velocidade angular sai da linear da folha dividida pelo raio, então um rolo
 * fino gira visivelmente mais rápido que um cilindro secador — é o que torna a
 * cena legível como uma máquina e não como peças soltas girando juntas.
 */

export interface RotatingProps {
  readonly position: readonly [number, number, number];
  readonly radius: number;
  readonly length: number;
  readonly material: Material;
  /** 1 gira no sentido do papel; -1 no contrário, como nos cilindros inferiores. */
  readonly direction?: 1 | -1;
  /** Peças que giram junto, em coordenadas locais. */
  readonly children?: ReactNode;
}

export function Rotating({
  position,
  radius,
  length,
  material,
  direction = 1,
  children,
}: RotatingProps) {
  const group = useRef<Group>(null);
  const { playing } = useScene();
  const m = materials();
  const geometry = rollGeometry(radius, length);

  useFrame((_, delta) => {
    if (!playing || !group.current) return;
    group.current.rotation.z -= (direction * delta * WEB_SPEED_M_S) / radius;
  });

  return (
    <group ref={group} position={[...position]}>
      <mesh geometry={geometry.barrel} material={material} castShadow receiveShadow />
      <mesh geometry={geometry.hubs} material={m.steel} />
      <mesh geometry={geometry.bolts} material={m.hose} />
      {children}
    </group>
  );
}
