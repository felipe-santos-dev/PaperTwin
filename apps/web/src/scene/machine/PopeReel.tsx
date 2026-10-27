import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { MachineSection } from '@mp1/shared';
import { CanvasTexture, type Group, type Mesh, MeshStandardMaterial, RepeatWrapping } from 'three';
import { materials } from '../materials';
import { useScene, WEB_SPEED_M_S } from '../sceneState';
import { BearingHousing } from './BearingHousing';
import { Rotating } from './Rotating';

/**
 * Enroladeira Pope: o tambor encosta na folha e o jumbo cresce contra ele.
 *
 * O jumbo engorda ao longo de um minuto e volta ao diâmetro vazio — é a troca
 * de bobina. Como ele gira à mesma velocidade linear da folha, quanto maior o
 * diâmetro, mais devagar gira; é o detalhe que denuncia uma cena honesta.
 */

export interface PopeReelProps {
  readonly section: MachineSection;
  readonly webWidth: number;
}

/** Topo da bobina: anéis concêntricos vistos de lado. */
function reelEndTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d indisponível');

  ctx.fillStyle = '#e6e1d3';
  ctx.fillRect(0, 0, 512, 512);
  let seed = 97;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let r = 40; r < 256; r += 3) {
    ctx.strokeStyle = `rgba(150,140,120,${String(0.08 + rand() * 0.15)})`;
    ctx.beginPath();
    ctx.arc(256, 256, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = '#8c8f94';
  ctx.beginPath();
  ctx.arc(256, 256, 40, 0, Math.PI * 2);
  ctx.fill();

  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  return texture;
}

/** Um minuto do diâmetro vazio até o jumbo cheio. */
const REEL_CYCLE_S = 60;
const EMPTY_DIAMETER = 1.0;
const DIAMETER_GROWTH = 0.4;

export function PopeReel({ section, webWidth }: PopeReelProps) {
  const m = materials();
  const { playing } = useScene();

  const drum = section.assets.find((a) => a.kind === 'reel-drum');
  const bearings = section.assets.filter((a) => a.kind === 'bearing');
  const [x, y] = drum?.position ?? [0, 0, 0];
  const drumRadius = drum?.radius ?? 0.8;
  const halfWidth = webWidth / 2 + 0.9;

  const jumbo = useRef<Group>(null);
  const barrel = useRef<Mesh>(null);
  const elapsed = useRef(0);

  const endMaterial = useMemo(
    () => new MeshStandardMaterial({ map: reelEndTexture(), roughness: 0.85 }),
    [],
  );
  const jumboMaterials = useMemo(() => [m.paper, endMaterial, endMaterial], [m.paper, endMaterial]);

  useFrame((_, delta) => {
    if (playing) elapsed.current += delta;
    const t = elapsed.current;
    const diameter = EMPTY_DIAMETER + ((t / REEL_CYCLE_S) % 1) * DIAMETER_GROWTH;

    if (jumbo.current) {
      jumbo.current.position.set(x + drumRadius + 0.02 + diameter, y, 0);
      jumbo.current.rotation.z = -(t * WEB_SPEED_M_S) / diameter;
    }
    if (barrel.current) barrel.current.scale.set(diameter, 1, diameter);
  });

  return (
    <group>
      {drum && (
        <Rotating
          position={drum.position}
          radius={drumRadius}
          length={drum.lengthM ?? webWidth}
          material={m.steel}
        />
      )}

      {bearings.map((bearing, i) => (
        <BearingHousing
          key={bearing.tag}
          asset={bearing}
          parentRadius={drumRadius}
          detailed={false}
          index={i}
        />
      ))}

      <group ref={jumbo}>
        <mesh
          ref={barrel}
          material={jumboMaterials}
          rotation={[Math.PI / 2, 0, 0]}
          castShadow
          receiveShadow
        >
          <cylinderGeometry args={[1, 1, webWidth - 0.5, 64]} />
        </mesh>
        <mesh material={m.steel} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.35, 0.35, webWidth + 1.4, 20]} />
        </mesh>
        {[1, -1].map((side) => (
          <mesh
            key={side}
            material={m.bearingBlue}
            position={[0, 0, side * (webWidth / 2 + 0.5)]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <cylinderGeometry args={[0.5, 0.5, 0.4, 20]} />
          </mesh>
        ))}
      </group>

      {/* estrutura dos trilhos onde o jumbo corre */}
      {[-halfWidth, halfWidth].map((z) => (
        <group key={z}>
          <mesh material={m.paint} position={[x + 2.2, 2.2, z]} castShadow>
            <boxGeometry args={[9, 0.45, 0.5]} />
          </mesh>
          <mesh material={m.paint} position={[x - 1.5, 2.3, z]} castShadow>
            <boxGeometry args={[0.5, 4.6, 0.5]} />
          </mesh>
          <mesh material={m.paint} position={[x + 6, 1.1, z]} castShadow>
            <boxGeometry args={[0.5, 2.2, 0.5]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
