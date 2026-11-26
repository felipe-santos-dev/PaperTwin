import type { ReactNode } from 'react';

import { PRIORITY_CLASS, PRIORITY_LABEL, type DesignPriority } from './priority';
import { RangeBar } from './RangeBar';
import { RAIL_SCREENS, type ScreenId } from './screens';
import { SectionBlock } from './SectionBlock';
import type { SectionState } from './sections';

/**
 * A moldura das nove telas: barra superior, navegação 1–9 e faixa do processo.
 *
 * Medidas do design (fonte/Main.dc.html): navegação de 56 px à esquerda, barra
 * de 48 px no alto e, logo abaixo, a faixa de 64 px com as dez seções. O resto
 * é da tela, com 16 px de respiro. A moldura não rola; quem rola, se precisar,
 * é o conteúdo — e nunca na horizontal.
 *
 * Nada aqui é `<aside>`: o painel do ativo na tela de Máquina é o único
 * complementar da página, e o e2e o encontra por esse papel.
 *
 * ## A barra superior em 1280 px
 *
 * A barra era uma fila de blocos `shrink-0` com espaçamento fixo. A soma deles
 * passa de 1600 px, e em 1280 o navegador faz a única coisa que pode: deixa os
 * blocos se atropelarem. Era por isso que "Turno B · 14:00–22:00" desaparecia
 * atrás de Gramatura e o "m/min" ficava debaixo da busca — não havia largura
 * para os dois, e nada na folha de estilo dizia quem cedia.
 *
 * Agora está dito, em duas camadas:
 *
 * 1. **Cada bloco de texto encolhe e corta** (`min-w-0` com `truncate`). Sem
 *    `min-w-0`, um filho de flex não encolhe abaixo do conteúdo — ele estoura,
 *    e é esse estouro que vira sobreposição.
 * 2. **Entre 1280 e 1440, os extras saem** (`max-largo:hidden`): o nome do
 *    operador, o dia ao lado do relógio e a barra de faixa da velocidade. São
 *    as três coisas da barra que alguém consulta, e não as que alguém opera.
 *
 * O que nunca sai: turno, gramatura, velocidade, os três contadores de alarme,
 * a fonte de dados e a hora.
 */

export interface FrameTop {
  /** Turno em curso: letra, janela e operador. */
  readonly shift: {
    readonly letter: string;
    readonly window: string;
    readonly operator: string;
  } | null;
  readonly gramatura: { readonly text: string; readonly unit: string } | null;
  readonly speed: {
    readonly text: string;
    readonly unit: string;
    readonly value: number | null;
    readonly bar: {
      readonly min: number;
      readonly max: number;
      readonly l: number | null;
      readonly h: number | null;
      readonly target: number | null;
    };
  } | null;
  readonly alarms: Readonly<Record<DesignPriority, number>>;
  /** Hora da leitura (`HH:MM:SS`) e o dia (`seg 09/11`). */
  readonly clock: { readonly time: string; readonly date: string } | null;
}

export interface ShellProps {
  readonly screen: ScreenId;
  readonly go: (id: ScreenId) => void;
  readonly top: FrameTop;
  /** O selo da fonte de dados. */
  readonly source: ReactNode;
  /**
   * O campo de busca, no meio da barra.
   *
   * Entra como nó pronto, como o selo da fonte: a moldura não sabe de onde os
   * resultados saem nem para onde cada um leva — quem sabe disso é a aplicação,
   * que já tem os abridores de tela.
   */
  readonly search?: ReactNode;
  readonly sections: readonly SectionState[];
  /** A seção aberta em Processo, para marcar na faixa. */
  readonly area: string | null;
  readonly onArea: (area: string) => void;
  /** Um aviso que pede ação (a API voltou, por exemplo). */
  readonly banner?: ReactNode;
  /**
   * Contadores na navegação, por tela.
   *
   * Hoje um só: as notas sugeridas esperando decisão. Ele fica na moldura, e não
   * na tela de Notas, porque quem está no Processo também precisa saber que a
   * manutenção tem uma decisão parada — é o que faz o ciclo da Fase 6 fechar.
   */
  readonly badges?: Partial<Record<ScreenId, number>> | undefined;
  readonly children: ReactNode;
}

export function Shell({
  screen,
  go,
  top,
  source,
  search,
  sections,
  area,
  onArea,
  banner,
  badges,
  children,
}: ShellProps) {
  return (
    <div className="flex h-full min-w-0 flex-col bg-base">
      <NarrowNotice />
      <div className="grid min-h-0 min-w-0 flex-1 grid-cols-[56px_minmax(0,1fr)] grid-rows-[48px_64px_auto_minmax(0,1fr)] bg-base">
        <NavRail screen={screen} go={go} badges={badges} />
        <TopBar
          top={top}
          source={source}
          search={search}
          onAlarms={() => {
            go('turno');
          }}
        />

        <div
          role="navigation"
          aria-label="Seções do processo"
          className="col-start-2 flex min-w-0 gap-1 overflow-hidden border-b border-line px-4 py-2"
        >
          {sections.map((section) => (
            <SectionBlock
              key={section.id}
              label={section.label}
              out={section.out}
              selected={screen === 'processo' && area === section.id}
              onClick={() => {
                onArea(section.id);
              }}
            />
          ))}
        </div>

        <div className="col-start-2 min-w-0">{banner}</div>

        <main className="col-start-2 flex min-h-0 min-w-0 flex-col gap-4 overflow-x-hidden overflow-y-auto p-4">
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
 *
 * O texto diz a largura em números porque é o que resolve o problema de quem
 * está lendo: "maximize a janela" não ajuda quem está num monitor de 1024.
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
      className="row-span-4 flex flex-col items-center border-r border-line bg-chrome"
    >
      <div className="flex h-12 w-14 shrink-0 items-center justify-center border-b border-line text-[13px] font-semibold tracking-[0.02em] text-fg">
        PT
      </div>
      {RAIL_SCREENS.map((item) => {
        const active = item.id === screen;
        const count = badges?.[item.id] ?? 0;
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
            <span aria-hidden="true" className="text-[16px] leading-none font-semibold">
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
  return <div aria-hidden="true" className="h-6 w-px shrink-0 bg-line-strong" />;
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
    <header className="col-start-2 flex min-w-0 items-center gap-3 border-b border-line bg-chrome px-4 largo:gap-5">
      <div className="flex shrink-0 items-baseline gap-2.5">
        <span className="text-[15px] font-semibold">MP1</span>
        <span className="text-[12px] text-fg-3 max-largo:hidden">PaperTwin</span>
      </div>
      <Divider />
      {top.shift ? (
        <div className="flex min-w-0 shrink items-baseline gap-2 whitespace-nowrap">
          <span className="shrink-0 text-[13px] font-semibold">Turno {top.shift.letter}</span>
          <span className="shrink-0 font-mono text-[12px] text-fg-2">{top.shift.window}</span>
          {/* o nome do operador é o primeiro extra a sair: ele é consulta, e a
              janela do turno é operação */}
          <span className="min-w-0 truncate text-[12px] text-fg-2 max-largo:hidden">
            {top.shift.operator}
          </span>
        </div>
      ) : null}
      <Divider />
      <div className="flex shrink-0 items-baseline gap-1.5 whitespace-nowrap">
        <span className="text-[11px] text-fg-3">Gramatura</span>
        <span className="font-mono text-[14px] font-medium">{top.gramatura?.text ?? '—'}</span>
        <span className="text-[11px] text-fg-2">{top.gramatura?.unit ?? ''}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
        <span className="text-[11px] text-fg-3">Velocidade</span>
        <span className="font-mono text-[14px] font-medium">{top.speed?.text ?? '—'}</span>
        <span className="text-[11px] text-fg-2">{top.speed?.unit ?? ''}</span>
        {top.speed ? (
          <RangeBar
            size="sm"
            min={top.speed.bar.min}
            max={top.speed.bar.max}
            l={top.speed.bar.l}
            h={top.speed.bar.h}
            target={top.speed.bar.target}
            pv={top.speed.value}
            className="w-18 max-largo:hidden"
            label="Velocidade na faixa"
          />
        ) : null}
      </div>

      {search ?? <div className="min-w-0 flex-1" />}

      <div className="flex shrink-0 items-center gap-1.5">
        <span className="mr-1 text-[11px] text-fg-3 max-largo:hidden">Alarmes</span>
        {([1, 2, 3] as const).map((priority) => {
          const count = top.alarms[priority];
          const tone = PRIORITY_CLASS[priority];
          const on = count > 0;
          return (
            <button
              key={priority}
              type="button"
              onClick={onAlarms}
              aria-label={`${String(count)} alarmes de prioridade ${PRIORITY_LABEL[priority].toLowerCase()}`}
              className={`flex h-7 items-center gap-1.5 border px-2 hover:border-action ${
                on ? `${tone.border} ${tone.tint}` : 'border-line-strong bg-cell'
              }`}
            >
              <span aria-hidden="true" className={`size-2 ${on ? tone.fill : 'bg-band'}`} />
              <span
                className={`font-mono text-[13px] ${on ? `font-semibold ${tone.text}` : 'text-fg-3'}`}
              >
                {count}
              </span>
              <span
                className={`text-[11px] whitespace-nowrap max-largo:hidden ${on ? 'text-fg' : 'text-fg-3'}`}
              >
                {PRIORITY_LABEL[priority]}
              </span>
            </button>
          );
        })}
      </div>
      <Divider />
      {source}
      {top.clock ? (
        <div className="flex shrink-0 items-baseline gap-2 whitespace-nowrap">
          <span className="font-mono text-[15px] font-medium">{top.clock.time}</span>
          {/* o dia sai antes da hora: quem olha o relógio quer a hora */}
          <span className="font-mono text-[11px] text-fg-3 max-largo:hidden">{top.clock.date}</span>
        </div>
      ) : null}
    </header>
  );
}
