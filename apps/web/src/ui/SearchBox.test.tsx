import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { DataGateway } from '../api/gateway';
import { SearchBox } from './SearchBox';

/**
 * A busca da moldura, pelo teclado e pelo mouse.
 *
 * O que estes testes seguram é a promessa: escolher um resultado chama o
 * abridor **daquele tipo** de item. Se amanhã alguém ligar o resultado de
 * mancal ao abridor de tendência, a tela continua bonita e o teste quebra.
 */

const gateway = {
  reels: () => Promise.resolve({ count: 0, reels: [] }),
  notes: () => Promise.resolve({ count: 0, notes: [] }),
} as unknown as DataGateway;

function setup() {
  const props = {
    gateway,
    onScreen: vi.fn(),
    onTag: vi.fn(),
    onBearing: vi.fn(),
    onReel: vi.fn(),
    onNote: vi.fn(),
  };
  render(<SearchBox {...props} />);
  const field = screen.getByRole('combobox');
  return { ...props, field };
}

describe('busca da moldura', () => {
  it('a barra "/" leva o foco para o campo', async () => {
    const { field } = setup();
    expect(field).not.toHaveFocus();

    await userEvent.keyboard('/');

    expect(field).toHaveFocus();
  });

  it('Ctrl+K também', async () => {
    const { field } = setup();

    await userEvent.keyboard('{Control>}k{/Control}');

    expect(field).toHaveFocus();
  });

  it('não rouba a barra digitada dentro de um campo', async () => {
    const { field } = setup();
    render(<textarea aria-label="motivo" />);
    const motivo = screen.getByLabelText('motivo');
    await userEvent.click(motivo);

    await userEvent.keyboard('/');

    expect(motivo).toHaveValue('/');
    expect(field).not.toHaveFocus();
  });

  it('Enter abre a TAG escolhida na tendência', async () => {
    const { field, onTag } = setup();

    await userEvent.click(field);
    await userEvent.keyboard('PIC-514');
    await waitFor(() => {
      expect(screen.getByRole('listbox')).toBeInTheDocument();
    });
    await userEvent.keyboard('{Enter}');

    expect(onTag).toHaveBeenCalledWith('PIC-514');
  });

  it('clicar num mancal abre Mancais, e não a tendência', async () => {
    const { field, onBearing, onTag } = setup();

    await userEvent.click(field);
    await userEvent.keyboard('CS23');
    const option = await screen.findByText(/Cilindro secador 23 · lado LC/);
    await userEvent.click(option);

    expect(onBearing).toHaveBeenCalledWith('MP1-SEC-G4-CS23-MLC');
    expect(onTag).not.toHaveBeenCalled();
  });

  it('a tela abre pela tela, não por outro caminho', async () => {
    const { field, onScreen } = setup();

    await userEvent.click(field);
    await userEvent.keyboard('rondas');
    await userEvent.keyboard('{Enter}');

    expect(onScreen).toHaveBeenCalledWith('rondas');
  });

  it('Esc fecha a lista e o que foi digitado continua lá', async () => {
    const { field } = setup();

    await userEvent.click(field);
    await userEvent.keyboard('PIC');
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(field).toHaveValue('PIC');
  });

  it('diz quando não achou, em vez de ficar mudo', async () => {
    const { field } = setup();

    await userEvent.click(field);
    await userEvent.keyboard('zzzzz');

    expect(screen.getByText(/Nada com/)).toBeInTheDocument();
  });

  it('as setas andam pela lista', async () => {
    const { field, onTag } = setup();

    await userEvent.click(field);
    await userEvent.keyboard('vapor');
    const segundo = screen.getAllByRole('option')[1]?.textContent ?? '';

    await userEvent.keyboard('{ArrowDown}{Enter}');

    expect(onTag).toHaveBeenCalledTimes(1);
    expect(segundo).toContain(String(onTag.mock.calls[0]?.[0]));
  });
});
