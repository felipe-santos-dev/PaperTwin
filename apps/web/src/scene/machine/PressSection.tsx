import type { MachineSection } from '@mp1/shared';
import { materials } from '../materials';
import { BearingHousing } from './BearingHousing';
import { Rotating } from './Rotating';

/**
 * Último par de prensas, que entra na cena como contexto: é de onde a folha sai
 * para a pré-secagem. O rolo de baixo é revestido de borracha, o de cima é de aço.
 */

export interface PressSectionProps {
  readonly section: MachineSection;
  readonly webWidth: number;
}

export function PressSection({ section, webWidth }: PressSectionProps) {
  const m = materials();
  const halfWidth = webWidth / 2 + 0.9;

  const rolls = section.assets.filter((a) => a.kind === 'roll');
  const bearings = section.assets.filter((a) => a.kind === 'bearing');
  const x = rolls[0]?.position[0] ?? 0;

  return (
    <group>
      {rolls.map((roll, i) => (
        <Rotating
          key={roll.tag}
          position={roll.position}
          radius={roll.radius ?? 0.95}
          length={roll.lengthM ?? webWidth}
          material={i === 0 ? m.rubber : m.steel}
          direction={i === 0 ? 1 : -1}
        />
      ))}

      {bearings.map((bearing, i) => (
        <BearingHousing
          key={bearing.tag}
          asset={bearing}
          parentRadius={rolls[0]?.radius ?? 0.95}
          detailed={false}
          index={i}
        />
      ))}

      {[x - 2, x + 2].map((cx) =>
        [-halfWidth, halfWidth].map((z) => (
          <mesh
            key={`${String(cx)}:${String(z)}`}
            material={m.paint}
            position={[cx, 6, z]}
            castShadow
          >
            <boxGeometry args={[0.45, 12, 0.45]} />
          </mesh>
        )),
      )}
      <mesh material={m.paint} position={[x, 12, 0]} castShadow>
        <boxGeometry args={[5, 0.5, 2 * halfWidth]} />
      </mesh>
    </group>
  );
}
