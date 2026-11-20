import { useCallback, useMemo } from 'react';
import { processVariable } from '@mp1/shared';

import type { DataGateway } from '../api/gateway';
import type { ShiftView } from '../api/process';
import { clockTime, hourWindow, tagValue, weekdayDate } from './format';
import { alarmCounts, sectionStates, type SectionState } from './sections';
import type { FrameTop } from './Shell';
import { useResource } from './useResource';

/** A gramatura da barra superior: a do QCS, que é a que o operador acompanha. */
const GSM_TAG = 'AIC-902';
const SPEED_TAG = 'SIC-1104';

/** Duração de um turno, para mostrar o fim previsto do turno em curso. */
const SHIFT_MS = 8 * 60 * 60 * 1000;

/**
 * Os dados da moldura: barra superior e faixa do processo.
 *
 * Três buscas — valores, alarmes e o último turno — e não uma por bloco, porque
 * a moldura aparece em todas as telas. O relógio é o instante da leitura que a
 * API devolveu, e não o relógio da máquina de quem olha: na demonstração ele
 * para no instante do instantâneo, e isso é verdade sobre o dado.
 */
export function useFrame(gateway: DataGateway | null): {
  top: FrameTop;
  sections: SectionState[];
  /** Quantas notas sugeridas esperam decisão — o contador da moldura. */
  suggested: number;
} {
  const enabled = gateway !== null;

  const values = useResource(
    useCallback(
      (signal) => {
        if (!gateway) return Promise.reject(new Error('fonte não escolhida'));
        return gateway.processValues({}, signal);
      },
      [gateway],
    ),
    { enabled },
  );

  const alarms = useResource(
    useCallback(
      (signal) => {
        if (!gateway) return Promise.reject(new Error('fonte não escolhida'));
        return gateway.alarms({}, signal);
      },
      [gateway],
    ),
    { enabled },
  );

  const shifts = useResource(
    useCallback(
      (signal) => {
        if (!gateway) return Promise.reject(new Error('fonte não escolhida'));
        return gateway.shifts({ limit: 3 }, signal);
      },
      [gateway],
    ),
    { enabled },
  );

  /**
   * As sugestões em pé, na moldura.
   *
   * É a quarta busca da moldura, e ela está aqui pelo mesmo motivo das outras
   * três: o contador aparece em todas as telas. A nota sugerida não serve para
   * nada se só quem abre Mancais souber que ela existe.
   */
  const suggestions = useResource(
    useCallback(
      (signal) => {
        if (!gateway) return Promise.reject(new Error('fonte não escolhida'));
        return gateway.noteSuggestions({ status: 'sugerida', limit: 100 }, signal);
      },
      [gateway],
    ),
    { enabled },
  );

  return useMemo(() => {
    const byTag = new Map(values.data?.values.map((item) => [item.tag, item]) ?? []);
    const gsm = byTag.get(GSM_TAG);
    const speed = byTag.get(SPEED_TAG);
    const speedVar = processVariable(SPEED_TAG);
    const current = currentShift(shifts.data?.shifts ?? []);
    const standing = alarms.data?.alarms ?? [];
    const ts = values.data?.ts ?? null;

    const top: FrameTop = {
      shift: current
        ? {
            letter: current.letter,
            window: hourWindow(
              current.startedAt,
              current.endedAt ?? new Date(Date.parse(current.startedAt) + SHIFT_MS).toISOString(),
            ),
            operator: current.operator,
          }
        : null,
      gramatura: gsm ? { text: tagValue(gsm.value, 'g/m²'), unit: gsm.unit } : null,
      speed:
        speed && speedVar
          ? {
              text: tagValue(speed.value, speed.unit),
              unit: speed.unit,
              value: speed.value,
              bar: {
                min: speedVar.min,
                max: speedVar.max,
                l: speedVar.limits.l,
                h: speedVar.limits.h,
                target: speedVar.target,
              },
            }
          : null,
      alarms: alarmCounts(standing),
      clock: ts ? { time: clockTime(ts), date: weekdayDate(ts) } : null,
    };

    return {
      top,
      sections: sectionStates(standing),
      suggested: suggestions.data?.count ?? 0,
    };
  }, [values.data, alarms.data, shifts.data, suggestions.data]);
}

/** O turno em curso, ou o mais recente se nenhum estiver aberto. */
function currentShift(shifts: readonly ShiftView[]): ShiftView | null {
  const open = shifts.find((shift) => shift.endedAt === null);
  if (open) return open;
  return [...shifts].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))[0] ?? null;
}
