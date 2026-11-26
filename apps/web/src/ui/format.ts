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

/**
 * Zero é zero, nunca "−0".
 *
 * `Intl` preserva o sinal do zero: um delta de −0,004 arredondado a duas casas
 * sai como "−0,00", que na tela diz "caiu um pouquinho" quando a conta deu
 * exatamente nada. Arredonda-se **antes** de formatar, na mesma casa em que o
 * número vai aparecer, e o zero resultante perde o sinal.
 */
function rounded(value: number, digits: number): number {
  const factor = 10 ** digits;
  const near = Math.round(value * factor) / factor;
  // `near === 0` é verdade para -0 também, e é isso que apaga o sinal
  return near === 0 ? 0 : near;
}

/** Um número com casas fixas. `null` vira travessão, nunca zero. */
export function num(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return formatter(digits).format(rounded(value, digits));
}

/**
 * O sinal de um número, decidido **depois** do arredondamento.
 *
 * Quem mostra sinal e valor em pedaços separados — porque o sinal tem outra cor
 * ou outro tamanho — não pode tirar o sinal do número cru: um delta de −0,004
 * daria o sinal de "−" e o valor "0,00", e a tela diria "−0,00 %". Nada caiu;
 * a conta deu zero. Arredondando na casa em que o número vai aparecer, o zero
 * fica sem sinal, e o que sobra é "0,00".
 *
 * Devolve `''` para o que arredonda em zero, de propósito: quem concatena ganha
 * o número sem sinal, sem precisar testar nada.
 */
export function signOf(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  const near = rounded(value, digits);
  if (near === 0) return '';
  return near > 0 ? '+' : '−';
}

/** `+1,20`, `−0,30`, `0,00`: o número com sinal, num pedaço só. */
export function signedNum(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${signOf(value, digits)}${num(Math.abs(value), digits)}`;
}

/** O mesmo, em inteiro: `+12 t`, `−3 t`, `0 t`. */
export function signedInt(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${signOf(value, 0)}${int(Math.abs(value))}`;
}

/** O mesmo, com as casas que a unidade da TAG pede. */
export function signedTagValue(value: number | null | undefined, unit: string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const digits = digitsFor(value, unit);
  return `${signOf(value, digits)}${tagValue(Math.abs(value), unit)}`;
}

/** Um inteiro com ponto de milhar. */
export function int(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return formatter(0).format(rounded(value, 0));
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
  const digits = digitsFor(value, unit);
  return formatter(digits).format(rounded(value, digits));
}

/**
 * Quantas casas a grandeza pede, para quem precisa saber antes de formatar.
 *
 * Quem mostra sinal separado do valor precisa arredondar na **mesma** casa em
 * que o número vai sair, senão o sinal volta a discordar do número.
 */
export function digitsFor(value: number, unit: string): number {
  const byUnit = DIGITS_BY_UNIT[unit] ?? (Math.abs(value) >= 100 ? 0 : 2);
  // uma dosagem de 1,4 kg/t sem casa viraria "1": abaixo de 10, inteiro não basta
  return byUnit === 0 && Math.abs(value) < 10 && value !== 0 ? 1 : byUnit;
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
  '°SR': 0,
  kW: 0,
};

/** `HH:MM` no fuso de quem está olhando. */
export function hhmm(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';

  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** `HH:MM:SS` no fuso de quem está olhando: o relógio da barra superior. */
export function clockTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';

  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const;

/** `seg 09/11`: o dia ao lado do relógio. */
export function weekdayDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${WEEKDAYS[date.getDay()] ?? ''} ${day}/${month}`;
}

/** `15:00–23:00`: a janela de um turno. Turno em curso usa o fim previsto. */
export function hourWindow(from: string, to: string | null | undefined): string {
  return `${hhmm(from)}–${to ? hhmm(to) : '—'}`;
}
