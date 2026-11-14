import { DoubleSide, type Texture } from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import {
  abs,
  clamp,
  color,
  float,
  fract,
  luminance,
  max,
  mix,
  normalWorld,
  positionWorld,
  smoothstep,
  texture,
  uniform,
  uv,
  vec2,
  bumpMap,
} from 'three/tsl';

import { makeNoiseTexture } from './noise';

/**
 * Os materiais procedurais da cena, em TSL.
 *
 * O nome do material no GLB é o contrato: o Blender exporta `zona__material`, e
 * é por ele que cada malha recebe o seu material daqui e o lightmap da sua zona.
 * Nenhuma textura de superfície é baixada — a cor, a rugosidade e a sujeira são
 * calculadas a partir da posição de mundo, que é o que deixa a máquina inteira
 * caber em 1,75 MB de geometria.
 *
 * A luz é assada: o `lightMap` traz a irradiância e o material só descreve a
 * superfície.
 */

const NOISE = /* @__PURE__ */ makeNoiseTexture();

/**
 * O tipo de um uniform de número.
 *
 * Os tipos do three nomeiam cada nó pelo tipo de dado que ele carrega
 * (`Node<'vec3'>`, `ConstNode<'color'>`) e não exportam um apelido para "um nó
 * qualquer"; capturar pelo retorno de `uniform` dá o nome sem inventar nada.
 */
const makeFloatUniform = (value: number) => uniform(value);
export type FloatUniform = ReturnType<typeof makeFloatUniform>;

/** Ruído amostrado por coordenada. */
const nz = (coord: unknown) => texture(NOISE, coord as never);

/**
 * Amostragem triplanar no espaço do mundo.
 *
 * A geometria vem do Blender sem UV de superfície — só o UV do lightmap —,
 * então todo detalhe de material é projetado pelas três faces e misturado pela
 * normal. Também é o que faz o grão não esticar numa viga comprida.
 */
function tri(scale: number) {
  const p = positionWorld.mul(scale);
  const w = abs(normalWorld);
  const ws = w.div(w.x.add(w.y).add(w.z));
  return nz(p.zy).mul(ws.x).add(nz(p.xz).mul(ws.y)).add(nz(p.xy).mul(ws.z));
}

/** Coordenada horizontal ao longo da face, para emendas e escorrimento. */
const faceU = () => mix(positionWorld.x, positionWorld.z, smoothstep(0.6, 0.8, abs(normalWorld.x)));

/** Uniforms que a cena manipula depois de montar os materiais. */
export interface SceneUniforms {
  /** Liga e desliga a luz assada. */
  readonly lightMapOn: FloatUniform;
}

export function createUniforms(): SceneUniforms {
  return {
    lightMapOn: makeFloatUniform(1),
  };
}

type Spec = (material: MeshStandardNodeMaterial) => void;

interface PaintedOptions {
  rough?: number;
  metal?: number;
  grime?: number;
  scale?: number;
  dirtFloor?: boolean;
}

/** Superfície pintada: cor com sujeira e rugosidade variando com o grão. */
function painted(hex: number, options: PaintedOptions = {}): Spec {
  const { rough = 0.55, metal = 0, grime = 0.35, scale = 0.6, dirtFloor = true } = options;
  return (m) => {
    const n = tri(scale);
    const fine = tri(scale * 6);
    let col = color(hex)
      .mul(mix(float(1 - grime), float(1), n.g))
      .mul(mix(0.88, 1.0, fine.r));
    // sujeira acumulada perto do piso
    if (dirtFloor) col = col.mul(mix(0.62, 1.0, smoothstep(0.0, 1.6, positionWorld.y)));
    m.colorNode = col;
    m.roughnessNode = clamp(
      float(rough).add(n.b.sub(0.5).mul(0.25)).add(fine.r.sub(0.5).mul(0.1)),
      0.05,
      1,
    );
    m.metalnessNode = float(metal);
  };
}

/** Metal: cor quase constante, o que varia é a rugosidade. */
function metal(
  hex: number,
  options: { rough?: number; variation?: number; scale?: number } = {},
): Spec {
  const { rough = 0.3, variation = 0.12, scale = 1.2 } = options;
  return (m) => {
    const n = tri(scale);
    const fine = tri(scale * 8);
    m.colorNode = color(hex).mul(mix(0.8, 1.05, n.g));
    m.roughnessNode = clamp(
      float(rough)
        .add(n.r.sub(0.5).mul(variation * 2))
        .add(fine.a.sub(0.5).mul(variation)),
      0.04,
      1,
    );
    m.metalnessNode = float(1);
  };
}

/** Chapa de alumínio da capota: emendas a cada 0,9 m e escorrimento abaixo delas. */
function hood(m: MeshStandardNodeMaterial, hex: number) {
  const u = faceU();
  const d = abs(fract(u.div(0.9).add(0.5)).sub(0.5)).mul(0.9);
  const dh = abs(fract(positionWorld.y.div(1.2)).sub(0.5)).mul(1.2);
  const seam = max(smoothstep(0.012, 0.004, d), smoothstep(0.01, 0.003, abs(dh.sub(0.59))));
  const n = tri(0.5);
  const run = nz(vec2(u.mul(1.7), positionWorld.y.mul(0.06))).a;
  const runMask = smoothstep(0.12, 0.0, d).mul(smoothstep(0.55, 0.85, run));
  m.colorNode = color(hex)
    .mul(mix(0.78, 1.0, n.g))
    .mul(mix(1.0, 0.45, seam))
    .mul(mix(1.0, 0.72, runMask))
    .mul(mix(0.6, 1.0, smoothstep(0.0, 1.4, positionWorld.y)));
  m.roughnessNode = clamp(float(0.42).add(n.r.sub(0.5).mul(0.3)).add(runMask.mul(0.2)), 0.1, 0.9);
  m.metalnessNode = float(0.15);
}

/**
 * Concreto do piso.
 *
 * O grão é fino e de pouco contraste. Com o ruído a 0,35 por metro as manchas
 * tinham uns 3 m e liam como textura de baixa resolução esticada; agora o
 * desenho vem de três escalas — mancha larga e fraca, grão médio e areia —, e
 * nenhuma delas domina. Sem poças: no estúdio elas espelhavam o fundo escuro
 * e, de longe, também liam como manchas.
 */
function concreteFloor(m: MeshStandardNodeMaterial, hex: number) {
  const broad = nz(positionWorld.xz.mul(0.09));
  const n = tri(1.6);
  const fine = nz(positionWorld.xz.mul(7.0));
  // juntas de dilatação a cada 6 m
  const jx = smoothstep(0.012, 0.0, abs(abs(fract(positionWorld.x.div(6)).sub(0.5)).sub(0.498)));
  const jz = smoothstep(0.012, 0.0, abs(abs(fract(positionWorld.z.div(6)).sub(0.5)).sub(0.498)));
  const joint = max(jx, jz);
  const base = mix(color(hex), color(0x8b8780), broad.g.mul(0.6).add(n.g.mul(0.4)))
    .mul(mix(0.9, 1.0, fine.r))
    .mul(mix(0.9, 1.0, n.b));
  m.colorNode = base.mul(mix(1.0, 0.45, joint));
  m.roughnessNode = float(0.8).add(fine.g.sub(0.5).mul(0.2));
  m.metalnessNode = float(0);
  m.normalNode = bumpMap(fine.r, float(0.25));
}

function stripe(m: MeshStandardNodeMaterial, zebra: boolean) {
  const n = tri(1.0);
  const wear = smoothstep(0.12, 0.35, nz(positionWorld.xz.mul(0.9)).r);
  // faixa zebrada: listras de 0,8 m na diagonal do piso. Na faixa lisa a listra
  // escura também é amarela, o que dispensa um caminho separado no grafo.
  const zebraMask = smoothstep(0.48, 0.52, fract(positionWorld.x.add(positionWorld.z).mul(1.25)));
  const col = mix(color(zebra ? 0x111111 : 0xd6a614), color(0xd6a614), zebraMask);
  m.colorNode = mix(color(0x6f6c66), col, wear).mul(mix(0.8, 1.0, n.g));
  m.roughnessNode = float(0.6);
  m.metalnessNode = float(0);
}

/**
 * Os materiais, por nome.
 *
 * As chaves são exatamente os nomes da paleta do gerador
 * (`tools/scene-bake/parts.py`). Um nome que chegue aqui sem entrada recebe um
 * cinza médio e um aviso — é melhor ver a peça errada do que não ver a peça.
 */
const SPECS: Record<string, Spec> = {
  cil_ferro: (m) => {
    // ferro fundido polido: riscos circunferenciais e manchas de condensado
    const n = tri(0.9);
    const streak = nz(vec2(positionWorld.z.mul(0.08), positionWorld.x.mul(3.0))).a;
    m.colorNode = color(0x6b6f73)
      .mul(mix(0.7, 1.05, n.g))
      .mul(mix(0.85, 1.0, streak));
    m.roughnessNode = clamp(
      float(0.22).add(n.b.sub(0.5).mul(0.3)).add(streak.sub(0.5).mul(0.12)),
      0.08,
      0.7,
    );
    m.metalnessNode = float(1);
  },
  cil_cabeca: painted(0x3a3e43, { rough: 0.6, grime: 0.4 }),
  munhao: metal(0x8b8f93, { rough: 0.32 }),
  estrutura: painted(0x2b3035, { rough: 0.5, grime: 0.45, scale: 0.8 }),
  estrutura_clara: painted(0xd0d4d8, { rough: 0.55, grime: 0.3, scale: 0.7 }),
  mancal_corpo: painted(0x2b5a88, { rough: 0.42, grime: 0.4, scale: 1.5 }),
  mancal_tampa: painted(0xd5cbae, { rough: 0.48, grime: 0.45, scale: 1.8 }),
  protecao_amarela: painted(0xe0ad1a, { rough: 0.5, grime: 0.5, scale: 1.5 }),
  junta_latao: metal(0xc29a55, { rough: 0.3, variation: 0.18, scale: 3 }),
  mangueira: painted(0x161616, { rough: 0.62, grime: 0.2, scale: 2, dirtFloor: false }),
  caixa_juncao: painted(0x9aa1a7, { rough: 0.45, grime: 0.3, scale: 2 }),
  rolo_feltro: metal(0x7f8489, { rough: 0.34 }),
  rolo_borracha: painted(0x2a2e33, { rough: 0.55, grime: 0.25, scale: 1.6, dirtFloor: false }),

  feltro: (m) => {
    const weave = nz(positionWorld.xz.mul(9.0)).r;
    m.colorNode = color(0x26363f).mul(mix(0.8, 1.1, weave));
    m.roughnessNode = float(0.95);
    m.metalnessNode = float(0);
    m.side = DoubleSide;
  },
  tela_formacao: (m) => {
    // tela de formação: trama mais fina e aberta que a do feltro, cinza-azulada
    // para não se confundir com o feltro bege nem com a folha
    const weave = nz(positionWorld.xz.mul(22.0)).r;
    m.colorNode = color(0x7a90a1).mul(mix(0.82, 1.1, weave));
    m.roughnessNode = float(0.7);
    m.metalnessNode = float(0.2);
    m.side = DoubleSide;
  },
  feltro_prensa: (m) => {
    // feltro de prensa: bege, grosso e fosco
    const weave = nz(positionWorld.xz.mul(7.0)).r;
    m.colorNode = color(0xc4ae86).mul(mix(0.86, 1.06, weave));
    m.roughnessNode = float(0.95);
    m.metalnessNode = float(0);
    m.side = DoubleSide;
  },
  papel: (m) => {
    m.colorNode = color(0xe8e7e1).mul(mix(0.93, 1.0, tri(2).r));
    m.roughnessNode = float(0.82);
    m.metalnessNode = float(0);
    m.side = DoubleSide;
  },
  sapata_correia: painted(0x1d2328, { rough: 0.5, grime: 0.2, scale: 2.4, dirtFloor: false }),
  manta_sapata: painted(0x2e6b74, { rough: 0.48, grime: 0.15, scale: 2, dirtFloor: false }),

  capota_painel: (m) => {
    hood(m, 0x9ea3a6);
  },
  capota_porta: (m) => {
    hood(m, 0xaeb2b4);
  },
  capota_moldura: metal(0x8e9398, { rough: 0.38 }),
  porta_moldura: metal(0x8e9398, { rough: 0.38 }),
  vidro: (m) => {
    m.colorNode = color(0x0f1418);
    m.roughnessNode = float(0.04);
    m.metalnessNode = float(0);
  },

  passarela: (m) => {
    // grade de piso: malha de 30 × 100 mm sugerida por linhas escuras
    const g1 = smoothstep(0.32, 0.42, abs(fract(positionWorld.x.mul(33)).sub(0.5)));
    const g2 = smoothstep(0.4, 0.47, abs(fract(positionWorld.z.mul(10)).sub(0.5)));
    const grid = max(g1, g2);
    const n = tri(1.2);
    m.colorNode = color(0x80858a)
      .mul(mix(1.0, 0.18, grid))
      .mul(mix(0.75, 1.0, n.g));
    m.roughnessNode = mix(float(0.4), float(0.85), grid);
    m.metalnessNode = mix(float(0.85), float(0.2), grid);
  },
  guarda_corpo: painted(0xe0ad1d, { rough: 0.42, grime: 0.35, scale: 2.5, dirtFloor: false }),
  tubo_vermelho: painted(0x8f2820, { rough: 0.48, grime: 0.4, scale: 1.2 }),
  tubo_isolado: (m) => {
    // jaqueta de alumínio: costuras a cada metro
    const seam = smoothstep(0.012, 0.0, abs(abs(fract(positionWorld.x).sub(0.5)).sub(0.49)));
    const n = tri(1.5);
    m.colorNode = color(0xc5c9cc)
      .mul(mix(0.75, 1.0, n.g))
      .mul(mix(1.0, 0.6, seam));
    m.roughnessNode = clamp(float(0.32).add(n.r.sub(0.5).mul(0.3)), 0.1, 0.8);
    m.metalnessNode = float(1);
  },
  duto: metal(0xa0a5a9, { rough: 0.38, variation: 0.2, scale: 0.8 }),

  caixa_drenagem: metal(0xa7aeb3, { rough: 0.36, variation: 0.15, scale: 1.4 }),
  motor: painted(0x4b6955, { rough: 0.5, grime: 0.25, scale: 1.6 }),

  piso: (m) => {
    concreteFloor(m, 0x6c6a65);
  },
  laje: (m) => {
    concreteFloor(m, 0x7f7d79);
  },
  fosso: painted(0x444440, { rough: 0.75, grime: 0.5, scale: 0.5, dirtFloor: false }),
  refugo: (m) => {
    m.colorNode = color(0xdcdbd4).mul(mix(0.7, 1.0, tri(2.5).g));
    m.roughnessNode = float(0.9);
    m.metalnessNode = float(0);
  },
  parede: (m) => {
    const n = tri(0.25);
    const streak = nz(vec2(faceU().mul(0.5), positionWorld.y.mul(0.04))).a;
    const base = color(0x86837b)
      .mul(mix(0.75, 1.0, n.b))
      .mul(mix(0.8, 1.0, streak));
    m.colorNode = base.mul(mix(0.55, 1.0, smoothstep(0.0, 2.2, positionWorld.y)));
    m.roughnessNode = float(0.88);
    m.metalnessNode = float(0);
  },
  telhado: painted(0x34373a, { rough: 0.6, grime: 0.3, scale: 0.3, dirtFloor: false }),
  trelica: painted(0x4f5459, { rough: 0.55, grime: 0.35, scale: 0.6, dirtFloor: false }),
  pilar: painted(0xc7b791, { rough: 0.55, grime: 0.45, scale: 0.7 }),
  faixa_amarela: (m) => {
    stripe(m, false);
  },
  faixa_zebrada: (m) => {
    stripe(m, true);
  },

  lampada: (m) => {
    m.colorNode = color(0xffe7c4);
    m.emissiveNode = color(0xffe2b8).mul(24);
    m.roughnessNode = float(0.5);
    m.metalnessNode = float(0);
  },
  claraboia: (m) => {
    m.colorNode = color(0xe8f0f6);
    m.emissiveNode = color(0xe8f0f6).mul(6);
    m.roughnessNode = float(0.5);
    m.metalnessNode = float(0);
  },
};

/** Materiais sem difusa para receber luz assada: usam o lightmap como oclusão. */
const METALS = new Set([
  'cil_ferro',
  'munhao',
  'junta_latao',
  'rolo_feltro',
  'capota_moldura',
  'porta_moldura',
  'tubo_isolado',
  'duto',
  'passarela',
  'caixa_drenagem',
]);

/** Materiais emissivos, que não recebem lightmap. */
const EMISSIVE = new Set(['lampada', 'claraboia']);

export interface MaterialContext {
  readonly uniforms: SceneUniforms;
  /**
   * Branco liso só com o lightmap, para conferir a luz assada.
   *
   * Tira a cor, a rugosidade e o reflexo do caminho e deixa na tela apenas o
   * que o bake gravou — é o jeito de separar "o bake está escuro" de "o
   * material está escuro". Liga com `?lm=1`.
   */
  readonly flatWhite?: boolean;
}

/** Nomes que chegaram sem receita, para a cena avisar uma vez só. */
export const missingSpecs = new Set<string>();

/**
 * Monta o material de uma peça.
 *
 * `name` é o nome sem a zona (`cil_ferro`), e o lightmap e a escala são os da
 * zona a que a peça pertence. A escala volta como `lightMapIntensity = S · π`,
 * que é o que desfaz a normalização feita na codificação do WebP.
 */
export function buildMaterial(
  name: string,
  lightMap: Texture | null,
  scale: number,
  ref: number,
  context: MaterialContext,
): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial();
  material.name = name;

  if (context.flatWhite && !EMISSIVE.has(name)) {
    material.colorNode = color(0xffffff);
    material.roughnessNode = float(1);
    material.metalnessNode = float(0);
  } else {
    const spec = SPECS[name];
    if (spec) {
      spec(material);
    } else {
      missingSpecs.add(name);
      painted(0x888888)(material);
    }
  }

  if (lightMap && !EMISSIVE.has(name)) {
    material.lightMap = lightMap;
    material.lightMapIntensity = scale * Math.PI;
    material.userData['lightMapIntensity'] = scale * Math.PI;

    if (METALS.has(name) && !context.flatWhite) {
      // Metal puro não tem difusa, então o lightmap não o ilumina. A luminância
      // do mapa vira oclusão do reflexo do ambiente: o metal escurece onde a
      // cena escureceu, em vez de espelhar o ambiente inteiro de forma uniforme.
      // `ref` é o percentil 80 da luminância **desta** zona: o porão e a
      // capota não têm a mesma faixa, e uma referência global escureceria a
      // zona clara e lavaria a escura.
      const e = luminance(texture(lightMap, uv()).rgb).mul(scale);
      material.aoNode = mix(
        float(1),
        clamp(e.div(float(Math.max(ref, 1e-4))), 0.03, 1).pow(0.75),
        context.uniforms.lightMapOn,
      );
    }
  }

  return material;
}
