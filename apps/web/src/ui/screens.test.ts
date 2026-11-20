import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { DEFAULT_SCREEN, RAIL_SCREENS, SCREENS, SCREEN_IDS, screenOf, useScreen } from './screens';

afterEach(() => {
  window.location.hash = '';
});

/** Dispara uma tecla no documento, como o navegador faria. */
function press(key: string, target?: HTMLElement): void {
  act(() => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    (target ?? window).dispatchEvent(event);
  });
}

describe('as telas', () => {
  it('estão na ordem do design', () => {
    expect(SCREEN_IDS).toEqual([
      'turno',
      'processo',
      'laboratorio',
      'bobinas',
      'mancais',
      'rondas',
      'notas',
      'maquina',
      'simulacao',
      'quebra',
    ]);
  });

  /**
   * A Simulação entrou na 9, e não no meio.
   *
   * A tecla decorada vale mais do que a ordem perfeita da lista: quem já usa o
   * gêmeo aperta 8 para a Máquina sem pensar, e mover isso para encaixar uma
   * tela nova custaria mais do que ganha.
   */
  it('tem as teclas 1 a 9, uma por tela da barra, com a Máquina na 8 e a Simulação na 9', () => {
    expect(RAIL_SCREENS.map((screen) => screen.key)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
    ]);
    expect(SCREENS.find((s) => s.key === '8')?.id).toBe('maquina');
    expect(SCREENS.find((s) => s.key === '9')?.id).toBe('simulacao');
    expect(new Set(RAIL_SCREENS.map((s) => s.key)).size).toBe(RAIL_SCREENS.length);
  });

  /**
   * A tela do replay de quebra não tem tecla nem entrada na barra: ela só
   * existe dentro de uma quebra, e os caminhos até ela são a linha do tempo do
   * Turno e a lista de bobinas.
   */
  it('a tela contextual fica fora da barra e sem tecla', () => {
    const quebra = SCREENS.find((screen) => screen.id === 'quebra');
    expect(quebra?.key).toBeNull();
    expect(quebra?.rail).toBe(false);
    expect(RAIL_SCREENS.map((screen) => screen.id)).not.toContain('quebra');
    expect(RAIL_SCREENS).toHaveLength(9);
  });

  it('tem rótulo e rótulo curto em todas', () => {
    for (const screen of SCREENS) {
      expect(screen.label.trim()).not.toBe('');
      expect(screen.short.trim()).not.toBe('');
    }
  });

  it('cai na padrão para id que não existe', () => {
    expect(screenOf('qualquer')).toBe(DEFAULT_SCREEN);
    expect(screenOf(null)).toBe(DEFAULT_SCREEN);
    expect(screenOf('mancais')).toBe('mancais');
    expect(screenOf('maquina')).toBe('maquina');
  });
});

describe('navegação', () => {
  it('abre na tela da âncora da URL', () => {
    window.location.hash = 'rondas';
    const { result } = renderHook(() => useScreen());

    expect(result.current.screen).toBe('rondas');
  });

  it('abre na padrão sem âncora', () => {
    const { result } = renderHook(() => useScreen());
    expect(result.current.screen).toBe(DEFAULT_SCREEN);
  });

  /**
   * A tela na URL é o que faz o botão voltar funcionar e o link ser colável.
   */
  it('escreve a tela na âncora ao navegar', () => {
    const { result } = renderHook(() => useScreen());

    act(() => {
      result.current.go('notas');
    });

    expect(window.location.hash).toBe('#notas');
    expect(result.current.screen).toBe('notas');
  });

  it('segue a âncora quando ela muda por fora', () => {
    const { result } = renderHook(() => useScreen());

    act(() => {
      window.location.hash = 'processo';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    expect(result.current.screen).toBe('processo');
  });

  it('as teclas 1 a 9 levam à tela certa', () => {
    const { result } = renderHook(() => useScreen());

    for (const screen of RAIL_SCREENS) {
      if (screen.key === null) continue;
      press(screen.key);
      expect(result.current.screen, `tecla ${screen.key}`).toBe(screen.id);
    }
  });

  it('a tecla 9 abre a Simulação', () => {
    const { result } = renderHook(() => useScreen());
    press('9');

    expect(result.current.screen).toBe('simulacao');
  });

  it('ignora tecla que não é de tela', () => {
    const { result } = renderHook(() => useScreen());
    press('0');
    press('a');

    expect(result.current.screen).toBe(DEFAULT_SCREEN);
  });

  /**
   * Digitar "3" no motivo de uma escrita de setpoint não pode levar a pessoa
   * para outra tela e perder o que ela escreveu.
   */
  it('ignora as teclas quando o foco está num campo', () => {
    const { result } = renderHook(() => useScreen());

    for (const tag of ['input', 'textarea', 'select'] as const) {
      const field = document.createElement(tag);
      document.body.append(field);
      press('4', field);
      expect(result.current.screen, tag).toBe(DEFAULT_SCREEN);
      field.remove();
    }
  });

  it('ignora atalho com modificador, que é do navegador', () => {
    const { result } = renderHook(() => useScreen());

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '3', metaKey: true }));
    });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '3', ctrlKey: true }));
    });

    expect(result.current.screen).toBe(DEFAULT_SCREEN);
  });

  it('solta o ouvinte ao desmontar', () => {
    const { result, unmount } = renderHook(() => useScreen());
    unmount();

    press('5');
    expect(result.current.screen).toBe(DEFAULT_SCREEN);
  });
});
