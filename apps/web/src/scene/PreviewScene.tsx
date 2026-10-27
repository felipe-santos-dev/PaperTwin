import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import type { Group } from 'three';

/**
 * Esboço da parte seca só para firmar a base do R3F.
 *
 * As proporções já são as validadas no protótipo (`reference/prototypes/`):
 * cilindro de raio 1,05, passo 2,2, fileira superior em y=6,1 e inferior em y=3,0.
 * A cena de verdade, gerada a partir do modelo declarativo da máquina, entra na Fase 2.
 */

const DRYER_RADIUS = 1.05;
const PITCH = 2.2;
const TOP_Y = 6.1;
const BOTTOM_Y = 3.0;
const WIDTH = 8;
const PAIRS = 5;

interface DryerProps {
  readonly position: readonly [number, number, number];
  readonly direction: 1 | -1;
}

function Dryer({ position, direction }: DryerProps) {
  const group = useRef<Group>(null);

  useFrame((_, delta) => {
    if (group.current) group.current.rotation.z -= (direction * delta * 3.2) / DRYER_RADIUS;
  });

  return (
    <group ref={group} position={[...position]}>
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[DRYER_RADIUS, DRYER_RADIUS, WIDTH, 48]} />
        <meshStandardMaterial color="#b4bac2" roughness={0.28} metalness={0.85} />
      </mesh>
      {/* marca para a rotação ficar visível */}
      <mesh position={[DRYER_RADIUS * 0.99, 0, 0]}>
        <boxGeometry args={[0.04, 0.3, WIDTH * 0.98]} />
        <meshStandardMaterial color="#3c4049" roughness={0.6} />
      </mesh>
    </group>
  );
}

function Bearing({ position }: { readonly position: readonly [number, number, number] }) {
  return (
    <mesh position={[...position]} rotation={[Math.PI / 2, 0, 0]} castShadow>
      <cylinderGeometry args={[DRYER_RADIUS * 0.55, DRYER_RADIUS * 0.55, 0.36, 24]} />
      <meshStandardMaterial color="#5fa6d0" roughness={0.45} metalness={0.3} />
    </mesh>
  );
}

function DryerSection() {
  const cylinders = Array.from({ length: PAIRS }, (_, i) => i);
  const bearingZ = WIDTH / 2 + 0.3;

  return (
    <group position={[-((PAIRS - 1) * PITCH) / 2, -4.5, 0]}>
      {cylinders.map((i) => {
        const topX = i * PITCH;
        const bottomX = topX + PITCH / 2;
        return (
          <group key={i}>
            <Dryer position={[topX, TOP_Y, 0]} direction={1} />
            <Dryer position={[bottomX, BOTTOM_Y, 0]} direction={-1} />
            {[bearingZ, -bearingZ].map((z) => (
              <group key={z}>
                <Bearing position={[topX, TOP_Y, z]} />
                <Bearing position={[bottomX, BOTTOM_Y, z]} />
              </group>
            ))}
          </group>
        );
      })}
    </group>
  );
}

export function PreviewScene() {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [6, 4, 16], fov: 48 }}
      gl={{ antialias: true }}
    >
      <color attach="background" args={['#0b0d14']} />
      <fog attach="fog" args={['#14171f', 24, 70]} />

      <hemisphereLight args={['#dfe8ff', '#4a4438', 0.55]} />
      <directionalLight
        position={[12, 18, 14]}
        intensity={2.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
      />
      <pointLight position={[0, 6, 6]} intensity={60} color="#ffd7a0" distance={30} />

      <DryerSection />
      <ContactShadows position={[0, -4.6, 0]} opacity={0.5} scale={40} blur={2.4} far={10} />

      <OrbitControls enableDamping dampingFactor={0.08} maxPolarAngle={Math.PI * 0.62} />
    </Canvas>
  );
}
