import { useCallback } from 'react';
import {
  assetByTag,
  bearingOfProcessTag,
  MP1,
  NOTE_PRIORITY_LABELS,
  NOTE_STATUSES,
  processVariable,
  type IsoLimits,
  type MaintenanceNote,
  type NotePriority,
  type NoteStatus,
} from '@mp1/shared';

import type { DataGateway } from '../api/gateway';
import { seriesOf, type Point } from '../ui/chart/series';
import { hhmm } from '../ui/format';
import { Panel } from '../ui/Panel';
import { ResourceState } from '../ui/ResourceState';
import { useResource } from '../ui/useResource';
import { SignalChart } from './notas/SignalChart';
import { bearingShort } from './turno/Support';

/**
 * Notas — o quadro da manutenção, por situação.
 *
 * Quatro colunas, as quatro situações que a API tem: aberta, programada
 * (`planejada` na API), em execução e encerrada. Cada cartão mostra a
 * prioridade pela cor da borda de cima, a origem e se exige parada. À direita,
 * a nota escolhida com o sinal que a fez nascer.
 *
 * ## A evidência é um link, não um anexo
 *
 * O gêmeo não guarda arquivo: cada evidência aponta para um registro que ele já
 * tem — a tendência, o alarme, a ronda. Clicar leva até ele.
 */

export interface NotasScreenProps {
  readonly gateway: DataGateway;
  readonly selected?: string | null;
  readonly onSelect?: (number: string | null) => void;
  /** Abre a tendência de uma TAG na tela de Processo. */
  readonly onOpenTrend: (tag: string) => void;
  /** Abre o mancal na tela de Mancais. */
  readonly onOpenBearing: (assetTag: string) => void;
}

const COLUMN_LABEL: Readonly<Record<NoteStatus, string>> = {
  aberta: 'Aberta',
  planejada: 'Programada',
  'em execução': 'Em execução',
  encerrada: 'Encerrada',
};

const PRIORITY_BAR: Readonly<Record<NotePriority, string>> = {
  1: 'var(--color-alarm-1)',
  2: 'var(--color-alarm-2)',
  3: 'var(--color-alarm-3)',
  4: 'var(--color-tick)',
};

export function NotasScreen({
  gateway,
  selected = null,
  onSelect,
  onOpenTrend,
  onOpenBearing,
}: NotasScreenProps) {
  const notes = useResource(
    useCallback(
      async (signal: AbortSignal) => {
        const [list, values] = await Promise.all([
          gateway.notes({ limit: 100 }, signal),
          gateway.processValues({}, signal),
        ]);
        return { notes: list.notes, now: Date.parse(values.ts) };
      },
      [gateway],
    ),
    { isEmpty: (data) => data.notes.length === 0 },
  );

  return (
    <ResourceState
      resource={notes}
      label="as notas"
      emptyMessage="Nenhuma nota aberta. As notas nascem de alarme de mancal de prioridade alta ou crítica."
    >
      {({ notes: list, now }) => {
        const pick =
          list.find((note) => note.number === selected) ??
          list.find((note) => note.status !== 'encerrada') ??
          list[0] ??
          null;
        const active = list.filter((note) => note.status !== 'encerrada');
        return (
          <div className="grid h-[calc(100vh-152px)] min-h-[720px] grid-cols-[minmax(0,1fr)_556px] gap-4">
            <Panel
              help="notas.quadro"
              title="Notas de manutenção · MP1"
              context={
                <span>
                  <span className="font-mono text-fg">{active.length}</span> ativas ·{' '}
                  <span className="font-mono text-fg">
                    {active.filter((note) => note.requiresShutdown).length}
                  </span>{' '}
                  exigem parada
                </span>
              }
              aside={
                <span className="flex items-center gap-2.5 text-fg-2">
                  prioridade
                  {([1, 2, 3, 4] as const).map((p) => (
                    <span
                      key={p}
                      className="flex items-center gap-1"
                      title={NOTE_PRIORITY_LABELS[p]}
                    >
                      <span className="h-0.5 w-3" style={{ background: PRIORITY_BAR[p] }} />
                      <span className="font-mono">{p}</span>
                    </span>
                  ))}
                </span>
              }
              bodyClassName="grid min-h-0 grid-cols-4 gap-2"
            >
              {NOTE_STATUSES.map((status) => {
                const cards = list.filter((note) => note.status === status);
                return (
                  <section
                    key={status}
                    aria-label={COLUMN_LABEL[status]}
                    className="flex min-h-0 flex-col bg-base/60"
                  >
                    <header className="flex h-9 items-center justify-between border-b border-line px-2.5 text-[12px] font-semibold tracking-[0.05em] text-fg-2 uppercase">
                      {COLUMN_LABEL[status]}
                      <span className="font-mono">{cards.length}</span>
                    </header>
                    <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
                      {cards.map((note) => (
                        <li key={note.number}>
                          <NoteCard
                            note={note}
                            now={now}
                            active={note.number === pick?.number}
                            onClick={() => onSelect?.(note.number)}
                          />
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </Panel>
            {pick ? (
              <NoteDetail
                key={pick.number}
                gateway={gateway}
                note={pick}
                onOpenTrend={onOpenTrend}
                onOpenBearing={onOpenBearing}
              />
            ) : null}
          </div>
        );
      }}
    </ResourceState>
  );
}

/** Onde a nota está: o mancal curto (`CS23 LC`) ou a TAG do ativo. */
function placeOf(note: MaintenanceNote): string {
  return bearingShort(note.assetTag);
}

/** Hora se for do dia da leitura, data se for de antes. */
function when(iso: string, now: number): string {
  const date = new Date(iso);
  const today = new Date(now);
  if (date.toDateString() === today.toDateString()) return hhmm(iso);
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function NoteCard({
  note,
  now,
  active,
  onClick,
}: {
  readonly note: MaintenanceNote;
  readonly now: number;
  readonly active: boolean;
  readonly onClick: () => void;
}) {
  const closed = note.status === 'encerrada';
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex w-full flex-col gap-2 border border-t-[3px] bg-cell px-3 pt-2 pb-2.5 text-left hover:border-x-action hover:border-b-action ${
        active ? 'border-x-action border-b-action' : 'border-x-edge border-b-edge'
      }`}
      style={{ borderTopColor: PRIORITY_BAR[note.priority] }}
    >
      <span className="flex items-center gap-2">
        <span className="font-mono text-[12px] font-semibold">{note.number}</span>
        <span className="font-mono text-[11px] text-fg-3">P{note.priority}</span>
        <span className="ml-auto border border-line-strong px-1.5 text-[10px] text-fg-2">
          {note.origin}
        </span>
      </span>
      <span className={`text-[13px] leading-snug ${closed ? 'text-fg-2' : ''}`}>
        {note.symptom}
      </span>
      <span className="flex items-center gap-2 font-mono text-[10px] text-fg-3">
        {placeOf(note)}
        <span className="flex-1" />
        {note.requiresShutdown ? (
          <span className="border border-fg-2 px-1.5 font-semibold tracking-[0.04em] text-fg">
            PARADA
          </span>
        ) : null}
        <span>{when(closed && note.closedAt ? note.closedAt : note.createdAt, now)}</span>
      </span>
    </button>
  );
}

/* --------------------------------------------------------------- detalhe */

interface Signal {
  readonly points: Point[];
  readonly unit: string;
  readonly iso: IsoLimits | null;
  readonly band: { lo: number | null; hi: number | null } | null;
  readonly tag: string;
  readonly windowLabel: string;
  readonly daysToZoneD: number | null;
}

function NoteDetail({
  gateway,
  note,
  onOpenTrend,
  onOpenBearing,
}: {
  readonly gateway: DataGateway;
  readonly note: MaintenanceNote;
  readonly onOpenTrend: (tag: string) => void;
  readonly onOpenBearing: (assetTag: string) => void;
}) {
  const asset = assetByTag(MP1, note.assetTag);
  const trendTag = note.evidence.find((item) => item.kind === 'tendência')?.ref ?? null;
  const isBearing =
    asset?.kind === 'bearing' || (trendTag !== null && bearingOfProcessTag(trendTag) !== null);

  const signal = useResource(
    useCallback(
      async (abort: AbortSignal): Promise<Signal | null> => {
        if (isBearing) {
          const series = await gateway.vibration(note.assetTag, {}, abort);
          const hours = Math.round((Date.parse(series.to) - Date.parse(series.from)) / 3_600_000);
          return {
            points: series.buckets.map((b) => ({ t: Date.parse(b.bucketStart), v: b.rmsAvgMmS })),
            unit: 'mm/s',
            iso: series.limits,
            band: null,
            tag: trendTag ?? note.assetTag,
            windowLabel:
              hours >= 48
                ? `últimos ${String(Math.round(hours / 24))} dias`
                : `últimas ${String(hours)} h`,
            daysToZoneD: series.remainingLife?.daysToZoneD ?? null,
          };
        }
        if (!trendTag) return null;
        const trend = await gateway.tagTrend(trendTag, {}, abort);
        const variable = processVariable(trendTag);
        const hours = Math.round((Date.parse(trend.to) - Date.parse(trend.from)) / 3_600_000);
        return {
          points: seriesOf(trend, Date.parse(trend.to)),
          unit: trend.unit,
          iso: null,
          band: variable
            ? {
                lo: variable.limits.l ?? variable.limits.ll,
                hi: variable.limits.h ?? variable.limits.hh,
              }
            : null,
          tag: trendTag,
          windowLabel: `últimas ${String(hours)} h`,
          daysToZoneD: null,
        };
      },
      [gateway, isBearing, note.assetTag, trendTag],
    ),
  );

  return (
    <Panel
      help="notas.detalhe"
      heading={1}
      label={`Nota ${note.number}`}
      title={<span className="font-mono text-[16px]">{note.number}</span>}
      context={
        <span className="border border-line-strong px-1.5 text-[11px] text-fg-2">
          {COLUMN_LABEL[note.status].toLowerCase()}
        </span>
      }
      className="overflow-y-auto border-t-[3px]"
      bodyClassName="flex min-h-0 flex-col"
      style={{ borderTopColor: PRIORITY_BAR[note.priority] }}
    >
      <h2 className="text-[18px] font-semibold">{note.symptom}</h2>

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2.5 border-b border-line pb-4 text-[13px]">
        <Fact label="Equipamento">{asset ? `${asset.label}` : note.assetTag}</Fact>
        <Fact label="Prioridade">
          <span className="flex items-center gap-2">
            <span className="h-0.5 w-3.5" style={{ background: PRIORITY_BAR[note.priority] }} />
            <span className="font-mono">{note.priority}</span> ·{' '}
            {NOTE_PRIORITY_LABELS[note.priority].toLowerCase()}
          </span>
        </Fact>
        <Fact label="Origem">
          {note.origin}
          {note.originRef ? (
            <span className="ml-1.5 font-mono text-[11px] text-fg-3">{note.originRef}</span>
          ) : null}
        </Fact>
        <Fact label="Exige parada">{note.requiresShutdown ? 'Sim' : 'Não'}</Fact>
        <Fact label="Aberta em">
          <span className="font-mono">{stamp(note.createdAt)}</span>
        </Fact>
        <Fact label="Encerrada em">
          <span className="font-mono">{note.closedAt ? stamp(note.closedAt) : '—'}</span>
        </Fact>
      </dl>

      <div className="mt-4 flex items-baseline justify-between">
        <h3 className="text-[13px] font-semibold">Sinal de origem</h3>
        {signal.data ? (
          <span className="font-mono text-[11px] text-fg-3">
            {signal.data.tag} · {signal.data.windowLabel}
          </span>
        ) : null}
      </div>
      <div className="mt-2">
        <ResourceState resource={signal} label="o sinal de origem">
          {(data) =>
            data ? (
              <SignalChart
                points={data.points}
                unit={data.unit}
                iso={data.iso}
                band={data.band}
                marker={Date.parse(note.createdAt)}
                windowLabel={data.windowLabel}
              />
            ) : (
              <p className="text-[12px] text-fg-3">A nota não aponta para nenhuma tendência.</p>
            )
          }
        </ResourceState>
      </div>

      <h3 className="mt-5 text-[13px] font-semibold">Histórico e evidências</h3>
      <ol className="mt-2 flex flex-col gap-2.5 text-[13px]">
        <Entry stamp={stamp(note.createdAt)} tone="open">
          Nota aberta por {note.origin}.
        </Entry>
        {note.evidence.map((item) => (
          <Entry key={`${item.kind}-${item.ref}`} stamp={item.kind}>
            {item.label}{' '}
            {item.kind === 'tendência' ? (
              <button
                type="button"
                onClick={() => {
                  onOpenTrend(item.ref);
                }}
                className="font-mono text-[12px] text-action hover:text-action-hover"
              >
                {item.ref}
              </button>
            ) : (
              <span className="font-mono text-[11px] text-fg-3">{item.ref}</span>
            )}
          </Entry>
        ))}
        {signal.data?.daysToZoneD != null ? (
          <Entry stamp="projeção" tone="action">
            {signal.data.daysToZoneD < 0.5
              ? 'Já em zona D.'
              : `Zona D em ~${String(Math.round(signal.data.daysToZoneD))} dias na tendência atual.`}
          </Entry>
        ) : null}
        {note.closedAt ? <Entry stamp={stamp(note.closedAt)}>Nota encerrada.</Entry> : null}
      </ol>

      <div className="mt-auto flex items-center justify-between gap-3 pt-5">
        <p className="text-[11px] text-fg-3">
          O gêmeo não guarda anexo. Cada evidência aponta para um registro que ele tem.
        </p>
        {asset?.kind === 'bearing' ? (
          <button
            type="button"
            onClick={() => {
              onOpenBearing(note.assetTag);
            }}
            className="h-7.5 shrink-0 border border-action px-2.5 text-[12px] text-action-hover hover:text-fg"
          >
            Abrir em Mancais
          </button>
        ) : null}
      </div>
    </Panel>
  );
}

function stamp(iso: string): string {
  const date = new Date(iso);
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')} ${hhmm(iso)}`;
}

function Fact({ label, children }: { readonly label: string; readonly children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] text-fg-3">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Entry({
  stamp: at,
  tone = 'neutral',
  children,
}: {
  readonly stamp: string;
  readonly tone?: 'neutral' | 'open' | 'action';
  readonly children: React.ReactNode;
}) {
  const ring =
    tone === 'open' ? 'border-spec-out' : tone === 'action' ? 'border-action' : 'border-fg-3';
  return (
    <li className="grid grid-cols-[14px_96px_minmax(0,1fr)] items-start gap-2.5">
      <span className={`mt-1 size-2.5 rounded-full border-2 ${ring}`} />
      <span className="font-mono text-[11px] leading-5 text-fg-2">{at}</span>
      <span className="leading-5">{children}</span>
    </li>
  );
}
