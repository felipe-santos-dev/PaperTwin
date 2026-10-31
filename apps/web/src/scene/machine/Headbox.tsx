import { HEADBOX, type MachineSection } from '@mp1/shared';
import { materials } from '../materials';

/**
 * A caixa de entrada: onde a máquina começa.
 *
 * Três peças, e cada uma tem razão de estar aqui. O tubulão atravessa a
 * máquina inteira porque a massa tem de chegar com a mesma pressão nos 8 m de
 * largura — é ele que decide se a gramatura sai plana no sentido transversal. O
 * corpo pressurizado vem depois, e o lábio é a fenda de onde o jato sai, fina o
 * bastante para a folha ter 75 g/m² quando secar.
 *
 * Não gira nada, então não há mancal nem vibração para acompanhar.
 */

export interface HeadboxProps {
  readonly section: MachineSection;
  readonly webWidth: number;
}

export function Headbox({ section, webWidth }: HeadboxProps) {
  const m = materials();
  const asset = section.assets[0];
  if (!asset) return null;

  const faceWidth = asset.lengthM ?? webWidth + 0.8;

  return (
    <group>
      {/* tubulão de distribuição, cônico: a massa entra por um lado */}
      <mesh
        material={m.bearingBlueDark}
        position={[HEADBOX.manifoldX, HEADBOX.manifoldY, 0]}
        rotation={[Math.PI / 2, 0, 0]}
        castShadow
        receiveShadow
      >
        <cylinderGeometry
          args={[HEADBOX.manifoldRadiusM, HEADBOX.manifoldRadiusM * 0.67, webWidth + 2, 24]}
        />
      </mesh>

      {/* corpo pressurizado */}
      <mesh material={m.paintDark} position={[HEADBOX.x, HEADBOX.y, 0]} castShadow receiveShadow>
        <boxGeometry args={[HEADBOX.widthM, HEADBOX.heightM, faceWidth]} />
      </mesh>

      {/* lábio */}
      <mesh
        material={m.steel}
        position={[HEADBOX.sliceX, HEADBOX.sliceY, 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[HEADBOX.sliceWidthM, HEADBOX.sliceHeightM, webWidth + 0.4]} />
      </mesh>
    </group>
  );
}
