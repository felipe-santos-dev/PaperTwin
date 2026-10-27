import { createContext, use, type ReactNode } from 'react';
import type { AssetTag } from '@mp1/shared';

/** Velocidade linear da folha, em m/s da cena. Define a rotação de cada corpo. */
export const WEB_SPEED_M_S = 3.2;

export interface SceneState {
  /** Ativo selecionado, ou `null`. */
  readonly selectedTag: AssetTag | null;
  readonly select: (tag: AssetTag | null) => void;
  /** Ativo sob o cursor. */
  readonly hoveredTag: AssetTag | null;
  readonly hover: (tag: AssetTag | null) => void;
  /** Falso congela a máquina, para examinar um ponto parado. */
  readonly playing: boolean;
  /** Portas da capota abertas, mostrando os cilindros por dentro. */
  readonly doorsOpen: boolean;
}

const SceneContext = createContext<SceneState>({
  selectedTag: null,
  select: () => undefined,
  hoveredTag: null,
  hover: () => undefined,
  playing: true,
  doorsOpen: true,
});

export function SceneProvider({ value, children }: { value: SceneState; children: ReactNode }) {
  return <SceneContext value={value}>{children}</SceneContext>;
}

export function useScene(): SceneState {
  return use(SceneContext);
}
