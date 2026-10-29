import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  classifyIsoZone,
  DRYER_BEARING_ISO,
  healthFromZone,
  isoLimitsOf,
  type AssetHealth,
} from '@mp1/shared';
import { StatusPill } from './StatusPill';

describe('StatusPill', () => {
  it.each<[AssetHealth, string]>([
    ['normal', 'Normal'],
    ['attention', 'Atenção'],
    ['critical', 'Crítico'],
  ])('mostra "%s" como "%s"', (health, label) => {
    render(<StatusPill health={health} />);
    expect(screen.getByRole('status')).toHaveTextContent(label);
  });

  it('mostra "Sem dados" quando não há leitura, e não uma severidade', () => {
    // ausência de leitura não é uma quarta severidade: é a falta de base para
    // afirmar qualquer uma das três
    render(<StatusPill health={null} />);

    const selo = screen.getByRole('status');
    expect(selo).toHaveTextContent('Sem dados');
    expect(selo.textContent).not.toMatch(/crítico|atenção|normal/i);
    expect(selo.className).not.toContain('mill-critical');
  });

  it('acompanha a leitura de 7,8 mm/s do mancal CS23 até o selo de crítico', () => {
    const zone = classifyIsoZone(7.8, isoLimitsOf(DRYER_BEARING_ISO));
    render(<StatusPill health={healthFromZone(zone)} />);
    expect(screen.getByRole('status')).toHaveTextContent('Crítico');
  });
});
