import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useResource } from './useResource';

/** Uma busca que resolve quando o teste quiser. */
function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (cause: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useResource', () => {
  it('começa carregando', () => {
    const { result } = renderHook(() => useResource(() => deferred<number>().promise));

    expect(result.current.phase).toBe('loading');
    expect(result.current.data).toBeNull();
  });

  it('entrega o dado quando chega', async () => {
    const load = vi.fn(() => Promise.resolve(42));
    const { result } = renderHook(() => useResource(load));

    await waitFor(() => {
      expect(result.current.phase).toBe('ready');
    });
    expect(result.current.data).toBe(42);
    expect(result.current.error).toBeNull();
  });

  /**
   * "Não havia nada" é diferente de "ainda não chegou", e é o estado que mais
   * costuma faltar numa tela.
   */
  it('distingue vazio de carregando', async () => {
    const { result } = renderHook(() =>
      useResource(() => Promise.resolve([] as number[]), { isEmpty: (d) => d.length === 0 }),
    );

    await waitFor(() => {
      expect(result.current.phase).toBe('empty');
    });
    // o dado vazio vem junto: a tela pode querer mostrar o cabeçalho da tabela
    expect(result.current.data).toEqual([]);
  });

  it('guarda a mensagem do erro', async () => {
    const { result } = renderHook(() =>
      useResource(() => Promise.reject(new Error('A API respondeu 503'))),
    );

    await waitFor(() => {
      expect(result.current.phase).toBe('error');
    });
    expect(result.current.error).toBe('A API respondeu 503');
  });

  it('tem mensagem mesmo quando o erro não é um Error', async () => {
    const { result } = renderHook(() => useResource(() => Promise.reject('texto solto')));

    await waitFor(() => {
      expect(result.current.phase).toBe('error');
    });
    expect(result.current.error).toMatch(/fonte de dados/);
  });

  it('não busca quando está desligado', () => {
    const load = vi.fn(() => Promise.resolve(1));
    const { result } = renderHook(() => useResource(load, { enabled: false }));

    expect(load).not.toHaveBeenCalled();
    expect(result.current.phase).toBe('loading');
  });

  it('busca de novo em reload, mantendo o dado na tela', async () => {
    let value = 1;
    const load = vi.fn(() => Promise.resolve(value));
    const { result } = renderHook(() => useResource(load));

    await waitFor(() => {
      expect(result.current.data).toBe(1);
    });

    value = 2;
    act(() => {
      result.current.reload();
    });

    await waitFor(() => {
      expect(result.current.data).toBe(2);
    });
    expect(load).toHaveBeenCalledTimes(2);
  });

  /**
   * Uma função nova a cada render — `(d) => d.length === 0` escrito no JSX — não
   * pode refazer a busca para sempre.
   */
  it('não entra em laço com isEmpty recriado a cada render', async () => {
    const load = vi.fn(() => Promise.resolve([1]));
    const { result, rerender } = renderHook(() =>
      useResource(load, { isEmpty: (d: number[]) => d.length === 0 }),
    );

    await waitFor(() => {
      expect(result.current.phase).toBe('ready');
    });

    rerender();
    rerender();

    expect(load).toHaveBeenCalledTimes(1);
  });

  it('descarta a resposta de uma busca abortada', async () => {
    const first = deferred<number>();
    const load = vi.fn(() => first.promise);
    const { result, unmount } = renderHook(() => useResource(load));

    unmount();
    first.resolve(7);
    await Promise.resolve();

    expect(result.current.data).toBeNull();
  });
});
