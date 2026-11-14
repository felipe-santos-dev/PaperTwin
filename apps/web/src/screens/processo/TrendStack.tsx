import { useCallback, useState } from 'react';
import type { Alarm, SetpointChange } from '@mp1/shared';

import type { DataGateway } from '../../api/gateway';
import type { TagTrend } from '../../api/process';
import { linear, type Linear } from '../../ui/chart/scale';
import { seriesOf, type Point } from '../../ui/chart/series';
import { hhmm, num, tagValue } from '../../ui/format';
import { Illustrative, Panel } from '../../ui/Panel';
import { ResourceState } from '../../ui/ResourceState';
import { isOut, tagScale } from '../../ui/tagScale';
import { useResource } from '../../ui/useResource';
import { useWidth } from '../../ui/useWidth';

/**
 * Tendência multi-TAG: uma faixa por TAG, todas no mesmo eixo de tempo.
 *
 * Cada faixa tem a sua escala — pressão em kPa e ponto de orvalho em °C não
 * dividem eixo vertical —, com a banda L–H ao fundo, a alteração de setpoint
 * em azul e o alarme na cor da prioridade. O eixo de tempo é o que as
 * respostas cobrem: o instantâneo de demonstração guarda 4 h, e pedir 24 h a
 * ele mostra as 4 h que existem, não 24 h com 20 vazias.
 */

export type TrendWindow = '1h' | '8h' | '24h' | '7d';

const WINDOW_MS: Readonly<Record<TrendWindow, number>> = {
  '1h': 3_600_000,
  '8h': 8 * 3_600_000,
  '24h': 24 * 3_600_000,
  '7d': 7 * 24 * 3_600_000,
};

const WINDOW_LABEL: Readonly<Record<TrendWindow, string>> = {
  '1h': '1 h',
  '8h': '8 h',
  '24h': '24 h',
  '7d': '7 d',
};

export const MAX_TREND_TAGS = 4;

export interface TrendStackProps {
  readonly gateway: DataGateway;
  readonly tags: readonly string[];
  readonly now: number;
  /** TAGs que vêm do dado fixo (preparo): a tendência sai da rota fixa e leva selo. */
  readonly fixedTags: ReadonlySet<string>;
  readonly options: readonly { readonly tag: string; readonly name: string }[];
  readonly setpoints: readonly SetpointChange[];
  readonly alarms: readonly Alarm[];
  readonly onAdd: (tag: string) => void;
  readonly onRemove: (tag: string) => void;
  readonly className?: string;
}

export function TrendStack(props: TrendStackProps) {
  const { gateway, tags, now, fixedTags } = props;
  const [window, setWindow] = useState<TrendWindow>('8h');
  const [adding, setAdding] = useState(false);

  const trends = useResource(
    useCallback(
      (signal: AbortSignal) => {
        const query = { from: new Date(now - WINDOW_MS[window]), to: new Date(now), buckets: 240 };
        return Promise.all(
          tags.map((tag) =>
            (fixedTags.has(tag)
              ? (gateway.fixedTrend(tag, query, signal) as Promise<TagTrend>)
              : gateway.tagTrend(tag, query, signal)
            ).catch(() => null),
          ),
        );
      },
      [gateway, tags, now, window, fixedTags],
    ),
  );

  return (
    <Panel
      title="Tendência"
      className={props.className ?? ''}
      aside={
        <div
          role="group"
          aria-label="Janela da tendência"
          className="flex border border-line-strong"
        >
          {(Object.keys(WINDOW_MS) as TrendWindow[]).map((key, index) => (
            <button
              key={key}
              type="button"
              aria-pressed={window === key}
              onClick={() => {
                setWindow(key);
              }}
              className={`h-7 px-3 text-[12px] ${index > 0 ? 'border-l border-line-strong' : ''} ${
                window === key
                  ? 'bg-[#1b2a44] text-[#cfe0ff]'
                  : 'text-fg-2 hover:bg-hover hover:text-fg'
              }`}
            >
              {WINDOW_LABEL[key]}
            </button>
          ))}
        </div>
      }
      bodyClassName="flex min-h-0 flex-col"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {tags.map((tag) => {
          const alarm = props.alarms.some((item) => item.tag === tag);
          return (
            <span
              key={tag}
              className={`inline-flex h-6 items-center gap-1.5 border px-2 font-mono text-[11px] ${
                alarm ? 'border-alarm-2 text-alarm-2' : 'border-line-strong text-fg'
              }`}
            >
              {tag}
              <button
                type="button"
                aria-label={`Tirar ${tag} da tendência`}
                onClick={() => {
                  props.onRemove(tag);
                }}
                className="text-fg-3 hover:text-fg"
              >
                ×
              </button>
            </span>
          );
        })}
        {tags.length < MAX_TREND_TAGS ? (
          adding ? (
            <select
              autoFocus
              aria-label="TAG para a tendência"
              defaultValue=""
              onChange={(event) => {
                if (event.target.value) props.onAdd(event.target.value);
                setAdding(false);
              }}
              onBlur={() => {
                setAdding(false);
              }}
              className="h-6 border border-action bg-cell px-1 font-mono text-[11px] text-fg"
            >
              <option value="">escolha…</option>
              {props.options
                .filter((option) => !tags.includes(option.tag))
                .map((option) => (
                  <option key={option.tag} value={option.tag}>
                    {option.tag} · {option.name}
                  </option>
                ))}
            </select>
          ) : (
            <button
              type="button"
              onClick={() => {
                setAdding(true);
              }}
              className="h-6 border border-dashed border-action px-2 font-mono text-[11px] text-action hover:text-action-hover"
            >
              + TAG
            </button>
          )
        ) : null}
      </div>
      {tags.length === 0 ? (
        <p className="py-4 text-[12px] text-fg-3">Escolha uma variável na tabela ou em “+ TAG”.</p>
      ) : (
        <ResourceState resource={trends} label="as tendências">
          {(list) => (
            <Rows
              tags={tags}
              trends={list}
              now={now}
              fixedTags={fixedTags}
              setpoints={props.setpoints}
              alarms={props.alarms}
            />
          )}
        </ResourceState>
      )}
    </Panel>
  );
}

function Rows({
  tags,
  trends,
  now,
  fixedTags,
  setpoints,
  alarms,
}: {
  readonly tags: readonly string[];
  readonly trends: readonly (TagTrend | null)[];
  readonly now: number;
  readonly fixedTags: ReadonlySet<string>;
  readonly setpoints: readonly SetpointChange[];
  readonly alarms: readonly Alarm[];
}) {
  const [ref, width] = useWidth<HTMLDivElement>(500);
  const covered = trends.filter((trend): trend is TagTrend => trend !== null);
  const from = Math.min(...covered.map((trend) => Date.parse(trend.from)));
  const to = Math.max(now, ...covered.map((trend) => Date.parse(trend.to)));
  if (!Number.isFinite(from)) {
    return (
      <p className="py-4 text-[12px] text-fg-3">
        O historiador não devolveu série para estas TAGs.
      </p>
    );
  }
  const x = linear([from, to], [0, width]);
  const step =
    to - from > 2 * 24 * 3_600_000
      ? 24 * 3_600_000
      : to - from > 10 * 3_600_000
        ? 4 * 3_600_000
        : to - from > 3 * 3_600_000
          ? 3_600_000
          : 15 * 60_000;
  const ticks: number[] = [];
  for (let t = Math.ceil(from / step) * step; t <= to; t += step) ticks.push(t);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tags.map((tag, index) => (
          <Row
            key={tag}
            tag={tag}
            trend={trends[index] ?? null}
            x={x}
            width={width}
            now={now}
            fixed={fixedTags.has(tag)}
            setpoints={setpoints.filter((change) => change.tag === tag)}
            alarms={alarms.filter((alarm) => alarm.tag === tag)}
            measure={index === 0 ? ref : undefined}
          />
        ))}
      </div>
      <div className="grid grid-cols-[84px_minmax(0,1fr)_96px] gap-x-3 pt-1">
        <span />
        <div className="relative h-4">
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute -translate-x-1/2 font-mono text-[10px] text-fg-3"
              style={{ left: x(t) }}
            >
              {step >= 24 * 3_600_000
                ? new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
                : hhmm(new Date(t).toISOString())}
            </span>
          ))}
        </div>
        <span />
      </div>
    </div>
  );
}

function Row({
  tag,
  trend,
  x,
  width,
  now,
  fixed,
  setpoints,
  alarms,
  measure,
}: {
  readonly tag: string;
  readonly trend: TagTrend | null;
  readonly x: Linear;
  readonly width: number;
  readonly now: number;
  readonly fixed: boolean;
  readonly setpoints: readonly SetpointChange[];
  readonly alarms: readonly Alarm[];
  readonly measure: React.Ref<HTMLDivElement> | undefined;
}) {
  const scale = tagScale(tag);
  const points: Point[] = trend ? seriesOf(trend, now) : [];
  const last = points.at(-1);
  const H = 46;
  const values = points.map((p) => p.v);
  const lo = Math.min(scale?.l ?? Infinity, scale?.ll ?? Infinity, ...values);
  const hi = Math.max(scale?.h ?? -Infinity, scale?.hh ?? -Infinity, ...values);
  const pad = (hi - lo) * 0.25 || Math.abs(hi) * 0.05 || 1;
  const y = linear([lo - pad, hi + pad], [H - 2, 2]);
  const path = points
    .map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`)
    .join(' ');
  const out = scale && last ? isOut(scale, last.v) : false;
  const inside = (t: number) => t >= x.domain[0] && t <= x.domain[1];
  const marks = [
    ...setpoints
      .filter((change) => inside(Date.parse(change.changedAt)))
      .map((change) => ({
        t: Date.parse(change.changedAt),
        color: 'var(--color-action)',
        text: `SP ${num(change.previousValue, 1)}→${num(change.newValue, 1)} · ${hhmm(change.changedAt)}`,
      })),
    ...alarms
      .filter((alarm) => inside(Date.parse(alarm.raisedAt)))
      .map((alarm) => ({
        t: Date.parse(alarm.raisedAt),
        color: 'var(--color-alarm-2)',
        text: `${alarm.limit} · ${hhmm(alarm.raisedAt)}`,
      })),
  ];

  return (
    <div className="grid min-h-[70px] grid-cols-[84px_minmax(0,1fr)_96px] items-center gap-x-3 border-b border-line">
      <div className="min-w-0">
        <div className="font-mono text-[11px] text-fg-2">{tag}</div>
        <div className="truncate text-[10px] text-fg-3">{scale?.name ?? ''}</div>
        {fixed ? <Illustrative /> : null}
      </div>
      <div ref={measure} className="relative min-w-0" style={{ height: H + 16 }}>
        <svg
          aria-label={`Tendência de ${tag}`}
          role="img"
          width={width}
          height={H + 16}
          className="block overflow-visible"
        >
          <g transform="translate(0 14)">
            <rect x={0} width={width} y={0} height={H} fill="#161b22" />
            {scale?.l != null && scale.h != null ? (
              <rect
                x={0}
                width={width}
                y={y(scale.h)}
                height={Math.max(0, y(scale.l) - y(scale.h))}
                fill="var(--color-track)"
              />
            ) : null}
            {marks.map((mark) => (
              <line
                key={`${mark.text}`}
                x1={x(mark.t)}
                x2={x(mark.t)}
                y1={-14}
                y2={H}
                stroke={mark.color}
              />
            ))}
            <path d={path} fill="none" stroke="#c9ced6" strokeWidth={1.3} strokeLinejoin="round" />
            {last ? (
              <circle
                cx={x(last.t)}
                cy={y(last.v)}
                r={2.5}
                fill={out ? 'var(--color-alarm-2)' : 'var(--color-fg)'}
              />
            ) : null}
          </g>
        </svg>
        {marks.map((mark) => (
          <span
            key={`l-${mark.text}`}
            className="absolute top-0 font-mono text-[10px] whitespace-nowrap"
            style={{ left: Math.min(width - 130, x(mark.t) + 4), color: mark.color }}
          >
            {mark.text}
          </span>
        ))}
        {points.length === 0 ? (
          <span className="absolute inset-0 flex items-center justify-center text-[11px] text-fg-3">
            sem série na janela
          </span>
        ) : null}
      </div>
      <div className="text-right">
        <span className={`font-mono text-[14px] ${out ? 'text-alarm-2' : ''}`}>
          {last ? tagValue(last.v, scale?.unit ?? '') : '—'}
        </span>
        <span className="ml-1 text-[11px] text-fg-2">{scale?.unit ?? ''}</span>
      </div>
    </div>
  );
}
