import { useMemo } from 'react';
import { FORMING_ROLLS, type MachineAsset, type MachineSection } from '@mp1/shared';
import { materials } from '../materials';
import { BearingHousing } from './BearingHousing';
import { Rotating } from './Rotating';
import { fabricLoop, ribbonGeometry } from './webPath';

/**
 * O formador de duas telas.
 *
 * A folha nasce aqui, e nasce entre duas telas: a massa entra com cerca de 1 %
 * de fibra e 99 % de água, e a água sai pelos dois lados ao mesmo tempo. É por
 * isso que são duas telas e não uma — drenar só por baixo deixaria os dois
 * lados da folha diferentes, e essa diferença atravessa a máquina inteira e
 * aparece na bobina como encurvamento.
 *
 * Os rolos saem de `section.assets`, as telas saem de `FORMING_ROLLS`: cada
 * tela é a envoltória convexa dos cinco rolos que ela abraça.
 */

export interface FormingSectionProps {
  readonly section: MachineSection;
  readonly webWidth: number;
}

export function FormingSection({ section, webWidth }: FormingSectionProps) {
  const m = materials();

  const rolls = section.assets.filter((a) => a.kind === 'roll');
  const bearings = section.assets.filter((a) => a.kind === 'bearing');
  const byTag = useMemo(() => new Map(rolls.map((r) => [r.tag, r])), [rolls]);

  /** As duas telas, cada uma esticada em volta dos seus rolos. */
  const wires = useMemo(
    () =>
      ([1, 2] as const).map((wire) =>
        ribbonGeometry(
          fabricLoop(FORMING_ROLLS.filter((roll) => roll.wire === wire)),
          webWidth - 0.2,
          3,
        ),
      ),
    [webWidth],
  );

  return (
    <group>
      {rolls.map((roll, index) => {
        const spec = FORMING_ROLLS[index];
        return (
          <Rotating
            key={roll.tag}
            position={roll.position}
            radius={roll.radius ?? 0.4}
            length={roll.lengthM ?? webWidth}
            material={spec?.covered ? m.rubber : m.steel}
            direction={spec?.direction ?? 1}
          />
        );
      })}

      {bearings.map((bearing, index) => (
        <BearingHousing
          key={bearing.tag}
          asset={bearing}
          parentRadius={parentRadiusOf(bearing, byTag)}
          detailed={false}
          index={index}
        />
      ))}

      {wires.map((geometry, index) => (
        <mesh
          key={index === 0 ? 'wire-1' : 'wire-2'}
          geometry={geometry}
          material={index === 0 ? m.wire : m.wireTop}
          castShadow
          receiveShadow
        />
      ))}
    </group>
  );
}

function parentRadiusOf(bearing: MachineAsset, byTag: Map<string, MachineAsset>): number {
  const parent = bearing.parentTag ? byTag.get(bearing.parentTag) : undefined;
  return parent?.radius ?? 0.4;
}
