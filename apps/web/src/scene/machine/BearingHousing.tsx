import { useMemo } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { BEARING_RADIUS_RATIO, type MachineAsset } from '@mp1/shared';
import { CatmullRomCurve3, CylinderGeometry, TubeGeometry, Vector3 } from 'three';
import { materials } from '../materials';
import { useScene } from '../sceneState';

/**
 * O mancal — o ativo que o monitoramento acompanha, e por isso o único clicável.
 *
 * Nos cilindros secadores do lado comando vem o detalhe validado em campo:
 * tampa creme ou azul, proteção amarela retangular, junta rotativa de latão com
 * mangueira preta descendo, e caixa de junção a cada quatro cilindros. É esse
 * detalhe que faz a secagem parecer uma secagem e não uma fileira de tubos.
 */

export interface BearingHousingProps {
  readonly asset: MachineAsset;
  /** Raio do corpo que o mancal sustenta. */
  readonly parentRadius: number;
  /** Mostra a junta rotativa e a proteção — só os secadores do lado comando. */
  readonly detailed: boolean;
  /** Ordem do mancal na fileira, para alternar a cor da tampa. */
  readonly index: number;
}

export function BearingHousing({ asset, parentRadius, detailed, index }: BearingHousingProps) {
  const m = materials();
  const { selectedTag, select, hover, hoveredTag } = useScene();
  const [x, y, z] = asset.position;
  const radius = parentRadius * BEARING_RADIUS_RATIO;
  const outward = Math.sign(z);

  const housing = useMemo(() => new CylinderGeometry(radius, radius, 0.36, 24), [radius]);

  const hoseGeometry = useMemo(() => {
    if (!detailed) return null;
    const start = z + outward * 0.75;
    const curve = new CatmullRomCurve3([
      new Vector3(x, y, start),
      new Vector3(x + 0.25, y - 0.5, start + outward * 0.1),
      new Vector3(x + 0.15, y - 1.2, start - outward * 0.15),
      new Vector3(x + 0.35, y - 1.7, start - outward * 0.55),
    ]);
    return new TubeGeometry(curve, 20, 0.04, 6);
  }, [detailed, x, y, z, outward]);

  const isSelected = selectedTag === asset.tag;
  const isHovered = hoveredTag === asset.tag;
  const shell = isSelected ? m.bearingSelected : isHovered ? m.bearingHovered : m.bearingBlue;

  const onOver = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    hover(asset.tag);
    document.body.style.cursor = 'pointer';
  };

  const onOut = () => {
    hover(null);
    document.body.style.cursor = '';
  };

  const onClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    select(isSelected ? null : asset.tag);
  };

  const capMaterial = index % 3 === 0 ? m.capBlue : m.capCream;
  const guardWidth = parentRadius * 1.35;
  const detailZ = z + outward * 0.2;

  return (
    <group>
      <mesh
        geometry={housing}
        material={shell}
        position={[x, y, z]}
        rotation={[Math.PI / 2, 0, 0]}
        castShadow
        onPointerOver={onOver}
        onPointerOut={onOut}
        onClick={onClick}
      />

      {detailed && (
        <group>
          <mesh position={[x, y, detailZ + outward * 0.1]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[parentRadius * 0.5, parentRadius * 0.5, 0.12, 24]} />
            <primitive object={capMaterial} attach="material" />
          </mesh>

          {/* proteção amarela: quatro barras formando um retângulo */}
          {(
            [
              [guardWidth, 0.07, 0, guardWidth / 2],
              [guardWidth, 0.07, 0, -guardWidth / 2],
              [0.07, guardWidth, guardWidth / 2, 0],
              [0.07, guardWidth, -guardWidth / 2, 0],
            ] as const
          ).map(([w, h, dx, dy], i) => (
            <mesh key={i} material={m.yellow} position={[x + dx, y + dy, detailZ + outward * 0.2]}>
              <boxGeometry args={[w, h, 0.07]} />
            </mesh>
          ))}

          {/* junta rotativa de latão e colar de aço */}
          <mesh
            material={m.brass}
            position={[x, y, detailZ + outward * 0.5]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <cylinderGeometry args={[0.09, 0.09, 0.7, 12]} />
          </mesh>
          <mesh
            material={m.steel}
            position={[x, y, detailZ + outward * 0.88]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <cylinderGeometry args={[0.16, 0.16, 0.22, 16]} />
          </mesh>

          {hoseGeometry && <mesh geometry={hoseGeometry} material={m.hose} />}

          {index % 4 === 0 && (
            <mesh material={m.white} position={[x + 1.1, y - 0.2, detailZ + outward * 0.1]}>
              <boxGeometry args={[0.5, 0.6, 0.25]} />
            </mesh>
          )}
        </group>
      )}
    </group>
  );
}
