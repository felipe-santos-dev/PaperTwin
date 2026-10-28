import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { assetByTag, MP1 } from '@mp1/shared';
import { Vector3 } from 'three';

/**
 * Projeção de um ativo na tela, exposta só no modo de teste.
 *
 * Testar o clique num objeto 3D por coordenada fixa é frágil: basta a câmera,
 * a janela ou a geometria mudarem um pouco para o clique cair no vazio, e a
 * falha parece do produto quando é do teste.
 *
 * Em vez de enfraquecer o teste — clicando num botão em vez do objeto, ou
 * varrendo a tela até acertar algo — este gancho devolve onde o ativo está
 * agora. O teste clica ali e exercita o mesmo caminho do usuário: raycast,
 * seleção, painel.
 *
 * Fica atrás de `MODE === 'test'`, então não existe no bundle de produção.
 */

export interface ScreenPoint {
  /** Coordenadas em pixels da janela, prontas para `mouse.click`. */
  readonly x: number;
  readonly y: number;
  /** Falso quando o ativo está atrás da câmera ou fora do corte. */
  readonly onScreen: boolean;
}

export interface TwinTestHook {
  screenPointOf: (tag: string) => ScreenPoint | null;
}

declare global {
  interface Window {
    __twin?: TwinTestHook;
  }
}

export function TestHook() {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);

  useEffect(() => {
    if (import.meta.env.MODE !== 'test') return;

    const hook: TwinTestHook = {
      screenPointOf(tag) {
        const asset = assetByTag(MP1, tag);
        if (!asset) return null;

        const ndc = new Vector3(...asset.position).project(camera);
        const rect = gl.domElement.getBoundingClientRect();

        return {
          x: rect.left + ((ndc.x + 1) / 2) * rect.width,
          y: rect.top + ((1 - ndc.y) / 2) * rect.height,
          onScreen: ndc.z < 1 && Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1,
        };
      },
    };

    window.__twin = hook;
    return () => {
      delete window.__twin;
    };
  }, [camera, gl]);

  return null;
}
