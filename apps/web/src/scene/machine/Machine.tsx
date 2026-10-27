import {
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
import { DryingSection } from './DryingSection';
import { PaperWeb } from './PaperWeb';
import { PopeReel } from './PopeReel';
import { PressSection } from './PressSection';
import { Scanner } from './Scanner';
import { SpeedSizer } from './SpeedSizer';

/**
 * A MP1 inteira, montada a partir do modelo.
 *
 * Nenhuma posição é escrita aqui: cada componente recebe a sua seção de
 * `MP1.sections` e desenha o que encontra. Mudar o nº de pares de cilindros no
 * modelo muda a cena, e uma tag que não existe no modelo não pode aparecer.
 */
export function Machine() {
  const webWidth = MP1.webWidthM;
  const halfWidth = webWidth / 2 + 0.9;

  const press = sectionById(MP1, 'press');
  const preDryer = sectionById(MP1, 'pre-dryer');
  const scanner1 = sectionById(MP1, 'scanner-1')?.assets[0];
  const sizer = sectionById(MP1, 'speed-sizer');
  const postDryer = sectionById(MP1, 'post-dryer');
  const calender = sectionById(MP1, 'calender');
  const scanner2 = sectionById(MP1, 'scanner-2')?.assets[0];
  const pope = sectionById(MP1, 'pope-reel');

  return (
    <group>
      <Building
        pitFrom={PRE_DRYER_HOOD.from - 1}
        pitTo={POST_DRYER_HOOD.to + 1}
        halfWidth={halfWidth}
      />

      {press && <PressSection section={press} webWidth={webWidth} />}

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
    </group>
  );
}
