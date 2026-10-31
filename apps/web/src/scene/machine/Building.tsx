import { useLayoutEffect, useMemo, useRef } from 'react';
import { IcosahedronGeometry, type InstancedMesh, MeshStandardMaterial, Object3D } from 'three';
import { materials } from '../materials';

/**
 * A sala de máquinas em volta da MP1.
 *
 * O piso tem uma abertura corrida sob a secagem — é por ali que o refugo cai no
 * porão quando a folha quebra. Desenhar o porão muda a leitura da cena: a
 * máquina deixa de flutuar e passa a estar apoiada em alguma coisa.
 */

export interface BuildingProps {
  /** Extensão da abertura do piso, em X. */
  readonly pitFrom: number;
  readonly pitTo: number;
  readonly halfWidth: number;
}

const FLOOR_Y = 0;
const CEILING_Y = 19;
const PIT_FLOOR_Y = -6;
const SCRAP_COUNT = 9000;

export function Building({ pitFrom, pitTo, halfWidth }: BuildingProps) {
  const m = materials();
  const pitHalf = halfWidth + 0.6;
  const pitLength = pitTo - pitFrom;
  const center = (pitFrom + pitTo) / 2;

  /** O piso é recortado em quatro peças em volta da abertura. */
  const slabs = useMemo(
    () =>
      [
        { x0: -90, x1: pitFrom, z0: -50, z1: 70 },
        { x0: pitTo, x1: 170, z0: -50, z1: 70 },
        { x0: pitFrom, x1: pitTo, z0: pitHalf, z1: 70 },
        { x0: pitFrom, x1: pitTo, z0: -50, z1: -pitHalf },
      ].map((s) => ({
        width: s.x1 - s.x0,
        depth: s.z1 - s.z0,
        x: (s.x0 + s.x1) / 2,
        z: (s.z0 + s.z1) / 2,
      })),
    [pitFrom, pitTo, pitHalf],
  );

  const pillars = useMemo(() => {
    const out: { x: number; z: number }[] = [];
    for (let x = pitFrom; x <= pitTo; x += 4.4) {
      out.push({ x, z: -pitHalf + 0.3 }, { x, z: pitHalf - 0.3 });
    }
    return out;
  }, [pitFrom, pitTo, pitHalf]);

  const lamps = useMemo(() => {
    const out: { x: number; z: number }[] = [];
    for (let x = -10; x < 110; x += 12) for (const z of [-2, 12, 24]) out.push({ x, z });
    return out;
  }, []);

  // refugo acumulado no porão: 9000 lascas em uma única chamada de desenho
  const scrap = useRef<InstancedMesh>(null);
  const scrapGeometry = useMemo(() => new IcosahedronGeometry(0.14, 0), []);
  const scrapMaterial = useMemo(
    () => new MeshStandardMaterial({ color: 0xc9cbd8, roughness: 0.9, flatShading: true }),
    [],
  );

  useLayoutEffect(() => {
    const mesh = scrap.current;
    if (!mesh) return;

    let seed = 7;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };

    // montes de refugo, mais alto onde o papel cai com mais frequência
    const mounds = Array.from({ length: 9 }, () => ({
      x: pitFrom + 3 + rand() * (pitLength - 6),
      z: (rand() - 0.5) * 6,
      height: 0.6 + rand() * 1.1,
      spread: 2 + rand() * 3,
    }));
    const heightAt = (x: number, z: number) =>
      mounds.reduce(
        (sum, mound) =>
          sum +
          mound.height * Math.exp(-((x - mound.x) ** 2 + (z - mound.z) ** 2) / mound.spread ** 2),
        0.15,
      );

    const dummy = new Object3D();
    for (let i = 0; i < SCRAP_COUNT; i += 1) {
      const x = pitFrom + rand() * pitLength;
      const z = (rand() - 0.5) * 2 * (pitHalf + 2);
      dummy.position.set(x, PIT_FLOOR_Y + rand() * heightAt(x, z), z);
      dummy.rotation.set(rand() * 6, rand() * 6, rand() * 6);
      const scale = 0.6 + rand() * 1.6;
      dummy.scale.set(scale * 1.4, scale * 0.35, scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [pitFrom, pitLength, pitHalf]);

  return (
    <group>
      {slabs.map((slab) => (
        <mesh
          key={`${String(slab.x)}:${String(slab.z)}`}
          material={m.concrete}
          position={[slab.x, FLOOR_Y, slab.z]}
          rotation={[-Math.PI / 2, 0, 0]}
          receiveShadow
        >
          <planeGeometry args={[slab.width, slab.depth]} />
        </mesh>
      ))}

      <mesh position={[40, CEILING_Y, 10]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[260, 120]} />
        <meshStandardMaterial color="#50545a" roughness={0.8} />
      </mesh>
      {/*
        A parede do fundo, atrás do lado acionamento.

        Ela recuou de 16 para 24 m quando os motores entraram na cena: os
        acionamentos ocupam até uns 10 m para fora do centro da máquina, e uma
        parede a 16 m deixava seis metros de corredor — menos do que basta para
        a câmera olhar a fileira de motores de frente.
      */}
      <mesh position={[40, 9.5, -24]}>
        <boxGeometry args={[260, 19, 0.4]} />
        <meshStandardMaterial color="#3a3e45" roughness={0.9} />
      </mesh>

      {lamps.map((lamp) => (
        <mesh
          key={`${String(lamp.x)}:${String(lamp.z)}`}
          material={m.lamp}
          position={[lamp.x, CEILING_Y - 0.2, lamp.z]}
        >
          <boxGeometry args={[1.6, 0.12, 0.5]} />
        </mesh>
      ))}

      {/* porão */}
      <mesh position={[center, PIT_FLOOR_Y, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[pitLength + 6, 2 * pitHalf + 6]} />
        <meshStandardMaterial color="#4a4740" roughness={0.7} />
      </mesh>
      {[-pitHalf - 3, pitHalf + 3].map((z) => (
        <mesh key={z} position={[center, PIT_FLOOR_Y / 2, z]}>
          <boxGeometry args={[pitLength + 6, 6, 0.3]} />
          <meshStandardMaterial color="#5a5548" roughness={0.9} />
        </mesh>
      ))}
      {pillars.map((pillar) => (
        <mesh
          key={`${String(pillar.x)}:${String(pillar.z)}`}
          position={[pillar.x, PIT_FLOOR_Y / 2, pillar.z]}
          castShadow
        >
          <boxGeometry args={[0.45, 6, 0.45]} />
          <meshStandardMaterial color="#b8ae96" roughness={0.8} />
        </mesh>
      ))}

      {/* tubulação de vapor e condensado */}
      {(
        [
          [-0.9, -4.4, 0.35],
          [-0.9, 4.4, 0.3],
          [-1.7, -3.6, 0.22],
        ] as const
      ).map(([y, z, radius]) => (
        <mesh
          key={`${String(y)}:${String(z)}`}
          position={[center, y, z]}
          rotation={[0, 0, Math.PI / 2]}
        >
          <cylinderGeometry args={[radius, radius, pitLength, 16]} />
          <meshStandardMaterial color="#c22d3e" roughness={0.5} metalness={0.2} />
        </mesh>
      ))}

      <instancedMesh ref={scrap} args={[scrapGeometry, scrapMaterial, SCRAP_COUNT]} receiveShadow />

      {[pitFrom + 10, pitFrom + 30].map((x) => (
        <pointLight key={x} position={[x, -1.2, 3]} color="#c8d4ff" intensity={22} distance={22} />
      ))}
    </group>
  );
}
