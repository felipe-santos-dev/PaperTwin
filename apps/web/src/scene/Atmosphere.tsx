import { useEffect, useMemo } from 'react';
import {
  allAssets,
  BUILDING_X0_M,
  BUILDING_X1_M,
  BUILDING_ROOF_Y_M,
  DRYER_BOTTOM_Y_M,
  DRYER_TOP_Y_M,
  MP1,
  SKYLIGHT_BANDS,
  SKYLIGHT_PANEL_M,
  SKYLIGHT_PITCH_M,
} from '@mp1/shared';
import {
  AdditiveBlending,
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  PlaneGeometry,
  Vector3,
} from 'three';
import { MeshBasicNodeMaterial, SpriteNodeMaterial } from 'three/webgpu';
import {
  color,
  cos,
  float,
  fract,
  length,
  mix,
  PI,
  positionWorld,
  range,
  sin,
  smoothstep,
  texture,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';

import type { FloatUniform, SceneUniforms } from './tsl/materials';

/**
 * O que se mexe na cena: vapor saindo pelas portas da capota e a poeira nos
 * fachos de luz das claraboias.
 *
 * Os dois andam por um uniform de tempo que a cena avança, em vez do `time` do
 * TSL — é o que deixa "Pausar" congelar tudo de verdade, e não só parar a
 * câmera. Um quadro parado é para examinar um ponto, e vapor correndo num
 * quadro parado atrapalha justamente isso.
 */

export interface AtmosphereProps {
  /** Nome do grupo, para a captura do ambiente poder escondê-lo. */
  readonly name: string;
  readonly uniforms: SceneUniforms;
  /** Tempo da cena, em segundos; congela quando pausado. */
  readonly clock: FloatUniform;
  /** Portas abertas: sem elas o vapor sai só pelas frestas. */
  readonly doorsOpen: boolean;
  /** Direção do sol, para projetar os fachos. */
  readonly sun: readonly [number, number, number];
  /** Textura de ruído compartilhada com os materiais. */
  readonly noise: Parameters<typeof texture>[0];
  /** Nº de sprites de vapor no total. */
  readonly steamBudget?: number;
}

const DOOR_SPLIT_Y = (DRYER_TOP_Y_M + DRYER_BOTTOM_Y_M) / 2;

/** Onde o vapor sai: um a cada três portas, para o orçamento render mais. */
function emitters(doorsOpen: boolean, hoodWallZ: number) {
  const xs = allAssets(MP1)
    .filter((asset) => asset.kind === 'dryer-cylinder' && asset.position[1] < DOOR_SPLIT_Y)
    .map((asset) => asset.position[0])
    .sort((a, b) => a - b)
    .filter((_, index) => index % 3 === 0);

  return xs.map((x) => ({
    position: [x, DOOR_SPLIT_Y + 2.6, hoodWallZ] as const,
    // de porta fechada sobra a fresta: menos vapor e mais rente à chapa
    power: doorsOpen ? 0.55 : 0.18,
  }));
}

export function Atmosphere({
  name,
  uniforms,
  clock,
  doorsOpen,
  sun,
  noise,
  steamBudget = 90,
}: AtmosphereProps) {
  void uniforms;

  const steam = useMemo(() => {
    const hoodWallZ = 4.15;
    const list = emitters(doorsOpen, hoodWallZ);
    const share = Math.max(8, Math.round(steamBudget / Math.max(1, list.length)));

    return list.map(({ position, power }) => {
      const material = new SpriteNodeMaterial({ transparent: true, depthWrite: false });
      const seed = range(0, 1);
      const life = fract(clock.mul(0.06).add(seed));
      const sideways = range(-0.85, 0.85);
      const drift = range(0.6, 1.6);

      const offset = vec3(
        sideways.add(
          sin(seed.mul(40).add(clock.mul(0.35)))
            .mul(life)
            .mul(0.6),
        ),
        life.mul(life).mul(5.5).add(life.mul(1.2)),
        life.mul(drift).add(
          cos(seed.mul(23).add(clock.mul(0.25)))
            .mul(life)
            .mul(0.5),
        ),
      );
      material.positionNode = vec3(...position).add(offset);
      material.scaleNode = mix(float(0.7), float(4.2), life).mul(power > 0.5 ? 1 : 0.6);

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
        .mul(0.13 * power);
      material.colorNode = vec4(color(0xcfccc6).mul(0.9), alpha);

      const mesh = new Mesh(new PlaneGeometry(1, 1), material);
      mesh.count = share;
      mesh.frustumCulled = false;
      mesh.renderOrder = 3;
      return mesh;
    });
  }, [clock, doorsOpen, noise, steamBudget]);

  /**
   * Os fachos das claraboias.
   *
   * Quatro paredes por painel, projetadas do telhado até o piso na direção do
   * sol, numa malha só: é um desenho e não trinta. A poeira é ruído rolando
   * devagar dentro do facho.
   */
  const shafts = useMemo(() => {
    const direction = new Vector3(...sun).normalize();
    const distance = BUILDING_ROOF_Y_M / -direction.y;

    const positions: number[] = [];
    const uvs: number[] = [];
    const xs: number[] = [];
    for (let x = BUILDING_X0_M + SKYLIGHT_PITCH_M; x < BUILDING_X1_M - 2; x += SKYLIGHT_PITCH_M) {
      xs.push(x);
    }

    for (const band of SKYLIGHT_BANDS) {
      for (const cx of xs) {
        const corners: readonly (readonly [number, number])[] = [
          [cx - SKYLIGHT_PANEL_M / 2, band.from],
          [cx + SKYLIGHT_PANEL_M / 2, band.from],
          [cx + SKYLIGHT_PANEL_M / 2, band.to],
          [cx - SKYLIGHT_PANEL_M / 2, band.to],
        ];
        for (let i = 0; i < 4; i += 1) {
          const a = corners[i] as readonly [number, number];
          const b = corners[(i + 1) % 4] as readonly [number, number];
          const top = [
            [a[0], BUILDING_ROOF_Y_M, a[1]],
            [b[0], BUILDING_ROOF_Y_M, b[1]],
          ] as const;
          const floor = top.map(
            (p) => [p[0] + direction.x * distance, 0, p[2] + direction.z * distance] as const,
          );
          positions.push(
            ...top[0],
            ...top[1],
            ...(floor[1] as readonly number[]),
            ...top[0],
            ...(floor[1] as readonly number[]),
            ...(floor[0] as readonly number[]),
          );
          uvs.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
        }
      }
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));

    const material = new MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: AdditiveBlending,
    });
    const u = uv();
    const edge = sin(u.x.mul(PI)).pow(3.0);
    const along = smoothstep(0.0, 0.12, u.y).mul(smoothstep(1.0, 0.55, u.y));
    const dust = texture(
      noise,
      vec2(
        positionWorld.x.mul(0.15).add(clock.mul(0.004)),
        positionWorld.y.mul(0.08).sub(clock.mul(0.01)),
      ),
    ).g;
    const alpha = edge
      .mul(along)
      .mul(mix(0.3, 1.0, dust))
      .mul(0.02);
    material.colorNode = vec4(color(0xffe9c8).mul(alpha), 1);
    material.fog = false;

    const mesh = new Mesh(geometry, material);
    mesh.renderOrder = 2;
    mesh.frustumCulled = false;
    return mesh;
  }, [clock, noise, sun]);

  useEffect(
    () => () => {
      for (const mesh of steam) {
        mesh.geometry.dispose();
        (mesh.material as { dispose: () => void }).dispose();
      }
      shafts.geometry.dispose();
      (shafts.material as { dispose: () => void }).dispose();
    },
    [steam, shafts],
  );

  return (
    <group name={name}>
      {steam.map((mesh, index) => (
        <primitive key={index} object={mesh} />
      ))}
      <primitive object={shafts} />
    </group>
  );
}
