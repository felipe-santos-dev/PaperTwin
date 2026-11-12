import {
  type Group,
  LinearMipmapLinearFilter,
  Mesh,
  SRGBColorSpace,
  TextureLoader,
  type Texture,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

import { buildMaterial, type MaterialContext } from './tsl/materials';

/**
 * Carrega o que o bake produziu: a geometria, os lightmaps e o `scene.json`.
 *
 * Os arquivos vêm de `public/scene/`, gerados por `tools/scene-bake`. O GLB está
 * comprimido com meshopt, então o decodificador entra antes do parse.
 */

/** Uma zona de bake, como o `scene.json` a descreve. */
export interface ZoneMeta {
  readonly id: string;
  readonly label: string;
  readonly group: 'machine' | 'building';
  readonly lightmap: string;
  /** Escala da irradiância: o material devolve `lightMapIntensity = scale · π`. */
  readonly scale: number;
  /** Irradiância de referência, para a oclusão especular dos metais. */
  readonly ref: number;
}

export interface SceneMeta {
  readonly schema: number;
  readonly zones: readonly ZoneMeta[];
  /** Direção do sol, no referencial da cena. */
  readonly sun: readonly [number, number, number];
  /** Linha de dobradiça das portas superiores da capota. */
  readonly hoodDoorHinge: { readonly y: number; readonly z: number };
  readonly hoodTop: number;
  readonly exposure: number;
}

export interface LoadedScene {
  readonly meta: SceneMeta;
  readonly root: Group;
  /** Quantas chamadas de desenho a geometria assada custa. */
  readonly meshCount: number;
}

const BASE = 'scene/';

function loadTexture(url: string): Promise<Texture> {
  return new Promise((resolve, reject) => {
    new TextureLoader().load(
      url,
      (texture) => {
        // O lightmap é um atlas: não repete, e o UV vem do canal 0.
        texture.flipY = false;
        texture.colorSpace = SRGBColorSpace;
        texture.channel = 0;
        texture.generateMipmaps = true;
        texture.minFilter = LinearMipmapLinearFilter;
        resolve(texture);
      },
      undefined,
      reject,
    );
  });
}

async function load(base: string, context: MaterialContext): Promise<LoadedScene> {
  const meta = (await (await fetch(`${base}scene.json`)).json()) as SceneMeta;
  if (meta.schema !== 1) {
    throw new Error(`scene.json com schema ${String(meta.schema)}; esta cena espera 1.`);
  }

  // a linha de dobradiça é do bake, não do código: as portas giram em torno dela
  context.uniforms.hingeY.value = meta.hoodDoorHinge.y;
  context.uniforms.hingeZ.value = meta.hoodDoorHinge.z;

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);

  const [gltf, ...textures] = await Promise.all([
    loader.loadAsync(`${base}mp1.glb`),
    ...meta.zones.map((zone) => loadTexture(`${base}${zone.lightmap}`)),
  ]);

  const lightmaps = new Map<string, { texture: Texture; zone: ZoneMeta }>();
  meta.zones.forEach((zone, index) => {
    const texture = textures[index];
    if (texture) lightmaps.set(zone.id, { texture, zone });
  });

  /**
   * Cada malha recebe o material da sua zona.
   *
   * O nome vem do GLB como `zona__material`: a zona diz qual lightmap aplicar e
   * o material diz qual receita TSL usar. O cache é pelo nome inteiro, porque
   * dois grupos de vapor usam o mesmo ferro fundido com lightmaps diferentes.
   */
  const cache = new Map<string, ReturnType<typeof buildMaterial>>();
  let meshCount = 0;

  gltf.scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    meshCount += 1;

    const full = (object.material as { name?: string }).name ?? object.name;
    const [zoneId = '', materialName = full] = full.split('__');
    const entry = lightmaps.get(zoneId);

    let material = cache.get(full);
    if (!material) {
      material = buildMaterial(
        materialName,
        entry?.texture ?? null,
        entry?.zone.scale ?? 1,
        entry?.zone.ref ?? 1,
        context,
      );
      cache.set(full, material);
    }
    object.material = material;
    object.frustumCulled = true;
  });

  return { meta, root: gltf.scene, meshCount };
}

let pending: Promise<LoadedScene> | null = null;

/**
 * A promessa do carregamento, memorizada.
 *
 * `use()` relê a promessa a cada render enquanto ela não resolve; sem memorizar,
 * cada render começaria um download novo.
 */
export function sceneResource(context: MaterialContext, base = BASE): Promise<LoadedScene> {
  pending ??= load(base, context);
  return pending;
}

/** Só para os testes: esquece o que já foi carregado. */
export function resetSceneResource(): void {
  pending = null;
}
