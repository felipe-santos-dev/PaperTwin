import type { ReactNode } from 'react';

import type { Resource } from './useResource';

/**
 * Os três estados que não são "pronto", desenhados de um jeito só.
 *
 * A regra do projeto pede estado vazio, carregando e erro em toda tela que busca
 * dados. Com sete telas, escrevê-los à mão daria sete aparências para a mesma
 * situação — e a sétima esqueceria o erro.
 *
 * Nenhum dos três usa ícone, emoji ou cartão. O que eles têm é uma frase que diz
 * **o que aconteceu** e, no erro, um botão que tenta de novo: numa sala de
 * controle, "algo deu errado" sem a mensagem da API é pior que a mensagem crua.
 */

export interface ResourceStateProps<T> {
  readonly resource: Resource<T>;
  /** O que a tela mostra quando há dado. */
  readonly children: (data: T) => ReactNode;
  /** A frase do estado vazio, específica da tela. */
  readonly emptyMessage?: string;
  /** O que está sendo carregado, para a frase dizer. */
  readonly label?: string;
}

export function ResourceState<T>({
  resource,
  children,
  emptyMessage,
  label,
}: ResourceStateProps<T>) {
  if (resource.phase === 'loading') {
    return (
      <p role="status" className="px-1 py-6 text-sm text-mill-muted">
        Carregando {label ?? 'dados'}…
      </p>
    );
  }

  if (resource.phase === 'error') {
    return (
      <div role="alert" className="px-1 py-6 text-sm">
        <p className="text-mill-critical">{resource.error}</p>
        <button
          type="button"
          onClick={resource.reload}
          className="mt-3 min-h-11 rounded border border-mill-line px-3 py-1.5 text-mill-fg transition-colors hover:bg-white/5"
        >
          Tentar de novo
        </button>
      </div>
    );
  }

  if (resource.phase === 'empty') {
    return (
      <p role="status" className="px-1 py-6 text-sm text-mill-muted">
        {emptyMessage ?? 'Nada para mostrar neste recorte.'}
      </p>
    );
  }

  return (
    <>
      {resource.refreshing && (
        <p role="status" className="sr-only">
          Atualizando {label ?? 'dados'}…
        </p>
      )}
      {resource.data === null ? null : children(resource.data)}
    </>
  );
}
