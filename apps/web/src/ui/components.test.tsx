import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { BearingBar, TemperatureBar } from './BearingBar';
import {
  laneBand,
  laneCursor,
  laneDomain,
  laneHeightFor,
  lanePath,
  lanesGeometry,
} from './chart/lanes';
import { fraction, linear } from './chart/scale';
import { Sparkline } from './chart/Sparkline';
import { Chip } from './Chip';
import { Lanes } from './Lanes';
import { Num } from './Num';
import { HELP } from './help';
import { PageIndex } from './PageIndex';
import { Panel } from './Panel';
import { RangeBar } from './RangeBar';
import { SectionBlock } from './SectionBlock';
import { Seg } from './Seg';

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

    /**
     * A primeira TAG aparece; as outras são contadas.
     *
     * São dez blocos dividindo a largura da faixa: em 1280 px cada um fica com
     * ~110 px, e duas TAGs de catálogo não cabem na linha de baixo. Mostrar uma
     * e contar o resto é o que cabe nas quatro larguras garantidas — e a lista
     * inteira continua no `title`, que é o que o olho procura depois de ver que
     * há algo fora.
     */
    expect(block).toHaveTextContent('PDIC-523');
    expect(block).toHaveTextContent('+1');
    expect(block).not.toHaveTextContent('VI-5123B');
    expect(block).toHaveAttribute('title', 'Pré-secagem: PDIC-523, VI-5123B');

    await userEvent.click(block);
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe('ajuda do bloco', () => {
  const texto = HELP['turno.placar'];

  function abrir() {
    render(
      <Panel help="turno.placar" title="Placar do turno">
        <p>conteúdo</p>
      </Panel>,
    );
    return screen.getByRole('button', { name: 'Ajuda: Placar do turno' });
  }

  it('o "?" abre as três linhas do bloco', async () => {
    const botao = abrir();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.click(botao);

    const ajuda = screen.getByRole('dialog', { name: 'Ajuda: Placar do turno' });
    expect(ajuda).toHaveTextContent(texto.shows);
    expect(ajuda).toHaveTextContent(texto.read);
    expect(ajuda).toHaveTextContent(texto.click);
    expect(botao).toHaveAttribute('aria-expanded', 'true');
  });

  it('abre pelo teclado, sem mouse', async () => {
    abrir();

    await userEvent.tab();
    await userEvent.keyboard('{Enter}');

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('Esc fecha e devolve o foco ao "?"', async () => {
    const botao = abrir();
    await userEvent.click(botao);

    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(botao).toHaveFocus();
  });

  it('clique fora fecha', async () => {
    const botao = abrir();
    await userEvent.click(botao);

    await userEvent.click(document.body);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('peças pequenas', () => {
  it('põe a unidade ao lado do número', () => {
    render(<Num unit="mm/s">4,9</Num>);
    expect(screen.getByText('4,9')).toHaveClass('font-mono');
    expect(screen.getByText('mm/s')).toBeInTheDocument();
  });

  it('o minigráfico sem dados não quebra', () => {
    render(<Sparkline values={[]} label="vazio" />);
    expect(screen.getByRole('img', { name: 'vazio' })).toBeInTheDocument();
  });
});

describe('barra de faixa · faixa, alvo e setpoint', () => {
  const props = { min: 0, max: 2, ll: 0.5, l: 0.8, h: 1.6, hh: 1.8, target: 1.4 };

  it('desenha a faixa L–H onde ela está, e com a largura dela', () => {
    const { container } = render(<RangeBar {...props} pv={1.4} />);
    const banda = container.querySelector<HTMLElement>('.bg-band');

    // L = 0,8 de 0–2 é 40 %; H − L = 0,8, que é 40 % da escala
    expect(banda?.style.left).toBe('40%');
    expect(banda?.style.width).toBe('40%');
  });

  it('não desenha faixa quando só um dos limites existe', () => {
    const { container } = render(<RangeBar min={0} max={2} l={0.8} pv={1} />);
    expect(container.querySelector('.bg-band')).toBeNull();
  });

  it('põe o triângulo do setpoint na posição do SP, e só quando há SP', () => {
    const { container: com } = render(<RangeBar {...props} pv={1.4} sp={1.0} />);
    expect(com.querySelector<SVGElement>('svg')?.style.left).toBe('50%');

    const { container: sem } = render(<RangeBar {...props} pv={1.4} />);
    expect(sem.querySelector('svg')).toBeNull();
  });

  it('cai no meio da barra quando a escala é degenerada', () => {
    // min = max acontece em TAG sem faixa no catálogo; dividir por zero poria
    // o PV em NaN e o navegador o desenharia na borda esquerda, como se o
    // valor estivesse no mínimo
    const { container } = render(<RangeBar min={5} max={5} pv={5} />);
    const pv = [...container.querySelectorAll<HTMLElement>('div')].at(-1);
    expect(pv?.style.left).toBe('50%');
  });
});

describe('faixas empilhadas · geometria', () => {
  it('empilha as faixas com o respiro entre elas e o eixo embaixo', () => {
    const geo = lanesGeometry({ width: 900, count: 3, laneHeight: 60 });

    // 3 × (60 + 12) − 12 + 22
    expect(geo.height).toBe(226);
    expect(geo.boxes.map((box) => box.top)).toEqual([0, 72, 144]);
    expect(geo.plot).toEqual({ left: 170, right: 810 });
  });

  it('não vira o desenho do avesso em painel estreito', () => {
    // o bug que este teste tranca: com 200 px de largura, `width - valueWidth`
    // cai abaixo da coluna do rótulo, `right < left`, e a linha sai desenhada
    // para a esquerda, atravessando os rótulos
    const geo = lanesGeometry({ width: 200, count: 1, laneHeight: 40 });
    expect(geo.plot.right).toBeGreaterThanOrEqual(geo.plot.left);
  });

  it('divide a altura disponível entre as faixas, com piso de 24 px', () => {
    // 360 − 22 de eixo − 2 × 12 de respiro, dividido por 3
    expect(laneHeightFor(360, 3)).toBeCloseTo((360 - 22 - 24) / 3);
    expect(laneHeightFor(60, 8)).toBe(24);
  });

  it('a escala do catálogo ganha dos dados', () => {
    expect(laneDomain({ series: [[0, 100]], lo: 70, hi: 80 })).toEqual([70, 80]);
  });

  it('deixa a banda de especificação caber na escala', () => {
    const [lo, hi] = laneDomain({ series: [[75, 75.2]], band: [73.5, 76.5] });
    expect(lo).toBeLessThanOrEqual(73.5);
    expect(hi).toBeGreaterThanOrEqual(76.5);
  });

  it('abre a escala quando a série é constante', () => {
    const [lo, hi] = laneDomain({ series: [[5, 5, 5]] });
    expect(hi).toBeGreaterThan(lo);
    expect(Number.isFinite(lo) && Number.isFinite(hi)).toBe(true);
  });

  it('sem número nenhum, devolve uma escala utilizável', () => {
    const [lo, hi] = laneDomain({ series: [[null, null]] });
    expect(hi).toBeGreaterThan(lo);
  });

  it('corta a linha no buraco em vez de atravessá-lo', () => {
    const d = lanePath({
      values: [1, null, 3],
      left: 0,
      right: 100,
      top: 0,
      bottom: 50,
      lo: 0,
      hi: 4,
    });

    // dois `M` quer dizer dois segmentos: o buraco não foi ligado
    expect(d.match(/M/g)).toHaveLength(2);
    expect(d).not.toContain('L');
  });

  it('prende na borda o valor que sai muito da escala', () => {
    const dentro = lanePath({
      values: [4],
      left: 0,
      right: 10,
      top: 0,
      bottom: 100,
      lo: 0,
      hi: 4,
    });
    const fora = lanePath({
      values: [40],
      left: 0,
      right: 10,
      top: 0,
      bottom: 100,
      lo: 0,
      hi: 4,
    });

    // 4 é o topo da escala (y = 0); 40 passa muito, e para na folga de 10 %
    expect(dentro).toBe('M0.0,0.0');
    expect(fora).toBe('M0.0,-10.0');
  });

  it('série vazia não desenha nada', () => {
    expect(lanePath({ values: [], left: 0, right: 10, top: 0, bottom: 10, lo: 0, hi: 1 })).toBe('');
  });

  it('recorta a banda ao que a faixa mostra', () => {
    const box = { top: 100, height: 50 };
    const dentro = laneBand([2, 3], box, 0, 4);
    expect(dentro?.top).toBeCloseTo(100 + 50 - (50 * 3) / 4);
    expect(dentro?.height).toBeCloseTo(50 / 4);

    // uma banda inteira acima do domínio não vira retângulo de altura negativa
    expect(laneBand([10, 12], box, 0, 4)).toBeNull();
  });

  it('o cursor de tempo fica entre as pontas do desenho', () => {
    const plot = { left: 100, right: 500 };
    expect(laneCursor(0.5, plot)).toBe(300);
    expect(laneCursor(1.4, plot)).toBe(500);
    expect(laneCursor(-2, plot)).toBe(100);
  });
});

describe('faixas empilhadas · desenho', () => {
  const FAIXAS = [
    {
      name: 'Gramatura',
      tag: 'AIC-902',
      values: [75, 75.2, 74.9],
      b: [74, 74.5, 74.8],
      baseline: [75, 75, 75],
      band: [73.5, 76.5] as [number, number],
      value: '74,9',
      sub: 'g/m²',
    },
    { name: 'Umidade final', tag: 'AIC-903', values: [4.8, 4.9, 5.0], value: '5,0' },
  ];

  it('diz o que mostra, e mostra o nome inteiro de cada faixa', () => {
    render(<Lanes lanes={FAIXAS} width={900} label="Resposta no tempo" />);

    expect(screen.getByRole('img', { name: 'Resposta no tempo' })).toBeInTheDocument();
    expect(screen.getByText('Gramatura')).toBeInTheDocument();
    expect(screen.getByText('Umidade final')).toBeInTheDocument();
    expect(screen.getByText('AIC-902')).toBeInTheDocument();
    expect(screen.getByText('74,9')).toBeInTheDocument();
  });

  it('a série B é tracejada em âmbar e a linha de base é tracejada em cinza', () => {
    const { container } = render(<Lanes lanes={FAIXAS} width={900} label="faixas" />);
    const tracejadas = [...container.querySelectorAll('path')].filter((path) =>
      path.getAttribute('stroke-dasharray'),
    );

    expect(tracejadas).toHaveLength(2);
    expect(tracejadas.map((path) => path.getAttribute('stroke'))).toEqual([
      'var(--color-fg-3)',
      'var(--color-alarm-2)',
    ]);
  });

  it('desenha o cursor de tempo só quando há instante', () => {
    const { container: com } = render(
      <Lanes lanes={FAIXAS} width={900} now={0.5} label="faixas" />,
    );
    expect(com.querySelector('line')).not.toBeNull();

    const { container: sem } = render(<Lanes lanes={FAIXAS} width={900} label="faixas" />);
    expect(sem.querySelector('line')).toBeNull();
  });

  it('a altura do SVG é a da geometria, para o painel crescer e a página rolar', () => {
    const { container } = render(
      <Lanes lanes={FAIXAS} width={900} laneHeight={60} label="faixas" />,
    );
    const esperada = lanesGeometry({ width: 900, count: 2, laneHeight: 60 }).height;

    expect(container.querySelector('svg')?.getAttribute('height')).toBe(String(esperada));
  });

  it('sem faixa nenhuma, não quebra', () => {
    render(<Lanes lanes={[]} width={900} label="vazio" />);
    expect(screen.getByRole('img', { name: 'vazio' })).toBeInTheDocument();
  });
});

describe('segmentados', () => {
  const OPCOES = [
    { value: 'turno', label: 'Turno' },
    { value: '24h', label: '24 h' },
    { value: '3turnos', label: '3 turnos' },
  ] as const;

  it('diz qual está escolhido, e é um grupo de rádio', () => {
    render(<Seg options={OPCOES} value="24h" onChange={() => undefined} label="Janela" />);

    expect(screen.getByRole('radiogroup', { name: 'Janela' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '24 h' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Turno' })).not.toBeChecked();
  });

  it('as setas andam entre os segmentos', async () => {
    const onChange = vi.fn();
    render(<Seg options={OPCOES} value="24h" onChange={onChange} label="Janela" />);

    await userEvent.type(screen.getByRole('radio', { name: '24 h' }), '{arrowright}');
    expect(onChange).toHaveBeenCalledWith('3turnos');
  });
});

describe('chip', () => {
  it('é botão quando leva a algum lugar, e texto quando só explica', async () => {
    const onClick = vi.fn();
    const { unmount } = render(<Chip label="Preparo e refino" onClick={onClick} />);
    await userEvent.click(screen.getByRole('button', { name: 'Preparo e refino' }));
    expect(onClick).toHaveBeenCalled();
    unmount();

    render(<Chip label="alarme" dot="var(--color-alarm-2)" />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('alarme')).toBeInTheDocument();
  });

  it('mostra o nome inteiro, sem cortar', () => {
    render(<Chip label="Pré-secagem" priority={1} count={2} onClick={() => undefined} />);
    expect(screen.getByText('Pré-secagem')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});

describe('índice da página', () => {
  it('não desenha nada quando a página não tem seções', () => {
    const { container } = render(<PageIndex entries={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('leva a cada seção da página', () => {
    render(
      <PageIndex
        entries={[
          { id: 't-comp', label: 'Últimos turnos' },
          { id: 't-ev', label: 'Eventos' },
        ]}
      />,
    );

    expect(screen.getByRole('link', { name: 'Eventos' })).toHaveAttribute('href', '#t-ev');
  });
});
