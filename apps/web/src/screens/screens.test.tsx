import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { WhatIfOptions } from '@mp1/shared/simulation';

import type { DataGateway } from '../api/gateway';
import type { ReelView, ShiftDetail, ShiftView } from '../api/process';
import { LaboratorioScreen } from './LaboratorioScreen';
import { MancaisScreen } from './MancaisScreen';
import { RondasScreen } from './RondasScreen';
import { BobinasScreen } from './BobinasScreen';
import { NotasScreen } from './NotasScreen';
import { ProcessoScreen } from './ProcessoScreen';
import { SimulacaoScreen } from './SimulacaoScreen';
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
  startedAt: '2026-06-15T17:00:00Z',
  endedAt: null,
  operator: 'turno B',
  productionT: 162.4,
  efficiencyPct: 94.2,
  handover: ['CS23 MLA em zona D, nota NM-000123 aberta'],
};

const BOBINA: ReelView = {
  number: 412,
  shiftId: TURNO.id,
  startedAt: '2026-06-15T17:05:00Z',
  endedAt: '2026-06-15T17:58:00Z',
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
    whatIf: nunca,
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
    labResults: vazio({ illustrative: true as const, specs: [], results: [] }),
    reelHolds: vazio({ illustrative: true as const, holds: [] }),
    fixedProcess: vazio({
      illustrative: true as const,
      ts: '2026-06-15T17:00:00Z',
      variables: [],
      values: [],
      alarms: [],
    }),
    fixedTrend: nunca,
    cdMap: nunca,
    ...over,
  };
}

describe('Turno', () => {
  it('diz que está carregando antes de a resposta chegar', () => {
    render(<TurnoScreen gateway={gatewayOf({ shifts: nunca })} {...turnoProps()} />);

    expect(screen.getByRole('status')).toHaveTextContent(/Carregando/i);
  });

  it('explica o vazio em vez de mostrar uma tela em branco', async () => {
    render(<TurnoScreen gateway={gatewayOf()} {...turnoProps()} />);

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/Nenhum turno registrado/i);
    });
  });

  it('mostra a mensagem da API no erro, com botão de tentar de novo', async () => {
    render(<TurnoScreen gateway={gatewayOf({ shifts: falha })} {...turnoProps()} />);

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

    render(<TurnoScreen gateway={gatewayOf({ shifts })} {...turnoProps()} />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole('button', { name: /tentar de novo/i }));

    expect(shifts).toHaveBeenCalledTimes(2);
  });

  it('integra a produção instantânea e mostra a passagem do turno', async () => {
    render(<TurnoScreen gateway={turnoGateway()} {...turnoProps()} />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        'Linha do tempo do turno',
      );
    });

    // 45 t/h das 17:00 às 19:00: 90 t no placar
    const placar = screen.getByRole('region', { name: 'Placar do turno' });
    const producao = within(placar).getByText('Produção').parentElement as HTMLElement;
    expect(producao).toHaveTextContent(/Produçãos*90s*t/);
    expect(screen.getByText(/CS23 MLA em zona D/)).toBeInTheDocument();
  });

  it('abre a bobina ao clicar na faixa de bobinas', async () => {
    const props = turnoProps();
    render(<TurnoScreen gateway={turnoGateway()} {...props} />);

    const bobina = await screen.findByRole('button', { name: '412' });
    await userEvent.click(bobina);

    expect(props.onSelectReel).toHaveBeenCalledWith(412);
  });

  it('diz que nada ficou pendente quando a passagem está vazia', async () => {
    const vazio = { ...TURNO, handover: [] };
    render(
      <TurnoScreen
        gateway={turnoGateway({
          shifts: () => Promise.resolve({ count: 1, shifts: [vazio] }),
          shift: () => Promise.resolve({ ...DETALHE, shift: vazio }),
        })}
        {...turnoProps()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Nada pendente/i)).toBeInTheDocument();
    });
  });
});

/** As três navegações da tela de Turno, como funções vigiadas. */
function turnoProps() {
  return { onSelectReel: vi.fn(), onOpenTag: vi.fn(), onOpenNote: vi.fn() };
}

/** Um turno das 17:00 com leitura às 19:00 e XI-0001 constante em 45 t/h. */
function turnoGateway(over: Partial<DataGateway> = {}): DataGateway {
  const trend = (tag: string) =>
    Promise.resolve({
      tag,
      unit: tag === 'XI-0001' ? 't/h' : 'm/min',
      from: '2026-06-15T17:00:00Z',
      to: '2026-06-15T19:00:00Z',
      bucketS: 60,
      buckets: [
        {
          bucketStart: '2026-06-15T17:00:00Z',
          samples: 1,
          min: tag === 'XI-0001' ? 45 : 1250,
          max: tag === 'XI-0001' ? 45 : 1250,
          first: tag === 'XI-0001' ? 45 : 1250,
          last: tag === 'XI-0001' ? 45 : 1250,
        },
      ],
      before: null,
      after: null,
      timeWeightedAverage: null,
      limits: null,
      target: null,
    });
  return gatewayOf({
    shifts: () => Promise.resolve({ count: 1, shifts: [TURNO] }),
    shift: () => Promise.resolve(DETALHE),
    processValues: () => Promise.resolve({ ts: '2026-06-15T19:00:00Z', count: 0, values: [] }),
    reels: () => Promise.resolve({ count: 1, reels: [BOBINA] }),
    tagTrend: trend,
    ...over,
  });
}

describe('Laboratório', () => {
  it('explica que o ensaio vem depois da bobina fechar', async () => {
    render(<LaboratorioScreen gateway={gatewayOf()} />);

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/depois que ela sai da Pope/);
    });
  });

  it('marca a matriz como ilustrativa e mostra a bobina', async () => {
    render(
      <LaboratorioScreen
        gateway={gatewayOf({
          tagTrend: falha,
          reels: () => Promise.resolve({ count: 1, reels: [BOBINA] }),
          labResults: () =>
            Promise.resolve({
              illustrative: true as const,
              specs: [
                {
                  tag: 'LAB-1211',
                  label: 'Cobb₆₀',
                  unit: 'g/m²',
                  lo: 22,
                  hi: 28,
                  target: 25,
                  everyReels: 1,
                },
              ],
              results: [
                {
                  reelNumber: 412,
                  tag: 'LAB-1211',
                  value: 29.4,
                  unit: 'g/m²',
                  analyzedAt: '2026-06-15T18:30:00Z',
                },
              ],
            }),
        })}
      />,
    );

    const matriz = await screen.findByRole('region', { name: 'Bobinas × ensaios' });
    expect(within(matriz).getByText('412')).toBeInTheDocument();
    expect(within(matriz).getByText('ilustrativo')).toBeInTheDocument();
    expect(within(matriz).getByText('1', { selector: '.text-spec-out' })).toBeInTheDocument();
  });
});

describe('Rondas', () => {
  it('explica o vazio', async () => {
    render(<RondasScreen gateway={gatewayOf()} onOpenBearing={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/Nenhuma ronda registrada/);
    });
  });

  it('marca o achado e leva ao mancal', async () => {
    const onOpenBearing = vi.fn();
    const ronda = {
      id: 'RD-1',
      shiftId: TURNO.id,
      startedAt: '2026-06-15T19:00:00Z',
      finishedAt: '2026-06-15T19:40:00Z',
      inspector: 'turno B',
      points: [
        {
          assetTag: 'MP1-SEC-G4-CS23-MLC',
          fieldTempC: 78.9,
          noise: 'anormal' as const,
          leak: 'nenhum' as const,
          note: 'ruído anormal, zunido constante',
          onlineTag: 'TI-5323B',
          onlineValue: 81.6,
        },
      ],
    };
    render(
      <RondasScreen
        gateway={gatewayOf({
          rounds: () => Promise.resolve({ count: 1, rounds: [ronda] }),
          shifts: () => Promise.resolve({ count: 1, shifts: [TURNO] }),
        })}
        onOpenBearing={onOpenBearing}
      />,
    );

    expect(await screen.findAllByText('achado')).not.toHaveLength(0);
    expect(screen.getByText('ruído anormal, zunido constante')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Abrir em Mancais' }));
    expect(onOpenBearing).toHaveBeenCalledWith('MP1-SEC-G4-CS23-MLC');
  });
});

describe('Mancais', () => {
  it('explica o vazio sem carregar a cena', async () => {
    render(
      <MancaisScreen gateway={gatewayOf({ asset: falha })} assetTag={null} onSelect={vi.fn()} />,
    );

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/Nenhuma leitura de mancal/);
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
        gateway={gatewayOf({
          tagTrend: falha,
          cdMap: falha,
          reels: () => Promise.resolve({ count: 1, reels: [BOBINA] }),
        })}
        selected={412}
        onSelect={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Bobina 412' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });

    // a tolerância do catálogo, não um número escrito na tela
    expect(screen.getByText('tolerância 73,5–76,5')).toBeInTheDocument();
    expect(screen.getByText('tolerância 4,3–5,3')).toBeInTheDocument();
    expect(screen.getByText('75,10')).toBeInTheDocument();
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
        gateway={gatewayOf({
          tagTrend: falha,
          cdMap: falha,
          reels: () => Promise.resolve({ count: 1, reels: [aberta] }),
        })}
        selected={413}
        onSelect={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/A bobina está na Pope/)).toBeInTheDocument();
    });
    // "em formação" aparece no destino e no perfil
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
        gateway={gatewayOf({
          tagTrend: falha,
          cdMap: falha,
          reels: () => Promise.resolve({ count: 1, reels: [rebaixada] }),
        })}
        selected={412}
        onSelect={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/papel de transição de gramatura/)).toBeInTheDocument();
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
      level: 'ligada' as const,
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
      expect(
        within(screen.getByRole('region', { name: 'Alteração de setpoint' })).getByRole('button', {
          name: /aplicar/i,
        }),
      ).toBeInTheDocument();
    });

    await userEvent.type(screen.getByLabelText(/Novo SP/i), '400');
    await userEvent.type(screen.getByLabelText(/Motivo/i), 'quero secar mais');
    await userEvent.click(
      within(screen.getByRole('region', { name: 'Alteração de setpoint' })).getByRole('button', {
        name: /aplicar/i,
      }),
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/fora da faixa de operação/);
    });
    expect(writeSetpoint).toHaveBeenCalledWith('PIC-712', {
      value: 400,
      reason: 'Correção de qualidade: quero secar mais',
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
      expect(
        within(screen.getByRole('region', { name: 'Alteração de setpoint' })).getByRole('button', {
          name: /aplicar/i,
        }),
      ).toBeInTheDocument();
    });

    await userEvent.type(screen.getByLabelText(/Novo SP/i), '160');
    await userEvent.type(screen.getByLabelText(/Motivo/i), 'umidade final acima do alvo');
    await userEvent.click(
      within(screen.getByRole('region', { name: 'Alteração de setpoint' })).getByRole('button', {
        name: /aplicar/i,
      }),
    );

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
      expect(
        within(screen.getByRole('region', { name: 'Alteração de setpoint' })).getByRole('button', {
          name: /aplicar/i,
        }),
      ).toBeInTheDocument();
    });

    await userEvent.type(screen.getByLabelText(/Novo SP/i), '145,5');
    await userEvent.type(screen.getByLabelText(/Motivo/i), 'motivo');
    await userEvent.click(
      within(screen.getByRole('region', { name: 'Alteração de setpoint' })).getByRole('button', {
        name: /aplicar/i,
      }),
    );

    await waitFor(() => {
      expect(writeSetpoint).toHaveBeenCalledWith('PIC-712', {
        value: 145.5,
        reason: 'Correção de qualidade: motivo',
        changedBy: 'operador',
      });
    });
  });
});

/**
 * Simulação — a tela que calcula sozinha.
 *
 * O que estes testes cobram é o que distingue esta tela das outras: ela não
 * espera clique nenhum para ter o que mostrar, e nada do que ela faz escreve no
 * processo. O resto — a forma das curvas, o tempo morto, o ganho — é do núcleo,
 * e tem teste lá, com o CSV na mão.
 */
describe('Simulação', () => {
  const VARIAVEIS = [
    {
      tag: 'SIC-1104',
      name: 'Velocidade da máquina',
      unit: 'm/min',
      base: [1250, 1250, 1250],
      proposed: [1250, 1265, 1270],
      finalDelta: 20,
      peakDelta: 20,
      peakAtS: 10,
      deadTimeS: 0,
      t63S: 5,
      crossings: [],
      saturated: false,
      path: ['SIC-1104'],
      limits: { ll: null, l: null, h: null, hh: null },
      target: 1250,
      manipulated: true,
    },
    {
      tag: 'AIC-902',
      name: 'Gramatura · scanner final',
      unit: 'g/m²',
      base: [75, 75, 75],
      proposed: [75, 73.9, 74.99],
      finalDelta: -0.01,
      peakDelta: -1.12,
      peakAtS: 110,
      deadTimeS: 20,
      t63S: 45,
      crossings: [{ limit: 'L' as const, atS: 60, value: 73.9 }],
      saturated: false,
      path: ['SIC-1104', 'AIC-902'],
      limits: { ll: null, l: 74, h: 76, hh: null },
      target: 75,
      manipulated: false,
    },
  ];

  const previsao = (over: Record<string, unknown> = {}) => ({
    fromTick: 1000,
    horizonS: 600,
    stepS: 5,
    mode: 'auto' as const,
    changes: [{ tag: 'SIC-1104', value: 1270 }],
    variables: VARIAVEIS,
    ts: '2026-06-15T21:00:00Z',
    fromSavedState: true,
    ...over,
  });

  const valores = () =>
    Promise.resolve({
      ts: '2026-06-15T21:00:00Z',
      count: 2,
      values: [
        {
          tag: 'SIC-1104',
          value: 1250,
          unit: 'm/min',
          ts: '2026-06-15T21:00:00Z',
          setpoint: 1250,
        },
        {
          tag: 'AIC-902',
          value: 75,
          unit: 'g/m²',
          ts: '2026-06-15T21:00:00Z',
          setpoint: 75,
        },
      ],
    });

  it('diz que está carregando antes de a resposta chegar', () => {
    render(<SimulacaoScreen gateway={gatewayOf({ processValues: nunca })} onApply={vi.fn()} />);

    expect(screen.getByRole('status')).toHaveTextContent(/Carregando/i);
  });

  it('mostra a mensagem da API no erro, com botão de tentar de novo', async () => {
    render(<SimulacaoScreen gateway={gatewayOf({ processValues: falha })} onApply={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('A API respondeu 503');
    });
  });

  /**
   * A regra desta tela: ela nunca abre vazia. Sem isto, quem entra tem de
   * adivinhar o que digitar antes de descobrir o que a tela faz.
   */
  it('não abre vazia: simula sozinha ao entrar, sem clique nenhum', async () => {
    const whatIf = vi.fn((_pedido: WhatIfOptions) => Promise.resolve(previsao()));
    render(
      <SimulacaoScreen gateway={gatewayOf({ processValues: valores, whatIf })} onApply={vi.fn()} />,
    );

    await waitFor(
      () => {
        expect(whatIf).toHaveBeenCalled();
      },
      { timeout: 3000 },
    );

    expect(whatIf.mock.calls[0]?.[0].changes[0]?.tag).toBe('SIC-1104');

    await waitFor(() => {
      expect(screen.getByText(/no pico/)).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /^Simular$/ })).not.toBeInTheDocument();
  });

  it('um valor novo recalcula sozinho', async () => {
    const whatIf = vi.fn((_pedido: WhatIfOptions) => Promise.resolve(previsao()));
    render(
      <SimulacaoScreen gateway={gatewayOf({ processValues: valores, whatIf })} onApply={vi.fn()} />,
    );

    await waitFor(
      () => {
        expect(whatIf).toHaveBeenCalledTimes(1);
      },
      { timeout: 3000 },
    );

    const campo = screen.getByLabelText('Novo valor de SIC-1104');
    await userEvent.clear(campo);
    await userEvent.type(campo, '1300');

    await waitFor(
      () => {
        expect(whatIf).toHaveBeenCalledTimes(2);
      },
      { timeout: 3000 },
    );
    expect(whatIf.mock.calls.at(-1)?.[0].changes[0]?.value).toBe(1300);
  });

  /**
   * Piscar para o vazio a cada tecla seria pior do que um número com meio
   * segundo de atraso.
   */
  it('mantém o resultado anterior enquanto a nova conta não chega', async () => {
    let chamadas = 0;
    const whatIf = vi.fn(() => {
      chamadas += 1;
      return chamadas === 1 ? Promise.resolve(previsao()) : (nunca() as Promise<never>);
    });

    render(
      <SimulacaoScreen gateway={gatewayOf({ processValues: valores, whatIf })} onApply={vi.fn()} />,
    );

    await waitFor(
      () => {
        expect(screen.getByText(/no pico/)).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    await userEvent.click(screen.getByRole('button', { name: '30 min' }));

    await waitFor(
      () => {
        expect(whatIf).toHaveBeenCalledTimes(2);
      },
      { timeout: 3000 },
    );
    expect(screen.getByText(/no pico/)).toBeInTheDocument();
  });

  it('clicar numa variável da tabela destaca o gráfico dela', async () => {
    render(
      <SimulacaoScreen
        gateway={gatewayOf({ processValues: valores, whatIf: () => Promise.resolve(previsao()) })}
        onApply={vi.fn()}
      />,
    );

    const tabela = await screen.findByRole(
      'table',
      { name: 'Variáveis alcançadas' },
      { timeout: 3000 },
    );
    const linha = await waitFor(
      () => {
        const achada = within(tabela)
          .getAllByRole('row')
          .find((row) => row.textContent?.includes('AIC-902'));
        expect(achada).toBeDefined();
        return achada as HTMLElement;
      },
      { timeout: 3000 },
    );

    await userEvent.click(linha);

    const faixa = screen.getByRole('img', { name: 'Previsão de Gramatura · scanner final' });
    expect(faixa.closest('button')).toHaveAttribute('aria-pressed', 'true');
    // e o caminho de causa e efeito aparece
    expect(screen.getByText(/pelo grafo de relações/)).toBeInTheDocument();
  });

  /**
   * A tela não escreve: o botão leva a proposta para o painel de setpoint, e
   * quem escreve é lá, com motivo obrigatório.
   */
  it('"Aplicar no processo" entrega a proposta em vez de escrever', async () => {
    const onApply = vi.fn();
    const writeSetpoint = vi.fn();
    render(
      <SimulacaoScreen
        gateway={gatewayOf({
          processValues: valores,
          whatIf: () => Promise.resolve(previsao()),
          writeSetpoint,
        })}
        onApply={onApply}
      />,
    );

    const botão = await screen.findByRole(
      'button',
      { name: 'Aplicar no processo' },
      {
        timeout: 3000,
      },
    );
    await userEvent.click(botão);

    expect(onApply).toHaveBeenCalledWith({ tag: 'SIC-1104', value: 1270 });
    expect(writeSetpoint).not.toHaveBeenCalled();
  });
});
