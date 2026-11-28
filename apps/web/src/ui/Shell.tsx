import { useEffect, useRef, useState, type ReactNode } from 'react';

import { PRIORITY_COLOR, PRIORITY_LABEL, type DesignPriority } from './priority';
import { RAIL_SCREENS, type ScreenId } from './screens';

/**
 * A moldura das telas: uma linha no topo, a trilha das teclas 1–9, e a página.
 *
 * ## O que saiu, e por quê
 *
 * A casca antiga tinha **quatro** camadas antes do conteúdo: a barra superior,
 * a faixa com as dez seções, o banner da API e o título do primeiro painel. Era
 * 112 px de altura e três lugares diferentes dizendo onde a pessoa estava. O
 * layout novo tem uma: 48 px de barra, e o cabeçalho da própria página.
 *
 * - **A faixa das dez seções saiu.** Ela estava no topo de todas as telas para
 *   servir a uma: Processo. Escolher seção é um filtro do Processo, e na
 *   Máquina é um seletor no canto da cena — os dois lugares onde a seção quer
 *   dizer algo. O estado da seção continua na aplicação, que é quem atravessa
 *   de uma tela para outra.
 * - **O banner "API disponível · Carregar ao vivo" saiu.** Ele era uma faixa
 *   inteira para um link. Virou o "ao vivo ›" dentro do selo DEMONSTRAÇÃO, que
 *   é onde alguém já olha para saber de onde vêm os números.
 * - **Os três botões de alarme viraram um contador só.** Três caixas com borda,
 *   ponto, número e rótulo custavam 230 px da linha para dizer "2, 4, 0". Uma
 *   caixa com os três pares diz o mesmo em 90 px, e continua clicável.
 *
 * ## Só a página rola
 *
 * `main.page` é o **único** elemento com rolagem própria da interface. Nenhum
 * painel rola por dentro: o painel cresce, a página rola, e quem está lendo
 * tem uma barra de rolagem para pensar, não dezessete. `e2e/rolagem.spec.ts`
 * é o guarda dessa regra.
 *
 * ## O cabeçalho de tela é da tela, não da casca
 *
 * `ui/PageHeader` existe, mas quem o desenha é cada tela. A casca não teria
 * como preencher a linha de contexto: os números que importam no Turno são a
 * produção e as pendências, nos Mancais são 98 mancais e quantos em cada zona,
 * em Bobinas são as toneladas do dia. A casca não conhece nenhum deles — ela
 * conhece a barra superior, que é a mesma em todas as telas. Na primeira
 * versão desta fase o cabeçalho ficava aqui, e o resultado foi uma linha de
 * contexto igual nas dez telas, repetindo o que a barra já dizia.
 *
 * ## Abaixo de 1500 px
 *
 * Saem gramatura, velocidade e o campo de busca, como no protótipo. A busca não
 * desaparece: ela vira o botão `⌕` e abre numa faixa logo abaixo da barra,
 * porque 1280 px é largura que o projeto **garante**, e uma busca que não se
 * alcança no piso não é uma busca. `/` e `Ctrl+K` continuam abrindo.
 */

export interface FrameTop {
  /** Turno em curso: letra, janela e operador. */
  readonly shift: { readonly letter: string; readonly window: string } | null;
  readonly gramatura: { readonly text: string; readonly unit: string } | null;
  readonly speed: { readonly text: string; readonly unit: string } | null;
  readonly alarms: Readonly<Record<DesignPriority, number>>;
  /** Hora da leitura (`HH:MM:SS`) e o dia (`seg 09/11`). */
  readonly clock: { readonly time: string; readonly date: string } | null;
}

export interface ShellProps {
  readonly screen: ScreenId;
  readonly go: (id: ScreenId) => void;
  readonly top: FrameTop;
  /** O selo da fonte de dados, já com o "ao vivo ›" se houver. */
  readonly source: ReactNode;
  /**
   * O campo de busca, no meio da barra.
   *
   * Entra como nó pronto, como o selo da fonte: a moldura não sabe de onde os
   * resultados saem nem para onde cada um leva — quem sabe disso é a aplicação,
   * que já tem os abridores de tela.
   */
  readonly search?: ReactNode;
  /**
   * Contadores na navegação, por tela.
   *
   * Hoje um só: as notas sugeridas esperando decisão. Ele fica na moldura, e não
   * na tela de Notas, porque quem está no Processo também precisa saber que a
   * manutenção tem uma decisão parada.
   */
  readonly badges?: Partial<Record<ScreenId, number>> | undefined;
  readonly children: ReactNode;
}

export function Shell({ screen, go, top, source, search, badges, children }: ShellProps) {
  return (
    <div className="flex h-full min-w-0 flex-col bg-base">
      <NarrowNotice />
      <div className="grid min-h-0 min-w-0 flex-1 grid-cols-[56px_minmax(0,1fr)] grid-rows-[48px_minmax(0,1fr)] bg-base">
        <NavRail screen={screen} go={go} badges={badges} />
        <TopBar
          top={top}
          source={source}
          search={search}
          onAlarms={() => {
            go('turno');
          }}
        />
        {/*
          A página: a única rolagem da interface.

          O respiro de baixo é generoso (56 px) de propósito — a última seção de
          uma página longa precisa parar de encostar na borda da janela para
          alguém saber que acabou.
        */}
        <main className="page col-start-2 min-h-0 min-w-0 overflow-x-hidden overflow-y-auto px-5 pt-4 pb-14">
          {children}
        </main>
      </div>
    </div>
  );
}

/**
 * A faixa que aparece abaixo de 1280 px.
 *
 * Em CSS e não em JavaScript de propósito: medir a janela daria um render a
 * mais a cada arrasto de borda, e a resposta é a mesma que uma consulta de
 * mídia dá de graça. `piso:hidden` a esconde de 1280 para cima.
 */
function NarrowNotice() {
  return (
    <p
      role="status"
      className="flex shrink-0 items-center justify-center gap-2 border-b border-line bg-chrome px-4 py-1 text-center text-[11px] text-fg-3 piso:hidden"
    >
      <span aria-hidden="true" className="size-[7px] shrink-0 border border-current" />
      Esta interface é desenhada para telas de 1280 px de largura ou mais. Em telas mais estreitas,
      parte dos painéis fica cortada.
    </p>
  );
}

function NavRail({
  screen,
  go,
  badges,
}: {
  readonly screen: ScreenId;
  readonly go: (id: ScreenId) => void;
  readonly badges?: Partial<Record<ScreenId, number>> | undefined;
}) {
  return (
    <nav
      aria-label="Telas"
      className="row-span-2 flex flex-col items-center border-r border-line bg-chrome"
    >
      <div className="flex h-12 w-14 shrink-0 items-center justify-center border-b border-line text-[13px] font-semibold tracking-[0.02em] text-fg">
        PT
      </div>
      {RAIL_SCREENS.map((item) => {
        const active = item.id === screen;
        const count = badges?.[item.id] ?? 0;
        /**
         * Máquina e Simulação em destaque.
         *
         * São as duas telas que o layout novo põe no centro do gêmeo — a
         * máquina em 3D em tela cheia e o "e se" — e as duas que alguém ainda
         * não decorou. O número delas sai azul, como no protótipo (`.star`).
         * Azul aqui é interação, não estado de máquina: ele diz "vá por aqui".
         */
        const destaque = item.id === 'maquina' || item.id === 'simulacao';
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              go(item.id);
            }}
            aria-current={active ? 'page' : undefined}
            aria-label={count > 0 ? `${item.label} (${String(count)})` : item.label}
            aria-keyshortcuts={item.key ?? undefined}
            title={`${item.label} (tecla ${item.key ?? '—'})`}
            className={`relative flex h-13 w-14 shrink-0 flex-col items-center justify-center gap-0.5 border-l-2 transition-colors ${
              active
                ? 'border-action bg-hover text-fg'
                : 'border-transparent text-fg-3 hover:bg-hover hover:text-fg'
            }`}
          >
            <span
              aria-hidden="true"
              className={`text-[16px] leading-none font-semibold ${
                destaque && !active ? 'text-action' : ''
              }`}
            >
              {item.key}
            </span>
            <span aria-hidden="true" className="text-[10px]">
              {item.short}
            </span>
            {count > 0 ? (
              <span
                aria-hidden="true"
                className="absolute top-1 right-1 border border-alarm-3 bg-chrome px-1 font-mono text-[10px] leading-[14px] text-alarm-3"
              >
                {count}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}

function Divider() {
  return <div aria-hidden="true" className="h-5 w-px shrink-0 bg-line-strong" />;
}

function TopBar({
  top,
  source,
  search,
  onAlarms,
}: {
  readonly top: FrameTop;
  readonly source: ReactNode;
  readonly search: ReactNode;
  readonly onAlarms: () => void;
}) {
  return (
    <header className="relative col-start-2 flex min-w-0 items-center gap-3.5 border-b border-line bg-chrome px-5 amplo:gap-5">
      <div className="flex shrink-0 items-baseline gap-2">
        <span className="text-[15px] font-semibold">MP1</span>
        <span className="text-[12px] text-fg-3 max-largo:hidden">PaperTwin</span>
      </div>
      <Divider />
      {top.shift ? (
        /*
          Turno e janela, e mais nada.

          O nome do operador também ficava aqui, de `largo` para cima. Só que a
          API chama o operador do turno A de "turno A", e a barra lia
          "Turno A 06:00-14:00 turno A" — a mesma informação duas vezes, uma
          delas em minúscula. Um campo que repete o vizinho não é extra, é
          ruído, e a linha única do layout novo não tem espaço para ruído.
        */
        <div className="flex min-w-0 shrink items-baseline gap-2 whitespace-nowrap">
          <span className="shrink-0 text-[13px]">
            Turno <b className="font-semibold">{top.shift.letter}</b>
          </span>
          <span className="shrink-0 font-mono text-[12px] text-fg-2">{top.shift.window}</span>
        </div>
      ) : null}
      {/*
        Gramatura e velocidade saem abaixo de 1500 px.

        Não é que elas não importem: é que quem precisa delas a cada minuto está
        na tela de Processo, onde elas vêm com faixa, setpoint e tendência. Na
        barra elas são conferência de passagem, e conferência cede a lugar.
      */}
      <div className="flex shrink-0 items-baseline gap-1.5 whitespace-nowrap max-amplo:hidden">
        <span className="text-[11px] text-fg-3">Gramatura</span>
        <span className="font-mono text-[14px] font-medium">{top.gramatura?.text ?? '—'}</span>
        <span className="text-[11px] text-fg-2">{top.gramatura?.unit ?? ''}</span>
      </div>
      <div className="flex shrink-0 items-baseline gap-1.5 whitespace-nowrap max-amplo:hidden">
        <span className="text-[11px] text-fg-3">Velocidade</span>
        <span className="font-mono text-[14px] font-medium">{top.speed?.text ?? '—'}</span>
        <span className="text-[11px] text-fg-2">{top.speed?.unit ?? ''}</span>
      </div>

      <SearchSlot>{search}</SearchSlot>

      <AlarmCount alarms={top.alarms} onClick={onAlarms} />
      {source}
      {top.clock ? (
        <div className="flex shrink-0 items-baseline gap-2 whitespace-nowrap">
          <span className="font-mono text-[14px] font-medium">{top.clock.time}</span>
          {/* o dia sai antes da hora: quem olha o relógio quer a hora */}
          <span className="font-mono text-[11px] text-fg-3 max-largo:hidden">{top.clock.date}</span>
        </div>
      ) : null}
    </header>
  );
}

/**
 * A busca: campo na linha acima de 1500 px, botão `⌕` abaixo.
 *
 * O campo é o **mesmo** nó nos dois casos — montado uma vez, com as classes
 * trocando. Montar duas cópias daria dois `combobox` na página, e aí nem quem
 * usa leitor de tela nem o teste saberiam qual é a busca.
 *
 * Abrir pelo botão ou por `/` é a mesma coisa: o estado abre a faixa e o efeito
 * leva o foco para dentro dela. O `/` do próprio `SearchBox` não bastaria —
 * quando o campo está escondido, não há o que focar no instante da tecla.
 */
function SearchSlot({ children }: { readonly children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target;
      const digitando =
        target instanceof HTMLElement &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

      const barra = event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey;
      const paleta = event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey);
      if (barra && digitando) return;
      if (!barra && !paleta) return;
      setOpen(true);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    caixa.current?.querySelector('input')?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const fora = (event: MouseEvent): void => {
      const alvo = event.target as Node | null;
      if (alvo && caixa.current?.contains(alvo)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', fora);
    return () => {
      document.removeEventListener('mousedown', fora);
    };
  }, [open]);

  if (!children) return <div className="min-w-0 flex-1" />;

  return (
    <>
      <div
        ref={caixa}
        className={`relative flex min-w-0 flex-1 justify-center ${
          open
            ? 'max-amplo:absolute max-amplo:inset-x-0 max-amplo:top-12 max-amplo:z-40 max-amplo:border-b max-amplo:border-line max-amplo:bg-chrome max-amplo:px-5 max-amplo:py-2'
            : 'max-amplo:hidden'
        }`}
      >
        {children}
      </div>
      {/* abaixo de 1500 px a busca é este botão; acima, ele não existe */}
      <button
        type="button"
        aria-label="Abrir a busca"
        aria-expanded={open}
        title="Buscar (tecla /)"
        onClick={() => {
          setOpen((valor) => !valor);
        }}
        className="ml-auto flex h-7 shrink-0 items-center gap-1.5 border border-line-strong px-2 text-[12px] text-fg-3 amplo:hidden hover:border-action hover:text-fg"
      >
        <span aria-hidden="true">⌕</span>
        <kbd aria-hidden="true" className="font-mono text-[10px]">
          /
        </kbd>
      </button>
    </>
  );
}

/**
 * O contador único de alarmes: alta, média e baixa numa caixa só.
 *
 * Os três números ficam juntos porque a pergunta que alguém faz é uma — "tem
 * alarme?" — e a resposta tem três partes. Separados em três botões, eles
 * disputavam espaço com a informação de processo e pareciam três assuntos.
 *
 * A contagem em zero fica cinza e sem destaque, mas **continua na tela**: o
 * "0" na prioridade baixa é informação, e esconder o zero obrigaria quem lê a
 * contar quantas caixas apareceram para saber qual delas falta.
 */
function AlarmCount({
  alarms,
  onClick,
}: {
  readonly alarms: Readonly<Record<DesignPriority, number>>;
  readonly onClick: () => void;
}) {
  const niveis = [1, 2, 3] as const;
  const total = niveis.reduce((soma, nivel) => soma + alarms[nivel], 0);
  const descricao = niveis
    .map((nivel) => `${String(alarms[nivel])} de prioridade ${PRIORITY_LABEL[nivel].toLowerCase()}`)
    .join(', ');

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${String(total)} alarmes ativos: ${descricao}`}
      title="Alarmes ativos por prioridade"
      className="flex h-7 shrink-0 items-center gap-2.5 border border-line-strong px-2.5 hover:border-action"
    >
      {niveis.map((nivel) => {
        const count = alarms[nivel];
        const on = count > 0;
        return (
          <span key={nivel} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-[7px] shrink-0"
              style={{ background: on ? PRIORITY_COLOR[nivel] : 'var(--color-band)' }}
            />
            <span
              className={`font-mono text-[13px] ${on ? 'font-semibold text-fg' : 'text-fg-3'}`}
              style={on ? { color: PRIORITY_COLOR[nivel] } : undefined}
            >
              {count}
            </span>
          </span>
        );
      })}
    </button>
  );
}
