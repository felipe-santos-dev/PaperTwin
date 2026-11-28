import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { WhatIfOptions } from '@mp1/shared/simulation';
import type { MaintenanceNote, NoteSuggestion } from '@mp1/shared';

import type { DataGateway } from '../api/gateway';
import type { ReelView, ShiftDetail, ShiftView } from '../api/process';
import { LaboratorioScreen } from './LaboratorioScreen';
import { MancaisScreen } from './MancaisScreen';
import { RondasScreen } from './RondasScreen';
import { BobinasScreen } from './BobinasScreen';
import { NotasScreen } from './NotasScreen';
import { ProcessoScreen } from './ProcessoScreen';
import { QuebraScreen } from './QuebraScreen';
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
    breakReplay: nunca,
    gradeChanges: vazio({ count: 0, gradeChanges: [] }),
    rounds: vazio({ count: 0, rounds: [] }),
    notes: vazio({ count: 0, notes: [] }),
    labTestResults: vazio({ count: 0, results: [] }),
    // sem sensor virtual por padrão: a tela cai no caminho dos 19 ilustrativos
    quality: falha,
    noteSuggestions: vazio({ count: 0, suggestions: [] }),
    confirmSuggestion: null,
    dismissSuggestion: null,
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

    // o `h1` agora e o do cabecalho de tela, na casca; o painel e `h2`
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 2, name: 'Linha do tempo do turno' }),
      ).toBeInTheDocument();
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
  return {
    onSelectReel: vi.fn(),
    onOpenTag: vi.fn(),
    onOpenNote: vi.fn(),
    onOpenBreak: vi.fn(),
  };
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
  /**
   * O sensor virtual, que é o único ensaio que não é ilustrativo.
   *
   * O que o teste cobra é a honestidade do painel: o número vem com a faixa
   * que ele mesmo declara, a tela diz se está dentro, e o aviso de que a
   * estimativa chega antes do papel num transiente continua lá.
   */
  describe('sensor virtual', () => {
    const QUALIDADE = {
      tag: 'LAB-1206',
      unit: 'kN/m',
      from: '2026-06-15T17:00:00Z',
      to: '2026-06-15T21:00:00Z',
      spec: { lo: 4.6, hi: 6.0, target: 5.2 },
      model: {
        tag: 'LAB-1206',
        base: 5.2,
        terms: [{ tag: 'JIC-101', kp: 0.0425, at: 110, unit: 'kN/m por kWh/t' }],
      },
      calibration: {
        bias: 0.04,
        sd: 0.03,
        samples: 5,
        lastAt: '2026-06-15T20:10:00Z',
      },
      now: { t: '2026-06-15T21:00:00Z', value: 5.24, lo: 5.18, hi: 5.3 },
      points: [
        { t: '2026-06-15T20:00:00Z', value: 5.2, lo: 5.14, hi: 5.26 },
        { t: '2026-06-15T21:00:00Z', value: 5.24, lo: 5.18, hi: 5.3 },
      ],
      results: [
        {
          id: 'LR-412-LAB-1206',
          tag: 'LAB-1206',
          reelNumber: 412,
          value: 5.26,
          unit: 'kN/m',
          sampledAt: '2026-06-15T20:10:00Z',
          reportedAt: '2026-06-15T20:35:00Z',
          withinSpec: true,
        },
      ],
      lastResult: {
        id: 'LR-412-LAB-1206',
        tag: 'LAB-1206',
        reelNumber: 412,
        value: 5.26,
        unit: 'kN/m',
        sampledAt: '2026-06-15T20:10:00Z',
        reportedAt: '2026-06-15T20:35:00Z',
        withinSpec: true,
      },
    };

    const portão = () =>
      gatewayOf({
        tagTrend: falha,
        reels: () => Promise.resolve({ count: 1, reels: [BOBINA] }),
        quality: () => Promise.resolve(QUALIDADE),
        labResults: () =>
          Promise.resolve({
            illustrative: true as const,
            specs: [
              {
                tag: 'LAB-1206',
                label: 'Tração MD',
                unit: 'kN/m',
                lo: 4.6,
                hi: 6.0,
                target: 5.2,
                everyReels: 1,
              },
            ],
            results: [],
          }),
      });

    it('abre no sensor virtual, com a estimativa e a faixa', async () => {
      render(<LaboratorioScreen gateway={portão()} />);

      const painel = await screen.findByRole('region', { name: 'Sensor virtual de tração MD' });
      expect(painel).toHaveTextContent('5,24');
      expect(painel).toHaveTextContent('± 0,06');
      expect(painel).toHaveTextContent('dentro da faixa');
      expect(painel).toHaveTextContent('viés +0,04 · 5 laudos');
      expect(painel).toHaveTextContent(/chega antes do papel/);
    });

    it('a matriz diz que a tração MD é medida, e não ilustrativa', async () => {
      render(<LaboratorioScreen gateway={portão()} />);

      const matriz = await screen.findByRole('region', { name: 'Bobinas × ensaios' });
      expect(within(matriz).getByText('LAB-1206 medido')).toBeInTheDocument();
    });

    it('sem faixa, diz que faltam laudos em vez de inventar incerteza', async () => {
      render(
        <LaboratorioScreen
          gateway={gatewayOf({
            tagTrend: falha,
            reels: () => Promise.resolve({ count: 1, reels: [BOBINA] }),
            labResults: () =>
              Promise.resolve({ illustrative: true as const, specs: [], results: [] }),
            quality: () =>
              Promise.resolve({
                ...QUALIDADE,
                calibration: { bias: 0, sd: null, samples: 2, lastAt: null },
                now: { t: '2026-06-15T21:00:00Z', value: 5.2, lo: null, hi: null },
                points: [{ t: '2026-06-15T21:00:00Z', value: 5.2, lo: null, hi: null }],
              }),
          })}
        />,
      );

      const painel = await screen.findByRole('region', { name: 'Sensor virtual de tração MD' });
      expect(painel).toHaveTextContent('menos de três laudos');
    });
  });

  it('explica que o ensaio vem depois da bobina fechar', async () => {
    render(<LaboratorioScreen gateway={gatewayOf()} />);

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/depois que ela sai da Pope/);
    });
  });

  it('mostra a bobina e o ensaio fora na matriz', async () => {
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
    /*
      A contagem de ensaios fora subiu para o cabeçalho da tela.

      Ela é o retrato da tela inteira — a carta de controle ao lado fala dos
      mesmos ensaios —, e repeti-la no título do painel era dizer duas vezes. O
      teste segue cobrando o número; mudou onde ele mora.
    */
    expect(screen.getByText('1', { selector: '.text-spec-out' })).toBeInTheDocument();
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
  const mancaisProps = () => ({
    assetTag: null,
    onSelect: vi.fn(),
    onOpenTag: vi.fn(),
    onOpenNote: vi.fn(),
  });

  it('explica o vazio sem carregar a cena', async () => {
    render(<MancaisScreen gateway={gatewayOf({ asset: falha })} {...mancaisProps()} />);

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/Nenhuma leitura de mancal/);
    });
  });

  /**
   * O cartão da nota sugerida, que é a tela da Fase 6.
   *
   * O que os testes cobram é o que a fase promete: a nota vem preenchida e sem
   * número, dispensar não passa sem motivo, e o instantâneo diz que não decide
   * em vez de fingir que decidiu.
   */
  describe('nota sugerida', () => {
    const resposta =
      <T,>(value: T) =>
      () =>
        Promise.resolve(value);

    const NOTA: MaintenanceNote = {
      number: 'NM-000900',
      assetTag: 'MP1-SEC-G4-CS23-MLC',
      symptom: 'vibração acima da fronteira C→D',
      priority: 1,
      origin: 'tendência',
      originRef: 'SG-1781265600-MP1-SEC-G4-CS23-MLC',
      status: 'aberta',
      requiresShutdown: true,
      evidence: [],
      createdAt: '2026-06-15T12:30:00Z',
      closedAt: null,
    };

    const SUGESTÃO: NoteSuggestion = {
      id: 'SG-1781265600-MP1-SEC-G4-CS23-MLC',
      assetTag: 'MP1-SEC-G4-CS23-MLC',
      trendStart: '2026-06-12T12:00:00Z',
      measure: 'vibração',
      symptom:
        'vibração 5,21 mm/s (zona D), subindo 1,40 mm/s por dia: a projeção já passou a fronteira C→D de 4,5 mm/s',
      priority: 1,
      requiresShutdown: true,
      daysToLimit: 0,
      perDay: 1.4,
      level: 5.21,
      limit: 4.5,
      samples: 72,
      evidence: [
        { kind: 'tendência', ref: 'VI-5123B', label: 'janela da tendência com a projeção' },
        { kind: 'alarme', ref: 'AL-1', label: 'alarme H de VI-5123B' },
      ],
      at: '2026-06-15T12:00:00Z',
      status: 'sugerida',
      decidedAt: null,
      decidedBy: null,
      reason: null,
      noteNumber: null,
    };

    const comMancal = (over: Partial<DataGateway> = {}) =>
      gatewayOf({
        // os mancais sem TAG no catálogo vêm da rota do ativo, que aqui falha e é
        // ignorada: o que o cartão precisa são os valores de processo
        asset: falha,
        processValues: resposta({
          ts: '2026-06-15T12:00:00Z',
          count: 1,
          values: [{ tag: 'VI-5123B', value: 5.21, unit: 'mm/s', setpoint: null, ts: SUGESTÃO.at }],
        }),
        noteSuggestions: resposta({ count: 1, suggestions: [SUGESTÃO] }),
        confirmSuggestion: vi.fn(() =>
          Promise.resolve({
            suggestion: { ...SUGESTÃO, status: 'confirmada' as const, noteNumber: 'NM-000900' },
            note: NOTA,
          }),
        ),
        dismissSuggestion: vi.fn(() =>
          Promise.resolve({ suggestion: { ...SUGESTÃO, status: 'dispensada' as const } }),
        ),
        ...over,
      });

    it('mostra a nota pronta, sem número, com a prioridade e a parada', async () => {
      render(<MancaisScreen gateway={comMancal()} {...mancaisProps()} />);

      const cartão = await screen.findByRole('region', { name: 'Nota sugerida pela tendência' });
      expect(cartão).toHaveTextContent('sem número até confirmar');
      expect(cartão).toHaveTextContent('P1');
      expect(cartão).toHaveTextContent('PARADA');
      expect(cartão).toHaveTextContent('a projeção já passou');
      expect(cartão).toHaveTextContent('já passou');
      expect(cartão).toHaveTextContent('defeito que acelera chega antes');
    });

    it('a evidência da tendência abre a TAG', async () => {
      const props = mancaisProps();
      render(<MancaisScreen gateway={comMancal()} {...props} />);

      const cartão = await screen.findByRole('region', { name: 'Nota sugerida pela tendência' });
      await userEvent.click(within(cartão).getByRole('button', { name: 'VI-5123B' }));
      expect(props.onOpenTag).toHaveBeenCalledWith('VI-5123B');
    });

    it('dispensar não passa sem motivo', async () => {
      const portão = comMancal();
      render(<MancaisScreen gateway={portão} {...mancaisProps()} />);

      const cartão = await screen.findByRole('region', { name: 'Nota sugerida pela tendência' });
      await userEvent.click(within(cartão).getByRole('button', { name: 'Dispensar' }));

      const enviar = within(cartão).getByRole('button', { name: 'Confirmar a dispensa' });
      expect(enviar).toBeDisabled();

      await userEvent.type(
        within(cartão).getByLabelText(/Motivo da dispensa/),
        'já programado para agosto',
      );
      expect(enviar).toBeEnabled();
      await userEvent.click(enviar);

      expect(portão.dismissSuggestion).toHaveBeenCalledWith(SUGESTÃO.id, {
        reason: 'já programado para agosto',
        dismissedBy: 'operador',
      });
    });

    it('confirmar abre a nota e diz o número', async () => {
      const portão = comMancal();
      render(<MancaisScreen gateway={portão} {...mancaisProps()} />);

      const cartão = await screen.findByRole('region', { name: 'Nota sugerida pela tendência' });
      await userEvent.click(within(cartão).getByRole('button', { name: 'Confirmar' }));

      await waitFor(() => {
        expect(within(cartão).getByRole('status')).toHaveTextContent('NM-000900');
      });
      expect(portão.confirmSuggestion).toHaveBeenCalledWith(SUGESTÃO.id, {
        confirmedBy: 'operador',
      });
    });

    it('no instantâneo os botões ficam desligados, com a razão', async () => {
      render(
        <MancaisScreen
          gateway={comMancal({ confirmSuggestion: null, dismissSuggestion: null })}
          {...mancaisProps()}
        />,
      );

      const cartão = await screen.findByRole('region', { name: 'Nota sugerida pela tendência' });
      expect(cartão).toHaveTextContent('não aceita decisão');
      expect(within(cartão).getByRole('button', { name: 'Confirmar' })).toBeDisabled();
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

/**
 * Replay de quebra — a tela que não pode inventar culpado.
 *
 * O que os testes cobram aqui é o que distingue esta tela: a ordem é a dos
 * números, a consequência aparece como consequência, e uma quebra sem desvio
 * diz que não sabe em vez de eleger o menos inocente da lista.
 */
describe('Replay de quebra', () => {
  const QUEBRA = {
    id: 'QB-1',
    shiftId: TURNO.id,
    startedAt: '2026-06-15T18:30:00Z',
    endedAt: '2026-06-15T18:52:00Z',
    section: 'press' as const,
    probableCause: 'perda de vácuo na prensa de sapata',
    precursors: [],
  };

  const desvio = (over: Record<string, unknown>) => ({
    tag: 'WIC-401',
    name: 'Carga linear da prensa de sapata',
    unit: 'kN/m',
    leadTimeS: 540,
    direction: 'caiu' as const,
    size: -50,
    peak: -52,
    sigmas: 25,
    baseline: 720,
    ruler: 2,
    consequenceOf: null,
    ...over,
  });

  const série = (tag: string) => ({
    tag,
    name: tag,
    unit: '%',
    baseline: 10,
    samples: [
      { t: '2026-06-15T18:20:00Z', v: 10 },
      { t: '2026-06-15T18:25:00Z', v: 9 },
      { t: '2026-06-15T18:30:00Z', v: 8 },
    ],
  });

  const replay = (over: Record<string, unknown> = {}) => ({
    webBreak: QUEBRA,
    replay: {
      breakAt: Date.parse(QUEBRA.startedAt),
      windowS: 600,
      deviations: [
        desvio({}),
        desvio({
          tag: 'AI-407',
          name: 'Sequidade na saída da prensa',
          unit: '%',
          leadTimeS: 300,
          consequenceOf: 'WIC-401',
        }),
      ],
      quiet: ['SIC-1104'],
      unknown: [],
      first: desvio({}),
      ...over,
    },
    series: [série('WIC-401'), série('AI-407'), série('SIC-1104')],
    events: { alarms: [], setpointChanges: [], gradeChanges: [] },
    pattern: { sameSection: 4, sameFirst: 2, tag: 'WIC-401' },
  });

  const portão = (over: Partial<DataGateway> = {}) =>
    gatewayOf({
      webBreaks: () => Promise.resolve({ count: 1, webBreaks: [QUEBRA] }),
      breakReplay: () => Promise.resolve(replay()),
      notes: () => Promise.resolve({ count: 0, notes: [] }),
      ...over,
    });

  const props = { id: null, onOpenNote: vi.fn(), onOpenTag: vi.fn() };

  it('diz que está carregando antes de a resposta chegar', () => {
    render(<QuebraScreen gateway={portão({ webBreaks: nunca })} {...props} />);
    expect(screen.getByRole('status')).toHaveTextContent(/Carregando/i);
  });

  it('explica o vazio quando não há quebra registrada', async () => {
    render(
      <QuebraScreen
        gateway={portão({ webBreaks: () => Promise.resolve({ count: 0, webBreaks: [] }) })}
        {...props}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/Nenhuma quebra/i);
    });
  });

  it('mostra a mensagem da API no erro', async () => {
    render(<QuebraScreen gateway={portão({ webBreaks: falha })} {...props} />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('A API respondeu 503');
    });
  });

  it('o resumo diz o primeiro desvio, e não a causa', async () => {
    render(<QuebraScreen gateway={portão()} {...props} />);

    const resumo = await screen.findByText(/Primeiro desvio:/);
    expect(resumo).toHaveTextContent('Carga linear da prensa de sapata');
    expect(resumo.textContent ?? '').not.toMatch(/causa/i);
  });

  it('a consequência aparece como consequência', async () => {
    render(<QuebraScreen gateway={portão()} {...props} />);

    await screen.findByText(/Primeiro desvio:/);

    const lista = within(screen.getByRole('region', { name: 'O que se mexeu' }));
    expect(lista.getByText(/depois de WIC-401 — que a move/)).toBeInTheDocument();
    expect(lista.getByText('primeiro desvio')).toBeInTheDocument();
  });

  /** O teste irmão do núcleo: sem desvio, sem culpado. */
  it('quebra sem desvio não aponta ninguém', async () => {
    render(
      <QuebraScreen
        gateway={portão({
          breakReplay: () =>
            Promise.resolve({
              ...replay(),
              replay: {
                breakAt: Date.parse(QUEBRA.startedAt),
                windowS: 600,
                deviations: [],
                quiet: ['WIC-401', 'AI-407'],
                unknown: [],
                first: null,
              },
            }),
        })}
        {...props}
      />,
    );

    // a frase aparece nos dois painéis: no resumo e no lugar da lista
    await waitFor(() => {
      expect(
        screen.getAllByText(/Nenhuma das variáveis observadas saiu do normal/).length,
      ).toBeGreaterThan(0);
    });
    expect(screen.queryByText(/Primeiro desvio:/)).not.toBeInTheDocument();
  });

  it('o padrão conta coincidências sem prever a próxima', async () => {
    render(<QuebraScreen gateway={portão()} {...props} />);

    const padrão = await screen.findByText(/quebras anteriores em/);
    expect(padrão).toHaveTextContent('2 das 4');
    expect(padrão.textContent ?? '').not.toMatch(/vai|provável/i);
  });
});
