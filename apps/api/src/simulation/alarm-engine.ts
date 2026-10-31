import {
  ALARM_LIMITS,
  alarmPriority,
  alarmThreshold,
  alarmsInFloodWindow,
  hasCrossedLimit,
  hasReturnedToNormal,
  isShelved,
  nextAlarmState,
  PROCESS_CATALOG,
  type Alarm,
  type AlarmLimitLevel,
} from '@mp1/shared';

/**
 * O motor de alarmes, no modelo da ISA-18.2.
 *
 * Ele percorre os pares (tag, limite) que o catálogo declara e mantém, para
 * cada um, no máximo **um alarme aberto**. É o detalhe que decide se a lista de
 * alarmes serve ou não: sem isso, uma variável oscilando em cima do limite
 * geraria um alarme novo por passo e a lista encheria de linhas iguais —
 * exatamente a inundação que a norma quer evitar.
 *
 * ## O que o engavetamento suprime
 *
 * Um alarme engavetado continua sendo **detectado**: o estado dele acompanha o
 * processo, o pico continua sendo registrado, e quando o valor volta ele
 * normaliza. O que a gaveta suprime é o anúncio — a presença dele na fila de
 * quem está no painel. A ISA-18.2 é explícita nisso, e a diferença importa: um
 * engavetamento que parasse a detecção perderia o que aconteceu enquanto a
 * gaveta estava fechada, que é justamente o que alguém vai querer saber depois.
 *
 * ## O pico tem direção
 *
 * O "pior valor desde o disparo" é o **máximo** num alarme de `H`/`HH` e o
 * **mínimo** num de `L`/`LL`. Guardar sempre o máximo faria um alarme de falta
 * de óleo registrar como pior momento o instante em que a vazão estava mais
 * alta.
 */

/** Um par monitorado: a tag, o limite e o valor dele no catálogo. */
export interface MonitoredLimit {
  readonly tag: string;
  readonly limit: AlarmLimitLevel;
  readonly threshold: number;
  /** `true` em `LL` e `L`: o alarme dispara quando o valor **cai**. */
  readonly low: boolean;
}

/**
 * Todos os pares (tag, limite) que o catálogo declara.
 *
 * Montado uma vez na carga, porque é percorrido a cada varredura: com as tags
 * por cilindro expandidas, são centenas de pares, e recalcular a lista por
 * passo seria o gasto dominante de uma retomada de um dia.
 */
function build(): MonitoredLimit[] {
  const monitored: MonitoredLimit[] = [];

  for (const variable of PROCESS_CATALOG) {
    for (const limit of ALARM_LIMITS) {
      const threshold = alarmThreshold(variable.tag, limit);
      if (threshold === null) continue;

      monitored.push({
        tag: variable.tag,
        limit,
        threshold,
        low: limit === 'LL' || limit === 'L',
      });
    }
  }

  return monitored;
}

export const MONITORED_LIMITS: readonly MonitoredLimit[] = Object.freeze(build());

/** O id de um alarme: determinístico, do instante e do par. */
export function alarmId(at: Date, tag: string, limit: AlarmLimitLevel): string {
  return `AL-${String(Math.floor(at.getTime() / 1000))}-${tag}-${limit}`;
}

export interface AlarmScan {
  /** Alarmes que dispararam nesta varredura. */
  readonly raised: readonly Alarm[];
  /** Alarmes que normalizaram nesta varredura. */
  readonly cleared: readonly Alarm[];
  /** Alarmes cujo pico piorou — mudaram, sem trocar de estado. */
  readonly updated: readonly Alarm[];
}

export interface AlarmEngine {
  /**
   * Varre os valores e atualiza os alarmes.
   *
   * Devolve só o que mudou, e não a lista inteira: quem grava no banco precisa
   * saber o que escrever, e numa máquina em regime a resposta é "nada".
   */
  scan(values: ReadonlyMap<string, number>, at: Date): AlarmScan;

  /** Todos os alarmes que o motor conhece, abertos ou normalizados. */
  all(): Alarm[];
  /** Os que ainda pedem ação de alguém e não estão engavetados. */
  annunciated(at: Date): Alarm[];
  find(id: string): Alarm | null;

  acknowledge(id: string, by: string, at: Date): Alarm | null;
  shelve(id: string, by: string, until: Date): Alarm | null;
  unshelve(id: string): Alarm | null;

  /** Quantos dispararam na janela de inundação que termina em `at`. */
  floodCount(at: Date): number;
}

/** A chave de um par monitorado, para achar o alarme aberto dele. */
const keyOf = (tag: string, limit: AlarmLimitLevel): string => `${tag}|${limit}`;

/**
 * Monta o motor, opcionalmente retomando alarmes já gravados.
 *
 * A retomada importa: a API dorme, acorda e precisa saber que o alarme da
 * `PDIC-524` já estava aberto e já havia sido reconhecido. Sem isso, cada
 * arranque geraria um alarme novo para a mesma condição e a lista contaria a
 * mesma coisa várias vezes.
 */
export function alarmEngine(initial: readonly Alarm[] = []): AlarmEngine {
  const byId = new Map<string, Alarm>(initial.map((alarm) => [alarm.id, alarm]));

  /** O alarme aberto de cada par — o que ainda não normalizou. */
  const open = new Map<string, string>();
  for (const alarm of initial) {
    if (alarm.state !== 'normalizado') open.set(keyOf(alarm.tag, alarm.limit), alarm.id);
  }

  function worse(limit: MonitoredLimit, current: number, candidate: number): number {
    return limit.low ? Math.min(current, candidate) : Math.max(current, candidate);
  }

  return {
    scan(values: ReadonlyMap<string, number>, at: Date): AlarmScan {
      const raised: Alarm[] = [];
      const cleared: Alarm[] = [];
      const updated: Alarm[] = [];
      const stamp = at.toISOString();

      for (const limit of MONITORED_LIMITS) {
        const value = values.get(limit.tag);
        if (value === undefined || !Number.isFinite(value)) continue;

        const key = keyOf(limit.tag, limit.limit);
        const openId = open.get(key);

        if (openId === undefined) {
          if (!hasCrossedLimit(limit.tag, limit.limit, value)) continue;

          const alarm: Alarm = {
            id: alarmId(at, limit.tag, limit.limit),
            tag: limit.tag,
            limit: limit.limit,
            threshold: limit.threshold,
            priority: alarmPriority(limit.tag, limit.limit),
            state: 'ativo',
            raisedAt: stamp,
            peakValue: value,
            acknowledgedAt: null,
            acknowledgedBy: null,
            clearedAt: null,
            shelvedUntil: null,
            shelvedBy: null,
          };

          byId.set(alarm.id, alarm);
          open.set(key, alarm.id);
          raised.push(alarm);
          continue;
        }

        const current = byId.get(openId);
        if (!current) {
          // o alarme aberto sumiu do mapa: estado inconsistente, melhor soltar
          // o par do que arrastar um id morto
          open.delete(key);
          continue;
        }

        if (hasReturnedToNormal(limit.tag, limit.limit, value)) {
          const next: Alarm = {
            ...current,
            state: nextAlarmState(current.state, 'normalizar'),
            clearedAt: stamp,
          };
          byId.set(next.id, next);
          open.delete(key);
          cleared.push(next);
          continue;
        }

        const peak = worse(limit, current.peakValue, value);
        if (peak !== current.peakValue) {
          const next: Alarm = { ...current, peakValue: peak };
          byId.set(next.id, next);
          updated.push(next);
        }
      }

      return { raised, cleared, updated };
    },

    all(): Alarm[] {
      return [...byId.values()].sort((a, b) => b.raisedAt.localeCompare(a.raisedAt));
    },

    annunciated(at: Date): Alarm[] {
      return this.all().filter(
        (alarm) =>
          !isShelved(alarm, at) && (alarm.acknowledgedAt === null || alarm.state === 'ativo'),
      );
    },

    find(id: string): Alarm | null {
      return byId.get(id) ?? null;
    },

    acknowledge(id: string, by: string, at: Date): Alarm | null {
      const alarm = byId.get(id);
      if (!alarm || alarm.acknowledgedAt !== null) return null;

      const next: Alarm = {
        ...alarm,
        state: nextAlarmState(alarm.state, 'reconhecer'),
        acknowledgedAt: at.toISOString(),
        acknowledgedBy: by,
      };
      byId.set(id, next);
      return next;
    },

    shelve(id: string, by: string, until: Date): Alarm | null {
      const alarm = byId.get(id);
      if (!alarm) return null;

      const next: Alarm = { ...alarm, shelvedUntil: until.toISOString(), shelvedBy: by };
      byId.set(id, next);
      return next;
    },

    unshelve(id: string): Alarm | null {
      const alarm = byId.get(id);
      if (!alarm) return null;

      const next: Alarm = { ...alarm, shelvedUntil: null, shelvedBy: null };
      byId.set(id, next);
      return next;
    },

    floodCount(at: Date): number {
      return alarmsInFloodWindow(this.all(), at).length;
    },
  };
}
