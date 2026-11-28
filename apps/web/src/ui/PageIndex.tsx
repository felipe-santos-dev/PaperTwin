/**
 * O índice da página: os links para as seções de baixo.
 *
 * É o `.toc` do protótipo. A página rola inteira agora, e uma página que rola
 * precisa dizer o que tem embaixo — senão o que está fora da primeira tela
 * simplesmente não existe para quem não rola. São três ou quatro links, ao lado
 * do título, em cinza.
 *
 * ## Por que ele some abaixo de 1500 px
 *
 * É a decisão do protótipo (`@media (max-width:1500px){.toc{display:none}}`), e
 * ela se defende: o índice é **atalho**, não informação. Abaixo de 1500 a linha
 * do cabeçalho tem de caber título, contexto e as ações da tela, e as ações são
 * o que alguém opera. O que sai é o atalho; a seção continua lá, a uma rolagem
 * de distância.
 *
 * `max-amplo:hidden` é o ponto de corte `amplo` de `apps/web/src/index.css`.
 *
 * ## Por que `scrollIntoView` e não só a âncora
 *
 * A tela mora na âncora da URL (`ui/screens.ts`): `#t-ev` trocaria a tela por
 * "a padrão", porque `screenOf` não conhece esse id. Então o clique é
 * interceptado, a página rola suave e a URL não muda — o que também é o
 * comportamento do protótipo, que faz `preventDefault` e chama
 * `scrollIntoView`.
 */

export interface PageIndexEntry {
  /** O `id` da seção na página, sem `#`. */
  readonly id: string;
  readonly label: string;
}

export function PageIndex({
  entries,
  className = '',
}: {
  readonly entries: readonly PageIndexEntry[];
  readonly className?: string;
}) {
  if (entries.length === 0) return null;

  return (
    <nav
      aria-label="Seções desta página"
      className={`flex shrink-0 items-center gap-1 max-amplo:hidden ${className}`}
    >
      {entries.map((entry) => (
        <a
          key={entry.id}
          href={`#${entry.id}`}
          onClick={(event) => {
            const alvo = document.getElementById(entry.id);
            if (!alvo) return;
            event.preventDefault();
            alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
          className="px-2 py-1 text-[12px] whitespace-nowrap text-fg-3 hover:bg-panel hover:text-fg"
        >
          {entry.label}
        </a>
      ))}
    </nav>
  );
}
