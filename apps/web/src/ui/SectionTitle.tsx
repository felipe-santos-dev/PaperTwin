import type { ReactNode } from 'react';

/**
 * O título de uma seção da página, com a linha que explica o recorte.
 *
 * É o `.st` do protótipo: `h3` em 15 px, a explicação em cinza na mesma linha
 * de base, e à direita o que a seção oferece — segmentados, chips de filtro, um
 * link. Ele fica **fora** do painel, e é o que separa um assunto do seguinte
 * agora que a página rola inteira em vez de cada painel rolar por dentro.
 *
 * ## Por que a explicação fica ao lado, e não embaixo
 *
 * Embaixo ela empurra o conteúdo e vira parágrafo: alguém lê. Ao lado, na mesma
 * linha de base e em cinza, ela é legenda — quem já sabe passa por cima, quem
 * não sabe lê sem ter de procurar. É a mesma razão pela qual o contexto do
 * `Panel` fica ao lado do título dele.
 *
 * O `id` é o que o `PageIndex` aponta: ele vai no elemento inteiro, e não só no
 * título, para o link levar à seção e não ao texto dela. `scroll-mt-3` tira o
 * título de debaixo da borda do topo quando a página pula para cá.
 */

export interface SectionTitleProps {
  readonly title: ReactNode;
  /** Uma linha, em cinza: o recorte, a contagem, a janela de tempo. */
  readonly hint?: ReactNode;
  /** O que fica à direita: segmentados, chips, um link. */
  readonly actions?: ReactNode;
  /** O nível do título; `3` por padrão, que é o do protótipo. */
  readonly heading?: 2 | 3;
  readonly className?: string;
}

export function SectionTitle({
  title,
  hint,
  actions,
  heading = 3,
  className = '',
}: SectionTitleProps) {
  const Heading = heading === 2 ? 'h2' : 'h3';

  return (
    <div className={`mb-3 flex min-w-0 items-baseline gap-3 ${className}`}>
      {/*
        O título não encolhe: ele é o nome da seção, e o `PageIndex` aponta para
        ele. Quem cede é a legenda, que tem reticências, e as ações, que já são
        curtas por natureza.
      */}
      <Heading className="shrink-0 text-[15px] font-semibold whitespace-nowrap text-fg">
        {title}
      </Heading>
      {hint ? <p className="min-w-0 truncate text-[12px] text-fg-3">{hint}</p> : null}
      {actions ? (
        <div className="ml-auto flex shrink-0 items-center gap-2 text-[12px]">{actions}</div>
      ) : null}
    </div>
  );
}

/**
 * Uma seção da página: o alvo de um link do índice.
 *
 * Existe para que o `id` e o respiro de rolagem fiquem num lugar só, e não
 * repetidos em cada tela com uma classe diferente. A margem de cima é a do
 * protótipo (`.blk`), e é ela que faz a página ter ritmo em vez de uma pilha de
 * painéis colados.
 */
export function PageSection({
  id,
  children,
  className = '',
}: {
  readonly id: string;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <section id={id} className={`mt-9 min-w-0 scroll-mt-3 first:mt-0 ${className}`}>
      {children}
    </section>
  );
}
