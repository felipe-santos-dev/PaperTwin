/**
 * Formatação em português do Brasil, num lugar só.
 *
 * Vírgula decimal e ponto de milhar não são preferência: são o que quem opera a
 * máquina lê. "75.1" num painel brasileiro é lido como setenta e cinco mil, e um
 * número de gramatura lido errado por mil é pior que número nenhum.
 *
 * O `Intl` faz isso, mas cada chamada com opções diferentes dá um resultado
 * diferente — e três telas mostrando a mesma gramatura com uma, duas e três
 * casas é o tipo de inconsistência que faz parecer que os números vêm de
 * lugares diferentes. Então o número de casas é decidido aqui, por tipo de
 * grandeza.
 */

const LOCALE = 'pt-BR';

const cache = new Map<string, Intl.NumberFormat>();

function formatter(digits: number): Intl.NumberFormat {
  const key = String(digits);
  const found = cache.get(key);
  if (found) return found;

  const made = new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  cache.set(key, made);
  return made;
}

/** Um número com casas fixas. `null` vira travessão, nunca zero. */
export function num(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return formatter(digits).format(value);
}

/** Um inteiro com ponto de milhar. */
export function int(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return formatter(0).format(Math.round(value));
}

/**
 * O valor de uma tag com as casas que a grandeza pede.
 *
 * As casas saem da unidade porque é ela que diz a escala: pressão em kPa não
 * precisa de decimal, umidade em % precisa de duas, e espessura em µm de uma.
 * Mostrar 230,0000 kPa não informa mais — informa menos, porque esconde o que
 * importa atrás de zeros.
 */
export function tagValue(value: number | null | undefined, unit: string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';

  const digits = DIGITS_BY_UNIT[unit] ?? (Math.abs(value) >= 100 ? 0 : 2);
  return formatter(digits).format(value);
}

const DIGITS_BY_UNIT: Readonly<Record<string, number>> = {
  'kPa rel': 0,
  kPa: 0,
  'm/min': 0,
  'm³/h': 0,
  'kg/t': 0,
  'g/t': 0,
  'kWh/t': 0,
  'N/m': 0,
  'kN/m': 0,
  µm: 1,
  '°C': 1,
  'g/m²': 2,
  '%': 2,
  'mm/s': 2,
  gE: 2,
  bar: 2,
  'mPa·s': 0,
  'L/min': 2,
  'mg/L': 0,
  mm: 0,
  't/h': 1,
  m: 1,
  'adim.': 3,
  '% ISO': 2,
  's/100mL': 0,
  'mL/min': 0,
};

/** `HH:MM` no fuso de quem está olhando. */
export function hhmm(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';

  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** `DD/MM · HH:MM`, que é como o protótipo escreve o instante no cabeçalho. */
export function dayTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month} · ${hhmm(iso)}`;
}

/** Uma duração em segundos como `22 min` ou `1 h 05`. */
export function duration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '—';
  if (seconds < 60) return `${String(Math.round(seconds))} s`;

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${String(minutes)} min`;

  const hours = Math.floor(minutes / 60);
  return `${String(hours)} h ${String(minutes % 60).padStart(2, '0')}`;
}

/**
 * O intervalo entre dois instantes, em texto curto.
 *
 * `null` no fim significa "ainda está acontecendo", e aí a resposta é "em
 * andamento" — não a duração até agora, que mudaria a cada render e daria a
 * impressão de um cronômetro que a tela não tem.
 */
export function span(from: string, to: string | null): string {
  if (to === null) return 'em andamento';
  return duration((Date.parse(to) - Date.parse(from)) / 1000);
}
