import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { monitoredAssets, MP1, type IsoZone } from '@mp1/shared';

import { MachineMap2D } from './MachineMap2D';
import type { BearingRow } from './derive';

/**
 * O mapa desenha um ponto por mancal, e cada ponto escolhe aquele mancal.
 *
 * O que o jsdom não faz é layout — largura, altura e posição valem zero lá. O
 * que dá para cobrar aqui é o que não depende de pixel: que **todos** os
 * mancais do modelo têm ponto (e não só os que a lista está mostrando), que o
 * ponto diz de quem é, e que clicar nele escolhe o mancal certo. Onde o desenho
 * cai na tela é assunto de `e2e/largura.spec.ts` e das capturas.
 */

const MANCAIS = monitoredAssets(MP1).filter((asset) => asset.kind === 'bearing');

const DEGRADANDO = 'MP1-SEC-G4-CS23-MLC';

function linhas(zona: IsoZone | null = 'A'): BearingRow[] {
  return MANCAIS.map((mancal) => ({
    assetTag: mancal.tag,
    label: mancal.label,
    side: mancal.side,
    vibrationTag: null,
    temperatureTag: null,
    rms: zona === null ? null : 1,
    temperature: null,
    limits: { aToB: 1.4, bToC: 2.8, cToD: 4.5 },
    zone: mancal.tag === DEGRADANDO ? 'D' : zona,
  }));
}

describe('mapa da máquina', () => {
  it('tem um ponto para cada mancal monitorado', () => {
    render(<MachineMap2D rows={linhas()} selected={null} onSelect={vi.fn()} />);

    expect(MANCAIS).toHaveLength(98);
    expect(screen.getAllByRole('button')).toHaveLength(MANCAIS.length);
  });

  it('cada ponto diz de que corpo e de que lado é, e em que zona está', () => {
    render(<MachineMap2D rows={linhas()} selected={null} onSelect={vi.fn()} />);

    expect(
      screen.getByRole('button', { name: /Cilindro secador 23 · lado comando · zona D/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Cilindro secador 23 · lado acionamento · zona A/ }),
    ).toBeInTheDocument();
  });

  it('mancal sem leitura é dito como tal, e não como zona A', () => {
    render(<MachineMap2D rows={linhas(null)} selected={null} onSelect={vi.fn()} />);

    expect(
      screen.getByRole('button', { name: /Cilindro secador 23 · lado acionamento · sem leitura/ }),
    ).toBeInTheDocument();
  });

  it('clicar no ponto escolhe aquele mancal', async () => {
    const onSelect = vi.fn();
    render(<MachineMap2D rows={linhas()} selected={null} onSelect={onSelect} />);

    await userEvent.click(
      screen.getByRole('button', { name: /Cilindro secador 23 · lado comando/ }),
    );

    expect(onSelect).toHaveBeenCalledWith(DEGRADANDO);
  });

  it('sem `onSelect` o mapa é só desenho: nenhum ponto vira botão', () => {
    render(<MachineMap2D rows={linhas()} selected={null} />);

    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByRole('img', { name: /Mapa da máquina/ })).toBeInTheDocument();
  });
});
