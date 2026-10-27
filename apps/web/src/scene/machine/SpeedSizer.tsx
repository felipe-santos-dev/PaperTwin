import { DRY_SECTION_WEB_Y_M, type MachineSection } from '@mp1/shared';
import { DoubleSide } from 'three';
import { materials } from '../materials';
import { BearingHousing } from './BearingHousing';
import { Rotating } from './Rotating';

/**
 * Speed Sizer: dois rolos grossos empilhados, com o nip horizontal exatamente na
 * altura do papel.
 *
 * Cada rolo carrega um filme de amido aplicado por uma lâmina, e é o nip que
 * transfere o filme para os dois lados da folha de uma vez.
 */

export interface SpeedSizerProps {
  readonly section: MachineSection;
  readonly webWidth: number;
}

export function SpeedSizer({ section, webWidth }: SpeedSizerProps) {
  const m = materials();
  const halfWidth = webWidth / 2 + 0.9;

  const rolls = section.assets.filter((a) => a.kind === 'roll');
  const bearings = section.assets.filter((a) => a.kind === 'bearing');
  const x = rolls[0]?.position[0] ?? 0;
  const radius = rolls[0]?.radius ?? 1.15;

  return (
    <group>
      {rolls.map((roll, i) => (
        <Rotating
          key={roll.tag}
          position={roll.position}
          radius={roll.radius ?? radius}
          length={roll.lengthM ?? webWidth}
          material={m.rubber}
          direction={i === 0 ? -1 : 1}
        />
      ))}

      {/* filme de amido na superfície de cada rolo */}
      {rolls.map((roll) => (
        <mesh key={`film:${roll.tag}`} position={[...roll.position]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry
            args={[
              (roll.radius ?? radius) + 0.015,
              (roll.radius ?? radius) + 0.015,
              webWidth - 0.4,
              48,
              1,
              true,
            ]}
          />
          <meshStandardMaterial
            color="#f3eed8"
            roughness={0.2}
            metalness={0}
            transparent
            opacity={0.55}
            side={DoubleSide}
          />
        </mesh>
      ))}

      {/* lâminas aplicadoras, inclinadas contra cada rolo */}
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[x + 1.45, DRY_SECTION_WEB_Y_M + side * 1.25, 0]}
          rotation={[0, 0, -side * 0.6]}
          castShadow
        >
          <boxGeometry args={[0.5, 0.7, webWidth]} />
          <meshStandardMaterial color="#6d7c8c" roughness={0.4} metalness={0.6} />
        </mesh>
      ))}

      {bearings.map((bearing, i) => (
        <BearingHousing
          key={bearing.tag}
          asset={bearing}
          parentRadius={radius}
          detailed={false}
          index={i}
        />
      ))}

      {/* pórtico */}
      {[-halfWidth, halfWidth].map((z) => (
        <group key={z}>
          {[x - 2.2, x + 2.2].map((cx) => (
            <mesh key={cx} material={m.paint} position={[cx, 4.5, z]} castShadow>
              <boxGeometry args={[0.5, 9, 0.5]} />
            </mesh>
          ))}
          {[9, 1.2].map((y) => (
            <mesh key={y} material={m.paint} position={[x, y, z]} castShadow>
              <boxGeometry args={[4.9, 0.5, 0.5]} />
            </mesh>
          ))}
        </group>
      ))}

      {/* placa de identificação */}
      <mesh position={[x, 9.9, halfWidth + 0.3]}>
        <boxGeometry args={[4.6, 0.6, 0.25]} />
        <meshStandardMaterial color="#2d4a9a" roughness={0.5} />
      </mesh>
    </group>
  );
}
