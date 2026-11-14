import { processVariable, WEB_WIDTH_M } from '@mp1/shared';

import type { ReelView } from '../process';
import { centered } from './random';
import type { CdMap } from './types';

/**
 * O mapa CD × MD de umidade de uma bobina — dado fixo, na escala da bobina real.
 *
 * A API guarda da bobina só a média e o 2σ CD (`cdSpread`). O mapa reparte esse
 * 2σ num desenho fixo: bordas um pouco mais úmidas (o perfil típico de secagem),
 * um lento vaivém ao longo da bobina e ruído por célula. A média do mapa é a
 * média real e o 2σ das células fica perto do 2σ real; a forma é **suposição**.
 */
export const CD_MAP_TAG = 'AIC-903';
const CD_CELLS = 12;
const MD_CELLS = 48;

export function cdMap(reel: ReelView): CdMap | null {
  const variable = processVariable(CD_MAP_TAG);
  const mean = reel.moisturePct ?? variable?.target ?? null;
  if (mean === null) return null;
  // 2σ → σ; sem dado da bobina, o 2σ alvo do catálogo (AI-913)
  const sigma = (reel.cdSpread?.moisturePct ?? processVariable('AI-913')?.target ?? 0.25) / 2;

  const values: number[][] = [];
  for (let cd = 0; cd < CD_CELLS; cd += 1) {
    const u = (cd + 0.5) / CD_CELLS; // 0 = LC, 1 = LA
    const edge = Math.pow(Math.abs(u - 0.5) * 2, 3) * 1.4 - 0.35;
    const row: number[] = [];
    for (let md = 0; md < MD_CELLS; md += 1) {
      const wave = Math.sin(md / 5 + cd / 3 + reel.number) * 0.5;
      const grain = centered(`${String(reel.number)}:${String(cd)}:${String(md)}`) * 0.9;
      row.push(round(mean + sigma * (edge + wave + grain)));
    }
    values.push(row);
  }

  return {
    illustrative: true,
    reelNumber: reel.number,
    tag: CD_MAP_TAG,
    unit: variable?.unit ?? '%',
    widthM: WEB_WIDTH_M,
    lengthM: reel.lengthM ?? 0,
    values,
  };
}

const round = (value: number) => Math.round(value * 1000) / 1000;
