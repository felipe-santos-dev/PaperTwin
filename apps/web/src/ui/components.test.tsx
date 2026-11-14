import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { BearingBar, TemperatureBar } from './BearingBar';
import { fraction, linear } from './chart/scale';
import { Sparkline } from './chart/Sparkline';
import { Num } from './Num';
import { Illustrative } from './Panel';
import { RangeBar } from './RangeBar';
import { SectionBlock } from './SectionBlock';

const LIMITS = { aToB: 1.4, bToC: 2.8, cToD: 4.5 };

describe('escala', () => {
  it('mapeia linear e cai no meio com domínio degenerado', () => {
    expect(linear([0, 10], [0, 100])(2.5)).toBe(25);
    expect(linear([5, 5], [0, 100])(5)).toBe(50);
  });

  it('encosta na ponta o que sai da escala', () => {
    expect(fraction(-3, 0, 10)).toBe(0);
    expect(fraction(30, 0, 10)).toBe(1);
  });
});

describe('barra de faixa', () => {
  const props = { min: 0, max: 2, ll: 0.5, l: 0.8, h: 1.6, hh: 1.8, target: 1.4 };

  it('pinta o PV de cinza-claro dentro da faixa', () => {
    const { container } = render(<RangeBar {...props} pv={1.4} sp={1.4} />);
    const pv = [...container.querySelectorAll<HTMLElement>('div')].at(-1);
    expect(pv?.style.background).toBe('var(--color-fg)');
  });

  it('pinta o PV da cor da prioridade quando sai', () => {
    const { container } = render(<RangeBar {...props} pv={0.6} sp={1.4} priority={2} />);
    const pv = [...container.querySelectorAll<HTMLElement>('div')].at(-1);
    expect(pv?.style.background).toBe('var(--color-alarm-2)');
  });

  it('mantém o PV visível quando ele sai da escala', () => {
    const { container } = render(<RangeBar {...props} pv={9} />);
    const pv = [...container.querySelectorAll<HTMLElement>('div')].at(-1);
    expect(pv?.style.left).toBe('100%');
  });

  it('diz que não há leitura quando o PV falta', () => {
    render(<RangeBar {...props} pv={null} />);
    expect(screen.getByRole('img', { name: 'sem leitura' })).toBeInTheDocument();
  });
});

describe('barra de mancal', () => {
  it('fica cinza em B e assume a cor da zona a partir de C', () => {
    const { container: b } = render(<BearingBar value={2.0} limits={LIMITS} />);
    expect(b.querySelector<HTMLElement>('.top-1\\.5')?.style.background).toBe('var(--color-fg-3)');

    const { container: c } = render(<BearingBar value={3.4} limits={LIMITS} />);
    expect(c.querySelector<HTMLElement>('.top-1\\.5')?.style.background).toBe(
      'var(--color-iso-c-line)',
    );
  });

  it('nomeia a zona para o leitor de tela', () => {
    render(<BearingBar value={4.9} limits={LIMITS} />);
    expect(screen.getByRole('img', { name: 'zona D' })).toBeInTheDocument();
  });

  it('marca a temperatura a partir de 80 °C', () => {
    const { container } = render(<TemperatureBar value={84} />);
    const pv = [...container.querySelectorAll<HTMLElement>('div')].at(-1);
    expect(pv?.style.background).toBe('var(--color-alarm-2)');
  });
});

describe('bloco de seção', () => {
  it('fica cinza e sem contagem quando nada está fora', () => {
    render(<SectionBlock label="Prensas" out={[]} />);
    expect(screen.getByRole('button', { name: /Prensas/ })).toHaveTextContent('Prensas');
    expect(screen.getByRole('button', { name: /Prensas/ })).not.toHaveTextContent(/\d/);
  });

  it('mostra a contagem e as TAGs do que está fora, e avisa o clique', async () => {
    const onClick = vi.fn();
    render(
      <SectionBlock
        label="Pré-secagem"
        out={[
          { tag: 'PDIC-523', priority: 2 },
          { tag: 'VI-5123B', priority: 3 },
        ]}
        onClick={onClick}
      />,
    );
    const block = screen.getByRole('button', { name: /Pré-secagem/ });
    expect(block).toHaveTextContent('2');
    expect(block).toHaveTextContent('PDIC-523');
    expect(block).toHaveTextContent('VI-5123B');

    await userEvent.click(block);
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe('peças pequenas', () => {
  it('põe a unidade ao lado do número', () => {
    render(<Num unit="mm/s">4,9</Num>);
    expect(screen.getByText('4,9')).toHaveClass('font-mono');
    expect(screen.getByText('mm/s')).toBeInTheDocument();
  });

  it('o selo ilustrativo explica por que existe', () => {
    render(<Illustrative />);
    expect(screen.getByText('ilustrativo').getAttribute('title')).toMatch(/fixo/);
  });

  it('o minigráfico sem dados não quebra', () => {
    render(<Sparkline values={[]} label="vazio" />);
    expect(screen.getByRole('img', { name: 'vazio' })).toBeInTheDocument();
  });
});
