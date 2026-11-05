import {
  WET_END_FRAME_TOP_Y_M,
  WET_END_FRAME_X_M,
  WET_END_HALF_WIDTH_M,
  WET_END_LEVELS,
} from '@mp1/shared';
import { materials } from '../materials';

/**
 * A estrutura em volta do formador e das prensas.
 *
 * A parte úmida é alta: o formador sobe 11 m e as telas voltam por cima. Sem a
 * estrutura, os rolos ficariam pendurados no ar e a cena perderia a única coisa
 * que dá escala a eles — alguém andando num piso de grade a 10 m do chão.
 *
 * São três pisos de operação, e eles existem porque o trabalho acontece nos
 * três: lavar tela, trocar feltro e ajustar o lábio são serviços em alturas
 * diferentes da mesma máquina.
 *
 * Nada aqui é ativo: é a sala, não a máquina. Por isso a geometria vem das
 * constantes e não de `MP1.sections`.
 */

export interface WetEndStructureProps {
  readonly webWidth: number;
}

/** Largura do piso de operação, do lado comando. */
const PLATFORM_EDGE_M = WET_END_HALF_WIDTH_M + 2.4;

const RAIL_HEIGHT_M = 1.1;
const RAIL_POST_STEP_M = 1.4;
const STEP_RISE_M = 0.22;

interface Platform {
  readonly from: number;
  readonly to: number;
  readonly y: number;
}

/** Os quatro pisos, nas alturas que o modelo declara. */
const PLATFORMS: readonly Platform[] = [
  { from: -11.4, to: 12.6, y: WET_END_LEVELS[0] },
  { from: -9.4, to: 1.6, y: WET_END_LEVELS[1] },
  { from: 6.6, to: 12.6, y: WET_END_LEVELS[1] },
  { from: -7.4, to: 11.6, y: WET_END_LEVELS[2] },
];

/** As escadas que ligam um piso ao seguinte, e o primeiro ao porão. */
const STAIRS = [
  { x0: 2, y0: WET_END_LEVELS[0], x1: 5.2, y1: WET_END_LEVELS[1] },
  { x0: -7, y0: WET_END_LEVELS[1], x1: -3.8, y1: WET_END_LEVELS[2] },
  { x0: -9.9, y0: WET_END_LEVELS[0], x1: -13.1, y1: 0 },
] as const;

/**
 * Postes do guarda-corpo e degraus das escadas.
 *
 * Saem daqui, do módulo, e não de um `useMemo` dentro do componente: eles não
 * dependem de nenhuma propriedade, então memorizar por render seria guardar o
 * mesmo resultado várias vezes — e o compilador do React reclama com razão.
 */
const RAIL_POSTS: readonly { x: number; y: number }[] = PLATFORMS.flatMap((platform) => {
  const posts: { x: number; y: number }[] = [];
  for (let x = platform.from; x <= platform.to + 0.01; x += RAIL_POST_STEP_M) {
    posts.push({ x, y: platform.y });
  }
  return posts;
});

const STEPS: readonly { x: number; y: number; width: number }[] = STAIRS.flatMap((stair) => {
  const count = Math.round(Math.abs(stair.y1 - stair.y0) / STEP_RISE_M);
  const dx = (stair.x1 - stair.x0) / count;
  const dy = (stair.y1 - stair.y0) / count;
  return Array.from({ length: count }, (_, i) => ({
    x: stair.x0 + dx * (i + 0.5),
    y: stair.y0 + dy * (i + 1),
    width: Math.abs(dx) + 0.05,
  }));
});

export function WetEndStructure({ webWidth }: WetEndStructureProps) {
  const m = materials();
  const columnZ = [-WET_END_HALF_WIDTH_M, WET_END_HALF_WIDTH_M];
  const frameSpan =
    (WET_END_FRAME_X_M[WET_END_FRAME_X_M.length - 1] ?? 0) - (WET_END_FRAME_X_M[0] ?? 0);
  const frameCenter =
    ((WET_END_FRAME_X_M[0] ?? 0) + (WET_END_FRAME_X_M[WET_END_FRAME_X_M.length - 1] ?? 0)) / 2;

  return (
    <group>
      {/* colunas */}
      {WET_END_FRAME_X_M.map((x) =>
        columnZ.map((z) => (
          <mesh
            key={`col:${String(x)}:${String(z)}`}
            material={m.paint}
            position={[x, 6.3, z]}
            castShadow
          >
            <boxGeometry args={[0.45, 12.6, 0.45]} />
          </mesh>
        )),
      )}

      {/* longarinas, uma por piso mais a de topo */}
      {columnZ.map((z) =>
        [...WET_END_LEVELS, WET_END_FRAME_TOP_Y_M].map((y) => (
          <mesh
            key={`beam:${String(z)}:${String(y)}`}
            material={m.paint}
            position={[frameCenter, y, z]}
            castShadow
          >
            <boxGeometry args={[frameSpan + 0.9, 0.5, 0.42]} />
          </mesh>
        )),
      )}

      {/* travessas de topo, atravessando a máquina */}
      {WET_END_FRAME_X_M.map((x) => (
        <mesh
          key={`cross:${String(x)}`}
          material={m.paint}
          position={[x, WET_END_FRAME_TOP_Y_M, 0]}
          castShadow
        >
          <boxGeometry args={[0.4, 0.45, 2 * WET_END_HALF_WIDTH_M]} />
        </mesh>
      ))}

      {/* pisos de grade, do lado comando */}
      {PLATFORMS.map((platform) => (
        <group key={`${String(platform.from)}:${String(platform.y)}`}>
          <mesh
            material={m.grating}
            position={[
              (platform.from + platform.to) / 2,
              platform.y,
              (WET_END_HALF_WIDTH_M + PLATFORM_EDGE_M) / 2,
            ]}
            receiveShadow
          >
            <boxGeometry
              args={[
                platform.to - platform.from,
                0.12,
                PLATFORM_EDGE_M - WET_END_HALF_WIDTH_M + 0.4,
              ]}
            />
          </mesh>

          {/* rodapé e corrimão da borda */}
          <mesh
            material={m.paint}
            position={[
              (platform.from + platform.to) / 2,
              platform.y + RAIL_HEIGHT_M,
              PLATFORM_EDGE_M,
            ]}
          >
            <boxGeometry args={[platform.to - platform.from, 0.07, 0.07]} />
          </mesh>
          <mesh
            material={m.paint}
            position={[(platform.from + platform.to) / 2, platform.y + 0.08, PLATFORM_EDGE_M]}
          >
            <boxGeometry args={[platform.to - platform.from, 0.15, 0.03]} />
          </mesh>
        </group>
      ))}

      {RAIL_POSTS.map((post) => (
        <mesh
          key={`post:${String(post.x)}:${String(post.y)}`}
          material={m.paint}
          position={[post.x, post.y + RAIL_HEIGHT_M / 2, PLATFORM_EDGE_M]}
        >
          <boxGeometry args={[0.07, RAIL_HEIGHT_M, 0.07]} />
        </mesh>
      ))}

      {STEPS.map((step) => (
        <mesh
          key={`step:${String(step.x)}:${String(step.y)}`}
          material={m.grating}
          position={[step.x, step.y, PLATFORM_EDGE_M - 0.7]}
        >
          <boxGeometry args={[step.width, 0.05, 1]} />
        </mesh>
      ))}

      {/* painéis de comando local, na beira do piso */}
      {(
        [
          [-8.4, WET_END_LEVELS[0], 1.2, 1.6],
          [-2.4, WET_END_LEVELS[0], 1, 1.3],
          [8.6, WET_END_LEVELS[1], 1.4, 1.6],
          [-5.4, WET_END_LEVELS[2], 1, 1.2],
        ] as const
      ).map(([x, y, width, height]) => (
        <mesh
          key={`panel:${String(x)}`}
          material={m.white}
          position={[x, y + height / 2 + 0.06, WET_END_HALF_WIDTH_M + 0.8]}
          castShadow
        >
          <boxGeometry args={[width, height, 0.7]} />
        </mesh>
      ))}

      {/* tanque de água branca, no chão sob o formador */}
      <mesh
        material={m.paintDark}
        position={[-6, 1, PLATFORM_EDGE_M + 0.4]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[webWidth / 2 + 1.4, 2, 0.6]} />
      </mesh>
    </group>
  );
}
