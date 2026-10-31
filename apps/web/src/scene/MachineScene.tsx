import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stats } from '@react-three/drei';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import { ACESFilmicToneMapping, PMREMGenerator, Vector3 } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Machine } from './machine/Machine';
import { TestHook } from './TestHook';
import { SceneProvider, type SceneState } from './sceneState';
import type { SceneView } from './views';

/**
 * A cena 3D da MP1.
 *
 * Carregada sob demanda: é este módulo que arrasta o three.js, e separá-lo do
 * resto da aplicação tira cerca de 1 MB do carregamento inicial.
 *
 * O acabamento segue o que foi validado no protótipo: iluminação de ambiente
 * por RoomEnvironment, mapeamento de tons ACES com exposição 0,82, sombras PCF
 * suaves e bloom só no que é emissivo — o feixe dos scanners e as luminárias.
 */

const TONE_MAPPING_EXPOSURE = 0.82;
const FLIGHT_MS = 1400;

/**
 * Contador de quadros, ligado com `?perf=1` e só em desenvolvimento.
 *
 * Fica atrás de um parâmetro porque medir FPS exige a máquina de quem mede: num
 * painel embutido o número reflete a taxa de composição do painel, não o custo
 * da cena.
 */
function showStats(): boolean {
  if (!import.meta.env.DEV) return false;
  return new URLSearchParams(window.location.search).get('perf') === '1';
}

/** O que o rig precisa do OrbitControls, sem depender do tipo do three-stdlib. */
interface ControlsLike {
  readonly target: Vector3;
  update: () => void;
}

/**
 * Iluminação de ambiente gerada em memória, sem baixar HDRI de CDN.
 *
 * A textura é anexada à cena declarativamente, por `attach`, em vez de atribuída
 * a `scene.environment` dentro de um efeito: escrever num objeto devolvido por
 * hook é justamente o que o compilador do React proíbe, e com razão.
 */
function RoomLighting() {
  const gl = useThree((state) => state.gl);

  const environment = useMemo(() => {
    const pmrem = new PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const target = pmrem.fromScene(room, 0.04);
    room.dispose();
    pmrem.dispose();
    return target.texture;
  }, [gl]);

  useEffect(
    () => () => {
      environment.dispose();
    },
    [environment],
  );

  return <primitive object={environment} attach="environment" />;
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

export interface MachineSceneProps {
  readonly view: SceneView;
  readonly state: SceneState;
}

export default function MachineScene({ view, state }: MachineSceneProps) {
  return (
    <Canvas
      shadows="soft"
      dpr={[1, 2]}
      camera={{ fov: 48, near: 0.1, far: 400, position: [...view.position] }}
      scene={{ environmentIntensity: 0.45 }}
      gl={{ antialias: true, toneMapping: ACESFilmicToneMapping }}
      onCreated={({ gl }) => {
        gl.toneMappingExposure = TONE_MAPPING_EXPOSURE;
      }}
      // clique no vazio desfaz a seleção
      onPointerMissed={() => {
        state.select(null);
      }}
    >
      <color attach="background" args={['#17191d']} />
      {/*
        O nevoeiro começa a 60 m e fecha a 220, como no protótipo.
        A máquina tem cerca de 96 m da caixa de entrada ao jumbo, e a visão
        geral olha de 80 m de distância: com o alcance anterior, de 35 a 120, a
        metade seca sumia dentro do nevoeiro na única vista que existe para
        mostrar a máquina inteira.
      */}
      <fog attach="fog" args={['#24272d', 60, 220]} />

      <RoomLighting />
      <hemisphereLight args={['#dfe8ff', '#4a4438', 0.55]} />
      <directionalLight
        position={[30, 32, 26]}
        intensity={1.4}
        color="#fff1dd"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-camera-left={-45}
        shadow-camera-right={45}
        shadow-camera-top={25}
        shadow-camera-bottom={-25}
        shadow-camera-near={1}
        shadow-camera-far={110}
      />
      {[20, 50, 80].map((x) => (
        <pointLight key={x} position={[x, 17, 10]} intensity={160} color="#fff4e8" distance={40} />
      ))}

      <SceneProvider value={state}>
        <Machine />
      </SceneProvider>

      <CameraRig view={view} />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        maxPolarAngle={Math.PI * 0.62}
        minDistance={2}
        maxDistance={200}
      />

      <EffectComposer>
        {/* limiar alto: só o feixe dos scanners e as luminárias passam */}
        <Bloom intensity={0.3} luminanceThreshold={0.93} luminanceSmoothing={0.4} mipmapBlur />
      </EffectComposer>

      <TestHook />
      {showStats() && <Stats />}
    </Canvas>
  );
}
