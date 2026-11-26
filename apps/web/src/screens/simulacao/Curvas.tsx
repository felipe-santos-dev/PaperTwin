import type { LoopMode, WhatIfVariable } from '@mp1/shared/simulation';

import { linear } from '../../ui/chart/scale';
import { signedNum, signedTagValue } from '../../ui/format';
import { Panel } from '../../ui/Panel';
import { useWidth } from '../../ui/useWidth';
import { minutos } from './frase';

/**
 * O centro: uma curva por variável alcançada, no mesmo eixo de tempo.
 *
 * Cada faixa tem a sua escala vertical — gramatura em g/m² e pressão em kPa não
 * dividem eixo —, mas o tempo é o mesmo de cima a baixo, e é por isso que dá
 * para ler a cadeia: o vapor sobe, a umidade começa a cair três minutos depois,
 * a gramatura atrás dela.
 *
 * ## Duas linhas, e o que importa é a distância
 *
 * A cinza é o que aconteceria sem mexer e a azul é a proposta. Numa máquina que
 * já estava se movendo, a curva proposta sozinha mistura a mudança com o que ia
 * acontecer de todo jeito; a diferença entre as duas é só a mudança.
 *
 * ## Comparar modos
 *
 * Com o alternador ligado, a mesma mudança aparece duas vezes: em automático
 * (cheia) e em manual (tracejada). O espaço entre elas é exatamente o que o
 * controle faz — a parte do desvio que a malha come. É a coisa mais difícil de
 * explicar com palavras e a mais fácil de ver num gráfico.
 */

export interface CurvasProps {
  readonly principal: readonly WhatIfVariable[];
  /** O mesmo pedido no outro modo, quando "comparar modos" está ligado. */
  readonly comparado: readonly WhatIfVariable[] | null;
  readonly modo: LoopMode;
  readonly stepS: number;
  readonly horizonS: number;
  readonly frase: string;
  readonly comparar: boolean;
  readonly onComparar: (value: boolean) => void;
  readonly podeComparar: boolean;
  /** A variável destacada pela tabela, se houver. */
  readonly selected: string | null;
  readonly onSelect: (tag: string | null) => void;
  /** Uma conta em curso: o resultado na tela ainda é o anterior. */
  readonly atualizando: boolean;
  /** A última conta recusada, se houve: o gráfico na tela é o de antes dela. */
  readonly erro: string | null;
  readonly className?: string;
}

export function Curvas(props: CurvasProps) {
  const { principal, comparado, selected } = props;
  const [ref, width] = useWidth<HTMLDivElement>(560);
  const outro = new Map((comparado ?? []).map((item) => [item.tag, item]));

  const x = linear([0, Math.max(1, props.horizonS)], [0, width]);
  const passo = passoDoEixo(props.horizonS);
  const marcas: number[] = [];
  for (let t = 0; t <= props.horizonS + 1; t += passo) marcas.push(t);

  return (
    <Panel
      help="simulacao.curvas"
      title="Resposta prevista"
      context={
        props.atualizando ? (
          <span role="status" className="text-fg-3">
            recalculando…
          </span>
        ) : undefined
      }
      className={props.className ?? ''}
      aside={
        <label
          className={`flex items-center gap-1.5 text-[11px] ${
            props.podeComparar ? 'text-fg-2' : 'text-fg-3/60'
          }`}
          title={
            props.podeComparar
              ? 'Desenha automático e manual no mesmo gráfico'
              : 'Esta malha só existe num dos modos: em cascata, o setpoint é do mestre e a válvula é da escrava'
          }
        >
          <input
            type="checkbox"
            checked={props.comparar && props.podeComparar}
            disabled={!props.podeComparar}
            onChange={(event) => {
              props.onComparar(event.target.checked);
            }}
            className="size-3.5 accent-action"
          />
          comparar modos
        </label>
      }
      bodyClassName="flex min-h-0 flex-col"
    >
      {props.erro === null ? null : (
        <p
          role="alert"
          className="mb-2 shrink-0 border-l-2 border-alarm-1 pl-2.5 text-[12px] text-fg-2"
        >
          {props.erro} · o gráfico abaixo é a última previsão que deu certo.
        </p>
      )}

      <p className="mb-3 shrink-0 border-l-2 border-action pl-2.5 text-[15px] leading-[1.35] text-fg">
        {props.frase}
      </p>

      <Legenda comparar={props.comparar && props.podeComparar} modo={props.modo} />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {principal.length === 0 ? (
          <p className="py-4 text-[12px] text-fg-3">
            A mudança não alcança nenhuma variável do catálogo neste horizonte.
          </p>
        ) : (
          principal.map((item, index) => (
            <Faixa
              key={item.tag}
              item={item}
              outro={outro.get(item.tag) ?? null}
              x={x}
              width={width}
              stepS={props.stepS}
              dim={selected !== null && selected !== item.tag}
              selected={selected === item.tag}
              onSelect={() => {
                props.onSelect(selected === item.tag ? null : item.tag);
              }}
              measure={index === 0 ? ref : undefined}
            />
          ))
        )}
      </div>

      <div className="grid shrink-0 grid-cols-[112px_minmax(0,1fr)] gap-x-3 border-t border-line pt-1">
        <span className="font-mono text-[10px] text-fg-3">tempo</span>
        <div className="relative h-4">
          {/*
            Cada marca é deslocada pela própria posição no eixo.

            Com `-translate-x-1/2` em todas, a primeira ("agora") saía metade
            para fora da coluna à esquerda e a última entrava na borda do painel
            à direita — e, nas larguras estreitas, as duas pontas encostavam nas
            vizinhas. Deslocando por `-posição`, as pontas ficam alinhadas às
            bordas e o meio continua centrado.
          */}
          {marcas.map((t) => {
            const f = marcas.length > 1 ? t / (marcas.at(-1) ?? 1) : 0;
            return (
              <span
                key={t}
                className="absolute font-mono text-[10px] whitespace-nowrap text-fg-3"
                style={{ left: x(t), transform: `translateX(${String(-f * 100)}%)` }}
              >
                {t === 0 ? 'agora' : minutos(t)}
              </span>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}

/** Marcas de tempo legíveis: 5, 10 e 30 min pedem passos diferentes. */
function passoDoEixo(horizonS: number): number {
  if (horizonS <= 300) return 60;
  if (horizonS <= 600) return 120;
  return 300;
}

function Legenda({ comparar, modo }: { readonly comparar: boolean; readonly modo: LoopMode }) {
  return (
    <div className="mb-1.5 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-fg-3">
      <Traco color="var(--color-tick)" /> sem mexer
      {comparar ? (
        <>
          <Traco color="var(--color-action)" /> automático
          <Traco color="var(--color-action-hover)" dashed /> manual
        </>
      ) : (
        <>
          <Traco color="var(--color-action)" /> proposta (
          {modo === 'auto' ? 'automático' : 'manual'})
        </>
      )}
      <span className="ml-auto">
        tracejado vertical = tempo morto · ▾ = 63 % · vermelho = limite
      </span>
    </div>
  );
}

function Traco({ color, dashed = false }: { readonly color: string; readonly dashed?: boolean }) {
  return (
    <svg aria-hidden="true" width={16} height={6} className="shrink-0">
      <line
        x1={0}
        x2={16}
        y1={3}
        y2={3}
        stroke={color}
        strokeWidth={1.6}
        {...(dashed ? { strokeDasharray: '3 2' } : {})}
      />
    </svg>
  );
}

const H = 64;

function Faixa({
  item,
  outro,
  x,
  width,
  stepS,
  dim,
  selected,
  onSelect,
  measure,
}: {
  readonly item: WhatIfVariable;
  readonly outro: WhatIfVariable | null;
  readonly x: (value: number) => number;
  readonly width: number;
  readonly stepS: number;
  readonly dim: boolean;
  readonly selected: boolean;
  readonly onSelect: () => void;
  readonly measure: React.Ref<HTMLDivElement> | undefined;
}) {
  const todos = [...item.base, ...item.proposed, ...(outro?.proposed ?? [])];
  const limites = [item.limits.l, item.limits.h].filter((v): v is number => v !== null);
  const lo = Math.min(...todos, ...limites);
  const hi = Math.max(...todos, ...limites);
  const pad = (hi - lo) * 0.15 || Math.abs(hi) * 0.02 || 0.5;
  const y = linear([lo - pad, hi + pad], [H - 4, 4]);

  const path = (serie: readonly number[]) =>
    serie.map((v, i) => `${i ? 'L' : 'M'}${x(i * stepS).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');

  const faixa =
    item.limits.l !== null && item.limits.h !== null
      ? { top: y(item.limits.h), height: Math.max(1, y(item.limits.l) - y(item.limits.h)) }
      : null;

  const pico = Math.abs(item.peakDelta) > Math.abs(item.finalDelta) ? item.peakDelta : null;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`grid w-full grid-cols-[112px_minmax(0,1fr)] items-center gap-x-3 border-b border-line py-1.5 text-left transition-opacity ${
        dim ? 'opacity-40' : ''
      } ${selected ? 'bg-hover' : 'hover:bg-hover/60'}`}
    >
      <div className="min-w-0">
        <div className="truncate text-[12px] text-fg" title={item.name}>
          {item.name}
        </div>
        <div className="font-mono text-[10px] text-fg-3">
          {item.tag}
          {item.manipulated ? ' · mexida' : ''}
        </div>
        <div className="font-mono text-[11px] text-fg-2">
          {signedTagValue(item.finalDelta, item.unit)} {item.unit}
        </div>
        {pico === null ? null : (
          <div className="font-mono text-[10px] text-fg-3">pico {signedNum(pico, 2)}</div>
        )}
      </div>

      <div ref={measure} className="relative min-w-0" style={{ height: H }}>
        <svg
          role="img"
          aria-label={`Previsão de ${item.name}`}
          width={width}
          height={H}
          className="block"
        >
          <rect width={width} height={H} fill="var(--color-cell)" />
          {faixa ? (
            <rect y={faixa.top} width={width} height={faixa.height} fill="var(--color-track)" />
          ) : null}

          {item.deadTimeS !== null && item.deadTimeS > 0 ? (
            <line
              x1={x(item.deadTimeS)}
              x2={x(item.deadTimeS)}
              y1={0}
              y2={H}
              stroke="var(--color-fg-3)"
              strokeDasharray="2 3"
            />
          ) : null}

          {item.crossings.map((crossing) => (
            <line
              key={crossing.limit}
              x1={x(crossing.atS)}
              x2={x(crossing.atS)}
              y1={0}
              y2={H}
              stroke="var(--color-alarm-1)"
            />
          ))}

          <path d={path(item.base)} fill="none" stroke="var(--color-tick)" strokeWidth={1.1} />
          {outro ? (
            <path
              d={path(outro.proposed)}
              fill="none"
              stroke="var(--color-action-hover)"
              strokeWidth={1.3}
              strokeDasharray="3 2"
            />
          ) : null}
          <path
            d={path(item.proposed)}
            fill="none"
            stroke="var(--color-action)"
            strokeWidth={1.5}
          />

          {item.t63S === null ? null : (
            <polygon
              points={`${String(x(item.t63S) - 3)},0 ${String(x(item.t63S) + 3)},0 ${String(x(item.t63S))},5`}
              fill="var(--color-action)"
            />
          )}
        </svg>
        {item.saturated ? (
          <span
            title="A válvula chegou ao fim do curso: a malha não consegue mais corrigir."
            className="absolute top-0.5 right-1 max-w-full truncate font-mono text-[10px] whitespace-nowrap text-alarm-2"
          >
            válvula satura
          </span>
        ) : null}
      </div>
    </button>
  );
}
