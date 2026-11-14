import { useCallback, useState } from 'react';
import { assetByTag, MP1, type MaintenanceNote, type Round, type RoundPoint } from '@mp1/shared';

import type { DataGateway } from '../api/gateway';
import { fraction } from '../ui/chart/scale';
import { hhmm, num } from '../ui/format';
import { Panel } from '../ui/Panel';
import { ResourceState } from '../ui/ResourceState';
import { areaOfAsset, PROCESS_AREAS } from '../ui/sections';
import { useResource } from '../ui/useResource';
import { bearingShort } from './turno/Support';
import {
  deltaOf,
  divergent,
  EXPECTED_OFFSET_C,
  findings,
  noteOf,
  stateOfPoint,
  TEMP_TOLERANCE_C,
} from './rondas/derive';

/**
 * Rondas — o roteiro de inspeção, ponto a ponto.
 *
 * Em cima, o roteiro da ronda escolhida com o estado de cada ponto; embaixo, um
 * cartão por ponto com campo × online na mesma escala. À direita, o ponto
 * escolhido em detalhe e as rondas do turno. Tudo vem da API: a ronda é uma
 * lista de pontos já registrados, então não há ponto "pendente" a mostrar —
 * a API não manda o roteiro inteiro, só o que foi feito.
 */

export interface RondasScreenProps {
  readonly gateway: DataGateway;
  /** Abre o mancal na tela de Mancais. */
  readonly onOpenBearing: (assetTag: string) => void;
  readonly onOpenTrend?: (tag: string) => void;
  readonly onOpenNote?: (number: string) => void;
}

/** A escala das barras de temperatura de todos os cartões: a mesma, para comparar. */
const SCALE: readonly [number, number] = [30, 100];

export function RondasScreen({
  gateway,
  onOpenBearing,
  onOpenTrend,
  onOpenNote,
}: RondasScreenProps) {
  const data = useResource(
    useCallback(
      async (signal: AbortSignal) => {
        const [rounds, notes, shifts] = await Promise.all([
          gateway.rounds({ limit: 30 }, signal),
          gateway.notes({ limit: 100 }, signal),
          gateway.shifts({ limit: 1 }, signal),
        ]);
        return { rounds: rounds.rounds, notes: notes.notes, shift: shifts.shifts[0] ?? null };
      },
      [gateway],
    ),
    { isEmpty: (result) => result.rounds.length === 0 },
  );

  return (
    <ResourceState
      resource={data}
      label="as rondas"
      emptyMessage="Nenhuma ronda registrada. A primeira sai no meio do turno."
    >
      {({ rounds, notes, shift }) => (
        <RoundsView
          rounds={rounds}
          notes={notes}
          shiftId={shift?.id ?? null}
          shiftLetter={shift?.letter ?? null}
          onOpenBearing={onOpenBearing}
          onOpenTrend={onOpenTrend}
          onOpenNote={onOpenNote}
        />
      )}
    </ResourceState>
  );
}

function RoundsView({
  rounds,
  notes,
  shiftId,
  shiftLetter,
  onOpenBearing,
  onOpenTrend,
  onOpenNote,
}: {
  readonly rounds: readonly Round[];
  readonly notes: readonly MaintenanceNote[];
  readonly shiftId: string | null;
  readonly shiftLetter: string | null;
  readonly onOpenBearing: (assetTag: string) => void;
  readonly onOpenTrend: ((tag: string) => void) | undefined;
  readonly onOpenNote: ((number: string) => void) | undefined;
}) {
  const sorted = [...rounds].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  const ofShift = sorted.filter((round) => round.shiftId === shiftId);
  const list = ofShift.length > 0 ? ofShift : sorted.slice(0, 3);
  const [roundId, setRoundId] = useState(list[0]?.id ?? '');
  const round = list.find((item) => item.id === roundId) ?? list[0];
  const firstFinding = round?.points.findIndex((p) => stateOfPoint(p) === 'achado') ?? -1;
  const [pointIndex, setPointIndex] = useState(Math.max(0, firstFinding));
  if (!round) return null;
  const point = round.points[pointIndex] ?? round.points[0];
  const flagged = round.points.filter((p) => stateOfPoint(p) === 'achado').length;
  const number = [...list].reverse().indexOf(round) + 1;

  return (
    <div className="grid h-[calc(100vh-152px)] min-h-[760px] grid-cols-[minmax(0,1180fr)_minmax(0,636fr)] gap-4">
      <Panel
        title={
          <span className="text-[16px]">
            Ronda {number} · {hhmm(round.startedAt)}
          </span>
        }
        label="Roteiro da ronda"
        context={
          <span>
            {round.inspector} ·{' '}
            {round.finishedAt ? `concluída ${hhmm(round.finishedAt)}` : 'em andamento'} ·{' '}
            <span className="font-mono text-fg">{round.points.length}</span> pontos ·{' '}
            <span className={`font-mono ${flagged > 0 ? 'text-spec-out' : 'text-fg'}`}>
              {flagged}
            </span>{' '}
            com achado
          </span>
        }
        aside={
          <span className="flex items-center gap-3 text-fg-2">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-fg-3" />
              feito
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-spec-out" />
              com achado
            </span>
          </span>
        }
        bodyClassName="flex min-h-0 flex-col"
      >
        <ol aria-label="Pontos da ronda" className="relative mb-4 flex items-start justify-between">
          <span
            aria-hidden="true"
            className="absolute top-3.5 right-4 left-4 h-px bg-line-strong"
          />
          {round.points.map((p, index) => {
            const achado = stateOfPoint(p) === 'achado';
            const active = index === pointIndex;
            return (
              <li key={p.assetTag} className="relative flex flex-col items-center gap-1">
                <button
                  type="button"
                  aria-label={`Ponto ${String(index + 1)}: ${bearingShort(p.assetTag)}${achado ? ' (achado)' : ''}`}
                  aria-pressed={active}
                  onClick={() => {
                    setPointIndex(index);
                  }}
                  className={`flex size-7 items-center justify-center rounded-full font-mono text-[11px] font-semibold ${
                    achado ? 'bg-spec-out text-[#1a0a14]' : 'bg-band text-fg'
                  } ${active ? 'outline-2 outline-offset-2 outline-action' : ''}`}
                >
                  {String(index + 1).padStart(2, '0')}
                </button>
                <span className="text-[10px] text-fg-3">{areaShort(p.assetTag)}</span>
              </li>
            );
          })}
        </ol>
        <ul className="grid min-h-0 flex-1 auto-rows-min grid-cols-4 gap-3 overflow-y-auto">
          {round.points.map((p, index) => (
            <li key={p.assetTag}>
              <PointCard
                point={p}
                index={index}
                active={index === pointIndex}
                onClick={() => {
                  setPointIndex(index);
                }}
              />
            </li>
          ))}
        </ul>
      </Panel>

      <div className="flex min-h-0 flex-col gap-4">
        {point ? (
          <PointDetail
            round={round}
            point={point}
            index={pointIndex}
            note={noteOf(round, point, notes)}
            onOpenBearing={onOpenBearing}
            onOpenTrend={onOpenTrend}
            onOpenNote={onOpenNote}
          />
        ) : null}
        <Panel
          title={
            shiftLetter && ofShift.length > 0 ? `Rondas do turno ${shiftLetter}` : 'Rondas recentes'
          }
          className="shrink-0"
        >
          <ul>
            {list.map((item, i) => {
              const marks = item.points.map(stateOfPoint);
              const count = marks.filter((m) => m === 'achado').length;
              const withNote = item.points.filter(
                (p) => stateOfPoint(p) === 'achado' && noteOf(item, p, notes),
              ).length;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    aria-pressed={item.id === round.id}
                    onClick={() => {
                      setRoundId(item.id);
                      setPointIndex(0);
                    }}
                    className={`grid w-full grid-cols-[110px_minmax(0,1fr)_130px] items-center gap-4 border-t border-line px-1 py-3 text-left ${
                      item.id === round.id ? 'bg-hover' : 'hover:bg-hover'
                    }`}
                  >
                    <span>
                      <span className="block text-[13px]">Ronda {list.length - i}</span>
                      <span className="font-mono text-[10px] text-fg-3">
                        {hhmm(item.startedAt)}–{item.finishedAt ? hhmm(item.finishedAt) : 'agora'}
                      </span>
                    </span>
                    <span className="flex gap-1">
                      {marks.map((m, k) => (
                        <span
                          key={k}
                          className={`h-3 w-4 ${m === 'achado' ? 'bg-spec-out' : 'bg-band'}`}
                        />
                      ))}
                    </span>
                    <span className="text-right text-[11px] text-fg-2">
                      <span className="block text-[12px] text-fg">
                        {item.finishedAt ? 'concluída' : 'em andamento'}
                      </span>
                      {count === 0
                        ? 'sem achados'
                        : `${String(count)} achado${count > 1 ? 's' : ''} · ${count - withNote > 0 ? `${String(count - withNote)} sem nota` : 'com nota'}`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

function areaShort(assetTag: string): string {
  const area = areaOfAsset(assetTag);
  const label = PROCESS_AREAS.find((a) => a.id === area)?.label ?? '—';
  return label.length > 6 ? `${label.slice(0, 4)}.` : label;
}

function PointCard({
  point,
  index,
  active,
  onClick,
}: {
  readonly point: RoundPoint;
  readonly index: number;
  readonly active: boolean;
  readonly onClick: () => void;
}) {
  const achado = stateOfPoint(point) === 'achado';
  const delta = deltaOf(point);
  const area = PROCESS_AREAS.find((a) => a.id === areaOfAsset(point.assetTag))?.label ?? '—';
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex w-full flex-col gap-2 border px-3.5 py-3 text-left ${
        active
          ? 'border-action bg-hover'
          : achado
            ? 'border-spec-out'
            : 'border-line hover:bg-hover'
      }`}
    >
      <span className="flex items-center gap-2">
        <span className="font-mono text-[12px] text-fg-2">
          {String(index + 1).padStart(2, '0')}
        </span>
        <span className="text-[11px] text-fg-3">{area}</span>
        <span
          className={`ml-auto px-1.5 text-[10px] ${achado ? 'bg-spec-out text-[#1a0a14]' : 'border border-line-strong text-fg-2'}`}
        >
          {achado ? 'achado' : 'feito'}
        </span>
      </span>
      <span>
        <span className="block text-[13px]">
          {assetByTag(MP1, point.assetTag)?.label ?? point.assetTag}
        </span>
        <span className="font-mono text-[10px] text-fg-3">{point.onlineTag ?? point.assetTag}</span>
      </span>
      <Bar label="campo" value={point.fieldTempC} out={divergent(delta)} />
      <Bar label="online" value={point.onlineValue} out={false} />
      <span className="text-[11px] text-fg-3">
        Δ{' '}
        <span className={`font-mono ${divergent(delta) ? 'text-spec-out' : 'text-fg'}`}>
          {delta === null ? '—' : `${delta >= 0 ? '+' : '−'}${num(Math.abs(delta), 1)}`}
        </span>{' '}
        °C · esperado {EXPECTED_OFFSET_C} ±{TEMP_TOLERANCE_C}
        {point.noise !== 'normal' ? ` · ruído ${point.noise}` : ''}
        {point.leak !== 'nenhum' ? ` · ${point.leak}` : ''}
      </span>
    </button>
  );
}

function Bar({
  label,
  value,
  out,
}: {
  readonly label: string;
  readonly value: number | null;
  readonly out: boolean;
}) {
  return (
    <span className="grid grid-cols-[44px_minmax(0,1fr)_40px] items-center gap-2 text-[11px] text-fg-3">
      {label}
      <span className="relative h-1.5 bg-line">
        {value !== null ? (
          <span
            className={`absolute inset-y-0 left-0 ${out ? 'bg-spec-out' : 'bg-fg-3'}`}
            style={{ width: `${(fraction(value, SCALE[0], SCALE[1]) * 100).toFixed(1)}%` }}
          />
        ) : null}
      </span>
      <span className={`text-right font-mono text-[12px] ${out ? 'text-spec-out' : 'text-fg'}`}>
        {value === null ? '—' : num(value, 1)}
      </span>
    </span>
  );
}

function PointDetail({
  round,
  point,
  index,
  note,
  onOpenBearing,
  onOpenTrend,
  onOpenNote,
}: {
  readonly round: Round;
  readonly point: RoundPoint;
  readonly index: number;
  readonly note: MaintenanceNote | null;
  readonly onOpenBearing: (assetTag: string) => void;
  readonly onOpenTrend: ((tag: string) => void) | undefined;
  readonly onOpenNote: ((number: string) => void) | undefined;
}) {
  const achado = stateOfPoint(point) === 'achado';
  const delta = deltaOf(point);
  const label = assetByTag(MP1, point.assetTag)?.label ?? point.assetTag;
  const values = [point.fieldTempC, point.onlineValue].filter((v): v is number => v !== null);
  const lo = Math.min(...values, 40) - 5;
  const hi = Math.max(...values, 60) + 5;
  const H = 200;
  const y = (v: number) => H - fraction(v, lo, hi) * H;
  const list = findings(point);

  return (
    <Panel
      title={
        <span>
          <span className="mr-2 font-mono text-fg-2">{String(index + 1).padStart(2, '0')}</span>
          {label}
        </span>
      }
      label="Ponto da ronda"
      aside={
        <span
          className={`px-1.5 text-[11px] ${achado ? 'bg-spec-out text-[#1a0a14]' : 'border border-line-strong text-fg-2'}`}
        >
          {achado ? 'achado' : 'feito'}
        </span>
      }
      className="min-h-0 flex-1"
      bodyClassName="flex min-h-0 flex-col overflow-y-auto"
    >
      <p className="mb-3 font-mono text-[11px] text-fg-3">
        {point.onlineTag ?? '—'} · ronda de {hhmm(round.startedAt)} · {round.inspector}
      </p>
      <div className="flex items-end gap-8 border-b border-line pb-4">
        <svg role="img" aria-label="Campo × online" width={260} height={H + 20}>
          <rect
            x={0}
            width={260}
            y={y(
              point.onlineValue !== null
                ? point.onlineValue + EXPECTED_OFFSET_C + TEMP_TOLERANCE_C
                : 0,
            )}
            height={(TEMP_TOLERANCE_C * 2 * H) / (hi - lo)}
            fill="none"
            stroke="var(--color-action)"
            strokeDasharray="3 3"
            opacity={point.onlineValue !== null ? 1 : 0}
          />
          {[
            {
              v: point.fieldTempC,
              x: 30,
              label: 'campo',
              fill: divergent(delta) ? 'var(--color-spec-out)' : 'var(--color-fg-3)',
            },
            { v: point.onlineValue, x: 150, label: 'online', fill: '#8b94a3' },
          ].map((bar) =>
            bar.v === null ? null : (
              <g key={bar.label}>
                <rect x={bar.x} width={70} y={y(bar.v)} height={H - y(bar.v)} fill={bar.fill} />
                <text
                  x={bar.x + 35}
                  y={y(bar.v) - 6}
                  textAnchor="middle"
                  fill="var(--color-fg)"
                  fontSize={16}
                  fontFamily="JetBrains Mono, monospace"
                >
                  {num(bar.v, 1)}
                </text>
                <text
                  x={bar.x + 35}
                  y={H + 16}
                  textAnchor="middle"
                  fill="var(--color-fg-2)"
                  fontSize={11}
                >
                  {bar.label}
                </text>
              </g>
            ),
          )}
        </svg>
        <div className="flex flex-col gap-1 pb-6 text-[11px] text-fg-3">
          divergência
          <span
            className={`font-mono text-[22px] ${divergent(delta) ? 'text-spec-out' : 'text-fg'}`}
          >
            {delta === null ? '—' : `${delta >= 0 ? '+' : '−'}${num(Math.abs(delta), 1)}`}
            <span className="ml-1 text-[11px] text-fg-2">°C</span>
          </span>
          <span>
            esperado {EXPECTED_OFFSET_C} ±{TEMP_TOLERANCE_C} °C: a carcaça é mais fria que o sensor
            (suposição)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-3.5 border border-dashed border-action" /> faixa aceita
          </span>
        </div>
      </div>
      <h3 className="mt-3 text-[11px] text-fg-3">Observação de campo</h3>
      <p className="mt-1 text-[13px]">{point.note ?? 'Sem observação escrita.'}</p>
      {list.length > 0 ? (
        <p className="mt-1 text-[12px] text-spec-out">{list.join(' · ')}</p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {note ? (
          <button
            type="button"
            onClick={() => onOpenNote?.(note.number)}
            className="h-8 border border-action px-3 text-[13px] text-action-hover hover:text-fg"
          >
            Abrir nota {note.number}
          </button>
        ) : achado ? (
          <span className="flex h-8 items-center border border-dashed border-line-strong px-3 text-[12px] text-fg-3">
            achado sem nota registrada
          </span>
        ) : null}
        {point.onlineTag ? (
          <button
            type="button"
            onClick={() => {
              if (point.onlineTag) onOpenTrend?.(point.onlineTag);
            }}
            className="h-8 border border-line-strong px-3 text-[13px] text-fg-2 hover:text-fg"
          >
            Ver tendência da TAG
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => {
            onOpenBearing(point.assetTag);
          }}
          className="h-8 border border-line-strong px-3 text-[13px] text-fg-2 hover:text-fg"
        >
          Abrir em Mancais
        </button>
      </div>
    </Panel>
  );
}
