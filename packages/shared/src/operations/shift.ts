/**
 * O turno — a moldura de tempo em que tudo o mais acontece.
 *
 * Bobina, quebra, ronda e nota pertencem a um turno, e é por turno que a
 * produção é fechada. A entidade sai da seção "Entidades de operação" da
 * LISTA-BASE: letra, início, fim, operador responsável, produção, eficiência e
 * passagem.
 *
 * O **quadro de turnos é suposição nossa**: três turnos de 8 h começando às
 * 06:00, com as letras A, B e C. A pesquisa B não dá a escala da MP1, e uma
 * quarta letra exigiria a regra de rotação das equipes, que também não temos.
 * Inventar a rotação daria um calendário com cara de verdadeiro.
 */

/** Letras do quadro de turnos. **Suposição**: três turnos de 8 h. */
export const SHIFT_LETTERS = ['A', 'B', 'C'] as const;

export type ShiftLetter = (typeof SHIFT_LETTERS)[number];

/** Duração de um turno, em horas. **Suposição**. */
export const SHIFT_HOURS = 8;

/** Hora local em que o turno A começa. **Suposição**. */
export const FIRST_SHIFT_START_HOUR = 6;

/**
 * Fuso da planta, em horas em relação ao UTC.
 *
 * O Brasil não tem horário de verão desde 2019, então um deslocamento fixo
 * basta e mantém a simulação determinística — uma biblioteca de fuso traria
 * regras que mudam com a versão dos dados, e o mesmo instante passaria a cair
 * em turnos diferentes conforme a versão instalada.
 */
export const PLANT_UTC_OFFSET_HOURS = -3;

/** Um turno de operação. */
export interface Shift {
  /** Id determinístico: `T-2026-10-31-A`. */
  readonly id: string;
  readonly letter: ShiftLetter;
  /** Início, em ISO 8601 com deslocamento. */
  readonly startedAt: string;
  /** Fim; `null` enquanto o turno está em andamento. */
  readonly endedAt: string | null;
  readonly operator: string;
  /** Produção do turno, em toneladas. */
  readonly productionT: number;
  /**
   * Eficiência do turno, em %: produção realizada sobre a possível.
   *
   * A possível é a nominal da máquina no tempo do turno — 45 t/h, da lista
   * base. Quebra de folha e troca de gramatura é o que a derruba.
   */
  readonly efficiencyPct: number;
  /** A passagem para o turno seguinte: pendências, uma por linha. */
  readonly handover: readonly string[];
}

/** O dia de operação (`2026-10-31`) e a letra formam o id do turno. */
export function shiftId(operationDate: string, letter: ShiftLetter): string {
  return `T-${operationDate}-${letter}`;
}

/** O deslocamento do fuso da planta, como sufixo ISO: `-03:00`. */
export function plantOffsetSuffix(): string {
  const sign = PLANT_UTC_OFFSET_HOURS < 0 ? '-' : '+';
  const hours = String(Math.abs(PLANT_UTC_OFFSET_HOURS)).padStart(2, '0');
  return `${sign}${hours}:00`;
}

/** Instante em milissegundos a partir de uma hora local da planta. */
function plantTime(ms: number): number {
  return ms + PLANT_UTC_OFFSET_HOURS * 3_600_000;
}

/**
 * Qual turno está correndo num instante, e quando ele começou.
 *
 * A conta é feita sobre a hora local da planta, deslocada do UTC, porque a
 * borda do turno é um horário de parede: 06:00 em São Paulo, não 09:00 UTC.
 *
 * O dia de operação é o dia em que o turno **começou**, e não o dia do
 * calendário em que o instante caiu. O turno C vai das 22:00 às 06:00 do dia
 * seguinte, então às 02:00 de 1º de novembro quem está na máquina é o turno C
 * de 31 de outubro — e é nesse turno que a bobina enrolada às 02:00 entra.
 */
export interface ShiftWindow {
  readonly id: string;
  readonly letter: ShiftLetter;
  /** Dia de operação, `AAAA-MM-DD`, no fuso da planta. */
  readonly operationDate: string;
  readonly startedAt: string;
  readonly endedAt: string;
}

export function shiftWindowAt(instant: Date): ShiftWindow {
  const local = new Date(plantTime(instant.getTime()));

  const hoursSinceFirstStart =
    ((local.getUTCHours() - FIRST_SHIFT_START_HOUR + 24) % 24) +
    local.getUTCMinutes() / 60 +
    local.getUTCSeconds() / 3600 +
    local.getUTCMilliseconds() / 3_600_000;

  const index = Math.floor(hoursSinceFirstStart / SHIFT_HOURS);
  const letter = SHIFT_LETTERS[index];
  if (!letter) {
    throw new Error(
      `O quadro de ${String(SHIFT_LETTERS.length)} turnos de ${String(SHIFT_HOURS)} h não cobre ` +
        'as 24 h do dia. Mudar um dos dois exige mudar o outro.',
    );
  }

  const startedMs = local.getTime() - hoursSinceFirstStart * 3_600_000;
  const started = new Date(startedMs);
  const operationDate = started.toISOString().slice(0, 10);
  const offset = plantOffsetSuffix();

  const localIso = (ms: number): string => `${new Date(ms).toISOString().slice(0, 19)}${offset}`;

  return {
    id: shiftId(operationDate, letter),
    letter,
    operationDate,
    startedAt: localIso(startedMs + index * SHIFT_HOURS * 3_600_000),
    endedAt: localIso(startedMs + (index + 1) * SHIFT_HOURS * 3_600_000),
  };
}
