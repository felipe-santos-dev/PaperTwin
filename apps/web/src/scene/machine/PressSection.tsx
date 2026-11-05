import { useMemo } from 'react';
import {
  FELT_LOOPS,
  FELT_ROLLS,
  PRESS_NIPS,
  pressRollsOf,
  type MachineAsset,
  type MachineSection,
  type WetRoll,
} from '@mp1/shared';
import { materials } from '../materials';
import { BearingHousing } from './BearingHousing';
import { Rotating } from './Rotating';
import { fabricLoop, ribbonGeometry } from './webPath';

/**
 * As três prensas.
 *
 * Aqui a água sai por compressão, e é a etapa mais barata de todas: cada ponto
 * de seco que a prensa tira é um ponto que a secagem não precisa evaporar com
 * vapor. É por isso que a parte úmida termina com três nips em sequência e não
 * com um só.
 *
 * Cada nip entra na cena a partir do modelo, com os seus dois rolos tangentes,
 * o pedestal embaixo e os feltros esticados em volta. O rolo de baixo é
 * revestido e o de cima é de aço — e os dois giram em sentidos opostos, que é o
 * que faz a folha atravessar o nip em vez de ser cuspida de volta.
 */

export interface PressSectionProps {
  readonly section: MachineSection;
  readonly webWidth: number;
}

export function PressSection({ section, webWidth }: PressSectionProps) {
  const m = materials();

  const rolls = section.assets.filter((a) => a.kind === 'roll');
  const bearings = section.assets.filter((a) => a.kind === 'bearing');
  const byTag = useMemo(() => new Map(rolls.map((r) => [r.tag, r])), [rolls]);

  /**
   * Os feltros, cada um esticado em volta dos rolos que o laço declara.
   *
   * O laço vem do modelo por índice, e não por posição copiada: mover um rolo
   * guia reacomoda o feltro inteiro sem ninguém mexer aqui.
   */
  const felts = useMemo(
    () =>
      FELT_LOOPS.map((loop) => {
        const circles: WetRoll[] = [
          ...loop.press.flatMap((reference) => {
            const nip = PRESS_NIPS[reference.nip];
            return nip ? [pressRollsOf(nip)[reference.roll]] : [];
          }),
          ...loop.guides.flatMap((index) => {
            const guide = FELT_ROLLS[index];
            return guide ? [guide] : [];
          }),
        ];

        return {
          label: loop.label,
          geometry: ribbonGeometry(fabricLoop(circles), webWidth - 0.2, 3),
        };
      }),
    [webWidth],
  );

  return (
    <group>
      {rolls.map((roll) => {
        const covered = roll.tag.endsWith('-RI');
        return (
          <Rotating
            key={roll.tag}
            position={roll.position}
            radius={roll.radius ?? 0.9}
            length={roll.lengthM ?? webWidth}
            material={covered ? m.rubber : m.steel}
            direction={covered ? 1 : -1}
          />
        );
      })}

      {/* pedestal de cada rolo, do chão até o mancal */}
      {rolls.map((roll) => {
        const [x, y] = roll.position;
        const radius = roll.radius ?? 0.9;
        const height = y - radius * 0.4;
        return [-1, 1].map((side) => (
          <mesh
            key={`${roll.tag}:${String(side)}`}
            material={m.paintDark}
            position={[x, height / 2, side * (webWidth / 2 + 0.3)]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[radius * 0.9, height, 0.5]} />
          </mesh>
        ));
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

      {felts.map((felt) => (
        <mesh
          key={felt.label}
          geometry={felt.geometry}
          material={m.felt}
          castShadow
          receiveShadow
        />
      ))}

      {/* rolos guia dos feltros: giram, mas não são ativos com tag */}
      {FELT_ROLLS.map((guide) => (
        <Rotating
          key={`${String(guide.x)}:${String(guide.y)}`}
          position={[guide.x, guide.y, 0]}
          radius={guide.radiusM}
          length={webWidth}
          material={m.steel}
        />
      ))}
    </group>
  );
}

function parentRadiusOf(bearing: MachineAsset, byTag: Map<string, MachineAsset>): number {
  const parent = bearing.parentTag ? byTag.get(bearing.parentTag) : undefined;
  return parent?.radius ?? 0.9;
}
