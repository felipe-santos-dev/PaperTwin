import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { MachineAsset } from '@mp1/shared';
import type { Group } from 'three';
import { materials } from '../materials';
import { useScene } from '../sceneState';

/**
 * Scanner de qualidade (QCS), em quadro O.
 *
 * Os dois cabeçotes — um acima e um abaixo da folha — varrem a máquina de lado
 * a lado medindo gramatura e umidade. O feixe entre eles é o único emissivo
 * forte da cena fora das luminárias, e é de propósito: é o que o bloom pega.
 */

export interface ScannerProps {
  readonly asset: MachineAsset;
  readonly webWidth: number;
  /** Defasagem da varredura, para os dois scanners não andarem em sincronia. */
  readonly phase: number;
}

export function Scanner({ asset, webWidth, phase }: ScannerProps) {
  const m = materials();
  const { playing } = useScene();
  const heads = useRef<Group>(null);
  const elapsed = useRef(0);

  const [x, y] = asset.position;
  const half = webWidth / 2;
  const railZ = half + 1.6;

  useFrame((_, delta) => {
    if (!heads.current) return;
    if (playing) elapsed.current += delta;
    heads.current.position.z = Math.sin(elapsed.current * 1.1 + phase) * (half - 0.6);
  });

  return (
    <group>
      {/* trilhos horizontais */}
      {[y + 0.9, y - 0.9].map((railY) => (
        <mesh key={railY} material={m.scannerFrame} position={[x, railY, 0]} castShadow>
          <boxGeometry args={[0.7, 0.7, webWidth + 3.6]} />
        </mesh>
      ))}
      {/* colunas */}
      {[-railZ, railZ].map((z) => (
        <mesh key={z} material={m.scannerFrame} position={[x, (y + 1.6) / 2, z]} castShadow>
          <boxGeometry args={[0.9, y + 1.6, 0.9]} />
        </mesh>
      ))}
      <mesh material={m.yellow} position={[x + 0.38, y + 1.27, 0]}>
        <boxGeometry args={[0.9, 0.12, webWidth + 3.4]} />
      </mesh>

      <group ref={heads}>
        {[y + 0.45, y - 0.45].map((headY) => (
          <mesh key={headY} material={m.scannerHead} position={[x, headY, 0]} castShadow>
            <boxGeometry args={[1.1, 0.6, 1.1]} />
          </mesh>
        ))}
        <mesh material={m.laser} position={[x, y, 0]}>
          <boxGeometry args={[0.05, 0.62, 0.05]} />
        </mesh>
      </group>

      {/* armário de controle, no lado operação */}
      <mesh material={m.white} position={[x + 1.5, 1, half + 2.2]} castShadow>
        <boxGeometry args={[1.2, 2, 0.6]} />
      </mesh>
    </group>
  );
}
