import { useCallback, useState } from 'react';
import { processVariable } from '@mp1/shared';

import { isStanding } from '../ui/sections';

import type { DataGateway } from '../api/gateway';
import type { ProcessValues, ShiftDetail } from '../api/process';
import { ResourceState } from '../ui/ResourceState';
import { hhmm } from '../ui/format';
import { useResource } from '../ui/useResource';
import {
  breakMs,
  production,
  PRODUCTION_TAG,
  scrap,
  seriesOf,
  shiftWindow,
  SPEED_TAG,
  timelineEvents,
  type Window,
} from './turno/derive';
import { ActiveAlarms, Handover, handoverItems, Scoreboard, standingAlarms } from './turno/Support';
import { Timeline, type TimelineWindow } from './turno/Timeline';

/**
 * Turno — o que aconteceu, onde estamos e o que fica para o próximo.
 *
 * A linha do tempo é o visual principal: velocidade, produção acumulada e
 * bobinas no mesmo eixo, com os eventos marcados em cima. Embaixo, o placar, os
 * alarmes em pé e a passagem de turno.
 *
 * Quase tudo é leitura da API. O que não é — as bobinas paradas pela qualidade
 * e a cola AKD — vem do cenário fixo e leva o selo "ilustrativo".
 */

export interface TurnoScreenProps {
  readonly gateway: DataGateway;
  readonly onSelectReel: (number: number) => void;
  readonly onOpenTag: (tag: string) => void;
  readonly onOpenNote: (number: string) => void;
  /** Abre o replay de uma quebra da linha do tempo. */
  readonly onOpenBreak: (id: string) => void;
}

const HOUR = 3_600_000;

/** A dosagem de cola: a TAG do cenário que termina na bobina retida. */
const AKD_TAG = 'FIC-107';

export function TurnoScreen({
  gateway,
  onSelectReel,
  onOpenTag,
  onOpenNote,
  onOpenBreak,
}: TurnoScreenProps) {
  const [mode, setMode] = useState<TimelineWindow>('turno');

  const base = useResource(
    useCallback(
      async (signal: AbortSignal) => {
        const [shifts, values] = await Promise.all([
          gateway.shifts({ limit: 3 }, signal),
          gateway.processValues({}, signal),
        ]);
        const current = shifts.shifts.find((shift) => shift.endedAt === null) ?? shifts.shifts[0];
        if (!current) return null;
        const detail = await gateway.shift(current.id, signal);
        return { detail, values };
      },
      [gateway],
    ),
    { isEmpty: (data) => data === null },
  );

  return (
    <ResourceState
      resource={base}
      label="o turno"
      emptyMessage="Nenhum turno registrado ainda. A simulação precisa rodar pelo menos um intervalo."
    >
      {(data) =>
        data ? (
          <ShiftBody
            gateway={gateway}
            detail={data.detail}
            values={data.values}
            mode={mode}
            onMode={setMode}
            onSelectReel={onSelectReel}
            onOpenTag={onOpenTag}
            onOpenNote={onOpenNote}
            onOpenBreak={onOpenBreak}
          />
        ) : null
      }
    </ResourceState>
  );
}

interface Base {
  readonly detail: ShiftDetail;
  readonly values: ProcessValues;
}

function windowOf(mode: TimelineWindow, shift: Window, now: number): Window {
  if (mode === '24h') return { from: now - 24 * HOUR, to: now };
  if (mode === '3turnos') return { from: shift.from - 16 * HOUR, to: shift.to };
  return shift;
}

function ShiftBody({
  gateway,
  detail,
  values,
  mode,
  onMode,
  onSelectReel,
  onOpenTag,
  onOpenNote,
  onOpenBreak,
}: Base & {
  readonly gateway: DataGateway;
  readonly mode: TimelineWindow;
  readonly onMode: (mode: TimelineWindow) => void;
  readonly onSelectReel: (number: number) => void;
  readonly onOpenTag: (tag: string) => void;
  readonly onOpenNote: (number: string) => void;
  readonly onOpenBreak: (id: string) => void;
}) {
  const { shift } = detail;
  const now = Date.parse(values.ts);
  const shiftWin = shiftWindow(shift);
  const window = windowOf(mode, shiftWin, now);

  const rest = useResource(
    useCallback(
      async (signal: AbortSignal) => {
        const query = {
          from: new Date(window.from),
          to: new Date(Math.min(now, window.to)),
          buckets: 240,
        };
        const [speed, prod, reels, breaks, grades, setpoints, alarms, holds, fixed, notes] =
          await Promise.all([
            gateway.tagTrend(SPEED_TAG, query, signal),
            gateway.tagTrend(PRODUCTION_TAG, query, signal),
            gateway.reels({ limit: 40 }, signal),
            gateway.webBreaks({ limit: 50 }, signal),
            gateway.gradeChanges({ limit: 20 }, signal),
            gateway.setpointChanges({ limit: 50 }, signal),
            gateway.alarms({ limit: 200 }, signal),
            gateway.reelHolds(signal),
            gateway.fixedProcess(signal),
            gateway.notes({ limit: 50 }, signal),
          ]);
        return { speed, prod, reels, breaks, grades, setpoints, alarms, holds, fixed, notes };
      },
      [gateway, window.from, window.to, now],
    ),
  );

  return (
    <ResourceState resource={rest} label="a linha do tempo">
      {(data) => {
        const speedSeries = seriesOf(data.speed, now);
        const prodSeries = seriesOf(data.prod, now);
        const speedVar = processVariable(SPEED_TAG);
        const prodWin = production(prodSeries, window, now);
        const prodShift = production(prodSeries, shiftWin, now);
        const shiftBreaks = data.breaks.webBreaks.filter((item) => item.shiftId === shift.id);
        const shiftReels = data.reels.reels.filter((reel) => reel.shiftId === shift.id);
        /**
         * A cola agora é TAG de verdade, e o alarme dela é do motor.
         *
         * Até a Fase 3 os dois vinham do dado fixo: o valor era uma curva
         * escrita à mão e o alarme, um objeto montado no front. Hoje a
         * `FIC-107` é malha do catálogo, a queda é um cenário do simulador e o
         * alarme de `L` sobe como o de qualquer outra — então a pendência da
         * passagem só aparece quando a queda realmente aconteceu.
         */
        const akd = values.values.find((v) => v.tag === AKD_TAG) ?? null;
        const akdAlarm =
          data.alarms.alarms.find(
            (alarm) => alarm.tag === AKD_TAG && alarm.limit === 'L' && isStanding(alarm),
          ) ?? null;

        const events = timelineEvents({
          window,
          now,
          breaks: data.breaks.webBreaks,
          grades: data.grades.gradeChanges,
          setpoints: data.setpoints.changes,
          alarms: data.alarms.alarms,
          fixedAlarms: data.fixed.alarms,
          holds: data.holds.holds,
        });

        const pv = new Map<string, number>([
          ...values.values.map((v) => [v.tag, v.value] as const),
          ...data.fixed.values.map((v) => [v.tag, v.value] as const),
        ]);

        const until = Math.min(now, shiftWin.to);
        const elapsedMin = (until - shiftWin.from) / 60_000;
        const breakMinutes =
          shiftBreaks.reduce((total, item) => total + breakMs(item, now), 0) / 60_000;

        const items = handoverItems({
          handover: shift.handover,
          holds: data.holds.holds,
          akd:
            akd && akdAlarm
              ? {
                  since: akdAlarm.raisedAt,
                  value: akd.value,
                  // a rota de lista não traz setpoint; o alvo do catálogo é o que a malha persegue
                  sp: akd.setpoint ?? processVariable(AKD_TAG)?.target ?? null,
                }
              : null,
          notes: data.notes.notes
            .filter((note) => note.status !== 'encerrada' && note.priority <= 2)
            .slice(0, 3),
          round: detail.rounds[0] ?? null,
          onOpenNote,
          onOpenTag,
        });

        return (
          <div className="flex flex-col gap-4">
            <Timeline
              window={window}
              now={now}
              mode={mode}
              onMode={onMode}
              unavailable={gateway.kind === 'demo' ? ['24h', '3turnos'] : []}
              speed={speedSeries}
              speedScale={{
                min: speedVar?.min ?? 1200,
                max: speedVar?.max ?? 1300,
                target: speedVar?.target ?? null,
              }}
              prod={prodWin}
              reels={data.reels.reels}
              holds={data.holds.holds}
              events={events}
              onOpenReel={onSelectReel}
              onOpenTag={onOpenTag}
              onOpenBreak={onOpenBreak}
            />
            <div className="grid h-88 grid-cols-3 gap-4">
              <Scoreboard
                prod={prodShift}
                efficiencyPct={shift.efficiencyPct}
                breaks={shiftBreaks.length}
                breakMinutes={breakMinutes}
                scrap={scrap(shiftReels, shiftBreaks, prodSeries, prodShift.nowT, now)}
                elapsedMin={elapsedMin}
                totalMin={(shiftWin.to - shiftWin.from) / 60_000}
                until={hhmm(new Date(until).toISOString())}
              />
              <ActiveAlarms
                alarms={standingAlarms(data.alarms.alarms, data.fixed.alarms)}
                values={pv}
                now={now}
                onOpen={onOpenTag}
              />
              <Handover items={items} deliverAt={hhmm(new Date(shiftWin.to).toISOString())} />
            </div>
          </div>
        );
      }}
    </ResourceState>
  );
}
