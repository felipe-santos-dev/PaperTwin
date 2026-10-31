import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { DEFAULT_SCREEN, SCREENS, SCREEN_IDS, screenOf, useScreen } from './screens';

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

describe('as sete telas', () => {
  it('estão na ordem do protótipo', () => {
    expect(SCREEN_IDS).toEqual([
      'turno',
      'bobinas',
      'processo',
      'mancais',
      'rondas',
      'notas',
      'maquina',
    ]);
  });

  it('tem as teclas 1 a 7, uma por tela', () => {
    expect(SCREENS.map((screen) => screen.key)).toEqual(['1', '2', '3', '4', '5', '6', '7']);
    expect(new Set(SCREENS.map((s) => s.key)).size).toBe(SCREENS.length);
  });

  it('tem rótulo em todas', () => {
    for (const screen of SCREENS) expect(screen.label.trim()).not.toBe('');
  });

  it('cai na padrão para id que não existe', () => {
    expect(screenOf('qualquer')).toBe(DEFAULT_SCREEN);
    expect(screenOf(null)).toBe(DEFAULT_SCREEN);
    expect(screenOf('mancais')).toBe('mancais');
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

  it('as teclas 1 a 7 levam à tela certa', () => {
    const { result } = renderHook(() => useScreen());

    for (const screen of SCREENS) {
      press(screen.key);
      expect(result.current.screen, `tecla ${screen.key}`).toBe(screen.id);
    }
  });

  it('ignora tecla que não é de tela', () => {
    const { result } = renderHook(() => useScreen());
    press('8');
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
