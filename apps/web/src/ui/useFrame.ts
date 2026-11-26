import { useCallback, useEffect, useMemo, useRef } from 'react';
import { processVariable } from '@mp1/shared';

import type { DataGateway } from '../api/gateway';
import type { ShiftView } from '../api/process';
import { clockTime, hourWindow, tagValue, weekdayDate } from './format';
import { alarmCounts, sectionStates, type SectionState } from './sections';
import type { FrameTop } from './Shell';
import { useResource } from './useResource';
import type { Live } from './useStream';

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
 *
 * ## O que o stream acrescenta
 *
 * A busca dá o estado inicial das 320 tags; o stream dá o que mudou, de dois em
 * dois segundos. Gramatura, Velocidade e o relógio vêm do stream quando ele
 * está de pé, e da busca enquanto nenhum evento chegou — é a mesma informação
 * por dois caminhos, e o mais recente ganha.
 *
 * O contador de alarmes **não** vem do stream: o quadro traz quantos pedem
 * ação, que é um número só, e a barra mostra três — um por prioridade. Quando o
 * stream diz que esse total mudou, a moldura rebusca `/alarms`, que é a rota
 * que sabe separar por prioridade. Assim o contador acompanha sem o stream ter
 * de carregar a lista inteira a cada evento.
 */
export function useFrame(
  gateway: DataGateway | null,
  live: Live,
): {
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
   * O stream avisa, a rota de alarmes responde.
   *
   * `alarmsNeedingAction` é o gatilho, não o dado: ele muda quando sobe ou cai
   * um alarme que pede ação, e é nesse momento que vale rebuscar a lista por
   * prioridade. Sem isto, a barra de alarmes ficaria no retrato da carga mesmo
   * com o resto da moldura correndo.
   */
  const needingAction = live.frame?.alarmsNeedingAction ?? null;
  const reloadAlarms = alarms.reload;
  const seenRef = useRef<number | null>(null);
  useEffect(() => {
    if (needingAction === null) return;
    if (seenRef.current === null) {
      seenRef.current = needingAction;
      return;
    }
    if (seenRef.current === needingAction) return;
    seenRef.current = needingAction;
    reloadAlarms();
  }, [needingAction, reloadAlarms]);

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

    /** O valor de uma tag agora: o do stream, se já mudou; senão o da busca. */
    const valueOf = (tag: string): number | null => {
      const streamed = live.values.get(tag);
      if (streamed !== undefined) return streamed;
      return byTag.get(tag)?.value ?? null;
    };

    const gsmUnit = byTag.get(GSM_TAG)?.unit ?? 'g/m²';
    const speedUnit = byTag.get(SPEED_TAG)?.unit ?? 'm/min';
    const gsmValue = valueOf(GSM_TAG);
    const speedValue = valueOf(SPEED_TAG);
    const speedVar = processVariable(SPEED_TAG);
    const current = currentShift(shifts.data?.shifts ?? []);
    const standing = alarms.data?.alarms ?? [];
    // o instante do último evento; sem stream, o da busca
    const ts = live.frame?.ts ?? values.data?.ts ?? null;

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
      gramatura: gsmValue === null ? null : { text: tagValue(gsmValue, 'g/m²'), unit: gsmUnit },
      speed:
        speedValue !== null && speedVar
          ? {
              text: tagValue(speedValue, speedUnit),
              unit: speedUnit,
              value: speedValue,
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
  }, [values.data, alarms.data, shifts.data, suggestions.data, live.values, live.frame]);
}

/** O turno em curso, ou o mais recente se nenhum estiver aberto. */
function currentShift(shifts: readonly ShiftView[]): ShiftView | null {
  const open = shifts.find((shift) => shift.endedAt === null);
  if (open) return open;
  return [...shifts].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))[0] ?? null;
}
