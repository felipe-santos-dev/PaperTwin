import { useState } from 'react';
import {
  healthFromZone,
  type IsoZone,
  type MachineAsset,
  type RemainingLife,
  type VibrationBucket,
  type VibrationBucketSize,
} from '@mp1/shared';
import type { AssetDetail, VibrationSeries } from '../api/client';
import type { AssetData } from './useAssetDetail';
import { StatusPill } from './StatusPill';
import { VibrationTrend } from './VibrationTrend';

/**
 * O painel do ativo clicado.
 *
 * Mostra o que o modelo sabe e, para os mancais, o que a API mediu: vibração,
 * zona da ISO 20816-3, tendência e vida útil restante.
 */

const KIND_LABEL: Record<MachineAsset['kind'], string> = {
  'dryer-cylinder': 'Cilindro secador',
  roll: 'Rolo',
  bearing: 'Mancal',
  scanner: 'Scanner',
  nip: 'Nip',
  'reel-drum': 'Tambor de enroladeira',
};

const SIDE_LABEL = { LA: 'lado acionamento', LC: 'lado comando' } as const;

/**
 * A API devolve o tamanho da janela como intervalo do Postgres, que é o valor
 * certo para a API e o errado para a tela.
 */
const BUCKET_LABEL: Record<VibrationBucketSize, string> = {
  '1 minute': '1 minuto',
  '5 minutes': '5 minutos',
  '15 minutes': '15 minutos',
  '1 hour': '1 hora',
  '6 hours': '6 horas',
  '1 day': '1 dia',
};

const ZONE_NOTE: Record<IsoZone, string> = {
  A: 'Recém-comissionada',
  B: 'Aceitável para operação contínua',
  C: 'Insatisfatória a longo prazo · programar intervenção',
  D: 'Severidade suficiente para causar dano',
};

export interface AssetPanelProps {
  readonly asset: MachineAsset;
  readonly data: AssetData;
  readonly onClose: () => void;
}

export function AssetPanel({ asset, data, onClose }: AssetPanelProps) {
  const [showTable, setShowTable] = useState(false);
  const detail = data.detail;
  const series = data.series;
  const zone = detail?.status.zone ?? null;

  return (
    <aside className="absolute top-4 right-4 flex max-h-[calc(100%-2rem)] w-80 flex-col overflow-y-auto rounded-xl border border-mill-line bg-mill-panel/92 p-4 backdrop-blur">
      <div className="flex items-start gap-3">
        <div className="min-w-0">
          {zone && (
            <div className="mb-1.5 flex items-center gap-2">
              <StatusPill health={healthFromZone(zone)} />
              <span className="font-mono text-[10px] tracking-wide text-mill-muted uppercase">
                ISO 20816 · zona {zone}
              </span>
            </div>
          )}
          <h2 className="text-sm font-semibold">{asset.label}</h2>
          <p className="mt-0.5 font-mono text-[11px] break-all text-mill-muted">{asset.tag}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="ml-auto rounded-md px-2 py-0.5 text-mill-muted hover:bg-white/5"
        >
          ×
        </button>
      </div>

      {zone && <p className="mt-2 text-[11px] text-mill-muted">{ZONE_NOTE[zone]}</p>}

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <Field label="Tipo" value={KIND_LABEL[asset.kind]} />
        {asset.side && <Field label="Lado" value={`${asset.side} · ${SIDE_LABEL[asset.side]}`} />}
        {asset.driveGroup && <Field label="Grupo" value={asset.driveGroup} />}
        <Field label="Posição" value={`${asset.position.map((n) => n.toFixed(1)).join(' · ')} m`} />
      </dl>

      {data.phase === 'loading' && asset.iso && (
        <p className="mt-3 text-xs text-mill-muted">Consultando a API…</p>
      )}

      {data.phase === 'error' && (
        <p className="mt-3 rounded-lg border border-mill-critical/30 bg-mill-critical/8 px-2.5 py-2 text-[11px] text-mill-critical">
          {data.error}
        </p>
      )}

      {detail?.status.latest && <Readings detail={detail} series={series} />}

      {series && series.buckets.length > 0 && (
        <>
          <VibrationTrend
            buckets={series.buckets}
            limits={series.limits}
            label={`Vibração RMS · janelas de ${BUCKET_LABEL[series.bucket]}`}
          />

          <button
            type="button"
            onClick={() => {
              setShowTable((open) => !open);
            }}
            aria-expanded={showTable}
            className="mt-1 self-start rounded-md px-1.5 py-1 text-[11px] text-mill-muted underline decoration-dotted underline-offset-2 hover:bg-white/5"
          >
            {showTable ? 'Ocultar tabela' : 'Ver como tabela'}
          </button>

          {showTable && <BucketTable buckets={series.buckets} />}
        </>
      )}

      {series?.remainingLife && <RemainingLifeNote life={series.remainingLife} />}

      {asset.source === 'assumed' && (
        <p className="mt-3 rounded-lg border border-mill-attention/25 bg-mill-attention/8 px-2.5 py-2 text-[11px] text-mill-attention">
          Posição e existência deste ativo ainda são suposição do protótipo, à espera do mapa de
          rolos.
        </p>
      )}
    </aside>
  );
}

function Readings({ detail, series }: { detail: AssetDetail; series: VibrationSeries | null }) {
  const latest = detail.status.latest;
  if (!latest) return null;

  const days = series?.remainingLife?.daysToZoneD ?? null;

  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      <Tile label="Vibração RMS" value={latest.rmsMmS.toFixed(1)} unit="mm/s" emphasis />
      <Tile label="Temperatura" value={latest.tempC.toFixed(0)} unit="°C" />
      <Tile label="Envelope" value={latest.envelopeGe.toFixed(1)} unit="gE" />
      <Tile
        label="Até a zona D · est."
        value={days === null ? '—' : days === 0 ? 'agora' : `~${days.toFixed(0)}`}
        unit={days !== null && days > 0 ? 'dias' : ''}
      />
    </div>
  );
}

function Tile({
  label,
  value,
  unit,
  emphasis = false,
}: {
  label: string;
  value: string;
  unit: string;
  emphasis?: boolean;
}) {
  return (
    <div className="rounded-lg border border-mill-line bg-black/20 px-2.5 py-2">
      <p className="text-[10px] text-mill-muted">{label}</p>
      <p className={emphasis ? 'text-xl font-semibold' : 'text-base'}>
        {value}
        {unit && <span className="ml-1 font-mono text-[10px] text-mill-muted">{unit}</span>}
      </p>
    </div>
  );
}

/**
 * O número de vida útil vem com o método e a limitação ao lado.
 *
 * Um prazo sem procedência é pior do que prazo nenhum: alguém o trata como
 * medição e programa parada em cima dele. Então a tela diz o que foi feito —
 * reta por mínimos quadrados sobre as janelas, estendida até a fronteira C→D
 * da ISO 20816-3 — e diz de que lado ela erra.
 */
function RemainingLifeNote({ life }: { life: RemainingLife }) {
  return (
    <details className="mt-3 text-[11px] text-mill-muted">
      <summary className="cursor-pointer list-none">
        <span className="rounded bg-white/5 px-1.5 py-0.5 tracking-wide uppercase">estimativa</span>{' '}
        tendência de{' '}
        <span className="font-mono text-mill-fg">
          {life.trendMmSPerDay >= 0 ? '+' : ''}
          {life.trendMmSPerDay.toFixed(2)} mm/s por dia
        </span>{' '}
        · como foi calculado
      </summary>

      <div className="mt-1.5 space-y-1.5 border-l border-mill-line pl-2.5">
        <p>
          Reta por mínimos quadrados sobre {life.samples} janelas da vibração RMS, estendida até a
          fronteira C→D da ISO 20816-3.
        </p>
        {life.daysToZoneD === null ? (
          <p>A tendência é plana ou de queda, então não cruza a fronteira: não há prazo a dar.</p>
        ) : (
          <p>
            A reta <strong className="font-medium text-mill-fg">subestima</strong>: defeito de
            rolamento acelera, então a data real chega antes da estimada.
          </p>
        )}
        <p>Não é medição nem previsão de falha — é extrapolação da tendência recente.</p>
      </div>
    </details>
  );
}

/** A versão em tabela do gráfico, para quem não lê a cor nem o traço. */
function BucketTable({ buckets }: { buckets: readonly VibrationBucket[] }) {
  const formato = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-mill-line">
      <table className="w-full text-[10px] tabular-nums">
        <caption className="sr-only">Vibração RMS média e de pico por janela</caption>
        <thead className="sticky top-0 bg-mill-panel text-mill-muted">
          <tr>
            <th scope="col" className="px-2 py-1 text-left font-medium">
              Janela
            </th>
            <th scope="col" className="px-2 py-1 text-right font-medium">
              Média
            </th>
            <th scope="col" className="px-2 py-1 text-right font-medium">
              Pico
            </th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((bucket) => (
            <tr key={bucket.bucketStart} className="border-t border-mill-line/60">
              <td className="px-2 py-1">{formato.format(new Date(bucket.bucketStart))}</td>
              <td className="px-2 py-1 text-right">{bucket.rmsAvgMmS.toFixed(2)}</td>
              <td className="px-2 py-1 text-right">{bucket.rmsMaxMmS.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] text-mill-muted">{label}</dt>
      <dd className="font-mono text-xs">{value}</dd>
    </div>
  );
}
