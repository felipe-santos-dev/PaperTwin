import { useEffect, useMemo } from 'react';
import { allAssets, DRYER_BOTTOM_Y_M, DRYER_TOP_Y_M, MP1 } from '@mp1/shared';
import { Mesh, PlaneGeometry } from 'three';
import { SpriteNodeMaterial } from 'three/webgpu';
import {
  color,
  cos,
  float,
  fract,
  length,
  mix,
  PI,
  range,
  sin,
  smoothstep,
  texture,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';

import type { FloatUniform } from './tsl/materials';

/**
 * O que se mexe na cena: o vapor saindo pelas portas abertas da capota.
 *
 * Discreto de propósito. A cena é de estúdio — luz branca, máquina inteira
 * legível — e vapor demais na frente da secagem esconde justamente o que se
 * quer ver. Os fachos de sol e a poeira saíram junto com o galpão.
 *
 * O vapor anda por um uniform de tempo que a cena avança, em vez do `time` do
 * TSL: é o que deixa "Pausar" congelá-lo de verdade.
 */

export interface AtmosphereProps {
  /** Nome do grupo, para a captura do ambiente poder escondê-lo. */
  readonly name: string;
  /** Tempo da cena, em segundos; congela quando pausado. */
  readonly clock: FloatUniform;
  /** Portas abertas: sem elas o vapor sai só pelas frestas. */
  readonly doorsOpen: boolean;
  /** Textura de ruído compartilhada com os materiais. */
  readonly noise: Parameters<typeof texture>[0];
  /** Z da parede da capota no lado comando, por onde o vapor sai. */
  readonly hoodWallZ: number;
  /** Nº de sprites de vapor no total. */
  readonly steamBudget?: number;
}

const DOOR_SPLIT_Y = (DRYER_TOP_Y_M + DRYER_BOTTOM_Y_M) / 2;

/** Onde o vapor sai: uma a cada três portas, para o orçamento render mais. */
function emitters(doorsOpen: boolean, hoodWallZ: number) {
  const xs = allAssets(MP1)
    .filter((asset) => asset.kind === 'dryer-cylinder' && asset.position[1] < DOOR_SPLIT_Y)
    .map((asset) => asset.position[0])
    .sort((a, b) => a - b)
    .filter((_, index) => index % 3 === 0);

  return xs.map((x) => ({
    position: [x, DOOR_SPLIT_Y + 2.6, hoodWallZ] as const,
    // de porta fechada sobra a fresta: menos vapor e mais rente à chapa
    power: doorsOpen ? 0.45 : 0.15,
  }));
}

export function Atmosphere({
  name,
  clock,
  doorsOpen,
  noise,
  hoodWallZ,
  steamBudget = 72,
}: AtmosphereProps) {
  const steam = useMemo(() => {
    const list = emitters(doorsOpen, hoodWallZ);
    const share = Math.max(6, Math.round(steamBudget / Math.max(1, list.length)));

    return list.map(({ position, power }) => {
      const material = new SpriteNodeMaterial({ transparent: true, depthWrite: false });
      const seed = range(0, 1);
      const life = fract(clock.mul(0.06).add(seed));
      const sideways = range(-0.85, 0.85);
      const drift = range(0.6, 1.6);

      const offset = vec3(
        sideways.add(sin(seed.mul(40).add(clock.mul(0.35))).mul(life).mul(0.6)),
        life.mul(life).mul(5.5).add(life.mul(1.2)),
        life.mul(drift).add(cos(seed.mul(23).add(clock.mul(0.25))).mul(life).mul(0.5)),
      );
      material.positionNode = vec3(...position).add(offset);
      material.scaleNode = mix(float(0.6), float(3.4), life);

      const centred = uv().sub(0.5);
      const soft = smoothstep(0.5, 0.05, length(centred));
      const wisps = texture(
        noise,
        uv()
          .mul(0.7)
          .add(vec2(seed.mul(7.3), seed.mul(3.1).add(clock.mul(0.02)))),
      ).g;
      const fade = sin(life.mul(PI)).pow(1.4);
      const alpha = soft
        .mul(smoothstep(0.25, 0.8, wisps))
        .mul(fade)
        .mul(0.12 * power);
      material.colorNode = vec4(color(0xf2f2f0), alpha);

      const mesh = new Mesh(new PlaneGeometry(1, 1), material);
      mesh.count = share;
      mesh.frustumCulled = false;
      mesh.renderOrder = 3;
      return mesh;
    });
  }, [clock, doorsOpen, noise, hoodWallZ, steamBudget]);

  useEffect(
    () => () => {
      for (const mesh of steam) {
        mesh.geometry.dispose();
        (mesh.material as { dispose: () => void }).dispose();
      }
    },
    [steam],
  );

  return (
    <group name={name}>
      {steam.map((mesh, index) => (
        <primitive key={index} object={mesh} />
      ))}
    </group>
  );
}
