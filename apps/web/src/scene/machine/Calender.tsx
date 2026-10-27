import type { MachineSection } from '@mp1/shared';
import { materials } from '../materials';
import { BearingHousing } from './BearingHousing';
import { Rotating } from './Rotating';

/**
 * Calandra: o nip aquecido que alisa a folha.
 *
 * O rolo térmico é liso e metálico, o revestido é escuro e macio, e a carga vem
 * dos cilindros hidráulicos no topo do pórtico. O nº de nips e qual rolo fica em
 * cima ainda são suposição — o modelo marca os dois como `assumed`.
 */

export interface CalenderProps {
  readonly section: MachineSection;
  readonly webWidth: number;
}

export function Calender({ section, webWidth }: CalenderProps) {
  const m = materials();
  const halfWidth = webWidth / 2 + 0.9;

  const thermal = section.assets.find((a) => a.tag === 'MP1-CAL-RT');
  const soft = section.assets.find((a) => a.tag === 'MP1-CAL-RR');
  const bearings = section.assets.filter((a) => a.kind === 'bearing');
  const nip = section.assets.find((a) => a.kind === 'nip');

  const x = nip?.position[0] ?? 0;
  const nipY = nip?.position[1] ?? 0;

  return (
    <group>
      {thermal && (
        <Rotating
          position={thermal.position}
          radius={thermal.radius ?? 0.8}
          length={thermal.lengthM ?? webWidth}
          material={m.calenderThermal}
          direction={1}
        />
      )}
      {soft && (
        <Rotating
          position={soft.position}
          radius={soft.radius ?? 0.8}
          length={soft.lengthM ?? webWidth}
          material={m.calenderSoft}
          direction={-1}
        />
      )}

      {/* rolo guia na entrada */}
      <Rotating
        position={[x - 2.4, nipY - 0.3, 0]}
        radius={0.3}
        length={webWidth}
        material={m.steel}
      />

      {bearings.map((bearing, i) => (
        <BearingHousing
          key={bearing.tag}
          asset={bearing}
          parentRadius={
            bearing.parentTag === 'MP1-CAL-RT' ? (thermal?.radius ?? 0.8) : (soft?.radius ?? 0.8)
          }
          detailed={false}
          index={i}
        />
      ))}

      {/* linha de óleo térmico, correndo acima do rolo aquecido */}
      <mesh position={[x + 0.3, nipY + 1.9, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.08, 0.08, webWidth + 3, 12]} />
        <meshStandardMaterial color="#d0442e" roughness={0.5} />
      </mesh>

      {/* pórtico e cilindros hidráulicos de carga */}
      {[-halfWidth, halfWidth].map((z) => (
        <group key={z}>
          {[x - 1.5, x + 1.5].map((cx) => (
            <mesh key={cx} material={m.paint} position={[cx, 3.6, z]} castShadow>
              <boxGeometry args={[0.6, 7.2, 0.6]} />
            </mesh>
          ))}
          <mesh material={m.paint} position={[x, 7.2, z]} castShadow>
            <boxGeometry args={[3.6, 0.6, 0.6]} />
          </mesh>
          <mesh material={m.paint} position={[x, 0.25, z]} castShadow>
            <boxGeometry args={[3.6, 0.5, 0.6]} />
          </mesh>
          <mesh position={[x, 6.2, z]} castShadow>
            <boxGeometry args={[0.45, 1.4, 0.45]} />
            <meshStandardMaterial color="#8a9099" roughness={0.3} metalness={0.8} />
          </mesh>
        </group>
      ))}

      <mesh position={[x, 7.9, halfWidth + 0.3]}>
        <boxGeometry args={[3.2, 0.6, 0.25]} />
        <meshStandardMaterial color="#2d4a9a" roughness={0.5} />
      </mesh>
    </group>
  );
}
