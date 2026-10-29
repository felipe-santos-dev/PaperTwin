import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DataSourcePill } from './DataSourcePill';
import type { DataSource } from './useDataSource';

const TODAS: DataSource[] = ['checking', 'live', 'demo', 'offline'];

describe('DataSourcePill', () => {
  it('mostra "Sem dados" quando não há nem API nem instantâneo', () => {
    render(<DataSourcePill source="offline" />);
    expect(screen.getByRole('status')).toHaveTextContent('Sem dados');
  });

  it('nunca mostra uma severidade da máquina', () => {
    // o bug que este teste tranca: com a API fora, o cabeçalho pintava
    // "Crítico" — a cor de máquina quebrada para dizer que o servidor caiu
    for (const source of TODAS) {
      const { unmount } = render(<DataSourcePill source={source} />);
      const texto = screen.getByRole('status').textContent ?? '';

      expect(texto, source).not.toMatch(/crítico/i);
      expect(texto, source).not.toMatch(/atenção/i);
      unmount();
    }
  });

  it('não empresta a cor do semáforo de vibração a nenhum estado', () => {
    for (const source of TODAS) {
      const { unmount } = render(<DataSourcePill source={source} />);
      const classes = screen.getByRole('status').className;

      expect(classes, source).not.toContain('mill-critical');
      expect(classes, source).not.toContain('mill-normal');
      unmount();
    }
  });

  it('distingue ao vivo de demonstração', () => {
    const { unmount } = render(<DataSourcePill source="live" />);
    expect(screen.getByRole('status')).toHaveTextContent('Ao vivo');
    unmount();

    render(<DataSourcePill source="demo" />);
    expect(screen.getByRole('status')).toHaveTextContent('Demonstração');
  });

  it('explica cada estado no título, para quem passar o cursor', () => {
    for (const source of TODAS) {
      const { unmount } = render(<DataSourcePill source={source} />);
      expect(screen.getByRole('status').getAttribute('title')?.trim(), source).toBeTruthy();
      unmount();
    }
  });
});
