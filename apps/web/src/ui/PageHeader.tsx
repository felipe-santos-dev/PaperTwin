import type { ReactNode } from 'react';

import { PageIndex, type PageIndexEntry } from './PageIndex';

/**
 * O cabeçalho de uma tela: título, contexto, índice e ações.
 *
 * É o `.ph` do protótipo, e é a peça que faltava para a casca parar de empilhar
 * camadas. Antes, saber em que tela se estava custava três lugares — a trilha
 * lateral, a faixa das dez seções e o título do primeiro painel. Agora custa
 * um: o `h1` da tela, com os números que importam na linha de baixo.
 *
 * Quatro coisas, nesta ordem de quem cede primeiro:
 *
 * 1. **o título**, que nunca cede — é o nome da tela;
 * 2. **a linha de contexto**, que corta com reticências;
 * 3. **o índice da página**, que sai inteiro abaixo de 1500 px (`PageIndex`);
 * 4. **as ações**, que ficam à direita e não cedem — são o que alguém opera.
 *
 * ## Um `h1` por tela, e é este
 *
 * Era o painel principal de cada tela que carregava o `h1` (`Panel heading={1}`).
 * Com o cabeçalho de tela existindo, dois `h1` na mesma página é um erro de
 * estrutura: quem usa leitor de tela ouve dois "nível 1" e não sabe qual é a
 * página. Então os painéis voltaram todos a `h2`, e o `h1` é o da tela.
 */

export interface PageHead {
  /** O nome da tela. */
  readonly title: ReactNode;
  /** Uma linha com os números que importam: turno, janela, contagem. */
  readonly context?: ReactNode;
  /** As seções de baixo, para o índice. */
  readonly index?: readonly PageIndexEntry[];
  /** O que a tela oferece: segmentados, botões, um link. */
  readonly actions?: ReactNode;
}

export function PageHeader({ title, context, index = [], actions }: PageHead) {
  return (
    <header className="mb-3.5 flex min-w-0 items-end gap-4">
      <div className="min-w-0">
        <h1 className="truncate text-[20px] leading-tight font-semibold tracking-[-0.2px] text-fg">
          {title}
        </h1>
        {context ? <p className="mt-0.5 truncate text-[13px] text-fg-2">{context}</p> : null}
      </div>
      <PageIndex entries={index} className="self-center" />
      {actions ? (
        <div className="ml-auto flex shrink-0 items-center gap-2 self-center">{actions}</div>
      ) : null}
    </header>
  );
}
