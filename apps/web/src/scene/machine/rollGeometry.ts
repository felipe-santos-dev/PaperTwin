import { BoxGeometry, type BufferGeometry, CylinderGeometry, Matrix4 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Geometrias de um corpo girante, criadas uma vez por formato.
 *
 * A máquina tem 43 corpos girantes e a maioria compartilha o mesmo raio: sem
 * cache, são 43 cilindros idênticos ocupando memória separada.
 *
 * Os cubos das pontas são mesclados numa geometria só. Eram doze malhas por
 * corpo — mais de quinhentas chamadas de desenho na máquina inteira, para uma
 * decoração que só se enxerga de perto.
 */

export interface RollGeometry {
  readonly barrel: BufferGeometry;
  readonly hubs: BufferGeometry;
  readonly bolts: BufferGeometry;
}

const BOLTS_PER_SIDE = 6;

const cache = new Map<string, RollGeometry>();

function build(radius: number, length: number): RollGeometry {
  const hubRadius = radius * 0.32;
  const hubZ = length / 2 + 0.25;
  const boltZ = length / 2 + 0.52;
  const boltOrbit = radius * 0.22;
  const boltSize = radius * 0.09;

  const hubs = mergeGeometries(
    [1, -1].map((side) => {
      const hub = new CylinderGeometry(hubRadius, hubRadius, 0.5, 20);
      hub.rotateX(Math.PI / 2);
      hub.translate(0, 0, side * hubZ);
      return hub;
    }),
  );

  const bolts: BufferGeometry[] = [];
  for (const side of [1, -1]) {
    for (let i = 0; i < BOLTS_PER_SIDE; i += 1) {
      const angle = (i / BOLTS_PER_SIDE) * Math.PI * 2;
      const bolt = new BoxGeometry(boltSize, boltSize, 0.08);
      bolt.applyMatrix4(
        new Matrix4().makeTranslation(
          Math.cos(angle) * boltOrbit,
          Math.sin(angle) * boltOrbit,
          side * boltZ,
        ),
      );
      bolts.push(bolt);
    }
  }

  const barrel = new CylinderGeometry(radius, radius, length, 48);
  barrel.rotateX(Math.PI / 2);

  const merged = mergeGeometries(bolts);
  if (!hubs || !merged) throw new Error('falha ao mesclar a geometria do rolo');

  return { barrel, hubs, bolts: merged };
}

/** A geometria de um corpo girante com este raio e comprimento. */
export function rollGeometry(radius: number, length: number): RollGeometry {
  const key = `${radius.toFixed(4)}:${length.toFixed(4)}`;
  let entry = cache.get(key);
  if (!entry) {
    entry = build(radius, length);
    cache.set(key, entry);
  }
  return entry;
}
