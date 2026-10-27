import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { assetByTag, MP1 } from '@mp1/shared';
import { AssetCard } from './AssetCard';

function asset(tag: string) {
  const found = assetByTag(MP1, tag);
  if (!found) throw new Error(`ativo ausente no modelo: ${tag}`);
  return found;
}

describe('AssetCard', () => {
  it('mostra a tag, o tipo e o lado de um mancal de secador', () => {
    render(<AssetCard asset={asset('MP1-SEC-G4-CS23-MLA')} onClose={() => undefined} />);

    expect(screen.getByRole('heading')).toHaveTextContent('Mancal LA');
    expect(screen.getByText('MP1-SEC-G4-CS23-MLA')).toBeInTheDocument();
    expect(screen.getByText('LA · lado acionamento')).toBeInTheDocument();
    expect(screen.getByText('G4')).toBeInTheDocument();
  });

  it('mostra os limites da ISO do mancal, em mm/s', () => {
    render(<AssetCard asset={asset('MP1-SEC-G4-CS23-MLA')} onClose={() => undefined} />);
    // grupo 2, apoio rígido
    expect(screen.getByText(/A\|B 1\.4 · B\|C 2\.8 · C\|D 4\.5/)).toBeInTheDocument();
  });

  it('não promete limites de vibração para um ativo que não é medido', () => {
    render(<AssetCard asset={asset('MP1-QCS-SC1')} onClose={() => undefined} />);
    expect(screen.queryByText(/Limites ISO/)).not.toBeInTheDocument();
  });

  it('avisa quando a posição do ativo ainda é suposição', () => {
    render(<AssetCard asset={asset('MP1-SEC-G4-CS23')} onClose={() => undefined} />);
    expect(screen.getByText(/suposição do protótipo/)).toBeInTheDocument();
  });

  it('não avisa no que já foi confirmado', () => {
    render(<AssetCard asset={asset('MP1-QCS-SC1')} onClose={() => undefined} />);
    expect(screen.queryByText(/suposição do protótipo/)).not.toBeInTheDocument();
  });

  it('fecha pelo botão', async () => {
    const onClose = vi.fn();
    render(<AssetCard asset={asset('MP1-POP-TBR')} onClose={onClose} />);

    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
