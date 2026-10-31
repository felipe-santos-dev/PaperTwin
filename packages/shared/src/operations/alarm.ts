import { processVariable } from '../process/catalog';
import type { ProcessVariable } from '../process/types';
import { SHIFT_HOURS } from './shift';
import type { ProvenanceNote } from './provenance';

/**
 * O alarme, no vocabulário da ISA-18.2.
 *
 * Da LISTA-BASE: TAG, limite, prioridade, ativo / reconhecido / normalizado e
 * horários.
 *
 * Um alarme não é um limite estourado: é um limite estourado que alguém precisa
 * ver, reconhecer e ver voltar. Por isso a entidade tem três horários e não um
 * — `raisedAt`, `acknowledgedAt`, `clearedAt` — e por isso o estado
 * `normalizado` existe separado de "sumiu": um alarme que normalizou sem ter
 * sido reconhecido continua na lista, porque ninguém soube que ele aconteceu.
 */

/** Qual dos quatro limites do catálogo disparou. */
export const ALARM_LIMITS = ['LL', 'L', 'H', 'HH'] as const;

export type AlarmLimitLevel = (typeof ALARM_LIMITS)[number];

/**
 * Prioridade do alarme.
 *
 * Os quatro nomes são **suposição nossa**. A ISA-18.2 exige que haja prioridade
 * e que a distribuição seja desequilibrada — poucos alarmes críticos, muitos de
 * prioridade baixa — mas não fixa os nomes. O catálogo usa "alta" e "crítico"
 * em prosa nas observações, e é de lá que vêm estes dois.
 */
export const ALARM_PRIORITIES = ['baixa', 'média', 'alta', 'crítica'] as const;

export type AlarmPriority = (typeof ALARM_PRIORITIES)[number];

/**
 * Estado do alarme, como a LISTA-BASE o escreve.
 *
 * A ISA-18.2 tem um modelo maior, com estados separados para "normalizou mas
 * não foi reconhecido" e com o engavetamento (*shelving*) como estado próprio.
 * Aqui ficam os três que a lista pede, e o engavetamento fica num campo
 * separado — `shelvedUntil` — e não como quarto estado.
 *
 * O motivo é prático: um alarme pode ser engavetado **enquanto está ativo**, e
 * quando a gaveta vence ele tem de voltar ao estado em que estava. Com o
 * engavetamento como estado, esse estado anterior se perderia e o alarme
 * voltaria como novo, pedindo reconhecimento de algo que já havia sido
 * reconhecido.
 */
export const ALARM_STATES = ['ativo', 'reconhecido', 'normalizado'] as const;

export type AlarmState = (typeof ALARM_STATES)[number];

/**
 * Inundação de alarmes: mais de 10 em 10 minutos.
 *
 * Da ISA-18.2, que chama de inundação a taxa acima de 10 alarmes por 10 min por
 * operador — acima disso ninguém consegue tratar o que chega, e a lista deixa de
 * informar. O gêmeo conta a taxa para poder dizer isso na tela, em vez de só
 * empilhar linhas.
 */
export const ALARM_FLOOD_WINDOW_S = 600;
export const ALARM_FLOOD_THRESHOLD = 10;

/**
 * Banda morta do alarme, como fração da faixa de operação.
 *
 * **Suposição.** A ISA-18.2 manda ter banda morta para o alarme não tremer
 * quando o valor fica oscilando em cima do limite, mas o número é de projeto e
 * o catálogo não o dá — ele dá `excDev` e `compDev`, que são do histórico e não
 * do alarme. 1 % da faixa é conservador: suficiente para o ruído da simulação
 * não gerar enxurrada, pequeno o bastante para não atrasar um alarme de
 * verdade.
 *
 * A banda morta é assimétrica de propósito: ela só atua na **volta**. O alarme
 * dispara no limite exato e normaliza 1 % depois dele, para dentro da faixa.
 * Simétrica, ela atrasaria o disparo — e um alarme que chega tarde é pior que
 * um alarme que insiste.
 */
export const ALARM_DEADBAND_FRACTION = 0.01;

/**
 * Teto do engavetamento: um turno.
 *
 * **Suposição.** A ISA-18.2 pede que o engavetamento tenha prazo e seja
 * revisto, sem fixar quanto. Um turno é o limite natural: uma gaveta que
 * sobrevive à troca de turno esconde o alarme de quem assume sem ter estado na
 * conversa que o engavetou.
 */
export const MAX_SHELVE_HOURS = SHIFT_HOURS;

/**
 * Prioridade por limite, quando o catálogo não diz outra coisa.
 *
 * **Suposição.** `LL` e `HH` são os limites de ação — passou deles, algo precisa
 * acontecer agora. `L` e `H` são de atenção.
 */
const PRIORITY_BY_LIMIT: Readonly<Record<AlarmLimitLevel, AlarmPriority>> = {
  LL: 'alta',
  L: 'média',
  H: 'média',
  HH: 'alta',
};

/**
 * As prioridades que o próprio catálogo nomeia, na coluna de observação.
 *
 * Fonte `B`: estão escritas na pesquisa, em prosa. Ficam numa tabela em vez de
 * serem extraídas por expressão regular da observação — seis linhas não
 * justificam um analisador, e um analisador erraria quieto quando a prosa
 * mudasse.
 */
const PRIORITY_OVERRIDES: readonly {
  readonly tag: string;
  readonly limit: AlarmLimitLevel;
  readonly priority: AlarmPriority;
  readonly why: string;
}[] = [
  { tag: 'PDIC-521', limit: 'LL', priority: 'alta', why: 'alagamento dos sifões' },
  { tag: 'PDIC-522', limit: 'LL', priority: 'alta', why: 'alagamento dos sifões' },
  { tag: 'PDIC-523', limit: 'LL', priority: 'alta', why: 'alagamento dos sifões' },
  { tag: 'PDIC-524', limit: 'LL', priority: 'alta', why: 'alagamento dos sifões' },
  { tag: 'PDIC-721', limit: 'LL', priority: 'alta', why: 'alagamento dos sifões' },
  { tag: 'PDIC-722', limit: 'LL', priority: 'alta', why: 'alagamento dos sifões' },
  { tag: 'LIC-531', limit: 'HH', priority: 'alta', why: 'tanque separador cheio' },
  { tag: 'LIC-532', limit: 'HH', priority: 'alta', why: 'tanque separador cheio' },
  { tag: 'LIC-533', limit: 'HH', priority: 'alta', why: 'tanque separador cheio' },
  { tag: 'LIC-534', limit: 'HH', priority: 'alta', why: 'tanque separador cheio' },
  { tag: 'TI-804', limit: 'HH', priority: 'crítica', why: 'abertura imediata do nip a 92 °C' },
  { tag: 'FIC-1105', limit: 'LL', priority: 'crítica', why: 'falta de óleo no mancal' },
  { tag: 'AIC-506', limit: 'HH', priority: 'alta', why: 'condensação e gotejamento na capota' },
  { tag: 'AIC-1102', limit: 'HH', priority: 'alta', why: 'troca para água fresca nos chuveiros' },
];

/** A prioridade de um par (tag, limite). */
export function alarmPriority(tag: string, limit: AlarmLimitLevel): AlarmPriority {
  const override = PRIORITY_OVERRIDES.find((item) => item.tag === tag && item.limit === limit);
  return override?.priority ?? PRIORITY_BY_LIMIT[limit];
}

/** Se a prioridade deste par está nomeada na pesquisa ou é da regra padrão. */
export function alarmPrioritySource(tag: string, limit: AlarmLimitLevel): ProvenanceNote {
  const override = PRIORITY_OVERRIDES.find((item) => item.tag === tag && item.limit === limit);

  return override
    ? { source: 'B', note: `A pesquisa nomeia esta prioridade: ${override.why}.` }
    : {
        source: 'assumed',
        note: 'Pela regra padrão: LL e HH são limites de ação, L e H são de atenção.',
      };
}

/** O valor do limite de uma tag no catálogo; `null` quando ela não tem esse nível. */
export function alarmThreshold(tag: string, limit: AlarmLimitLevel): number | null {
  const variable = processVariable(tag);
  if (!variable) return null;

  const key = limit.toLowerCase() as keyof ProcessVariable['limits'];
  return variable.limits[key];
}

/**
 * A banda morta de uma tag, na unidade dela.
 *
 * `null` quando a tag não existe. Zero é possível e significa sem banda morta,
 * o que só acontece se a faixa de operação for degenerada.
 */
export function alarmDeadband(tag: string): number | null {
  const variable = processVariable(tag);
  if (!variable) return null;
  return (variable.max - variable.min) * ALARM_DEADBAND_FRACTION;
}

/**
 * Se o valor voltou o suficiente para o alarme normalizar.
 *
 * `LL` e `L` disparam por baixo, então normalizam quando o valor sobe acima do
 * limite **mais** a banda morta; `H` e `HH` ao contrário.
 */
export function hasReturnedToNormal(tag: string, limit: AlarmLimitLevel, value: number): boolean {
  const threshold = alarmThreshold(tag, limit);
  const deadband = alarmDeadband(tag);
  if (threshold === null || deadband === null) return false;

  return limit === 'LL' || limit === 'L'
    ? value > threshold + deadband
    : value < threshold - deadband;
}

/** Se o valor estourou o limite. O disparo é no limite exato, sem banda morta. */
export function hasCrossedLimit(tag: string, limit: AlarmLimitLevel, value: number): boolean {
  const threshold = alarmThreshold(tag, limit);
  if (threshold === null) return false;

  return limit === 'LL' || limit === 'L' ? value <= threshold : value >= threshold;
}

/** Um alarme, com a sua história. */
export interface Alarm {
  /** Id determinístico: `AL-<instante em segundos>-<tag>-<limite>`. */
  readonly id: string;
  readonly tag: string;
  readonly limit: AlarmLimitLevel;
  /** Valor do limite no momento do disparo, copiado do catálogo. */
  readonly threshold: number;
  readonly priority: AlarmPriority;
  readonly state: AlarmState;
  /** Quando estourou. */
  readonly raisedAt: string;
  /** Pior valor atingido desde o disparo. */
  readonly peakValue: number;
  /** `null` enquanto ninguém reconheceu. */
  readonly acknowledgedAt: string | null;
  readonly acknowledgedBy: string | null;
  /** `null` enquanto o valor não voltou. */
  readonly clearedAt: string | null;
  /** Até quando está engavetado; `null` quando não está. */
  readonly shelvedUntil: string | null;
  readonly shelvedBy: string | null;
}

/** Se o alarme está engavetado num instante. */
export function isShelved(alarm: Alarm, at: Date): boolean {
  return alarm.shelvedUntil !== null && Date.parse(alarm.shelvedUntil) > at.getTime();
}

/**
 * Se o alarme ainda pede ação de alguém.
 *
 * Um alarme normalizado e reconhecido saiu da lista. Um normalizado e **não**
 * reconhecido continua: ele aconteceu, voltou sozinho, e ninguém ficou sabendo
 * — que é justamente o caso que a ISA-18.2 quer que apareça.
 */
export function needsOperatorAction(alarm: Alarm): boolean {
  return alarm.acknowledgedAt === null || alarm.state === 'ativo';
}

/**
 * O estado para onde o alarme vai.
 *
 * As transições válidas são poucas e vale escrevê-las num lugar só: reconhecer
 * um alarme ativo o leva a `reconhecido`; o valor voltar o leva a
 * `normalizado`, reconhecido ou não. Reconhecer um alarme já normalizado o
 * mantém normalizado — o que muda é `acknowledgedAt`, e é por isso que o estado
 * sozinho nunca basta para saber se o alarme saiu da lista.
 */
export type AlarmTransition = 'reconhecer' | 'normalizar' | 'reativar';

export function nextAlarmState(current: AlarmState, transition: AlarmTransition): AlarmState {
  switch (transition) {
    case 'reconhecer':
      return current === 'ativo' ? 'reconhecido' : current;
    case 'normalizar':
      return 'normalizado';
    case 'reativar':
      return 'ativo';
  }
}

/** Quantos alarmes dispararam na janela de inundação que termina em `at`. */
export function alarmsInFloodWindow(alarms: readonly Alarm[], at: Date): Alarm[] {
  const from = at.getTime() - ALARM_FLOOD_WINDOW_S * 1000;

  return alarms.filter((alarm) => {
    const raised = Date.parse(alarm.raisedAt);
    return raised > from && raised <= at.getTime();
  });
}

/** Se a taxa de alarmes passou do que a ISA-18.2 considera tratável. */
export function isAlarmFlood(alarms: readonly Alarm[], at: Date): boolean {
  return alarmsInFloodWindow(alarms, at).length > ALARM_FLOOD_THRESHOLD;
}

export const ALARM_PROVENANCE: ProvenanceNote = {
  source: 'ISA-18.2',
  note:
    'Estados, prioridade e horários da LISTA-BASE; a taxa de inundação (10 por 10 min) e a ' +
    'exigência de banda morta e de prazo no engavetamento são da ISA-18.2. Os nomes das quatro ' +
    'prioridades, a fração da banda morta (1 % da faixa) e o teto de um turno para a gaveta são ' +
    'suposição nossa.',
};
