import { useMemo } from 'react';
import {
  allAssets,
  HEADBOX,
  MP1,
  POST_DRYER_HOOD,
  POST_DRYER_PAIRS,
  POST_DRYER_X0_M,
  PRE_DRYER_HOOD,
  PRE_DRYER_PAIRS,
  PRE_DRYER_X0_M,
  sectionById,
} from '@mp1/shared';
import { Building } from './Building';
import { Calender } from './Calender';
import { DriveSide } from './DriveSide';
import { DryingSection } from './DryingSection';
import { FormingSection } from './FormingSection';
import { Headbox } from './Headbox';
import { PaperWeb } from './PaperWeb';
import { PopeReel } from './PopeReel';
import { PressSection } from './PressSection';
import { Scanner } from './Scanner';
import { SpeedSizer } from './SpeedSizer';
import { WetEndStructure } from './WetEndStructure';

/**
 * A MP1 inteira, montada a partir do modelo.
 *
 * Nenhuma posição é escrita aqui: cada componente recebe a sua seção de
 * `MP1.sections` e desenha o que encontra. Mudar o nº de pares de cilindros no
 * modelo muda a cena, e uma tag que não existe no modelo não pode aparecer.
 *
 * A ordem em que os componentes aparecem é a ordem do processo, da caixa de
 * entrada à enroladeira — a mesma que `section.order` declara. É a ordem em que
 * alguém que conhece a máquina a percorre, e ler o arquivo de cima para baixo
 * deve ser como andar por ela.
 */
export function Machine() {
  const webWidth = MP1.webWidthM;
  const halfWidth = webWidth / 2 + 0.9;

  const headbox = sectionById(MP1, 'headbox');
  const forming = sectionById(MP1, 'forming');
  const press = sectionById(MP1, 'press');
  const preDryer = sectionById(MP1, 'pre-dryer');
  const scanner1 = sectionById(MP1, 'scanner-1')?.assets[0];
  const sizer = sectionById(MP1, 'speed-sizer');
  const postDryer = sectionById(MP1, 'post-dryer');
  const calender = sectionById(MP1, 'calender');
  const scanner2 = sectionById(MP1, 'scanner-2')?.assets[0];
  const pope = sectionById(MP1, 'pope-reel');

  const assets = useMemo(() => allAssets(MP1), []);

  return (
    <group>
      <Building
        pitFrom={PRE_DRYER_HOOD.from - 1}
        pitTo={POST_DRYER_HOOD.to + 1}
        halfWidth={halfWidth}
      />

      {headbox && <Headbox section={headbox} webWidth={webWidth} />}
      {forming && <FormingSection section={forming} webWidth={webWidth} />}
      {press && <PressSection section={press} webWidth={webWidth} />}
      <WetEndStructure webWidth={webWidth} />

      {preDryer && (
        <DryingSection
          section={preDryer}
          hood={PRE_DRYER_HOOD}
          x0={PRE_DRYER_X0_M}
          pairs={PRE_DRYER_PAIRS}
          webWidth={webWidth}
        />
      )}

      {scanner1 && <Scanner asset={scanner1} webWidth={webWidth} phase={0} />}
      {sizer && <SpeedSizer section={sizer} webWidth={webWidth} />}

      {postDryer && (
        <DryingSection
          section={postDryer}
          hood={POST_DRYER_HOOD}
          x0={POST_DRYER_X0_M}
          pairs={POST_DRYER_PAIRS}
          webWidth={webWidth}
        />
      )}

      {calender && <Calender section={calender} webWidth={webWidth} />}
      {scanner2 && <Scanner asset={scanner2} webWidth={webWidth} phase={1.3} />}
      {pope && <PopeReel section={pope} webWidth={webWidth} />}

      <PaperWeb webWidth={webWidth} />

      {/*
        O lado acionamento vem por último e de uma vez, para a máquina inteira:
        ele não pertence a nenhuma seção. As fileiras de motores são decididas
        por quem está perto de quem em X, e dividir isso por seção faria dois
        motores de seções vizinhas caírem no mesmo lugar.
      */}
      <DriveSide assets={assets} halfWidth={halfWidth} webWidth={webWidth} />

      {/* a sala continua para trás da caixa de entrada, onde fica a massa */}
      <mesh position={[HEADBOX.manifoldX - 8, 9.5, 0]}>
        <boxGeometry args={[0.4, 19, 2 * halfWidth + 14]} />
        <meshStandardMaterial color="#3a3e45" roughness={0.9} />
      </mesh>
    </group>
  );
}
