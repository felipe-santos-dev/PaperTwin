import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { DataGateway } from '../api/gateway';
import type { ReelView, ShiftDetail, ShiftView } from '../api/process';
import { BobinasScreen } from './BobinasScreen';
import { NotasScreen } from './NotasScreen';
import { ProcessoScreen } from './ProcessoScreen';
import { TurnoScreen } from './TurnoScreen';

/**
 * As telas contra um portão de mentira.
 *
 * O portão é injetado, então o teste observa o que cada tela faz com cada
 * resposta — inclusive com as que falham e as que vêm vazias. Interceptar o
 * `fetch` global testaria o mesmo caminho com mais cerimônia e sem conseguir
 * segurar uma resposta no meio.
 *
 * O que estes testes cobram é a regra do projeto: **estado vazio, carregando e
 * erro em toda tela que busca dados**. É uma regra fácil de cumprir na primeira
 * tela e fácil de esquecer na sétima.
 */

const nunca = (): Promise<never> => new Promise(() => undefined);
const falha = (): Promise<never> => Promise.reject(new Error('A API respondeu 503'));

const TURNO: ShiftView = {
  id: 'T-2026-06-15-B',
  letter: 'B',
  operationDate: '2026-06-15',
  startedAt: '2026-06-15T14:00:00-03:00',
  endedAt: null,
  operator: 'turno B',
  productionT: 162.4,
  efficiencyPct: 94.2,
  handover: ['CS23 MLA em zona D, nota NM-000123 aberta'],
};

const BOBINA: ReelView = {
  number: 412,
  shiftId: TURNO.id,
  startedAt: '2026-06-15T14:05:00-03:00',
  endedAt: '2026-06-15T14:58:00-03:00',
  weightT: 39.9,
  lengthM: 66_540,
  finalDiameterMm: 3000,
  basisWeightGsm: 75.1,
  moisturePct: 4.79,
  caliperUm: 101.8,
  cdSpread: { basisWeightGsm: 0.41, moisturePct: 0.24, caliperUm: 0.83 },
  splices: 0,
  disposition: 'aprovada',
  dispositionReason: null,
};

const DETALHE: ShiftDetail = {
  shift: TURNO,
  reels: [BOBINA],
  webBreaks: [],
  gradeChanges: [],
  rounds: [],
};

/** Um portão com tudo vazio, que cada teste sobrescreve no que precisa. */
function gatewayOf(over: Partial<DataGateway> = {}): DataGateway {
  const vazio =
    <T,>(value: T) =>
    () =>
      Promise.resolve(value);

  return {
    kind: 'live',
    asset: nunca,
    vibration: nunca,
    processValues: vazio({ ts: '2026-06-15T17:00:00Z', count: 0, values: [] }),
    tag: nunca,
    tagTrend: nunca,
    steamGroups: vazio({ ts: '2026-06-15T17:00:00Z', groups: [] }),
    alarms: vazio({
      count: 0,
      floodWindowS: 600,
      floodThreshold: 10,
      inFloodWindow: 0,
      flooding: false,
      alarms: [],
    }),
    shifts: vazio({ count: 0, shifts: [] }),
    shift: nunca,
    reels: vazio({ count: 0, reels: [] }),
    reel: nunca,
    webBreaks: vazio({ count: 0, webBreaks: [] }),
    gradeChanges: vazio({ count: 0, gradeChanges: [] }),
    rounds: vazio({ count: 0, rounds: [] }),
    notes: vazio({ count: 0, notes: [] }),
    setpointChanges: vazio({ count: 0, changes: [] }),
    writeSetpoint: null,
    acknowledgeAlarm: null,
    ...over,
  };
}

describe('Turno', () => {
  it('diz que está carregando antes de a resposta chegar', () => {
    render(<TurnoScreen gateway={gatewayOf({ shifts: nunca })} onSelectReel={vi.fn()} />);

    expect(screen.getByRole('status')).toHaveTextContent(/Carregando/i);
  });

  it('explica o vazio em vez de mostrar uma tela em branco', async () => {
    render(<TurnoScreen gateway={gatewayOf()} onSelectReel={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/Nenhum turno registrado/i);
    });
  });

  it('mostra a mensagem da API no erro, com botão de tentar de novo', async () => {
    render(<TurnoScreen gateway={gatewayOf({ shifts: falha })} onSelectReel={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('A API respondeu 503');
    });
    expect(screen.getByRole('button', { name: /tentar de novo/i })).toBeInTheDocument();
  });

  it('tenta de novo ao clicar', async () => {
    const shifts = vi
      .fn()
      .mockRejectedValueOnce(new Error('A API respondeu 503'))
      .mockResolvedValue({ count: 1, shifts: [TURNO] });

    render(<TurnoScreen gateway={gatewayOf({ shifts })} onSelectReel={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole('button', { name: /tentar de novo/i }));

    expect(shifts).toHaveBeenCalledTimes(2);
  });

  it('mostra a produção, as bobinas e a passagem do turno', async () => {
    render(
      <TurnoScreen
        gateway={gatewayOf({
          shifts: () => Promise.resolve({ count: 1, shifts: [TURNO] }),
          shift: () => Promise.resolve(DETALHE),
        })}
        onSelectReel={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Turno B');
    });

    expect(screen.getByText('162,4')).toBeInTheDocument();
    expect(screen.getByText(/eficiência 94,2 %/)).toBeInTheDocument();
    expect(screen.getByText(/CS23 MLA em zona D/)).toBeInTheDocument();
  });

  it('abre a bobina ao clicar na linha', async () => {
    const onSelectReel = vi.fn();

    render(
      <TurnoScreen
        gateway={gatewayOf({
          shifts: () => Promise.resolve({ count: 1, shifts: [TURNO] }),
          shift: () => Promise.resolve(DETALHE),
        })}
        onSelectReel={onSelectReel}
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /412/ }).length).toBeGreaterThan(0);
    });
    await userEvent.click(screen.getAllByRole('button', { name: /412/ })[0] as HTMLElement);

    expect(onSelectReel).toHaveBeenCalledWith(412);
  });

  it('diz que nada ficou pendente quando a passagem está vazia', async () => {
    render(
      <TurnoScreen
        gateway={gatewayOf({
          shifts: () => Promise.resolve({ count: 1, shifts: [{ ...TURNO, handover: [] }] }),
          shift: () => Promise.resolve({ ...DETALHE, shift: { ...TURNO, handover: [] } }),
        })}
        onSelectReel={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Nada pendente/i)).toBeInTheDocument();
    });
  });
});

describe('Bobinas', () => {
  it('explica o vazio com o tempo que a primeira bobina leva', async () => {
    render(<BobinasScreen gateway={gatewayOf()} selected={null} onSelect={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/53 min/);
    });
  });

  it('mostra as médias da bobina com a tolerância ao lado', async () => {
    render(
      <BobinasScreen
        gateway={gatewayOf({ reels: () => Promise.resolve({ count: 1, reels: [BOBINA] }) })}
        selected={412}
        onSelect={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Nº 412');
    });

    // a tolerância do catálogo, não um número escrito na tela
    expect(screen.getByText('tolerância 73,5–76,5')).toBeInTheDocument();
    expect(screen.getByText('tolerância 4,3–5,3')).toBeInTheDocument();
  });

  /**
   * Nulo é informação: a bobina em formação não tem peso nem destino, e mostrar
   * zero diria que ela pesa zero.
   */
  it('mostra a bobina em formação sem inventar peso', async () => {
    const aberta: ReelView = {
      ...BOBINA,
      number: 413,
      endedAt: null,
      weightT: null,
      basisWeightGsm: null,
      cdSpread: null,
      disposition: null,
      dispositionReason: null,
    };

    render(
      <BobinasScreen
        gateway={gatewayOf({ reels: () => Promise.resolve({ count: 1, reels: [aberta] }) })}
        selected={413}
        onSelect={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/A bobina está na Pope/)).toBeInTheDocument();
    });
    // "em formação" aparece no título e na linha da tabela
    expect(screen.getAllByText(/em formação/i).length).toBeGreaterThan(0);
  });

  it('diz por que a bobina foi rebaixada', async () => {
    const rebaixada: ReelView = {
      ...BOBINA,
      disposition: 'rebaixada',
      dispositionReason: 'papel de transição de gramatura',
    };

    render(
      <BobinasScreen
        gateway={gatewayOf({ reels: () => Promise.resolve({ count: 1, reels: [rebaixada] }) })}
        selected={412}
        onSelect={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('papel de transição de gramatura')).toBeInTheDocument();
    });
  });
});

describe('Notas', () => {
  it('explica de onde as notas nascem quando não há nenhuma', async () => {
    render(<NotasScreen gateway={gatewayOf()} onOpenTrend={vi.fn()} onOpenBearing={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/alarme de mancal de prioridade alta/i)).toBeInTheDocument();
    });
  });

  it('leva à tendência ao clicar na evidência', async () => {
    const onOpenTrend = vi.fn();
    const nota = {
      number: 'NM-000123',
      assetTag: 'MP1-SEC-G4-CS23-MLA',
      symptom: 'vibração acima do limite HH',
      priority: 2 as const,
      origin: 'alarme' as const,
      originRef: 'AL-1',
      status: 'aberta' as const,
      requiresShutdown: false,
      evidence: [{ kind: 'tendência' as const, ref: 'VI-5123A', label: 'últimas 72 h' }],
      createdAt: '2026-06-15T17:30:00Z',
      closedAt: null,
    };

    render(
      <NotasScreen
        gateway={gatewayOf({ notes: () => Promise.resolve({ count: 1, notes: [nota] }) })}
        onOpenTrend={onOpenTrend}
        onOpenBearing={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'VI-5123A' })).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole('button', { name: 'VI-5123A' }));

    expect(onOpenTrend).toHaveBeenCalledWith('VI-5123A');
  });

  it('diz que o gêmeo não guarda anexo', async () => {
    const nota = {
      number: 'NM-000123',
      assetTag: 'MP1-SEC-G4-CS23-MLA',
      symptom: 'sintoma',
      priority: 1 as const,
      origin: 'operação' as const,
      originRef: null,
      status: 'aberta' as const,
      requiresShutdown: true,
      evidence: [],
      createdAt: '2026-06-15T17:30:00Z',
      closedAt: null,
    };

    render(
      <NotasScreen
        gateway={gatewayOf({ notes: () => Promise.resolve({ count: 1, notes: [nota] }) })}
        onOpenTrend={vi.fn()}
        onOpenBearing={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/não guarda anexo/i)).toBeInTheDocument();
    });
  });
});

describe('Processo · escrita de setpoint', () => {
  const detalhe = (over: Record<string, unknown> = {}) => ({
    variable: {
      tag: 'PIC-712',
      name: 'Pressão de vapor G6',
      area: 'pós-secagem',
      group: 'vapor',
      unit: 'kPa rel',
      min: 40,
      max: 250,
      target: 140,
      limits: { ll: null, l: null, h: 230, hh: null },
      controlled: true,
      mv: 'PV-712',
      compression: { excDev: 1, compDev: 2 },
      source: 'B' as const,
      confidence: 'média' as const,
      note: null,
      cylinder: null,
      steamGroup: null,
    },
    value: {
      tag: 'PIC-712',
      value: 140,
      unit: 'kPa rel',
      ts: '2026-06-15T17:00:00Z',
      setpoint: null,
    },
    writable: true,
    notWritableBecause: null,
    archived: true,
    ...over,
  });

  const vazio = {
    tag: 'PIC-712',
    unit: 'kPa rel',
    from: '',
    to: '',
    bucketS: 60,
    buckets: [],
    before: null,
    after: null,
    timeWeightedAverage: null,
    limits: null,
    target: null,
  };

  /**
   * A tela de Processo só desenha o painel da tag quando a lista de variáveis
   * tem conteúdo — lista vazia é estado vazio, e aí não há o que selecionar.
   */
  const valores = () =>
    Promise.resolve({
      ts: '2026-06-15T17:00:00Z',
      count: 1,
      values: [
        {
          tag: 'PIC-712',
          value: 140,
          unit: 'kPa rel',
          ts: '2026-06-15T17:00:00Z',
          setpoint: null,
        },
      ],
    });

  /**
   * O instantâneo não aceita escrita, e dizer isso é melhor que simular: o
   * número voltaria ao anterior no próximo carregamento sem nenhuma explicação.
   */
  it('diz que o modo de demonstração não aceita escrita', async () => {
    render(
      <ProcessoScreen
        gateway={gatewayOf({
          kind: 'demo',
          writeSetpoint: null,
          processValues: valores,
          tag: () => Promise.resolve(detalhe()),
          tagTrend: () => Promise.resolve(vazio),
        })}
        tag="PIC-712"
        onSelectTag={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/não aceita escrita/i)).toBeInTheDocument();
    });
  });

  it('explica por que a tag não aceita escrita', async () => {
    render(
      <ProcessoScreen
        gateway={gatewayOf({
          processValues: valores,
          tag: () =>
            Promise.resolve(
              detalhe({
                writable: false,
                notWritableBecause: 'escrava de cascata: o setpoint pertence ao mestre',
              }),
            ),
          tagTrend: () => Promise.resolve(vazio),
          writeSetpoint: vi.fn(),
        })}
        tag="PIC-711"
        onSelectTag={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/escrava de cascata/i)).toBeInTheDocument();
    });
  });

  it('mostra a recusa da API com as palavras dela', async () => {
    const writeSetpoint = vi.fn().mockResolvedValue({
      ok: false,
      rejected: {
        statusCode: 422,
        error: 'Unprocessable Entity',
        message: '400 kPa rel está fora da faixa de operação de PIC-712, que vai de 40 a 250.',
        rejection: 'fora-dos-limites',
        min: 40,
        max: 250,
      },
    });

    render(
      <ProcessoScreen
        gateway={gatewayOf({
          processValues: valores,
          tag: () => Promise.resolve(detalhe()),
          tagTrend: () => Promise.resolve(vazio),
          writeSetpoint,
        })}
        tag="PIC-712"
        onSelectTag={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /escrever/i })).toBeInTheDocument();
    });

    await userEvent.type(screen.getByLabelText(/Novo valor/i), '400');
    await userEvent.type(screen.getByLabelText(/Motivo/i), 'quero secar mais');
    await userEvent.click(screen.getByRole('button', { name: /escrever/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/fora da faixa de operação/);
    });
    expect(writeSetpoint).toHaveBeenCalledWith('PIC-712', {
      value: 400,
      reason: 'quero secar mais',
      changedBy: 'operador',
    });
  });

  it('confirma a escrita aceita dizendo o valor anterior', async () => {
    const writeSetpoint = vi.fn().mockResolvedValue({
      ok: true,
      accepted: {
        change: {
          id: 'SP-1',
          tag: 'PIC-712',
          previousValue: 140,
          newValue: 160,
          unit: 'kPa rel',
          changedBy: 'operador',
          changedAt: '2026-06-15T17:05:00Z',
          reason: 'umidade final acima do alvo',
        },
        min: 40,
        max: 250,
      },
    });

    render(
      <ProcessoScreen
        gateway={gatewayOf({
          processValues: valores,
          tag: () => Promise.resolve(detalhe()),
          tagTrend: () => Promise.resolve(vazio),
          writeSetpoint,
        })}
        tag="PIC-712"
        onSelectTag={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /escrever/i })).toBeInTheDocument();
    });

    await userEvent.type(screen.getByLabelText(/Novo valor/i), '160');
    await userEvent.type(screen.getByLabelText(/Motivo/i), 'umidade final acima do alvo');
    await userEvent.click(screen.getByRole('button', { name: /escrever/i }));

    // a tendência vazia também tem role="status", então a consulta é pelo texto
    await waitFor(() => {
      expect(screen.getByText(/Anterior: 140,00/)).toBeInTheDocument();
    });
  });

  /** Vírgula decimal é o que quem opera digita. */
  it('aceita vírgula no valor digitado', async () => {
    const writeSetpoint = vi.fn().mockResolvedValue({
      ok: true,
      accepted: {
        change: {
          id: 'SP-1',
          tag: 'PIC-712',
          previousValue: 140,
          newValue: 145.5,
          unit: 'kPa rel',
          changedBy: 'operador',
          changedAt: '2026-06-15T17:05:00Z',
          reason: 'motivo',
        },
        min: 40,
        max: 250,
      },
    });

    render(
      <ProcessoScreen
        gateway={gatewayOf({
          processValues: valores,
          tag: () => Promise.resolve(detalhe()),
          tagTrend: () => Promise.resolve(vazio),
          writeSetpoint,
        })}
        tag="PIC-712"
        onSelectTag={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /escrever/i })).toBeInTheDocument();
    });

    await userEvent.type(screen.getByLabelText(/Novo valor/i), '145,5');
    await userEvent.type(screen.getByLabelText(/Motivo/i), 'motivo');
    await userEvent.click(screen.getByRole('button', { name: /escrever/i }));

    await waitFor(() => {
      expect(writeSetpoint).toHaveBeenCalledWith('PIC-712', {
        value: 145.5,
        reason: 'motivo',
        changedBy: 'operador',
      });
    });
  });
});
