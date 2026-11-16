import { useState, type ReactNode } from 'react';
import type { Alarm, MaintenanceNote, Round } from '@mp1/shared';

import type { ReelHold } from '../../api/fixtures';
import { fraction } from '../../ui/chart/scale';
import { hhmm, int, num, tagValue } from '../../ui/format';
import { Illustrative, Panel, PriorityBadge } from '../../ui/Panel';
import { designPriority, PRIORITY_COLOR, type DesignPriority } from '../../ui/priority';
import { RangeBar } from '../../ui/RangeBar';
import { isStanding } from '../../ui/sections';
import { tagScale } from '../../ui/tagScale';
import {
  alarmText,
  EFFICIENCY_BAND,
  SCRAP_TARGET_PCT,
  type Production,
  type Scrap,
} from './derive';

const pct = (value: number) => `${(value * 100).toFixed(2)}%`;

/* ------------------------------------------------------------------ placar */

export function Scoreboard({
  prod,
  efficiencyPct,
  breaks,
  breakMinutes,
  scrap,
  elapsedMin,
  totalMin,
  until,
}: {
  readonly prod: Production;
  readonly efficiencyPct: number;
  readonly breaks: number;
  readonly breakMinutes: number;
  readonly scrap: Scrap;
  readonly elapsedMin: number;
  readonly totalMin: number;
  readonly until: string;
}) {
  const goal = Math.max(prod.goalT, 1);
  const delta = prod.nowT - prod.paceT;
  const effLo = 85;
  const scrapMax = 8;

  return (
    <Panel
      help="turno.placar"
      title="Placar do turno"
      aside={
        <span>
          até <span className="font-mono">{until}</span> ·{' '}
          <span className="font-mono">{int(elapsedMin)}</span> de{' '}
          <span className="font-mono">{int(totalMin)}</span> min
        </span>
      }
      bodyClassName="flex flex-col gap-7 pt-2"
    >
      <Score
        title={`Meta do turno: ${int(prod.goalT)} t (alvo de XI-0001 × 8 h). Ritmo da meta agora: ${int(prod.paceT)} t. Acumulado = integral de XI-0001 desde o início do turno.`}
        label="Produção"
        value={int(prod.nowT)}
        unit="t"
        note={
          <>
            <span className="font-mono text-[12px] text-fg-2">
              {delta >= 0 ? '+' : '−'}
              {int(Math.abs(delta))} t
            </span>{' '}
            vs. ritmo
          </>
        }
        bar={
          <>
            <div className="absolute inset-x-0 top-1.5 h-2 bg-line" />
            <div
              className="absolute top-1.5 left-0 h-2 bg-[#8b94a3]"
              style={{ width: pct(fraction(prod.nowT, 0, goal)) }}
            />
            {prod.projectedT > prod.nowT ? (
              <div
                className="absolute top-1.5 h-2 border border-l-0 border-dashed border-tick"
                style={{
                  left: pct(fraction(prod.nowT, 0, goal)),
                  width: pct(fraction(prod.projectedT, 0, goal) - fraction(prod.nowT, 0, goal)),
                }}
              />
            ) : null}
            <div
              className="absolute top-0 h-5 w-0.5 bg-fg"
              style={{ left: pct(fraction(prod.paceT, 0, goal)) }}
            />
            <div className="absolute top-0 right-0 h-5 w-0.5 bg-tick" />
          </>
        }
        ticks={[
          { at: 0, text: '0' },
          {
            at: fraction(prod.paceT, 0, goal),
            text: (
              <>
                ritmo <span className="font-mono">{int(prod.paceT)}</span>
              </>
            ),
          },
          {
            at: 1,
            text: (
              <>
                meta <span className="font-mono">{int(prod.goalT)}</span>
              </>
            ),
          },
        ]}
      />

      <Score
        title={`Eficiência de tempo = tempo produzindo / tempo calendário, da API. Faixa de referência ${String(EFFICIENCY_BAND[0])}–${String(EFFICIENCY_BAND[1])} % (meta do desenho).`}
        label="Eficiência de tempo"
        value={num(efficiencyPct, 1)}
        unit="%"
        note={
          <>
            {breaks === 1 ? '1 quebra' : `${String(breaks)} quebras`} ·{' '}
            <span className="font-mono">{int(breakMinutes)}</span> min
          </>
        }
        bar={
          <>
            <div className="absolute inset-x-0 top-1.5 h-2 bg-line" />
            <div
              className="absolute top-1.5 h-2 bg-band"
              style={{
                left: pct(fraction(EFFICIENCY_BAND[0], effLo, 100)),
                width: pct(
                  fraction(EFFICIENCY_BAND[1], effLo, 100) -
                    fraction(EFFICIENCY_BAND[0], effLo, 100),
                ),
              }}
            />
            <div
              className="absolute top-0 -ml-px h-5 w-[3px] bg-fg"
              style={{ left: pct(fraction(efficiencyPct, effLo, 100)) }}
            />
          </>
        }
        ticks={[
          { at: 0, text: String(effLo) },
          { at: fraction(EFFICIENCY_BAND[0], effLo, 100), text: String(EFFICIENCY_BAND[0]) },
          { at: fraction(EFFICIENCY_BAND[1], effLo, 100), text: String(EFFICIENCY_BAND[1]) },
          { at: 1, text: '100' },
        ]}
      />

      <Score
        title={`Refugo = (bobinas segregadas + papel ao pulper nas quebras) / produção bruta. Segregadas ${num(scrap.segregatedT, 1)} t; quebras ${num(scrap.breakT, 1)} t (duração × XI-0001 antes da quebra); bruta ${num(scrap.grossT, 1)} t. Meta ≤ ${num(SCRAP_TARGET_PCT, 1)} %.`}
        label="Refugo"
        value={num(scrap.pct, 1)}
        unit="%"
        note={
          <>
            meta ≤ <span className="font-mono">{num(SCRAP_TARGET_PCT, 1)}</span> %
          </>
        }
        bar={
          <>
            <div className="absolute inset-x-0 top-1.5 h-2 bg-line" />
            <div
              className="absolute top-1.5 left-0 h-2 bg-band"
              style={{ width: pct(fraction(SCRAP_TARGET_PCT, 0, scrapMax)) }}
            />
            <div
              className="absolute top-0 -ml-px h-5 w-[3px]"
              style={{
                left: pct(fraction(scrap.pct, 0, scrapMax)),
                background:
                  scrap.pct > SCRAP_TARGET_PCT ? 'var(--color-alarm-2)' : 'var(--color-fg)',
              }}
            />
          </>
        }
        ticks={[
          { at: 0, text: '0' },
          { at: fraction(SCRAP_TARGET_PCT, 0, scrapMax), text: String(SCRAP_TARGET_PCT) },
          { at: 1, text: String(scrapMax) },
        ]}
      />
    </Panel>
  );
}

function Score({
  title,
  label,
  value,
  unit,
  note,
  bar,
  ticks,
}: {
  readonly title: string;
  readonly label: string;
  readonly value: string;
  readonly unit: string;
  readonly note: ReactNode;
  readonly bar: ReactNode;
  readonly ticks: readonly { readonly at: number; readonly text: ReactNode }[];
}) {
  return (
    <div title={title}>
      <div className="mb-2 flex items-baseline gap-1.5">
        <span className="w-35 text-[12px] text-fg-2">{label}</span>
        <span className="font-mono text-[22px] font-medium">{value}</span>
        <span className="text-[12px] text-fg-2">{unit}</span>
        <span className="flex-1" />
        <span className="text-[11px] text-fg-3">{note}</span>
      </div>
      <div className="relative h-5">{bar}</div>
      <div className="relative mt-1 h-3.5 text-[10px] text-fg-3">
        {ticks.map((tick, index) => (
          <span
            key={index}
            className={`absolute whitespace-nowrap ${
              tick.at <= 0 ? 'left-0' : tick.at >= 1 ? 'right-0' : '-translate-x-1/2'
            } ${typeof tick.text === 'string' ? 'font-mono' : ''}`}
            style={tick.at > 0 && tick.at < 1 ? { left: pct(tick.at) } : undefined}
          >
            {tick.text}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- alarmes ativos */

interface StandingAlarm {
  readonly alarm: Alarm;
  readonly priority: DesignPriority;
  readonly fixed: boolean;
}

/** Um por TAG, pela pior prioridade; em ordem de prioridade e, empatado, do mais antigo. */
export function standingAlarms(real: readonly Alarm[], fixed: readonly Alarm[]): StandingAlarm[] {
  const byTag = new Map<string, StandingAlarm>();
  const all = [
    ...real.map((alarm) => ({ alarm, fixed: false })),
    ...fixed.map((alarm) => ({ alarm, fixed: true })),
  ];
  for (const { alarm, fixed: isFixed } of all) {
    if (!isStanding(alarm)) continue;
    const priority = designPriority(alarm.priority);
    const known = byTag.get(alarm.tag);
    if (
      !known ||
      priority < known.priority ||
      (priority === known.priority && alarm.raisedAt < known.alarm.raisedAt)
    ) {
      byTag.set(alarm.tag, { alarm, priority, fixed: isFixed });
    }
  }
  return [...byTag.values()].sort(
    (a, b) =>
      a.priority - b.priority || Date.parse(a.alarm.raisedAt) - Date.parse(b.alarm.raisedAt),
  );
}

export function ActiveAlarms({
  alarms,
  values,
  now,
  onOpen,
}: {
  readonly alarms: readonly StandingAlarm[];
  readonly values: ReadonlyMap<string, number>;
  readonly now: number;
  readonly onOpen: (tag: string) => void;
}) {
  return (
    <Panel
      help="turno.alarmes"
      title="Alarmes ativos"
      aside="por prioridade e tempo ativo"
      bodyClassName="flex min-h-0 flex-col"
    >
      {alarms.length === 0 ? (
        <p className="border-t border-line py-4 text-[12px] text-fg-2">Nenhum alarme em pé.</p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto pr-1">
          {alarms.map(({ alarm, priority, fixed }) => {
            const scale = tagScale(alarm.tag);
            const pv = values.get(alarm.tag) ?? alarm.peakValue;
            return (
              <li key={alarm.id}>
                <button
                  type="button"
                  onClick={() => {
                    onOpen(alarm.tag);
                  }}
                  className="grid w-full grid-cols-[24px_1fr_88px] items-center gap-x-3 gap-y-2 border-t border-line py-3.5 text-left hover:bg-hover"
                >
                  <span className="row-span-2 self-start">
                    <PriorityBadge priority={priority} />
                  </span>
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="shrink-0 font-mono text-[11px] whitespace-nowrap text-fg-2">
                      {alarm.tag}
                    </span>
                    <span className="truncate text-[13px]">{alarmText(alarm)}</span>
                    {fixed ? <Illustrative /> : null}
                  </span>
                  <span className="text-right text-[11px] whitespace-nowrap text-fg-3">
                    há{' '}
                    <span className="font-mono text-fg">
                      {ago(now - Date.parse(alarm.raisedAt))}
                    </span>
                  </span>
                  <span className="flex items-center gap-2.5">
                    {scale ? (
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
                        pv={pv}
                        priority={priority}
                      />
                    ) : (
                      <span className="flex-1" />
                    )}
                    <span
                      className="min-w-9 text-right font-mono text-[13px] font-semibold"
                      style={{ color: PRIORITY_COLOR[priority] }}
                    >
                      {tagValue(pv, scale?.unit ?? '')}
                    </span>
                    <span className="w-10 text-[11px] text-fg-2">{scale?.unit ?? ''}</span>
                  </span>
                  <span className="text-right font-mono text-[11px] text-fg-3">
                    {hhmm(alarm.raisedAt)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="border-t border-line pt-3 text-[11px] text-fg-3">
        Barras: faixa operacional L–H, marcas LL/HH, alvo e PV
      </p>
    </Panel>
  );
}

/** `28 min`, `2 h 20`: há quanto tempo. */
export function ago(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 60) return `${String(minutes)} min`;
  return `${String(Math.floor(minutes / 60))} h ${String(minutes % 60).padStart(2, '0')}`;
}

/* -------------------------------------------------------- passagem de turno */

export interface HandoverItem {
  readonly id: string;
  readonly title: ReactNode;
  readonly detail: ReactNode;
  readonly chip: ReactNode;
  readonly illustrative: boolean;
}

export function Handover({
  items,
  deliverAt,
}: {
  readonly items: readonly HandoverItem[];
  readonly deliverAt: string;
}) {
  const [done, setDone] = useState<ReadonlySet<string>>(new Set());
  return (
    <Panel
      help="turno.passagem"
      title="Passagem de turno"
      label="Pendências da passagem de turno"
      aside={
        <span>
          <span className="font-mono text-fg">{items.length}</span>{' '}
          {items.length === 1 ? 'pendência' : 'pendências'} · entrega{' '}
          <span className="font-mono">{deliverAt}</span>
        </span>
      }
      bodyClassName="min-h-0 overflow-y-auto"
    >
      {items.length === 0 ? (
        <p className="border-t border-line py-4 text-[12px] text-fg-2">
          Nada pendente para o próximo turno.
        </p>
      ) : (
        <ul>
          {items.map((item) => {
            const id = `handover-${item.id}`;
            return (
              <li
                key={item.id}
                className="flex min-h-14.5 items-center gap-3 border-t border-line py-2"
              >
                <input
                  id={id}
                  type="checkbox"
                  checked={done.has(item.id)}
                  onChange={() => {
                    setDone((current) => {
                      const next = new Set(current);
                      if (next.has(item.id)) next.delete(item.id);
                      else next.add(item.id);
                      return next;
                    });
                  }}
                  className="size-4 shrink-0 accent-action"
                />
                <label htmlFor={id} className="flex min-w-0 flex-1 cursor-pointer flex-col gap-0.5">
                  <span
                    className={`text-[13px] ${done.has(item.id) ? 'text-fg-3 line-through' : ''}`}
                  >
                    {item.title}
                  </span>
                  <span className="truncate text-[11px] text-fg-3">{item.detail}</span>
                </label>
                {item.illustrative ? <Illustrative /> : null}
                {item.chip}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/** O chip à direita: estado em texto, com borda. */
export function Chip({
  children,
  tone = 'neutral',
}: {
  readonly children: ReactNode;
  readonly tone?: 'neutral' | 'out';
}) {
  return (
    <span
      className={`shrink-0 border px-1.5 py-0.5 text-[11px] ${
        tone === 'out' ? 'border-spec-out text-spec-out' : 'border-band text-fg-2'
      }`}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------- montagem da lista */

export interface HandoverSources {
  readonly handover: readonly string[];
  readonly holds: readonly ReelHold[];
  readonly akd: {
    readonly since: string;
    readonly value: number;
    readonly sp: number | null;
  } | null;
  readonly notes: readonly MaintenanceNote[];
  readonly round: Round | null;
  readonly onOpenNote: (number: string) => void;
  readonly onOpenTag: (tag: string) => void;
}

/** Nome curto de um mancal: `MP1-SEC-G4-CS23-MLC` → `CS23 LC`. */
export function bearingShort(assetTag: string): string {
  const parts = assetTag.split('-');
  const cylinder = parts.at(-2);
  const side = parts.at(-1);
  if (!cylinder || !side?.startsWith('M')) return assetTag;
  return `${cylinder} ${side.slice(1)}`;
}

export function handoverItems(src: HandoverSources): HandoverItem[] {
  const items: HandoverItem[] = [];

  for (const hold of src.holds) {
    const value = (
      <span className="font-mono text-spec-out">
        {hold.tag} {tagValue(hold.value, hold.unit)} {hold.unit}
      </span>
    );
    const range = tagScale(hold.tag)?.range ?? '';
    items.push(
      hold.status === 'retida'
        ? {
            id: `hold-${String(hold.reelNumber)}`,
            title: (
              <>
                Reteste de Cobb da bobina <span className="font-mono">{hold.reelNumber}</span>{' '}
                (retida)
              </>
            ),
            detail: (
              <>
                {value} · {range} · Laboratório
              </>
            ),
            chip: <Chip tone="out">retida</Chip>,
            illustrative: true,
          }
        : {
            id: `hold-${String(hold.reelNumber)}`,
            title: (
              <>
                Definir destino da bobina <span className="font-mono">{hold.reelNumber}</span>
              </>
            ),
            detail: <>{value} · demais ensaios dentro · Qualidade</>,
            chip: <Chip>em avaliação</Chip>,
            illustrative: true,
          },
    );
  }

  if (src.akd) {
    const { since, value, sp } = src.akd;
    items.push({
      id: 'akd',
      title: (
        <>
          Cola AKD abaixo do SP desde <span className="font-mono">{hhmm(since)}</span>
        </>
      ),
      detail: (
        <>
          <span className="font-mono text-alarm-2">FIC-107 {tagValue(value, 'kg/t')} kg/t</span>
          {sp !== null ? (
            <>
              {' '}
              · SP <span className="font-mono">{tagValue(sp, 'kg/t')}</span>
            </>
          ) : null}{' '}
          · checar dosadora
        </>
      ),
      chip: (
        <button
          type="button"
          onClick={() => {
            src.onOpenTag('FIC-107');
          }}
          className="h-7.5 shrink-0 border border-action px-2.5 text-[12px] text-action-hover hover:text-fg"
        >
          Ver tendência
        </button>
      ),
      illustrative: true,
    });
  }

  if (src.round) {
    const flagged = src.round.points.filter(
      (point) => point.noise !== 'normal' || point.leak !== 'nenhum',
    );
    for (const point of flagged) {
      items.push({
        id: `round-${point.assetTag}`,
        title: (
          <>
            Verificar mancal {bearingShort(point.assetTag)} apontado na ronda de{' '}
            <span className="font-mono">{hhmm(src.round.startedAt)}</span>
          </>
        ),
        detail: (
          <>
            {point.note ?? `ruído ${point.noise} · vazamento ${point.leak}`}
            {point.onlineTag ? (
              <>
                {' '}
                ·{' '}
                <span className="font-mono">
                  {point.onlineTag} {tagValue(point.onlineValue, '°C')} °C
                </span>
              </>
            ) : null}
          </>
        ),
        chip: <Chip>ronda</Chip>,
        illustrative: false,
      });
    }
  }

  for (const note of src.notes) {
    items.push({
      id: `note-${note.number}`,
      title: <>Programar intervenção no mancal {bearingShort(note.assetTag)}</>,
      detail: note.symptom,
      chip: (
        <button
          type="button"
          onClick={() => {
            src.onOpenNote(note.number);
          }}
          className="shrink-0 border border-band px-1.5 py-0.5 font-mono text-[11px] text-fg hover:border-action"
        >
          {note.number} · P{note.priority}
        </button>
      ),
      illustrative: false,
    });
  }

  for (const line of src.handover) {
    items.push({
      id: `api-${line}`,
      title: line.charAt(0).toUpperCase() + line.slice(1),
      detail: 'registrado pelo turno',
      chip: <Chip>turno</Chip>,
      illustrative: false,
    });
  }

  return items;
}
