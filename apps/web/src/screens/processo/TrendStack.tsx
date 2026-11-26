import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { Alarm, SetpointChange } from '@mp1/shared';

import type { DataGateway } from '../../api/gateway';
import type { TagTrend } from '../../api/process';
import { linear, type Linear } from '../../ui/chart/scale';
import { seriesOf, type Point } from '../../ui/chart/series';
import { hhmm, num, tagValue } from '../../ui/format';
import { Illustrative, Panel } from '../../ui/Panel';
import { ResourceState } from '../../ui/ResourceState';
import { isOut, tagScale } from '../../ui/tagScale';
import { useResource } from '../../ui/useResource';
import { useWidth } from '../../ui/useWidth';

/**
 * Tendência multi-TAG: uma faixa por TAG, todas no mesmo eixo de tempo.
 *
 * Cada faixa tem a sua escala — pressão em kPa e ponto de orvalho em °C não
 * dividem eixo vertical —, com a banda L–H ao fundo, a alteração de setpoint
 * em azul e o alarme na cor da prioridade. O eixo de tempo é o que as
 * respostas cobrem: o instantâneo de demonstração guarda 4 h, e pedir 24 h a
 * ele mostra as 4 h que existem, não 24 h com 20 vazias.
 */

export type TrendWindow = '1h' | '8h' | '24h' | '7d';

const WINDOW_MS: Readonly<Record<TrendWindow, number>> = {
  '1h': 3_600_000,
  '8h': 8 * 3_600_000,
  '24h': 24 * 3_600_000,
  '7d': 7 * 24 * 3_600_000,
};

const WINDOW_LABEL: Readonly<Record<TrendWindow, string>> = {
  '1h': '1 h',
  '8h': '8 h',
  '24h': '24 h',
  '7d': '7 d',
};

export const MAX_TREND_TAGS = 4;

/** O `gap-1.5` do cabeçalho, em pixels, que entra na conta do que cabe. */
const GAP_PX = 6;

export interface TrendStackProps {
  readonly gateway: DataGateway;
  readonly tags: readonly string[];
  readonly now: number;
  /** TAGs que vêm do dado fixo (preparo): a tendência sai da rota fixa e leva selo. */
  readonly fixedTags: ReadonlySet<string>;
  readonly options: readonly { readonly tag: string; readonly name: string }[];
  readonly setpoints: readonly SetpointChange[];
  readonly alarms: readonly Alarm[];
  readonly onAdd: (tag: string) => void;
  readonly onRemove: (tag: string) => void;
  readonly className?: string;
}

export function TrendStack(props: TrendStackProps) {
  const { gateway, tags, now, fixedTags } = props;
  const [window, setWindow] = useState<TrendWindow>('8h');

  const trends = useResource(
    useCallback(
      (signal: AbortSignal) => {
        const query = { from: new Date(now - WINDOW_MS[window]), to: new Date(now), buckets: 240 };
        return Promise.all(
          tags.map((tag) =>
            (fixedTags.has(tag)
              ? (gateway.fixedTrend(tag, query, signal) as Promise<TagTrend>)
              : gateway.tagTrend(tag, query, signal)
            ).catch(() => null),
          ),
        );
      },
      [gateway, tags, now, window, fixedTags],
    ),
  );

  return (
    <Panel
      help="processo.tendencia"
      title="Tendência"
      className={props.className ?? ''}
      aside={
        <>
          <Escolhidas {...props} />
          <div
            role="group"
            aria-label="Janela da tendência"
            className="flex shrink-0 border border-line-strong"
          >
            {(Object.keys(WINDOW_MS) as TrendWindow[]).map((key, index) => (
              <button
                key={key}
                type="button"
                aria-pressed={window === key}
                onClick={() => {
                  setWindow(key);
                }}
                className={`h-6 px-1.5 text-[11px] ${index > 0 ? 'border-l border-line-strong' : ''} ${
                  window === key
                    ? 'bg-[#1b2a44] text-[#cfe0ff]'
                    : 'text-fg-2 hover:bg-hover hover:text-fg'
                }`}
              >
                {WINDOW_LABEL[key]}
              </button>
            ))}
          </div>
        </>
      }
      bodyClassName="flex min-h-0 flex-col"
    >
      {tags.length === 0 ? (
        <p className="py-4 text-[12px] text-fg-3">Escolha uma variável na tabela ou em “+ TAG”.</p>
      ) : (
        <ResourceState resource={trends} label="as tendências">
          {(list) => (
            <Rows
              tags={tags}
              trends={list}
              now={now}
              fixedTags={fixedTags}
              setpoints={props.setpoints}
              alarms={props.alarms}
            />
          )}
        </ResourceState>
      )}
    </Panel>
  );
}

/**
 * As TAGs escolhidas e o "+ TAG", na linha do título.
 *
 * Ficavam no corpo do painel, acima dos gráficos, e aí comiam uma linha inteira
 * da área que é o painel: o gráfico. No cabeçalho elas convivem com os botões
 * de janela, que são o outro controle do mesmo bloco — e a área de desenho
 * começa logo abaixo da borda.
 *
 * ## Por que medir, em vez de escolher um número
 *
 * A linha tem 493 px de conteúdo e 402 px de espaço quando a janela é de
 * 1440 px — e sobra folga quando é de 1920. Um "mostre duas e esconda o resto"
 * escondia TAG à toa na tela larga e ainda estourava na estreita, porque o
 * tamanho de um chip depende do nome da TAG (`JI-111` e `PDIC-521` não medem o
 * mesmo). Então a conta é feita com as larguras reais: uma régua invisível
 * desenha todas as peças no tamanho natural, e a linha mostra quantas couberem.
 *
 * A régua existe para a medida não depender do que está na tela. Medir as peças
 * visíveis faria o resultado mudar o layout, que mudaria o resultado — esconder
 * uma TAG sobraria espaço, que traria a TAG de volta, que faltaria espaço.
 */
function Escolhidas({ tags, alarms, options, onAdd, onRemove }: TrendStackProps) {
  const [adding, setAdding] = useState(false);
  const [abertas, setAbertas] = useState(false);
  const [cabem, setCabem] = useState(tags.length);
  const caixa = useRef<HTMLDivElement>(null);
  const régua = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const caixaEl = caixa.current;
    const réguaEl = régua.current;
    if (!caixaEl || !réguaEl) return;

    const medir = (): void => {
      const peças = [...réguaEl.children].map((peça) => (peça as HTMLElement).offsetWidth);
      // a régua desenha, nesta ordem: as TAGs, o "+N" e o "+ TAG"
      const maisN = peças.at(-2) ?? 0;
      const addTag = peças.at(-1) ?? 0;
      const larguras = peças.slice(0, -2);

      const reservado = addTag + GAP_PX;
      let usado = 0;
      let quantas = 0;

      for (const [índice, largura] of larguras.entries()) {
        const sobram = larguras.length - índice - 1;
        // o "+N" só ocupa lugar se ainda houver TAG escondida depois desta
        const comMais = sobram > 0 ? maisN + GAP_PX : 0;
        if (reservado + usado + largura + comMais > caixaEl.clientWidth) break;
        usado += largura + GAP_PX;
        quantas += 1;
      }

      // uma sempre aparece: um cabeçalho só com "+3" não diz o que está no gráfico
      setCabem(Math.max(1, quantas));
    };

    medir();

    // o jsdom não tem ResizeObserver, e sem layout não haveria o que observar
    if (typeof ResizeObserver === 'undefined') return;
    const observador = new ResizeObserver(medir);
    observador.observe(caixaEl);
    return () => {
      observador.disconnect();
    };
  }, [tags]);

  const visíveis = tags.slice(0, cabem);
  const escondidas = tags.slice(cabem);
  // a lista aberta some sozinha quando a janela cresce e todas voltam a caber
  const aberta = abertas && escondidas.length > 0;

  const chip = (tag: string) => (
    <Chip
      key={tag}
      tag={tag}
      alarm={alarms.some((item) => item.tag === tag)}
      onRemove={() => {
        onRemove(tag);
      }}
    />
  );

  return (
    <div
      ref={caixa}
      className="relative flex min-w-0 flex-1 items-center justify-end gap-1.5 overflow-hidden"
    >
      {/* a régua: as mesmas peças, no tamanho natural, fora da vista */}
      {/*
        `inert` além de `aria-hidden`: a régua tem botões de verdade dentro, e um
        botão invisível no caminho do Tab é pior do que não medir nada.
      */}
      <div
        ref={régua}
        inert
        aria-hidden="true"
        className="pointer-events-none invisible absolute top-0 left-0 flex gap-1.5"
      >
        {tags.map((tag) => (
          <Chip key={tag} tag={tag} alarm={false} onRemove={() => undefined} />
        ))}
        <Mais quantas={tags.length} aberta={false} onToggle={() => undefined} />
        <AddTag cheio={false} onClick={() => undefined} />
      </div>

      {visíveis.map((tag) => chip(tag))}

      {escondidas.length > 0 ? (
        <span className="relative flex shrink-0 items-center">
          <Mais
            quantas={escondidas.length}
            aberta={aberta}
            onToggle={() => {
              setAbertas((valor) => !valor);
            }}
          />
          {aberta ? (
            <div
              role="dialog"
              aria-label="TAGs da tendência"
              className="absolute top-7 right-0 z-30 flex w-44 flex-col gap-1 border border-line-strong bg-chrome p-2 shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
            >
              {escondidas.map((tag) => chip(tag))}
            </div>
          ) : null}
        </span>
      ) : null}

      {tags.length < MAX_TREND_TAGS ? (
        adding ? (
          <select
            autoFocus
            aria-label="TAG para a tendência"
            defaultValue=""
            onChange={(event) => {
              if (event.target.value) onAdd(event.target.value);
              setAdding(false);
            }}
            onBlur={() => {
              setAdding(false);
            }}
            className="h-6 max-w-40 shrink border border-action bg-cell px-1 font-mono text-[11px] text-fg"
          >
            <option value="">escolha…</option>
            {options
              .filter((option) => !tags.includes(option.tag))
              .map((option) => (
                <option key={option.tag} value={option.tag}>
                  {option.tag} · {option.name}
                </option>
              ))}
          </select>
        ) : (
          <AddTag
            cheio={false}
            onClick={() => {
              setAdding(true);
            }}
          />
        )
      ) : null}
    </div>
  );
}

function Chip({
  tag,
  alarm,
  onRemove,
}: {
  readonly tag: string;
  readonly alarm: boolean;
  readonly onRemove: () => void;
}) {
  return (
    <span
      className={`inline-flex h-6 shrink-0 items-center gap-1 border px-1.5 font-mono text-[11px] ${
        alarm ? 'border-alarm-2 text-alarm-2' : 'border-line-strong text-fg'
      }`}
    >
      {tag}
      <button
        type="button"
        aria-label={`Tirar ${tag} da tendência`}
        onClick={onRemove}
        className="text-fg-3 hover:text-fg"
      >
        ×
      </button>
    </span>
  );
}

/** O "+N" das TAGs que não couberam na linha. */
function Mais({
  quantas,
  aberta,
  onToggle,
}: {
  readonly quantas: number;
  readonly aberta: boolean;
  readonly onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={aberta}
      aria-label={`Mais ${String(quantas)} TAG(s) na tendência`}
      title="As TAGs que não couberam na linha"
      onClick={onToggle}
      /*
        `ml-auto` encosta o "+N" à direita do que sobrou da linha.

        Sem ele, o botão ficava no fim da fila de chips e a fila inteira era
        empurrada para a esquerda pela caixa do aside — o "+N" acabava metade
        fora da borda esquerda. Encostado à direita e com `shrink-0`, ele tem o
        lugar dele garantido e são os chips que cedem.
      */
      className={`ml-auto h-6 shrink-0 border px-1.5 font-mono text-[11px] whitespace-nowrap ${
        aberta ? 'border-action text-action' : 'border-line-strong text-fg-2 hover:text-fg'
      }`}
    >
      +{quantas}
    </button>
  );
}

function AddTag({ cheio, onClick }: { readonly cheio: boolean; readonly onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={cheio}
      onClick={onClick}
      className="h-6 shrink-0 border border-dashed border-action px-1.5 font-mono text-[11px] text-action hover:text-action-hover"
    >
      + TAG
    </button>
  );
}

/**
 * Os passos possíveis do eixo de tempo, do mais fino ao mais grosso.
 *
 * São os múltiplos que alguém lê sem contar: quinze minutos, meia hora, hora,
 * duas, três, quatro, seis, doze, um dia. Um passo de 37 min daria rótulos
 * tecnicamente espaçados e praticamente ilegíveis.
 */
const PASSOS_MS = [
  15 * 60_000,
  30 * 60_000,
  3_600_000,
  2 * 3_600_000,
  3 * 3_600_000,
  4 * 3_600_000,
  6 * 3_600_000,
  12 * 3_600_000,
  24 * 3_600_000,
] as const;

/** Espaço mínimo entre dois rótulos de hora, em px: `00:00` mais respiro. */
const ESPACO_MINIMO_PX = 64;

/**
 * O passo do eixo, escolhido pela largura que o eixo tem.
 *
 * O passo era função só da duração da janela: numa janela de três horas ele
 * dava quinze minutos, ou doze rótulos — que cabem nos 900 px de 1920 e viram
 * uma mancha nos 420 px que o eixo tem em 1280. Era o "eixo de tempo da
 * Tendência ilegível" da revisão.
 *
 * Agora a largura entra na conta: pede-se o menor passo da lista que deixe cada
 * rótulo com `ESPACO_MINIMO_PX` de espaço. Em 1920 nada muda, porque lá o passo
 * fino já cabia; em 1280 o eixo passa a mostrar menos marcas, legíveis.
 */
export function passoDoEixo(duracaoMs: number, larguraPx: number): number {
  const cabem = Math.max(2, Math.floor(larguraPx / ESPACO_MINIMO_PX));
  const minimo = duracaoMs / cabem;
  return PASSOS_MS.find((passo) => passo >= minimo) ?? PASSOS_MS[PASSOS_MS.length - 1]!;
}

function Rows({
  tags,
  trends,
  now,
  fixedTags,
  setpoints,
  alarms,
}: {
  readonly tags: readonly string[];
  readonly trends: readonly (TagTrend | null)[];
  readonly now: number;
  readonly fixedTags: ReadonlySet<string>;
  readonly setpoints: readonly SetpointChange[];
  readonly alarms: readonly Alarm[];
}) {
  const [ref, width] = useWidth<HTMLDivElement>(500);
  const covered = trends.filter((trend): trend is TagTrend => trend !== null);
  const from = Math.min(...covered.map((trend) => Date.parse(trend.from)));
  const to = Math.max(now, ...covered.map((trend) => Date.parse(trend.to)));
  if (!Number.isFinite(from)) {
    return (
      <p className="py-4 text-[12px] text-fg-3">
        O historiador não devolveu série para estas TAGs.
      </p>
    );
  }
  const x = linear([from, to], [0, width]);
  const step = passoDoEixo(to - from, width);
  const ticks: number[] = [];
  for (let t = Math.ceil(from / step) * step; t <= to; t += step) ticks.push(t);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tags.map((tag, index) => (
          <Row
            key={tag}
            tag={tag}
            trend={trends[index] ?? null}
            x={x}
            width={width}
            now={now}
            fixed={fixedTags.has(tag)}
            setpoints={setpoints.filter((change) => change.tag === tag)}
            alarms={alarms.filter((alarm) => alarm.tag === tag)}
            measure={index === 0 ? ref : undefined}
          />
        ))}
      </div>
      <div className="grid grid-cols-[84px_minmax(0,1fr)_96px] gap-x-3 pt-1">
        <span />
        <div className="relative h-4">
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute -translate-x-1/2 font-mono text-[10px] whitespace-nowrap text-fg-3"
              style={{ left: x(t) }}
            >
              {step >= 24 * 3_600_000
                ? new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
                : hhmm(new Date(t).toISOString())}
            </span>
          ))}
        </div>
        <span />
      </div>
    </div>
  );
}

function Row({
  tag,
  trend,
  x,
  width,
  now,
  fixed,
  setpoints,
  alarms,
  measure,
}: {
  readonly tag: string;
  readonly trend: TagTrend | null;
  readonly x: Linear;
  readonly width: number;
  readonly now: number;
  readonly fixed: boolean;
  readonly setpoints: readonly SetpointChange[];
  readonly alarms: readonly Alarm[];
  readonly measure: React.Ref<HTMLDivElement> | undefined;
}) {
  const scale = tagScale(tag);
  const points: Point[] = trend ? seriesOf(trend, now) : [];
  const last = points.at(-1);
  const H = 46;
  const values = points.map((p) => p.v);
  const lo = Math.min(scale?.l ?? Infinity, scale?.ll ?? Infinity, ...values);
  const hi = Math.max(scale?.h ?? -Infinity, scale?.hh ?? -Infinity, ...values);
  const pad = (hi - lo) * 0.25 || Math.abs(hi) * 0.05 || 1;
  const y = linear([lo - pad, hi + pad], [H - 2, 2]);
  const path = points
    .map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`)
    .join(' ');
  const out = scale && last ? isOut(scale, last.v) : false;
  const inside = (t: number) => t >= x.domain[0] && t <= x.domain[1];
  const marks = [
    ...setpoints
      .filter((change) => inside(Date.parse(change.changedAt)))
      .map((change) => ({
        t: Date.parse(change.changedAt),
        color: 'var(--color-action)',
        text: `SP ${num(change.previousValue, 1)}→${num(change.newValue, 1)} · ${hhmm(change.changedAt)}`,
      })),
    ...alarms
      .filter((alarm) => inside(Date.parse(alarm.raisedAt)))
      .map((alarm) => ({
        t: Date.parse(alarm.raisedAt),
        color: 'var(--color-alarm-2)',
        text: `${alarm.limit} · ${hhmm(alarm.raisedAt)}`,
      })),
  ];

  return (
    <div className="grid min-h-[70px] grid-cols-[84px_minmax(0,1fr)_96px] items-center gap-x-3 border-b border-line">
      <div className="min-w-0">
        <div className="font-mono text-[11px] text-fg-2">{tag}</div>
        <div className="truncate text-[10px] text-fg-3">{scale?.name ?? ''}</div>
        {fixed ? <Illustrative /> : null}
      </div>
      <div ref={measure} className="relative min-w-0" style={{ height: H + 16 }}>
        <svg
          aria-label={`Tendência de ${tag}`}
          role="img"
          width={width}
          height={H + 16}
          className="block overflow-visible"
        >
          <g transform="translate(0 14)">
            <rect x={0} width={width} y={0} height={H} fill="#161b22" />
            {scale?.l != null && scale.h != null ? (
              <rect
                x={0}
                width={width}
                y={y(scale.h)}
                height={Math.max(0, y(scale.l) - y(scale.h))}
                fill="var(--color-track)"
              />
            ) : null}
            {marks.map((mark) => (
              <line
                key={`${mark.text}`}
                x1={x(mark.t)}
                x2={x(mark.t)}
                y1={-14}
                y2={H}
                stroke={mark.color}
              />
            ))}
            <path d={path} fill="none" stroke="#c9ced6" strokeWidth={1.3} strokeLinejoin="round" />
            {last ? (
              <circle
                cx={x(last.t)}
                cy={y(last.v)}
                r={2.5}
                fill={out ? 'var(--color-alarm-2)' : 'var(--color-fg)'}
              />
            ) : null}
          </g>
        </svg>
        {marks.map((mark) => (
          <span
            key={`l-${mark.text}`}
            className="absolute top-0 font-mono text-[10px] whitespace-nowrap"
            style={{ left: Math.min(width - 130, x(mark.t) + 4), color: mark.color }}
          >
            {mark.text}
          </span>
        ))}
        {points.length === 0 ? (
          <span className="absolute inset-0 flex items-center justify-center text-[11px] text-fg-3">
            sem série na janela
          </span>
        ) : null}
      </div>
      <div className="text-right">
        <span className={`font-mono text-[14px] ${out ? 'text-alarm-2' : ''}`}>
          {last ? tagValue(last.v, scale?.unit ?? '') : '—'}
        </span>
        <span className="ml-1 text-[11px] text-fg-2">{scale?.unit ?? ''}</span>
      </div>
    </div>
  );
}
