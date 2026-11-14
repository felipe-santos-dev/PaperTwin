import { Suspense, use, useEffect, useMemo, useRef } from 'react';
import { Canvas, events as pointerEvents, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { AgXToneMapping, Color, PCFShadowMap, Vector3 } from 'three';
import {
  CubeCamera,
  CubeRenderTarget,
  HalfFloatType,
  PMREMGenerator,
  RenderPipeline,
  WebGPURenderer,
} from 'three/webgpu';
import {
  color,
  emissive,
  fog,
  densityFogFactor,
  length,
  mrt,
  output,
  pass,
  rand,
  renderOutput,
  screenUV,
  smoothstep,
  uniform,
  vec2,
  vec4,
  velocity,
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { traa } from 'three/addons/tsl/display/TRAANode.js';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';

import { Atmosphere } from './Atmosphere';
import { Bearings } from './Bearings';
import { sceneResource, type LoadedScene } from './sceneData';
import { TestHook } from './TestHook';
import { createUniforms, type MaterialContext } from './tsl/materials';
import { makeNoiseTexture } from './tsl/noise';
import { SceneProvider, type SceneState } from './sceneState';
import type { SceneView } from './views';
import {
  BEARING_Z_M,
  PRE_DRYER_HOOD,
  POPE_X_M,
  WEB_WIDTH_M,
  type AssetTag,
  type IsoZone,
} from '@mp1/shared';

/**
 * A cena 3D da MP1.
 *
 * Carregada sob demanda: é este módulo que arrasta o three.js, e separá-lo do
 * resto da aplicação tira cerca de 1 MB do carregamento inicial.
 *
 * A luz é assada. A geometria vem de `public/scene/mp1.glb`, gerada por
 * `tools/scene-bake` a partir do modelo, e cada peça recebe um material
 * procedural em TSL mais o lightmap da sua zona. Não há luz dinâmica nem
 * sombra calculada em tempo real: o que a GPU faz é superfície e
 * pós-processamento.
 */

const FLIGHT_MS = 1400;

/** Por que o WebGPU caiu, quando caiu. Sobrevive ao recarregamento. */
const FALLBACK_KEY = 'mp1-webgpu-erro';

function readFallbackReason(): string | null {
  try {
    return sessionStorage.getItem(FALLBACK_KEY);
  } catch {
    return null;
  }
}

/**
 * Cria o renderizador.
 *
 * WebGPU quando dá, WebGL2 quando não dá. O caminho WebGL2 é forçado no modo de
 * teste: o Chromium sem cabeça perde o dispositivo WebGPU até com um cubo, e um
 * teste que falha por causa do ambiente não diz nada sobre o produto.
 *
 * A função é **síncrona** de propósito. Devolvendo uma promessa, o `Canvas` do
 * R3F nunca chega a se configurar: o canvas fica em 300 × 150, nenhum filho
 * monta e o e2e estoura em `waitForScene`. Devolvendo o renderizador pronto,
 * o R3F segue em frente e o `init()` corre por fora — o `__ready` abaixo diz
 * ao pipeline quando pode começar a desenhar, porque desenhar antes disso
 * lança e derrubaria o laço a cada quadro.
 *
 * Com três alvos MRT a cena usa 24 bytes por pixel, dentro dos 32 que o WebGPU
 * garante em qualquer dispositivo, então não há limite a pedir no construtor.
 */
function createRenderer(props: Record<string, unknown>): WebGPURenderer {
  const forced = import.meta.env.MODE === 'test' || readFallbackReason() !== null;

  const renderer = new WebGPURenderer({
    ...props,
    antialias: false,
    forceWebGL: forced,
  } as ConstructorParameters<typeof WebGPURenderer>[0]);

  renderer.toneMapping = AgXToneMapping;
  renderer.toneMappingExposure = 0.82;

  void renderer.init().then(() => {
    (renderer as unknown as { __ready?: boolean }).__ready = true;
  });
  return renderer;
}

/**
 * Pós-processamento: TRAA e bloom só no que é emissivo.
 *
 * Nada de SSR, GTAO ou SSGI — a luz já está assada, e o que eles acrescentariam
 * não paga o preço medido. O reflexo do piso vem do cubemap capturado da
 * própria cena.
 */
function Pipeline() {
  const gl = useThree((state) => state.gl) as unknown as WebGPURenderer;
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);

  const pipeline = useMemo(() => {
    const scenePass = pass(scene, camera);

    // output + emissive + velocity = 24 bytes por pixel, dentro dos 32 que o
    // WebGPU garante; não há alvo a cortar, e o FXAA fica como caminho de
    // reserva para um dispositivo que recusasse o alvo de velocidade.
    const temporal = true;
    scenePass.setMRT(mrt(temporal ? { output, emissive, velocity } : { output, emissive }));

    const sceneColour = scenePass.getTextureNode('output');
    const withBloom = sceneColour.add(
      // bloom baixo: só um halo curto nas luminárias, nada lavado
      bloom(scenePass.getTextureNode('emissive'), 0.12, 0.3, 0.0),
    );
    const antialiased = temporal
      ? traa(
          withBloom,
          scenePass.getTextureNode('depth'),
          scenePass.getTextureNode('velocity'),
          camera,
        )
      : withBloom;

    // Os tipos do three nomeiam cada nó pelo tipo de dado que ele carrega, e um
    // grafo montado assim cruza esses nomes. A conversão é só nas junções.
    type Colour = Parameters<typeof renderOutput>[0];
    const toned = renderOutput(antialiased as unknown as Colour);
    const out = temporal ? toned : fxaa(toned as unknown as Parameters<typeof fxaa>[0]);

    // vinheta e grão leves: é o que tira o aspecto de render limpo demais
    const centred = screenUV.sub(0.5);
    const vignette = smoothstep(0.95, 0.25, length(centred.mul(vec2(1.0, 0.8))))
      .mul(0.28)
      .add(0.72);
    const grain = rand(screenUV).sub(0.5).mul(0.018);

    const created = new RenderPipeline(gl);
    created.outputColorTransform = false;
    const graded = out as unknown as ReturnType<typeof vec4>;
    created.outputNode = vec4(graded.rgb.mul(vignette).add(grain), 1) as typeof created.outputNode;
    return created;
  }, [gl, scene, camera]);

  // prioridade > 0 desliga o desenho automático do R3F: quem desenha é o pipeline
  useFrame(() => {
    if (!(gl as unknown as { __ready?: boolean }).__ready) return;
    void pipeline.render();
  }, 1);

  return null;
}

/**
 * Medição de quadro, ligada com `?perf=1`.
 *
 * Fica atrás de um parâmetro porque medir FPS exige a máquina de quem mede, e
 * porque ler `renderer.info` a cada quadro custa. O que sai daqui é o que
 * entra no relatório de desempenho: fps, chamadas de desenho e triângulos.
 */
export interface ScenePerf {
  readonly fps: number;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly backend: 'WebGPU' | 'WebGL2';
}

declare global {
  interface Window {
    __twinPerf?: ScenePerf;
  }
}

function perfEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('perf') === '1';
}

/** `?lm=1`: branco liso só com o lightmap, para conferir a luz assada. */
function flatWhiteEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('lm') === '1';
}

function PerfProbe() {
  const gl = useThree((state) => state.gl) as unknown as WebGPURenderer;
  const frames = useRef(0);
  // zero marca 'ainda não medido': `performance.now()` no corpo do componente
  // seria chamada impura durante a renderização.
  const since = useRef(0);

  useFrame(() => {
    frames.current += 1;
    const now = performance.now();
    if (since.current === 0) {
      since.current = now;
      return;
    }
    const elapsed = now - since.current;
    if (elapsed < 500) return;

    const info = (gl as unknown as { info: { render: { drawCalls: number; triangles: number } } })
      .info;
    window.__twinPerf = {
      fps: Math.round((frames.current * 1000) / elapsed),
      drawCalls: info.render.drawCalls,
      triangles: info.render.triangles,
      backend: (gl.backend as unknown as { isWebGPUBackend?: boolean }).isWebGPUBackend
        ? 'WebGPU'
        : 'WebGL2',
    };
    frames.current = 0;
    since.current = now;
  }, 2);

  /**
   * Captura do quadro, para os relatórios.
   *
   * Tem de acontecer **dentro** do quadro, logo depois do pipeline desenhar:
   * a superfície de um canvas WebGPU é apresentada e some, e um `toDataURL`
   * de fora devolve imagem vazia. Prioridade 3 põe isto depois do desenho.
   */
  useFrame(() => {
    const w = window as unknown as { __grabNext?: boolean; __grab?: string };
    if (!w.__grabNext) return;
    w.__grabNext = false;
    w.__grab = gl.domElement.toDataURL('image/png');
  }, 3);

  // só com ?perf=1: dá acesso à cena para medir e depurar de fora
  const scene = useThree((state) => state.scene);
  useEffect(() => {
    (window as unknown as { __twinScene?: unknown }).__twinScene = { scene, gl };
  }, [scene, gl]);

  return null;
}

/** O que o rig precisa do OrbitControls, sem depender do tipo do three-stdlib. */
interface ControlsLike {
  readonly target: Vector3;
  update: () => void;
}

interface Flight {
  readonly from: Vector3;
  readonly lookedAt: Vector3;
  readonly startedAt: number;
}

/**
 * Leva a câmera até o enquadramento pedido.
 *
 * O voo é suave, de 1,4 s, mas quem pediu menos movimento no sistema recebe o
 * corte seco: um sobrevoo pela máquina inteira é justamente o tipo de movimento
 * que incomoda.
 */
function CameraRig({ view }: { view: SceneView }) {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as ControlsLike | null;

  const destination = useMemo(() => new Vector3(...view.position), [view]);
  const lookAt = useMemo(() => new Vector3(...view.target), [view]);

  const flight = useRef<Flight | null>(null);
  const applied = useRef<SceneView | null>(null);

  useFrame(() => {
    if (!controls) return;

    if (applied.current !== view) {
      const isFirst = applied.current === null;
      applied.current = view;

      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (isFirst || reduced) {
        camera.position.copy(destination);
        controls.target.copy(lookAt);
        controls.update();
        flight.current = null;
      } else {
        flight.current = {
          from: camera.position.clone(),
          lookedAt: controls.target.clone(),
          startedAt: performance.now(),
        };
      }
    }

    const active = flight.current;
    if (!active) return;

    const k = Math.min(1, (performance.now() - active.startedAt) / FLIGHT_MS);
    const eased = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;

    camera.position.lerpVectors(active.from, destination, eased);
    controls.target.lerpVectors(active.lookedAt, lookAt, eased);
    controls.update();

    if (k >= 1) flight.current = null;
  });

  return null;
}

/**
 * Eventos de ponteiro medidos pelo retângulo **vivo** do canvas.
 *
 * O padrão do R3F converte o clique com o tamanho guardado no estado dele, que
 * só muda depois de o React confirmar o redimensionamento. Quando o painel do
 * ativo fecha, o canvas alarga na hora e o estado fica um instante para trás:
 * um clique nesse instante é convertido com a largura antiga e cai no mancal
 * vizinho. Lendo o retângulo no momento do evento, o clique acerta o que está
 * debaixo do cursor.
 */
const livePointerEvents: typeof pointerEvents = (store) => ({
  ...pointerEvents(store),
  compute: (event, state) => {
    const rect = state.gl.domElement.getBoundingClientRect();
    state.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    state.raycaster.setFromCamera(state.pointer, state.camera);
  },
});

/** Ver a nota no `Canvas`: desliga a sombra sem passar por uma constante removida. */
const SHADOWS = { enabled: false, type: PCFShadowMap } as const;

/** Fundo da tela: o cinza escuro neutro do design. */
const BACKGROUND = '#0D1015';

/** O mundo branco do bake, usado como fundo só durante a captura do ambiente. */
const STUDIO_WHITE = new Color(1, 1, 1);

/** Quanto do ambiente capturado entra no reflexo. */
const ENVIRONMENT_INTENSITY = 0.8;

/** Nome do grupo do vapor, para escondê-lo na captura do ambiente. */
const ATMOSPHERE = 'atmosfera';

/**
 * Z da parede da capota no lado comando, por onde o vapor sai.
 *
 * A parede fica a meio caminho entre a ponta da mesa e o plano dos mancais —
 * a mesma conta do gerador da cena.
 */
const HOOD_WALL_Z = (WEB_WIDTH_M / 2 + BEARING_Z_M) / 2;

interface ContentProps {
  readonly state: SceneState;
  readonly context: MaterialContext;
  readonly noise: ReturnType<typeof makeNoiseTexture>;
  readonly bearingZones: ReadonlyMap<AssetTag, IsoZone> | undefined;
}

function SceneContent({ state, context, noise, bearingZones }: ContentProps) {
  const loaded: LoadedScene = use(sceneResource(context));
  const gl = useThree((rs) => rs.gl) as unknown as WebGPURenderer;
  const scene = useThree((rs) => rs.scene);

  /** Tempo da cena: só anda quando está tocando, e é o que congela o vapor. */
  const clock = useMemo(() => uniform(0), []);

  /**
   * Nevoeiro e ambiente entram por `attach`, e não por atribuição.
   *
   * Escrever num objeto devolvido por hook é o que o compilador do React
   * proíbe, e com razão: o valor volta ao que era na próxima renderização.
   */
  useEffect(() => {
    // névoa mínima, da cor do fundo: só o bastante para dar profundidade ao longe
    scene.fogNode = fog(color(0x0d1015), densityFogFactor(0.0012));
    return () => {
      scene.fogNode = null;
    };
  }, [scene]);

  /**
   * Ambiente: um cubemap capturado da própria cena, uma vez só.
   *
   * É de onde vem o reflexo do piso molhado e dos metais. Capturar da cena, e
   * não de um HDRI baixado, dá ao reflexo a cor desta sala e não custa
   * requisição nenhuma. São seis renderizações de face, então o `useRef`
   * garante que aconteça uma vez por montagem e não a cada reconciliação.
   */
  const captured = useRef(false);
  useEffect(() => {
    if (captured.current) return;
    captured.current = true;

    const target = new CubeRenderTarget(256, { type: HalfFloatType });
    const cube = new CubeCamera(0.1, 120, target);
    // no meio da máquina, à altura de quem opera
    cube.position.set((PRE_DRYER_HOOD.from + POPE_X_M) / 2, 3.2, 9.5);

    void (async () => {
      const fogNode = scene.fogNode;
      const background = scene.background;
      const atmosphere = scene.getObjectByName(ATMOSPHERE);
      try {
        // A captura é da sala, não do ar: névoa, vapor e fachos entrariam no
        // reflexo de todo metal e lavariam a cena inteira.
        scene.fogNode = null;
        if (atmosphere) atmosphere.visible = false;
        // A luz do bake é um mundo branco e uniforme. Para o reflexo dos metais
        // enxergar a mesma luz, a captura troca o fundo escuro da tela por esse
        // branco — senão o metal espelharia o cinza do fundo e escureceria.
        scene.background = STUDIO_WHITE;

        await cube.update(gl, scene);

        // O PMREMGenerator tem de vir de `three/webgpu`. O de `three` é o do
        // caminho WebGL: ele monta ShaderMaterial, que o construtor de nós
        // recusa, e aí a cena fica sem ambiente — com os metais pretos, porque
        // metal puro não tem difusa para receber a luz assada.
        const pmrem = new PMREMGenerator(gl);
        scene.environment = pmrem.fromCubemap(target.texture).texture;
        scene.environmentIntensity = ENVIRONMENT_INTENSITY;
        pmrem.dispose();
      } catch {
        // sem ambiente a cena continua: o que se perde é o reflexo
      } finally {
        scene.fogNode = fogNode;
        scene.background = background;
        if (atmosphere) atmosphere.visible = true;
        target.dispose();
      }
    })();
  }, [gl, scene]);

  useFrame((_, delta) => {
    if (state.playing) clock.value = (clock.value as number) + delta;
  });

  return (
    <group>
      <primitive object={loaded.root} />
      <Bearings zones={bearingZones} />
      <Atmosphere name={ATMOSPHERE} clock={clock} noise={noise} hoodWallZ={HOOD_WALL_Z} />
    </group>
  );
}

export interface MachineSceneProps {
  readonly view: SceneView;
  readonly state: SceneState;
  /**
   * A zona da ISO 20816-3 de cada mancal, quando há leitura.
   *
   * Opcional: sem ela os mancais ficam em cinza neutro, que é o que a cena
   * sabe. Ver `Bearings`.
   */
  readonly bearingZones?: ReadonlyMap<AssetTag, IsoZone> | undefined;
}

export default function MachineScene({ view, state, bearingZones }: MachineSceneProps) {
  const noise = useMemo(() => makeNoiseTexture(), []);
  const context = useMemo<MaterialContext>(
    () => ({ uniforms: createUniforms(), flatWhite: flatWhiteEnabled() }),
    [],
  );

  return (
    <Canvas
      // O canvas acompanha o container por CSS, em vez de esperar o R3F gravar
      // a largura em pixels. Quando o painel do ativo fecha, o container alarga
      // na hora e o R3F só redimensiona depois de o React confirmar; nesse
      // intervalo, quem medisse o canvas mediria a largura antiga e um clique
      // no centro cairia no mancal vizinho. Junto com `livePointerEvents`, o
      // que está debaixo do cursor é sempre o que o clique acerta.
      className="[&_canvas]:h-full! [&_canvas]:w-full!"
      dpr={[1, 2]}
      // A luz é assada: não há sombra para calcular. Em objeto, e não `false`,
      // porque o R3F atribui PCFSoftShadowMap para qualquer booleano — e a
      // constante saiu do three 0.187.
      shadows={SHADOWS}
      camera={{ fov: 48, near: 0.1, far: 400, position: [...view.position] }}
      gl={createRenderer}
      events={livePointerEvents}
      // clique no vazio desfaz a seleção
      onPointerMissed={() => {
        state.select(null);
      }}
    >
      <color attach="background" args={[BACKGROUND]} />

      <SceneProvider value={state}>
        <Suspense fallback={null}>
          <SceneContent state={state} context={context} noise={noise} bearingZones={bearingZones} />
        </Suspense>
      </SceneProvider>

      <CameraRig view={view} />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        maxPolarAngle={Math.PI * 0.62}
        minDistance={2}
        maxDistance={120}
      />

      <Pipeline />
      <TestHook />
      {perfEnabled() && <PerfProbe />}
    </Canvas>
  );
}
