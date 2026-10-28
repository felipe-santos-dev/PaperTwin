import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { assetByTag, DRYER_BEARING_ISO, isoLimitsOf, MP1, type VibrationBucket } from '@mp1/shared';
import type { AssetDetail, VibrationSeries } from '../api/client';
import { AssetPanel } from './AssetPanel';
import type { AssetData } from './useAssetDetail';

const limits = isoLimitsOf(DRYER_BEARING_ISO); // 1,4 / 2,8 / 4,5

function asset(tag: string) {
  const found = assetByTag(MP1, tag);
  if (!found) throw new Error(`ativo ausente no modelo: ${tag}`);
  return found;
}

const bearing = asset('MP1-SEC-G4-CS23-MLA');

function buckets(values: readonly number[]): VibrationBucket[] {
  const start = Date.parse('2026-03-01T00:00:00Z');
  return values.map((rms, i) => ({
    bucketStart: new Date(start + i * 3600_000).toISOString(),
    samples: 4,
    rmsAvgMmS: rms,
    rmsMaxMmS: rms * 1.1,
    tempAvgC: 70 + i,
    envelopeMaxGe: 1 + i / 10,
  }));
}

function ready(overrides: Partial<AssetData> = {}): AssetData {
  const detail: AssetDetail = {
    asset: bearing,
    status: {
      assetTag: bearing.tag,
      zone: 'D',
      health: 'critical',
      latest: {
        assetTag: bearing.tag,
        ts: '2026-03-04T00:00:00Z',
        rmsMmS: 5.8,
        tempC: 84,
        envelopeGe: 3.2,
      },
    },
    limits,
  };

  const series: VibrationSeries = {
    assetTag: bearing.tag,
    from: '2026-03-01T00:00:00Z',
    to: '2026-03-04T00:00:00Z',
    bucket: '1 hour',
    limits,
    buckets: buckets([1.5, 2.4, 3.6, 4.8, 5.8]),
    remainingLife: { trendMmSPerDay: 1.05, daysToZoneD: 0, samples: 5 },
  };

  return { phase: 'ready', detail, series, error: null, ...overrides };
}

const loading: AssetData = { phase: 'loading', detail: null, series: null, error: null };

describe('AssetPanel', () => {
  it('mostra a identidade do ativo mesmo antes da API responder', () => {
    render(<AssetPanel asset={bearing} data={loading} onClose={() => undefined} />);

    expect(screen.getByRole('heading')).toHaveTextContent('Mancal LA');
    expect(screen.getByText(bearing.tag)).toBeInTheDocument();
    expect(screen.getByText('LA · lado acionamento')).toBeInTheDocument();
    expect(screen.getByText(/Consultando a API/)).toBeInTheDocument();
  });

  it('mostra a zona da ISO e o que ela significa', () => {
    render(<AssetPanel asset={bearing} data={ready()} onClose={() => undefined} />);

    expect(screen.getByText(/ISO 20816 · zona D/)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Crítico');
    expect(screen.getByText(/causar dano/)).toBeInTheDocument();
  });

  it('mostra as leituras mais recentes', () => {
    render(<AssetPanel asset={bearing} data={ready()} onClose={() => undefined} />);

    expect(screen.getByText('5.8')).toBeInTheDocument(); // RMS
    expect(screen.getByText('84')).toBeInTheDocument(); // temperatura
    expect(screen.getByText('3.2')).toBeInTheDocument(); // envelope
  });

  it('diz que a vida útil acabou quando a tendência já cruzou', () => {
    render(<AssetPanel asset={bearing} data={ready()} onClose={() => undefined} />);
    expect(screen.getByText('agora')).toBeInTheDocument();
  });

  it('expõe o método e a limitação junto com o número', () => {
    render(<AssetPanel asset={bearing} data={ready()} onClose={() => undefined} />);

    // o número sem a procedência seria pior do que número nenhum
    expect(screen.getByText('estimativa')).toBeInTheDocument();
    expect(screen.getByText(/\+1\.05 mm\/s por dia/)).toBeInTheDocument();
    expect(screen.getByText(/mínimos quadrados sobre 5 janelas/)).toBeInTheDocument();
    expect(screen.getByText(/fronteira C→D/)).toBeInTheDocument();
    expect(screen.getByText(/a data real chega antes/)).toBeInTheDocument();
    expect(screen.getByText(/não é medição nem previsão de falha/i)).toBeInTheDocument();
  });

  it('não promete prazo quando a tendência não leva à zona D', () => {
    const data = ready();
    const series = data.series;
    if (!series) throw new Error('série ausente');

    render(
      <AssetPanel
        asset={bearing}
        data={{
          ...data,
          series: {
            ...series,
            remainingLife: { trendMmSPerDay: -0.01, daysToZoneD: null, samples: 5 },
          },
        }}
        onClose={() => undefined}
      />,
    );

    expect(screen.getByText(/não cruza a fronteira: não há prazo a dar/)).toBeInTheDocument();
    expect(screen.queryByText(/a data real chega antes/)).not.toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('desenha a tendência com rótulo acessível, em português', () => {
    render(<AssetPanel asset={bearing} data={ready()} onClose={() => undefined} />);
    // o intervalo chega da API como '1 hour'; a tela não mostra isso
    expect(
      screen.getByRole('img', { name: 'Vibração RMS · janelas de 1 hora' }),
    ).toBeInTheDocument();
  });

  it('oferece a tabela como alternativa ao gráfico', async () => {
    render(<AssetPanel asset={bearing} data={ready()} onClose={() => undefined} />);

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ver como tabela' }));

    const tabela = screen.getByRole('table');
    expect(within(tabela).getAllByRole('row')).toHaveLength(6); // cabeçalho + 5 janelas
    expect(within(tabela).getByText('5.80')).toBeInTheDocument();
  });

  it('mostra o erro da API sem esconder o ativo', () => {
    render(
      <AssetPanel
        asset={bearing}
        data={{ phase: 'error', detail: null, series: null, error: 'A API respondeu 503' }}
        onClose={() => undefined}
      />,
    );

    expect(screen.getByRole('heading')).toHaveTextContent('Mancal LA');
    expect(screen.getByText('A API respondeu 503')).toBeInTheDocument();
  });

  it('não mostra gráfico nem zona em ativo que não é medido', () => {
    const scanner = asset('MP1-QCS-SC1');
    render(
      <AssetPanel
        asset={scanner}
        data={{
          phase: 'ready',
          detail: {
            asset: scanner,
            status: { assetTag: scanner.tag, zone: null, health: null, latest: null },
            limits: null,
          },
          series: null,
          error: null,
        }}
        onClose={() => undefined}
      />,
    );

    expect(screen.queryByText(/ISO 20816 · zona/)).not.toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('avisa quando a posição do ativo ainda é suposição', () => {
    render(<AssetPanel asset={bearing} data={ready()} onClose={() => undefined} />);
    expect(screen.getByText(/suposição do protótipo/)).toBeInTheDocument();
  });

  it('fecha pelo botão', async () => {
    const onClose = vi.fn();
    render(<AssetPanel asset={bearing} data={loading} onClose={onClose} />);

    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
