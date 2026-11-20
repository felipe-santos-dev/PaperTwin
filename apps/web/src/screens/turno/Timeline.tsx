import { useState } from 'react';

import type { ReelHold } from '../../api/fixtures';
import type { ReelView } from '../../api/process';
import { linear } from '../../ui/chart/scale';
import { EVENT_LABEL, EventGlyph, type EventKind } from '../../ui/EventMarker';
import { hhmm, int, num, tagValue } from '../../ui/format';
import { Illustrative, Panel } from '../../ui/Panel';
import { RangeBar } from '../../ui/RangeBar';
import { isOut, tagScale } from '../../ui/tagScale';
import { useWidth } from '../../ui/useWidth';
import {
  eventCounts,
  lanes,
  type Point,
  type Production,
  type TimelineEvent,
  type Window,
} from './derive';

/**
 * A linha do tempo do turno: eventos, velocidade, produção acumulada e bobinas,
 * no mesmo eixo de horas.
 *
 * Medidas do desenho a 1920 px: 84 px de eventos, 160 de velocidade, 160 de
 * produção, a faixa de bobinas e o eixo. A largura acompanha o painel — o
 * gráfico é desenhado em pixels reais, não esticado.
 */

export type TimelineWindow = 'turno' | '24h' | '3turnos';

const WINDOW_LABEL: Readonly<Record<TimelineWindow, string>> = {
  turno: 'Turno',
  '24h': '24 h',
  '3turnos': '3 turnos',
};

const SPEED_TOP = 84;
const SPEED_H = 160;
const PROD_TOP = 260;
const PROD_H = 160;
const REELS_TOP = 436;
const REELS_H = 28;
const AXIS_TOP = 470;
const PLOT_H = 464;

export interface TimelineProps {
  readonly window: Window;
  readonly now: number;
  readonly mode: TimelineWindow;
  readonly onMode: (mode: TimelineWindow) => void;
  /** Janelas que a fonte não cobre (o instantâneo tem só o turno em curso). */
  readonly unavailable: readonly TimelineWindow[];
  readonly speed: readonly Point[];
  readonly speedScale: {
    readonly min: number;
    readonly max: number;
    readonly target: number | null;
  };
  readonly prod: Production;
  readonly reels: readonly ReelView[];
  readonly holds: readonly ReelHold[];
  readonly events: readonly TimelineEvent[];
  readonly onOpenReel: (number: number) => void;
  readonly onOpenTag: (tag: string) => void;
  /** Abre o replay de uma quebra; o id vem do evento da linha do tempo. */
  readonly onOpenBreak: (id: string) => void;
}

export function Timeline(props: TimelineProps) {
  const { window, now, events } = props;
  const [ref, width] = useWidth<HTMLDivElement>(1660);
  const [selected, setSelected] = useState<string | null>(null);

  const x = linear([window.from, window.to], [0, width]);
  const nowX = Math.min(width, x(now));
  const counts = eventCounts(events);
  const remaining = Math.max(0, window.to - now);
  const pick = events.find((event) => event.id === selected) ?? null;

  return (
    <Panel
      help="turno.linha-do-tempo"
      heading={1}
      title="Linha do tempo do turno"
      label="Linha do tempo do turno"
      context={
        <ul
          className="flex items-center gap-3.5 text-[12px] text-fg-2"
          aria-label="Eventos na janela"
        >
          {(Object.keys(counts) as EventKind[]).map((kind) => (
            <li key={kind} className="flex items-center gap-1.5">
              <EventGlyph kind={kind} />
              {EVENT_LABEL[kind]} <span className="font-mono text-fg">{counts[kind]}</span>
            </li>
          ))}
        </ul>
      }
      aside={
        <>
          {props.mode === 'turno' ? (
            <span className="text-[12px] text-fg-3">
              restam <span className="font-mono text-fg">{remainingText(remaining)}</span>
            </span>
          ) : null}
          <div
            role="group"
            aria-label="Janela"
            className="flex overflow-hidden border border-line-strong"
          >
            {(Object.keys(WINDOW_LABEL) as TimelineWindow[]).map((mode, index) => {
              const off = props.unavailable.includes(mode);
              const active = props.mode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={active}
                  disabled={off}
                  title={off ? 'O instantâneo de demonstração tem só o turno em curso.' : undefined}
                  onClick={() => {
                    props.onMode(mode);
                  }}
                  className={`h-7 px-3 text-[12px] ${index > 0 ? 'border-l border-line-strong' : ''} ${
                    active
                      ? 'bg-[#1b2a44] text-[#cfe0ff]'
                      : off
                        ? 'cursor-not-allowed text-fg-3/60'
                        : 'text-fg-2 hover:bg-hover hover:text-fg'
                  }`}
                >
                  {WINDOW_LABEL[mode]}
                </button>
              );
            })}
          </div>
        </>
      }
    >
      <div className="flex min-w-0 pb-5">
        <Labels speed={props.speedScale} prod={props.prod} />

        <div ref={ref} className="relative min-w-0 flex-1" style={{ height: AXIS_TOP + 22 }}>
          <SpeedPlot width={width} x={x} series={props.speed} scale={props.speedScale} />
          <ProductionPlot width={width} x={x} window={window} now={now} prod={props.prod} />

          {/* quebras: faixa vertical do início ao fim */}
          {events
            .filter((event) => event.kind === 'quebra')
            .map((event) => (
              <div
                key={`band-${event.id}`}
                aria-hidden="true"
                className="absolute top-0 border-x border-alarm-1/50 bg-alarm-1/10"
                style={{
                  left: x(event.t),
                  width: Math.max(2, x(event.end ?? event.t) - x(event.t)),
                  height: PLOT_H,
                }}
              />
            ))}

          {/* o que ainda não aconteceu */}
          {nowX < width ? (
            <div
              aria-hidden="true"
              className="absolute bg-white/[0.018]"
              style={{
                left: nowX,
                width: width - nowX,
                top: SPEED_TOP,
                height: PLOT_H - SPEED_TOP,
              }}
            />
          ) : null}

          <Reels
            x={x}
            now={now}
            window={window}
            reels={props.reels}
            holds={props.holds}
            onOpen={props.onOpenReel}
          />

          <Axis x={x} window={window} width={width} />

          {/* agora */}
          <div
            aria-hidden="true"
            className="absolute top-0 w-px bg-fg"
            style={{ left: nowX, height: PLOT_H }}
          />
          <div
            className="absolute h-5 w-12 rounded-[2px] bg-fg text-center font-mono text-[11px] leading-5 font-semibold text-base"
            style={{ left: Math.min(width - 48, Math.max(0, nowX - 24)), top: AXIS_TOP - 4 }}
          >
            {hhmm(new Date(now).toISOString())}
          </div>

          <Markers
            x={x}
            events={events}
            selected={selected}
            onSelect={(id) => {
              setSelected((current) => (current === id ? null : id));
            }}
          />

          {pick ? (
            <EventCard
              event={pick}
              left={Math.min(width - 360, Math.max(0, x(pick.t) - 340))}
              onClose={() => {
                setSelected(null);
              }}
              onOpenReel={props.onOpenReel}
              onOpenTag={props.onOpenTag}
              onOpenBreak={props.onOpenBreak}
            />
          ) : null}
        </div>
      </div>
    </Panel>
  );
}

function remainingText(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  const h = Math.floor(minutes / 60);
  return h > 0 ? `${String(h)} h ${String(minutes % 60)} min` : `${String(minutes)} min`;
}

/* --------------------------------------------------------------- rótulos */

function Labels({
  speed,
  prod,
}: {
  readonly speed: TimelineProps['speedScale'];
  readonly prod: Production;
}) {
  const sy = speedY(speed);
  const top = prodTop(prod);
  const py = linear([0, top], [PROD_TOP + PROD_H, PROD_TOP]);
  const speedTicks = [speed.max, speed.target, speed.min].filter(
    (value): value is number => value !== null,
  );
  const prodTicks = [0, top / 3, (2 * top) / 3, top];

  return (
    <div className="relative w-35 shrink-0" style={{ height: AXIS_TOP + 22 }}>
      <div className="absolute top-1 text-[12px] text-fg-2">Eventos</div>
      <div className="absolute text-[12px] text-fg-2" style={{ top: SPEED_TOP }}>
        Velocidade
      </div>
      <div className="absolute text-[11px] text-fg-3" style={{ top: SPEED_TOP + 16 }}>
        m/min
      </div>
      {speedTicks.map((value) => (
        <Tick key={`s${String(value)}`} y={sy(value)} strong={value === speed.target}>
          {int(value)}
        </Tick>
      ))}
      <Tick y={SPEED_TOP + SPEED_H}>≤{int(sy.domain[0])}</Tick>

      <div className="absolute text-[12px] text-fg-2" style={{ top: PROD_TOP }}>
        Produção
      </div>
      <div className="absolute text-[11px] text-fg-3" style={{ top: PROD_TOP + 16 }}>
        t acumuladas
      </div>
      {prodTicks.map((value) => (
        <Tick key={`p${String(value)}`} y={py(value)}>
          {int(value)}
        </Tick>
      ))}

      <div className="absolute text-[12px] text-fg-2" style={{ top: REELS_TOP + 6 }}>
        Bobinas
      </div>
    </div>
  );
}

function Tick({
  y,
  strong = false,
  children,
}: {
  y: number;
  strong?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`absolute right-2.5 -translate-y-1/2 font-mono text-[11px] ${strong ? 'text-fg-2' : 'text-fg-3'}`}
      style={{ top: y }}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------ velocidade */

/**
 * A escala da velocidade: de `max` a três faixas de catálogo abaixo de `min`.
 *
 * A faixa normal (1.200–1.300) ocupa o terço de cima, e o resto do espaço é
 * para a queda numa quebra ser vista inteira até o piso; abaixo dele a linha
 * encosta no fundo, e o rótulo diz "≤".
 */
function speedY(scale: TimelineProps['speedScale']) {
  const span = scale.max - scale.min;
  return linear([scale.min - 2 * span, scale.max], [SPEED_TOP + SPEED_H, SPEED_TOP]);
}

function SpeedPlot({
  width,
  x,
  series,
  scale,
}: {
  readonly width: number;
  readonly x: (t: number) => number;
  readonly series: readonly Point[];
  readonly scale: TimelineProps['speedScale'];
}) {
  const y = speedY(scale);
  const floor = y.domain[0];
  const clampY = (v: number) => y(Math.max(floor, Math.min(scale.max, v)));
  const path = series
    .map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)} ${clampY(p.v).toFixed(1)}`)
    .join(' ');
  const last = series.at(-1);
  const lows = lowRuns(series, floor, x);

  return (
    <>
      <svg
        aria-hidden="true"
        width={width}
        height={PLOT_H}
        className="absolute top-0 left-0 overflow-visible"
      >
        <line x1={0} x2={width} y1={y(scale.max)} y2={y(scale.max)} stroke="var(--color-line)" />
        {scale.target !== null ? (
          <line
            x1={0}
            x2={width}
            y1={y(scale.target)}
            y2={y(scale.target)}
            stroke="var(--color-band)"
            strokeDasharray="2 3"
          />
        ) : null}
        <line x1={0} x2={width} y1={y(scale.min)} y2={y(scale.min)} stroke="var(--color-line)" />
        <line
          x1={0}
          x2={width}
          y1={SPEED_TOP + SPEED_H}
          y2={SPEED_TOP + SPEED_H}
          stroke="var(--color-line-strong)"
        />
        <path d={path} fill="none" stroke="#c9ced6" strokeWidth={1.5} strokeLinejoin="round" />
        {last ? <circle cx={x(last.t)} cy={clampY(last.v)} r={3.5} fill="var(--color-fg)" /> : null}
      </svg>
      {last ? (
        <div
          className="absolute flex items-baseline gap-1"
          style={{ left: Math.min(width - 90, x(last.t) + 9), top: clampY(last.v) - 22 }}
        >
          <span className="font-mono text-[13px] font-medium">{tagValue(last.v, 'm/min')}</span>
          <span className="text-[11px] text-fg-2">m/min</span>
        </div>
      ) : null}
      {lows.map((run) => (
        <div
          key={run}
          className="absolute text-[11px] whitespace-nowrap text-alarm-1"
          style={{ left: run + 4, top: SPEED_TOP + SPEED_H - 18 }}
        >
          {`≤${int(floor)} m/min`}
        </div>
      ))}
    </>
  );
}

/** Onde a velocidade começa a ficar abaixo do piso da escala. */
function lowRuns(series: readonly Point[], floor: number, x: (t: number) => number): number[] {
  const out: number[] = [];
  let low = false;
  for (const p of series) {
    if (p.v < floor && !low) out.push(x(p.t));
    low = p.v < floor;
  }
  return out;
}

/* -------------------------------------------------------------- produção */

/** O topo da escala: a meta, ou o que passar dela. */
function prodTop(prod: Production): number {
  const top = Math.max(prod.goalT, prod.projectedT, prod.nowT);
  const step = top > 300 ? 60 : top > 90 ? 30 : 6;
  return Math.ceil(top / step) * step;
}

function ProductionPlot({
  width,
  x,
  window,
  now,
  prod,
}: {
  readonly width: number;
  readonly x: (t: number) => number;
  readonly window: Window;
  readonly now: number;
  readonly prod: Production;
}) {
  const top = prodTop(prod);
  const y = linear([0, top], [PROD_TOP + PROD_H, PROD_TOP]);
  const pts = prod.accumulated;
  const line = pts
    .map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`)
    .join(' ');
  const last = pts.at(-1);
  const area = last
    ? `${line} L${x(last.t).toFixed(1)} ${y(0)} L${x(pts[0]?.t ?? 0).toFixed(1)} ${y(0)} Z`
    : '';
  const nowX = Math.min(width, x(now));
  const future = now < window.to;

  return (
    <>
      <svg
        aria-hidden="true"
        width={width}
        height={PLOT_H}
        className="absolute top-0 left-0 overflow-visible"
      >
        {[top, (2 * top) / 3, top / 3].map((v) => (
          <line key={v} x1={0} x2={width} y1={y(v)} y2={y(v)} stroke="var(--color-line)" />
        ))}
        <line x1={0} x2={width} y1={y(0)} y2={y(0)} stroke="var(--color-line-strong)" />
        {area ? <path d={area} fill="#1f262f" /> : null}
        {/* o ritmo da meta: de zero no início à meta no fim */}
        <line
          x1={0}
          y1={y(0)}
          x2={width}
          y2={y(prod.goalT)}
          stroke="var(--color-fg-3)"
          strokeDasharray="5 4"
        />
        {future && last ? (
          <line
            x1={nowX}
            y1={y(prod.nowT)}
            x2={width}
            y2={y(prod.projectedT)}
            stroke="var(--color-fg-2)"
            strokeWidth={1.5}
            strokeDasharray="2 3"
          />
        ) : null}
        <path d={line} fill="none" stroke="#c9ced6" strokeWidth={1.5} strokeLinejoin="round" />
        {last ? <circle cx={x(last.t)} cy={y(last.v)} r={3.5} fill="var(--color-fg)" /> : null}
      </svg>

      {last ? (
        <div
          className="absolute flex items-baseline gap-1 whitespace-nowrap"
          style={{ left: Math.min(width - 210, nowX + 9), top: y(prod.nowT) + 4 }}
        >
          <span className="font-mono text-[13px] font-medium">{int(prod.nowT)}</span>
          <span className="text-[11px] text-fg-2">t</span>
          <span className="ml-1.5 text-[11px] text-fg-3">ritmo da meta</span>
          <span className="font-mono text-[11px] text-fg-2">{int(prod.paceT)} t</span>
        </div>
      ) : null}
      <div
        className="absolute right-0 flex items-baseline gap-1 whitespace-nowrap text-[11px] text-fg-3"
        style={{ top: PROD_TOP - 12 }}
      >
        {future ? (
          <>
            projeção <span className="font-mono text-fg-2">{int(prod.projectedT)} t</span> ·
          </>
        ) : null}
        meta <span className="font-mono text-fg-2">{int(prod.goalT)} t</span>
      </div>
    </>
  );
}

/* --------------------------------------------------------------- bobinas */

function Reels({
  x,
  now,
  window,
  reels,
  holds,
  onOpen,
}: {
  readonly x: (t: number) => number;
  readonly now: number;
  readonly window: Window;
  readonly reels: readonly ReelView[];
  readonly holds: readonly ReelHold[];
  readonly onOpen: (number: number) => void;
}) {
  const holdOf = new Map(holds.map((hold) => [hold.reelNumber, hold]));
  return (
    <>
      {reels.map((reel) => {
        const start = Math.max(window.from, Date.parse(reel.startedAt));
        const end = Math.min(window.to, reel.endedAt ? Date.parse(reel.endedAt) : now);
        if (end <= start) return null;
        const left = x(start) + 1;
        const w = Math.max(4, x(end) - x(start) - 2);
        const hold = holdOf.get(reel.number);
        const open = reel.endedAt === null;
        const out = reel.disposition === 'rebaixada' || reel.disposition === 'segregada';

        const style = hold
          ? hold.status === 'retida'
            ? 'border-solid border-spec-out bg-spec-out/20 text-fg'
            : 'border-dashed border-spec-edge-line bg-spec-edge/40 text-fg'
          : open
            ? 'border-dashed border-tick text-fg-2'
            : out
              ? 'border-solid border-spec-edge-line bg-spec-edge/30 text-fg'
              : 'border-solid border-line-strong bg-cell text-fg-2';
        const label = hold
          ? hold.status === 'retida'
            ? `${String(reel.number)} · RETIDA`
            : `${String(reel.number)} · Cobb`
          : open
            ? `${String(reel.number)} ▸`
            : out
              ? `${String(reel.number)} · ${reel.disposition ?? ''}`
              : String(reel.number);
        const tip = [
          `Bobina ${String(reel.number)}`,
          reel.weightT ? `${num(reel.weightT, 1)} t` : null,
          reel.disposition ?? (open ? 'em formação' : null),
          reel.dispositionReason,
          hold ? `${hold.status} (ilustrativo): ${hold.reason}` : null,
        ]
          .filter(Boolean)
          .join(' · ');

        return (
          <button
            key={reel.number}
            type="button"
            title={tip}
            onClick={() => {
              onOpen(reel.number);
            }}
            className={`absolute overflow-hidden rounded-[2px] border px-1.5 text-left text-[11px] whitespace-nowrap hover:border-action ${style}`}
            style={{ left, width: w, top: REELS_TOP, height: REELS_H }}
          >
            <span className="font-mono">{label}</span>
          </button>
        );
      })}
    </>
  );
}

/* ------------------------------------------------------------------ eixo */

function Axis({
  x,
  window,
  width,
}: {
  readonly x: (t: number) => number;
  readonly window: Window;
  readonly width: number;
}) {
  const span = window.to - window.from;
  const step = span > 12 * 3_600_000 ? 3 * 3_600_000 : 3_600_000;
  const first = Math.ceil(window.from / step) * step;
  const ticks: number[] = [];
  for (let t = first; t <= window.to; t += step) ticks.push(t);

  return (
    <>
      {ticks.map((t) => {
        const left = x(t);
        return (
          <div
            key={t}
            className="absolute font-mono text-[11px] text-fg-3"
            style={{ left: Math.min(width - 34, left), top: AXIS_TOP }}
          >
            {hhmm(new Date(t).toISOString())}
          </div>
        );
      })}
    </>
  );
}

/* ------------------------------------------------------------ marcadores */

const HAIR: Readonly<Record<EventKind, string>> = {
  quebra: 'transparent',
  gramatura: 'var(--color-line-strong)',
  alarme: 'color-mix(in srgb, var(--color-alarm-2) 35%, transparent)',
  setpoint: 'var(--color-line-strong)',
  bobina: 'color-mix(in srgb, var(--color-spec-out) 35%, transparent)',
};

function Markers({
  x,
  events,
  selected,
  onSelect,
}: {
  readonly x: (t: number) => number;
  readonly events: readonly TimelineEvent[];
  readonly selected: string | null;
  readonly onSelect: (id: string) => void;
}) {
  const placed = events.map((event) => ({
    event,
    x: x(event.t),
    width: 26 + event.short.length * 7,
  }));
  const lane = lanes(placed.map((p) => ({ x: p.x - 9, width: p.width })));

  return (
    <>
      {placed.map(({ event, x: left }) => (
        <div
          key={`hair-${event.id}`}
          aria-hidden="true"
          className="absolute w-px"
          style={{ left, top: 34, height: PLOT_H - 34, background: HAIR[event.kind] }}
        />
      ))}
      {placed.map(({ event, x: left }, index) => (
        <button
          key={event.id}
          type="button"
          aria-label={`${EVENT_LABEL[event.kind]} ${hhmm(new Date(event.t).toISOString())}: ${event.title}${
            event.illustrative ? ' (ilustrativo)' : ''
          }`}
          aria-expanded={selected === event.id}
          onClick={() => {
            onSelect(event.id);
          }}
          className={`absolute flex h-6 items-center gap-1.5 rounded-[3px] border pr-1.5 pl-1 whitespace-nowrap ${
            selected === event.id
              ? 'border-[#3a4350] bg-[#1a2029]'
              : event.illustrative
                ? 'border-dashed border-line-strong hover:border-[#3a4350] hover:bg-[#1a2029]'
                : 'border-transparent hover:border-[#3a4350] hover:bg-[#1a2029]'
          }`}
          style={{ left: left - 9, top: 6 + (lane[index] ?? 0) * 26 }}
        >
          <EventGlyph kind={event.kind} />
          <span
            className={`font-mono text-[11px] ${event.kind === 'quebra' ? 'text-fg' : 'text-fg-2'}`}
          >
            {event.short}
          </span>
        </button>
      ))}
    </>
  );
}

/* ---------------------------------------------------------------- detalhe */

const KIND_COLOR: Readonly<Record<EventKind, string>> = {
  quebra: 'bg-alarm-1',
  gramatura: 'bg-fg-2',
  alarme: 'bg-alarm-2',
  setpoint: 'bg-fg-2',
  bobina: 'bg-spec-out',
};

function EventCard({
  event,
  left,
  onClose,
  onOpenReel,
  onOpenTag,
  onOpenBreak,
}: {
  readonly event: TimelineEvent;
  readonly left: number;
  readonly onClose: () => void;
  readonly onOpenReel: (number: number) => void;
  readonly onOpenTag: (tag: string) => void;
  readonly onOpenBreak: (id: string) => void;
}) {
  const scale = event.tag ? tagScale(event.tag) : null;
  const out = scale && event.value !== null ? isOut(scale, event.value) : false;
  const color =
    event.kind === 'bobina'
      ? 'var(--color-spec-out)'
      : out
        ? 'var(--color-alarm-2)'
        : 'var(--color-fg)';
  const reel = event.reel;
  const tag = event.tag;
  /**
   * Na quebra, o botão leva ao replay.
   *
   * É o caminho da Fase 5: a quebra aparece aqui, e o diagnóstico dos 10 min
   * anteriores está a um clique — sem ninguém ter de procurar a quebra numa
   * outra tela para investigá-la.
   */
  const action =
    event.kind === 'quebra'
      ? {
          label: 'Ver o replay',
          run: () => {
            onOpenBreak(event.id.replace(/^quebra:/, ''));
          },
        }
      : reel !== null && (event.kind === 'bobina' || event.kind === 'gramatura')
        ? {
            label: 'Abrir em Bobinas',
            run: () => {
              onOpenReel(reel);
            },
          }
        : tag !== null && event.kind !== 'bobina'
          ? {
              label: 'Abrir em Processo',
              run: () => {
                onOpenTag(tag);
              },
            }
          : null;

  return (
    <div
      role="dialog"
      aria-label="Detalhe do evento"
      className="absolute z-10 flex w-90 flex-col gap-2 rounded-[4px] border border-[#3a4350] bg-[#1a2029] px-3.5 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
      style={{ left, top: 74 }}
    >
      <div className="flex items-center gap-2">
        <span className={`size-2 ${KIND_COLOR[event.kind]}`} />
        <span className="font-mono text-[12px] text-fg-2">
          {hhmm(new Date(event.t).toISOString())}
        </span>
        <span className="text-[11px] tracking-[0.05em] text-fg-2 uppercase">
          {EVENT_LABEL[event.kind]}
        </span>
        {event.illustrative ? (
          <Illustrative title="Cenário fixo de demonstração: a API não tem esta fonte." />
        ) : null}
        <span className="flex-1" />
        <button
          type="button"
          aria-label="Fechar detalhe"
          onClick={onClose}
          className="flex size-6 items-center justify-center text-fg-3 hover:text-fg"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M2 2 L10 10 M10 2 L2 10" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      </div>
      <div className="text-[14px] font-semibold">{event.title}</div>
      <div className="text-[12px] text-fg-2">{event.meta}</div>
      {scale && event.value !== null && tag ? (
        <>
          <div className="flex items-center gap-2.5 pt-0.5">
            <span className="w-16 font-mono text-[10px] text-fg-3">{tag}</span>
            <RangeBar
              size="sm"
              className="flex-1"
              min={scale.min}
              max={scale.max}
              ll={scale.ll}
              l={scale.l}
              h={scale.h}
              hh={scale.hh}
              target={scale.target}
              pv={event.value}
            />
            <span
              className="min-w-10 text-right font-mono text-[13px] font-semibold"
              style={{ color }}
            >
              {tagValue(event.value, scale.unit)}
            </span>
            <span className="w-12 text-[11px] text-fg-2">{scale.unit}</span>
          </div>
          <div className="pl-[74px] font-mono text-[10px] text-fg-3">{scale.range}</div>
        </>
      ) : null}
      {action ? (
        <div className="flex justify-end pt-0.5">
          <button
            type="button"
            onClick={action.run}
            className="text-[12px] text-action hover:text-action-hover"
          >
            {action.label} →
          </button>
        </div>
      ) : null}
    </div>
  );
}
