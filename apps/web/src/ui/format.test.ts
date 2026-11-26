import { describe, expect, it } from 'vitest';

import {
  clockTime,
  hhmm,
  hourWindow,
  int,
  num,
  signedInt,
  signedNum,
  signedTagValue,
  signOf,
  tagValue,
} from './format';

describe('números em português', () => {
  /**
   * Vírgula decimal não é preferência: "75.1" num painel brasileiro é lido como
   * setenta e cinco mil, e uma gramatura lida errado por mil é pior que número
   * nenhum.
   */
  it('usa vírgula decimal', () => {
    expect(num(75.14, 2)).toBe('75,14');
    expect(num(4.8, 1)).toBe('4,8');
  });

  it('usa ponto de milhar nos inteiros', () => {
    expect(int(66540)).toBe('66.540');
    expect(int(1250)).toBe('1.250');
  });

  it('completa as casas pedidas', () => {
    expect(num(230, 2)).toBe('230,00');
    expect(num(4, 1)).toBe('4,0');
  });

  /** Ausência vira travessão, nunca zero: zero é uma medição. */
  it('não confunde ausência com zero', () => {
    for (const value of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(num(value)).toBe('—');
      expect(int(value)).toBe('—');
      expect(tagValue(value, 'kPa')).toBe('—');
    }
    expect(num(0, 1)).toBe('0,0');
  });
});

describe('valor de tag pela unidade', () => {
  /**
   * As casas saem da unidade porque é ela que diz a escala. "230,0000 kPa" não
   * informa mais — informa menos, porque esconde o que importa atrás de zeros.
   */
  it('não põe decimal em pressão e velocidade', () => {
    expect(tagValue(230, 'kPa rel')).toBe('230');
    expect(tagValue(1248, 'm/min')).toBe('1.248');
  });

  it('põe duas casas em umidade e gramatura', () => {
    expect(tagValue(4.812, '%')).toBe('4,81');
    expect(tagValue(75.137, 'g/m²')).toBe('75,14');
  });

  it('põe duas casas em vibração', () => {
    expect(tagValue(5.237, 'mm/s')).toBe('5,24');
  });

  it('decide pela magnitude numa unidade desconhecida', () => {
    expect(tagValue(1234, 'unidade-nova')).toBe('1.234');
    expect(tagValue(1.23456, 'unidade-nova')).toBe('1,23');
  });
});

describe('instantes', () => {
  const iso = new Date(2026, 5, 15, 13, 32, 0).toISOString();

  it('mostra a hora no fuso de quem olha', () => {
    expect(hhmm(iso)).toBe('13:32');
  });

  it('mostra o relógio com segundos e a janela do turno', () => {
    expect(clockTime(iso)).toBe('13:32:00');
    expect(hourWindow(iso, null)).toBe('13:32–—');
  });

  it('não inventa hora para entrada inválida', () => {
    expect(hhmm(null)).toBe('—');
    expect(hhmm('nem data')).toBe('—');
    expect(clockTime(undefined)).toBe('—');
  });
});

/**
 * Zero negativo: o que a tela de Simulação mostrava como "−0,00 %".
 *
 * O `Intl` guarda o sinal do zero, e quem monta sinal e valor em pedaços
 * separados tirava o sinal do número cru. Um delta de −0,004 dava "−" e "0,00",
 * e a tela dizia que algo caiu quando a conta deu exatamente nada.
 */
describe('zero não tem sinal', () => {
  it('não mostra zero negativo', () => {
    expect(num(-0, 2)).toBe('0,00');
    expect(num(-0.001, 2)).toBe('0,00');
    expect(num(-0.04, 1)).toBe('0,0');
    expect(int(-0.4)).toBe('0');
    expect(tagValue(-0.004, '%')).toBe('0,00');
  });

  it('o sinal sai do número já arredondado', () => {
    expect(signOf(-0.004, 2)).toBe('');
    expect(signOf(-0.04, 1)).toBe('');
    expect(signOf(-0.02, 2)).toBe('−');
    expect(signOf(0.02, 2)).toBe('+');
    expect(signOf(0, 2)).toBe('');
  });

  it('o número com sinal junta os dois na mesma casa', () => {
    expect(signedNum(-0.004, 2)).toBe('0,00');
    expect(signedNum(-0.31, 2)).toBe('−0,31');
    expect(signedNum(1.2, 1)).toBe('+1,2');
    expect(signedInt(-0.4)).toBe('0');
    expect(signedInt(-12)).toBe('−12');
    expect(signedInt(12)).toBe('+12');
  });

  /** Com unidade, o arredondamento é na casa que a unidade pede. */
  it('respeita as casas da unidade', () => {
    expect(signedTagValue(-0.004, '%')).toBe('0,00');
    expect(signedTagValue(-0.4, 'm/min')).toBe('−0,4');
    // abaixo de 10 a unidade inteira ganha uma casa, e o zero segue sem sinal
    expect(signedTagValue(-0.04, 'kPa')).toBe('0,0');
    expect(signedTagValue(-40, 'kPa')).toBe('−40');
  });

  it('ausência continua virando travessão', () => {
    for (const value of [null, undefined, Number.NaN]) {
      expect(signedNum(value, 2)).toBe('—');
      expect(signedInt(value)).toBe('—');
      expect(signedTagValue(value, '%')).toBe('—');
      expect(signOf(value, 2)).toBe('');
    }
  });
});
