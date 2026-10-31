import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Uma busca com os quatro estados que toda tela precisa ter.
 *
 * A regra do projeto é explícita: **estado vazio, carregando e erro em toda tela
 * que busca dados**. Três telas escrevendo isso à mão dariam três jeitos
 * diferentes de dizer a mesma coisa, e a quarta esqueceria o erro.
 *
 * Os quatro estados são distintos de propósito:
 *
 * - `loading`: a busca está em andamento e nunca terminou;
 * - `ready`: tem dado;
 * - `empty`: a busca respondeu **e não havia nada** — é diferente de carregando,
 *   e é o estado que mais costuma faltar numa tela;
 * - `error`: a busca falhou, com a mensagem que a API deu.
 *
 * `empty` é decidido por quem chama, com `isEmpty`, porque só ele sabe o que
 * "nada" significa: uma lista de zero bobinas é vazia, um turno com produção
 * zero não é.
 */

export type ResourcePhase = 'loading' | 'ready' | 'empty' | 'error';

export interface Resource<T> {
  readonly phase: ResourcePhase;
  readonly data: T | null;
  readonly error: string | null;
  /** Busca de novo, mantendo o que já está na tela até a resposta chegar. */
  readonly reload: () => void;
  /** `true` enquanto uma rebusca acontece com dado já na tela. */
  readonly refreshing: boolean;
}

export interface ResourceOptions<T> {
  /** O que conta como "nada". O padrão é nunca vazio. */
  readonly isEmpty?: (data: T) => boolean;
  /**
   * Quando `false`, a busca não sai.
   *
   * É o que evita a tela pedir dados antes de a fonte ser escolhida: pedir à API
   * e ao instantâneo ao mesmo tempo mostraria o que chegasse antes.
   */
  readonly enabled?: boolean;
}

const MESSAGE = (cause: unknown): string =>
  cause instanceof Error ? cause.message : 'Falha ao consultar a fonte de dados';

export function useResource<T>(
  load: (signal: AbortSignal) => Promise<T>,
  options: ResourceOptions<T> = {},
): Resource<T> {
  const enabled = options.enabled ?? true;

  const [data, setData] = useState<T | null>(null);
  const [phase, setPhase] = useState<ResourcePhase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [nonce, setNonce] = useState(0);

  /**
   * `isEmpty` vai para uma referência em vez de entrar nas dependências do
   * efeito.
   *
   * Quem chama costuma passar uma função nova a cada render — `(d) => d.length
   * === 0` escrito no JSX é um objeto novo por render — e isso refaria a busca
   * para sempre. A função é lida no momento de usar, então a versão atual é a
   * que vale.
   */
  const isEmptyRef = useRef(options.isEmpty);
  isEmptyRef.current = options.isEmpty;

  const hasData = data !== null;

  useEffect(() => {
    if (!enabled) return;

    const controller = new AbortController();
    if (hasData) setRefreshing(true);

    load(controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;

        const empty = isEmptyRef.current?.(result) ?? false;
        setData(result);
        setPhase(empty ? 'empty' : 'ready');
        setError(null);
        setRefreshing(false);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setPhase('error');
        setError(MESSAGE(cause));
        setRefreshing(false);
      });

    return () => {
      controller.abort();
    };
    // `hasData` de propósito fora: ele muda quando o dado chega, e entrar aqui
    // refaria a busca logo depois de ela terminar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, enabled, nonce]);

  const reload = useCallback(() => {
    setNonce((value) => value + 1);
  }, []);

  if (!enabled) {
    return { phase: 'loading', data: null, error: null, reload, refreshing: false };
  }

  return { phase, data, error, reload, refreshing };
}
