import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { materials } from '../materials';
import { useScene, WEB_SPEED_M_S } from '../sceneState';
import { dryWebPath, ribbonGeometry } from './webPath';

/**
 * A folha de papel correndo pela máquina.
 *
 * O movimento não vem de mover a geometria: a fita fica parada e o que desliza
 * é a coordenada U da textura. Como a UV acompanha o comprimento percorrido ao
 * longo do caminho, a folha corre na mesma velocidade nas retas e nas curvas em
 * volta dos cilindros.
 */

export interface PaperWebProps {
  readonly webWidth: number;
}

/** Quanto da textura cabe em um metro de folha. */
const TEXTURE_SCALE = 4;

export function PaperWeb({ webWidth }: PaperWebProps) {
  const m = materials();
  const { playing } = useScene();
  const elapsed = useRef(0);

  const geometry = useMemo(
    () => ribbonGeometry(dryWebPath(), webWidth - 0.6, TEXTURE_SCALE),
    [webWidth],
  );

  useFrame((_, delta) => {
    if (!playing) return;
    elapsed.current += delta;
    // o material é buscado aqui dentro, e não capturado do render: quem anima
    // não deve escrever em valor que a renderização leu.
    materials().paperMap.offset.x = -(elapsed.current * WEB_SPEED_M_S) / TEXTURE_SCALE;
  });

  return <mesh geometry={geometry} material={m.paper} castShadow receiveShadow />;
}
