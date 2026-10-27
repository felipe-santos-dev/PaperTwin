import { useMemo } from 'react';
import {
  DRYER_PITCH_M,
  DRYER_TOP_Y_M,
  type HoodSpan,
  type MachineAsset,
  type MachineSection,
} from '@mp1/shared';
import { materials } from '../materials';
import { BearingHousing } from './BearingHousing';
import { Hood } from './Hood';
import { Rotating } from './Rotating';
import { dryerFabricPaths, ribbonGeometry } from './webPath';

/**
 * Uma secagem inteira — pré ou pós — montada a partir da seção do modelo.
 *
 * Os cilindros não são escritos à mão: eles saem de `section.assets`, então
 * mudar o nº de pares no modelo muda a cena, e não há como a cena e as tags
 * divergirem.
 */

export interface DryingSectionProps {
  readonly section: MachineSection;
  readonly hood: HoodSpan;
  readonly x0: number;
  readonly pairs: number;
  readonly webWidth: number;
}

const FRAME_HEIGHT = 8.6;

export function DryingSection({ section, hood, x0, pairs, webWidth }: DryingSectionProps) {
  const m = materials();
  const halfWidth = webWidth / 2 + 0.9;

  const cylinders = section.assets.filter((a) => a.kind === 'dryer-cylinder');
  const bearings = section.assets.filter((a) => a.kind === 'bearing');
  const byTag = useMemo(() => new Map(cylinders.map((c) => [c.tag, c])), [cylinders]);

  const fabrics = useMemo(() => {
    const { upper, lower } = dryerFabricPaths(x0, pairs);
    return {
      upper: ribbonGeometry(upper, webWidth - 0.3, 3),
      lower: ribbonGeometry(lower, webWidth - 0.3, 3),
    };
  }, [x0, pairs, webWidth]);

  /** Rolos esticadores da tela, entre um cilindro e o seguinte. */
  const feltRolls = useMemo(() => {
    const rolls: { x: number; y: number; direction: 1 | -1 }[] = [];
    for (let pair = 0; pair < pairs; pair += 1) {
      const topX = x0 + pair * DRYER_PITCH_M;
      rolls.push({ x: topX + DRYER_PITCH_M / 2, y: DRYER_TOP_Y_M + 1.35, direction: -1 });
    }
    return rolls;
  }, [x0, pairs]);

  const frameColumns = useMemo(() => {
    const columns: number[] = [];
    for (let x = hood.from; x <= hood.to + 0.01; x += DRYER_PITCH_M * 2) columns.push(x);
    return columns;
  }, [hood.from, hood.to]);

  return (
    <group>
      {cylinders.map((cylinder) => (
        <Rotating
          key={cylinder.tag}
          position={cylinder.position}
          radius={cylinder.radius ?? 1}
          length={cylinder.lengthM ?? webWidth}
          material={m.dryer}
          direction={cylinder.position[1] === DRYER_TOP_Y_M ? 1 : -1}
        />
      ))}

      {feltRolls.map((roll) => (
        <Rotating
          key={roll.x}
          position={[roll.x, roll.y, 0]}
          radius={0.28}
          length={webWidth}
          material={m.steel}
          direction={roll.direction}
        />
      ))}

      {bearings.map((bearing, index) => (
        <BearingHousing
          key={bearing.tag}
          asset={bearing}
          parentRadius={parentRadiusOf(bearing, byTag)}
          detailed={bearing.side === 'LC'}
          index={index}
        />
      ))}

      <mesh geometry={fabrics.upper} material={m.fabric} castShadow receiveShadow />
      <mesh geometry={fabrics.lower} material={m.fabric} castShadow receiveShadow />

      {/* estrutura: colunas e longarinas em três alturas */}
      {frameColumns.map((x) =>
        [-halfWidth, halfWidth].map((z) => (
          <mesh
            key={`${String(x)}:${String(z)}`}
            material={m.frameDark}
            position={[x, FRAME_HEIGHT / 2, z]}
            castShadow
          >
            <boxGeometry args={[0.35, FRAME_HEIGHT, 0.35]} />
          </mesh>
        )),
      )}
      {[-halfWidth, halfWidth].map((z) =>
        [1.3, 4.55, FRAME_HEIGHT].map((y) => (
          <mesh
            key={`${String(z)}:${String(y)}`}
            material={m.frameDark}
            position={[(hood.from + hood.to) / 2, y, z]}
            castShadow
          >
            <boxGeometry args={[hood.to - hood.from, 0.35, 0.35]} />
          </mesh>
        )),
      )}

      <Hood span={hood} halfWidth={halfWidth} />

      {/* luz quente por dentro da capota, visível quando as portas abrem */}
      {frameColumns
        .filter((_, i) => i % 3 === 0)
        .map((x) => (
          <pointLight key={x} position={[x, 4.5, 1]} color="#ffd7a0" intensity={25} distance={12} />
        ))}
    </group>
  );
}

function parentRadiusOf(bearing: MachineAsset, byTag: Map<string, MachineAsset>): number {
  const parent = bearing.parentTag ? byTag.get(bearing.parentTag) : undefined;
  return parent?.radius ?? 1;
}
