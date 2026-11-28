import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';

import { HELP, type HelpKey } from './help';
import { PRIORITY_CLASS, type DesignPriority } from './priority';

/**
 * Bloco de painel: o retângulo que agrupa um assunto da tela.
 *
 * Título em Inter 600 · 14, contexto ao lado em cinza e, à direita, o que o
 * bloco oferece (filtro, janela de tempo, legenda) e o "?" da ajuda. Sem sombra
 * e sem relevo: o que separa um bloco do outro é a borda de 1 px e o fundo do
 * painel.
 *
 * `help` é **obrigatória**. Não é zelo: um bloco sem explicação é um bloco que
 * alguém vai ler errado, e o tipo é o lugar mais barato de cobrar isso — painel
 * novo sem texto não compila.
 */
export interface PanelProps {
  readonly title: ReactNode;
  /** Contexto curto ao lado do título: contagem, recorte, período. */
  readonly context?: ReactNode;
  /** O que fica à direita do título, antes do "?". */
  readonly aside?: ReactNode;
  /** A chave do texto em `ui/help.ts`. */
  readonly help: HelpKey;
  /**
   * O nível do título.
   *
   * O bloco principal de uma tela é o `h1` dela — a linha do tempo no Turno, a
   * lista de variáveis no Processo, a nota aberta em Notas. Os outros são `h2`,
   * que é o padrão.
   */
  readonly heading?: 1 | 2;
  readonly children: ReactNode;
  readonly className?: string;
  /** Classe do corpo, abaixo do título. */
  readonly bodyClassName?: string;
  /** Rótulo acessível, quando o título não é texto simples. */
  readonly label?: string;
  /** Só para o que a classe não resolve, como a cor da borda de prioridade. */
  readonly style?: CSSProperties;
}

export function Panel({
  title,
  context,
  aside,
  help,
  heading = 2,
  children,
  className = '',
  bodyClassName = '',
  label,
  style,
}: PanelProps) {
  const name = label ?? (typeof title === 'string' ? title : undefined);
  const Heading = heading === 1 ? 'h1' : 'h2';

  return (
    <section
      aria-label={name}
      style={style}
      className={`flex min-h-0 min-w-0 flex-col border border-line bg-panel px-5 pt-4 pb-4 ${className}`}
    >
      <header className="mb-3 flex min-h-6 min-w-0 items-baseline gap-3">
        {/*
          O título não encolhe: ele é o nome do painel, e um nome cortado é pior
          que uma legenda cortada. Quem cede é o contexto ao lado e o aside.
        */}
        <Heading className="shrink-0 text-[14px] font-semibold whitespace-nowrap text-fg">
          {title}
        </Heading>
        {context ? <div className="min-w-0 truncate text-[12px] text-fg-2">{context}</div> : null}
        {/*
          O aside toma o espaço que sobra, numa linha só.

          `flex-1` em vez de largura de conteúdo porque a Tendência põe as TAGs
          aqui e precisa saber quanto espaço tem para decidir quantas mostrar —
          uma caixa do tamanho do conteúdo responderia o tamanho do conteúdo, e
          a conta andaria em círculo.

          `[&>*]:min-w-0` é o que faltava, e é a causa de metade da revisão de
          1142 px. Um filho de flex **não encolhe abaixo do conteúdo** sem
          `min-width: 0` — e `truncate`, que é o que os asides usam, não mexe em
          `min-width`. Então a legenda com `truncate` recusava encolher, estourava
          a caixa dela e passava da borda do painel: o "64" do placar do turno
          saía 55 px para fora em 1280 px. Posto aqui, vale para todo painel,
          sem cada aside ter de lembrar.

          `basis-auto` resolve o outro lado da mesma moeda. `flex-1` é
          `flex-basis: 0%`: quando o contexto ao lado enche a linha, não sobra
          nada para crescer e o aside recebe **largura zero** — e aí o conteúdo
          dele sai por cima do "?" da ajuda, que foi o que sobrou no cabeçalho de
          "Bobinas × ensaios". Partindo do conteúdo, os dois encolhem na
          proporção do que pediram: o contexto, que pede muito, cede quase tudo;
          o aside, que pede pouco, cede quase nada. Os dois continuam cedendo,
          que é o que impede o cabeçalho de estourar o painel.
        */}
        <div className="ml-auto flex min-w-0 grow basis-auto items-center justify-end gap-2 text-[11px] text-fg-3 [&>*]:min-w-0">
          {aside}
          <HelpButton help={help} name={name} />
        </div>
      </header>
      <div className={`min-h-0 flex-1 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

/**
 * O "?" do cabeçalho e as três linhas que ele abre.
 *
 * Discreto de propósito: quadrado de 16 px, borda fina, cinza. Ele não disputa
 * atenção com o dado — quem precisa dele vai procurar.
 *
 * Fecha com Esc e com clique fora, e o foco volta para o botão: quem abriu pelo
 * teclado não fica perdido no meio da página. Não é modal — a tela atrás
 * continua viva, porque a ajuda é para ser lida **olhando** para o bloco.
 */
function HelpButton({ help, name }: { readonly help: HelpKey; readonly name: string | undefined }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const text = HELP[help];
  const title = name ? `Ajuda: ${name}` : 'Ajuda do bloco';

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      // sem isto, o Esc que fecha a ajuda também fecharia o que estiver atrás
      event.stopPropagation();
      setOpen(false);
      button.current?.focus();
    };

    const onPointerDown = (event: MouseEvent): void => {
      const target = event.target as Node | null;
      if (!target) return;
      if (box.current?.contains(target) || button.current?.contains(target)) return;
      setOpen(false);
    };

    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  return (
    <span className="relative flex items-center">
      <button
        ref={button}
        type="button"
        aria-label={title}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => {
          setOpen((value) => !value);
        }}
        className={`flex size-4 items-center justify-center border text-[10px] leading-none ${
          open
            ? 'border-action text-action'
            : 'border-line-strong text-fg-3 hover:border-fg-3 hover:text-fg'
        }`}
      >
        ?
      </button>
      {open ? (
        <div
          ref={box}
          id={id}
          role="dialog"
          aria-label={title}
          className="absolute top-6 right-0 z-30 w-80 border border-line-strong bg-chrome px-3 py-2.5 text-left text-[12px] leading-[1.45] text-fg-2 shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
        >
          <HelpLine label="O que mostra">{text.shows}</HelpLine>
          <HelpLine label="Como ler">{text.read}</HelpLine>
          <HelpLine label="O que dá para clicar">{text.click}</HelpLine>
        </div>
      ) : null}
    </span>
  );
}

function HelpLine({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <p className="mb-2 last:mb-0">
      <span className="mb-0.5 block text-[10px] tracking-[0.06em] text-fg-3 uppercase">
        {label}
      </span>
      {children}
    </p>
  );
}

/** O quadradinho da prioridade de alarme, com o número dentro. */
export function PriorityBadge({ priority }: { readonly priority: DesignPriority }) {
  return (
    <span
      aria-label={`prioridade ${String(priority)}`}
      className={`inline-flex h-4 min-w-4.5 items-center justify-center px-1 font-mono text-[11px] leading-4 font-semibold text-on-alarm ${PRIORITY_CLASS[priority].fill}`}
    >
      {priority}
    </span>
  );
}

/** Chip de modo do controlador: AUT, MAN, CAS. MAN em destaque neutro. */
export function ModeChip({ mode }: { readonly mode: string | null }) {
  const manual = mode === 'MAN';
  return (
    <span
      className={`inline-flex h-4.5 min-w-11 items-center justify-center border px-1.5 font-mono text-[10px] ${
        manual ? 'border-fg-3 bg-band text-fg' : 'border-line-strong text-fg-2'
      }`}
    >
      {mode ?? '–'}
    </span>
  );
}
