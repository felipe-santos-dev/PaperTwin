import { useEffect, useMemo } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import {
  allAssets,
  assetByTag,
  BEARING_RADIUS_RATIO,
  MP1,
  type AssetTag,
  type IsoZone,
  type MachineAsset,
} from '@mp1/shared';
import { CylinderGeometry } from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';

import { useScene } from './sceneState';

/**
 * Os mancais, as únicas malhas vivas por cima da geometria assada.
 *
 * Tudo o mais na cena é um GLB com a luz já assada; o mancal não pode ser,
 * porque a cor dele é um dado que muda: a zona da ISO 20816-3 em que a
 * vibração medida caiu. São também os únicos ativos clicáveis, que é o caminho
 * curto entre "vi algo estranho na máquina" e "o que esse mancal está fazendo".
 *
 * Um por ativo `bearing` do modelo — nenhuma posição é escrita aqui.
 */

/**
 * As cores das zonas.
 *
 * A escala não é um gradiente de verde a vermelho: A e B são tons dessaturados,
 * porque a máquina normal não deve chamar atenção, e só C e D puxam cor. Quem
 * olha a cena de longe enxerga onde há problema sem ter que ler tag nenhuma.
 */
const ZONE_COLOR: Record<IsoZone, number> = {
  A: 0x5d6b63,
  B: 0x7c8578,
  C: 0xd6a23a,
  D: 0xf2555a,
};

/** Sem leitura: cinza neutro, que não se confunde com nenhuma zona. */
const NO_READING = 0x6b6f72;

/** Selecionado e sob o cursor. */
const HIGHLIGHT = 0x4f8cff;

export interface BearingsProps {
  /**
   * A zona de cada mancal, quando há leitura.
   *
   * Fica como entrada opcional de propósito: hoje nenhuma tela da aplicação
   * busca a vibração dos 86 mancais de uma vez, e inventar essa busca mexeria
   * no back-end. Sem o mapa, todos ficam em cinza neutro — que é a verdade:
   * não há leitura. Quando as telas forem refeitas, é só passar o mapa.
   */
  readonly zones?: ReadonlyMap<AssetTag, IsoZone> | undefined;
}

export function Bearings({ zones }: BearingsProps) {
  const { selectedTag, select, hover, hoveredTag } = useScene();

  const bearings = useMemo(
    () => allAssets(MP1).filter((asset): asset is MachineAsset => asset.kind === 'bearing'),
    [],
  );

  /** Uma geometria para todos: o raio varia com o corpo, então entra na escala. */
  const geometry = useMemo(() => {
    const g = new CylinderGeometry(1, 1, 1, 20);
    // o eixo do mancal atravessa a máquina, que é o Z da cena
    g.rotateX(Math.PI / 2);
    return g;
  }, []);

  /** Um material por cor, não por mancal: são 86 malhas e cinco cores. */
  const materials = useMemo(() => {
    const make = (hex: number) => {
      const m = new MeshStandardNodeMaterial();
      m.color.setHex(hex);
      m.roughness = 0.45;
      m.metalness = 0.1;
      return m;
    };
    return {
      none: make(NO_READING),
      highlight: make(HIGHLIGHT),
      A: make(ZONE_COLOR.A),
      B: make(ZONE_COLOR.B),
      C: make(ZONE_COLOR.C),
      D: make(ZONE_COLOR.D),
    };
  }, []);

  useEffect(
    () => () => {
      geometry.dispose();
      for (const material of Object.values(materials)) material.dispose();
    },
    [geometry, materials],
  );

  // o cursor volta ao normal se o componente sair com o ponteiro em cima
  useEffect(
    () => () => {
      document.body.style.cursor = '';
    },
    [],
  );

  return (
    <group>
      {bearings.map((asset) => {
        const parent = asset.parentTag ? assetByTag(MP1, asset.parentTag) : null;
        const radius = (parent?.radius ?? 0.6) * BEARING_RADIUS_RATIO;
        const [x, y, z] = asset.position;
        const active = selectedTag === asset.tag || hoveredTag === asset.tag;
        const zone = zones?.get(asset.tag);
        const material = active ? materials.highlight : zone ? materials[zone] : materials.none;

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
          select(selectedTag === asset.tag ? null : asset.tag);
        };

        return (
          <mesh
            key={asset.tag}
            name={asset.tag}
            geometry={geometry}
            material={material}
            position={[x, y, z]}
            scale={[radius, radius, 0.42]}
            onPointerOver={onOver}
            onPointerOut={onOut}
            onClick={onClick}
          />
        );
      })}
    </group>
  );
}
