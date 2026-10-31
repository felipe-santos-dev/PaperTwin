import { describe, expect, it } from 'vitest';

import { dayTime, duration, hhmm, int, num, span, tagValue } from './format';

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

  it('mostra dia e hora no formato do protótipo', () => {
    expect(dayTime(iso)).toBe('15/06 · 13:32');
  });

  it('não inventa hora para entrada inválida', () => {
    expect(hhmm(null)).toBe('—');
    expect(hhmm('nem data')).toBe('—');
    expect(dayTime(undefined)).toBe('—');
  });
});

describe('durações', () => {
  it('usa segundos, minutos e horas conforme a escala', () => {
    expect(duration(42)).toBe('42 s');
    expect(duration(22 * 60)).toBe('22 min');
    expect(duration(3 * 3600 + 5 * 60)).toBe('3 h 05');
  });

  it('não inventa duração sem dado', () => {
    expect(duration(null)).toBe('—');
  });

  /**
   * `null` no fim significa "ainda está acontecendo", e a resposta é isso — não
   * a duração até agora, que mudaria a cada render e daria a impressão de um
   * cronômetro que a tela não tem.
   */
  it('diz "em andamento" quando não há fim', () => {
    expect(span('2026-06-15T10:00:00Z', null)).toBe('em andamento');
  });

  it('mede o intervalo entre dois instantes', () => {
    expect(span('2026-06-15T10:00:00Z', '2026-06-15T10:53:00Z')).toBe('53 min');
  });
});
