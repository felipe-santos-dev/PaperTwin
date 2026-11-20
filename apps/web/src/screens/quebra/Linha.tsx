import type { BreakDeviation } from '@mp1/shared';

import type { BreakReplayView, ReplaySeries } from '../../api/process';
import { linear } from '../../ui/chart/scale';
import { hhmm, num } from '../../ui/format';
import { Panel } from '../../ui/Panel';
import { useSize, useWidth } from '../../ui/useWidth';
import { quando, resumo } from './frase';

/**
 * A janela de −10 min a 0, com cursor e reprodução.
 *
 * O que a reprodução acrescenta a um gráfico parado é a **ordem**: ver a
 * pressão diferencial sair da faixa, depois a umidade, depois a gramatura, uma
 * depois da outra, é entender a cadeia de um jeito que três curvas sobrepostas
 * não ensinam.
 *
 * ## Três gráficos, não dez
 *
 * As três primeiras a desviar. A quarta em diante está na lista ao lado, com o
 * número; desenhar as dez faria dez faixas de 40 px que ninguém lê. Clicar numa
 * variável da lista troca o gráfico pela dela.
 */

/** Altura mínima e máxima de uma faixa: abaixo some, acima vira cartaz. */
const H_MIN = 96;
const H_MAX = 240;

export interface LinhaProps {
  readonly view: BreakReplayView;
  readonly cursorS: number;
  readonly onCursor: (segundos: number) => void;
  readonly tocando: boolean;
  readonly onTocar: (tocando: boolean) => void;
  readonly velocidade: number;
  readonly velocidades: readonly number[];
  readonly onVelocidade: (velocidade: 1 | 4 | 16) => void;
  readonly escolhida: string | null;
  readonly onEscolher: (tag: string | null) => void;
}

export function Linha(props: LinhaProps) {
  const { view, cursorS } = props;
  const janela = view.replay.windowS;
  const [ref, width] = useWidth<HTMLDivElement>(640);
  const [caixa, , altura] = useSize<HTMLDivElement>(640, 360);

  const x = linear([0, janela], [0, width]);
  const quebraEm = Date.parse(view.webBreak.startedAt);
  const início = quebraEm - janela * 1000;

  /** As três primeiras a desviar, ou a escolhida na lista. */
  const desenhar = props.escolhida
    ? view.replay.deviations.filter((item) => item.tag === props.escolhida)
    : view.replay.deviations.slice(0, 3);

  const porTag = new Map(view.series.map((série) => [série.tag, série]));

  /**
   * As faixas dividem a altura que o painel tem.
   *
   * Uma altura fixa deixaria metade do painel vazia em 1080 px e cortaria a
   * terceira curva em 900. Como são sempre uma, duas ou três, dividir o espaço
   * entre elas dá a curva mais alta que cabe — e é na altura da curva que se vê
   * a forma do desvio.
   */
  const H = Math.max(
    H_MIN,
    Math.min(H_MAX, Math.floor(altura / Math.max(1, desenhar.length)) - 14),
  );

  /** Os eventos do período, marcados no eixo. */
  const marcas = [
    ...view.events.alarms.map((alarme) => ({
      t: Date.parse(alarme.raisedAt),
      cor: 'var(--color-alarm-2)',
      texto: `${alarme.tag} ${alarme.limit}`,
    })),
    ...view.events.setpointChanges.map((mudança) => ({
      t: Date.parse(mudança.changedAt),
      cor: 'var(--color-action)',
      texto: `SP ${mudança.tag}`,
    })),
    ...view.events.gradeChanges.map((troca) => ({
      t: Date.parse(troca.startedAt),
      cor: 'var(--color-fg-2)',
      texto: `gramatura ${num(troca.toGsm, 0)}`,
    })),
  ].filter((marca) => marca.t >= início && marca.t <= quebraEm);

  return (
    <Panel
      help="quebra.linha"
      heading={1}
      title="Os 10 min antes da quebra"
      context={
        <span>
          quebra às <span className="font-mono text-fg">{hhmm(view.webBreak.startedAt)}</span> ·{' '}
          {view.webBreak.probableCause}
        </span>
      }
      aside={<Reprodução {...props} />}
      bodyClassName="flex min-h-0 flex-col"
    >
      <p className="mb-3 shrink-0 border-l-2 border-alarm-1 pl-2.5 text-[15px] leading-[1.35] text-fg">
        {resumo(view.replay)}
      </p>

      <div ref={caixa} className="min-h-0 flex-1 overflow-y-auto">
        {desenhar.length === 0 ? (
          <p className="py-4 text-[12px] text-fg-3">
            Nenhuma das variáveis observadas saiu do normal nesta janela.
          </p>
        ) : (
          desenhar.map((desvio, índice) => (
            <Curva
              key={desvio.tag}
              desvio={desvio}
              série={porTag.get(desvio.tag) ?? null}
              x={x}
              width={width}
              início={início}
              janela={janela}
              cursorS={cursorS}
              altura={H}
              measure={índice === 0 ? ref : undefined}
            />
          ))
        )}
      </div>

      <div className="mt-2 shrink-0 border-t border-line pt-2">
        <div className="relative mb-1 grid grid-cols-[132px_minmax(0,1fr)] gap-x-3">
          <span className="font-mono text-[10px] text-fg-3">eventos</span>
          <div className="relative h-4">
            {marcas.map((marca) => (
              <span
                key={`${marca.texto}-${String(marca.t)}`}
                title={marca.texto}
                className="absolute top-0 h-3 w-0.5"
                style={{ left: x((marca.t - início) / 1000), background: marca.cor }}
              />
            ))}
            {marcas.length === 0 ? (
              <span className="text-[10px] text-fg-3">nenhum alarme, setpoint ou troca</span>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-[132px_minmax(0,1fr)] items-center gap-x-3">
          <span className="font-mono text-[10px] text-fg-3">
            cursor {quando(janela - cursorS)} antes
          </span>
          <input
            type="range"
            aria-label="Instante do replay"
            min={0}
            max={janela}
            step={1}
            value={Math.round(cursorS)}
            onChange={(event) => {
              props.onCursor(Number(event.target.value));
            }}
            className="w-full accent-action"
          />
        </div>

        <div className="grid grid-cols-[132px_minmax(0,1fr)] gap-x-3">
          <span />
          <div className="relative h-4">
            {[0, 0.25, 0.5, 0.75, 1].map((parte) => (
              <span
                key={parte}
                className="absolute -translate-x-1/2 font-mono text-[10px] text-fg-3"
                style={{ left: x(janela * parte) }}
              >
                {parte === 1 ? 'quebra' : `−${num((janela * (1 - parte)) / 60, 0)} min`}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}

function Reprodução({
  tocando,
  onTocar,
  velocidade,
  velocidades,
  onVelocidade,
  escolhida,
  onEscolher,
}: LinhaProps) {
  return (
    <span className="flex items-center gap-2">
      {escolhida ? (
        <button
          type="button"
          onClick={() => {
            onEscolher(null);
          }}
          className="h-6 border border-line-strong px-1.5 text-[11px] text-fg-2 hover:text-fg"
        >
          ver as três primeiras
        </button>
      ) : null}
      <button
        type="button"
        aria-label={tocando ? 'Pausar o replay' : 'Reproduzir o replay'}
        onClick={() => {
          onTocar(!tocando);
        }}
        className="h-6 border border-action px-2 text-[11px] text-action hover:text-action-hover"
      >
        {tocando ? '❚❚ pausar' : '▶ reproduzir'}
      </button>
      <span role="group" aria-label="Velocidade" className="flex border border-line-strong">
        {velocidades.map((item, índice) => (
          <button
            key={item}
            type="button"
            aria-pressed={velocidade === item}
            onClick={() => {
              onVelocidade(item as 1 | 4 | 16);
            }}
            className={`h-6 px-1.5 font-mono text-[11px] ${
              índice > 0 ? 'border-l border-line-strong' : ''
            } ${
              velocidade === item
                ? 'bg-[#1b2a44] text-[#cfe0ff]'
                : 'text-fg-2 hover:bg-hover hover:text-fg'
            }`}
          >
            {item}×
          </button>
        ))}
      </span>
    </span>
  );
}

function Curva({
  desvio,
  série,
  x,
  width,
  início,
  janela,
  cursorS,
  altura: H,
  measure,
}: {
  readonly desvio: BreakDeviation;
  readonly série: ReplaySeries | null;
  readonly x: (segundos: number) => number;
  readonly width: number;
  readonly início: number;
  readonly janela: number;
  readonly cursorS: number;
  readonly altura: number;
  readonly measure: React.Ref<HTMLDivElement> | undefined;
}) {
  const pontos = (série?.samples ?? []).map((amostra) => ({
    s: (Date.parse(amostra.t) - início) / 1000,
    v: amostra.v,
  }));

  const base = desvio.baseline;
  const valores = [...pontos.map((ponto) => ponto.v), base];
  const lo = Math.min(...valores);
  const hi = Math.max(...valores);
  const folga = (hi - lo) * 0.2 || Math.abs(hi) * 0.02 || 1;
  const y = linear([lo - folga, hi + folga], [H - 6, 6]);

  /**
   * A linha vai até o cursor, e não além.
   *
   * É o que faz a reprodução ser uma reprodução: no instante em que a pressão
   * sai da faixa, a curva dela ainda não sabe o que vai acontecer depois.
   */
  const até = pontos.filter((ponto) => ponto.s <= cursorS);
  const caminho = (lista: typeof pontos) =>
    lista.map((p, i) => `${i ? 'L' : 'M'}${x(p.s).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ');

  const desvioEm = janela - desvio.leadTimeS;
  const chegou = cursorS >= desvioEm;
  const atual = até.at(-1)?.v ?? null;

  return (
    <div className="grid grid-cols-[132px_minmax(0,1fr)] items-center gap-x-3 border-b border-line py-1.5">
      <div className="min-w-0">
        <div className="truncate text-[12px] text-fg" title={desvio.name}>
          {desvio.name}
        </div>
        <div className="font-mono text-[10px] text-fg-3">
          {desvio.tag}
          {desvio.consequenceOf === null ? '' : ` · depois de ${desvio.consequenceOf}`}
        </div>
        <div className={`font-mono text-[12px] ${chegou ? 'text-alarm-2' : 'text-fg-2'}`}>
          {atual === null ? '–' : num(atual, 2)} <span className="text-[10px]">{desvio.unit}</span>
        </div>
      </div>

      <div ref={measure} className="relative min-w-0" style={{ height: H }}>
        <svg
          role="img"
          aria-label={`Janela de ${desvio.name}`}
          width={width}
          height={H}
          className="block"
        >
          <rect width={width} height={H} fill="var(--color-cell)" />

          {/* a faixa de normalidade: a média da hora anterior, mais ou menos a régua */}
          <rect
            x={0}
            width={width}
            y={y(base + desvio.ruler * 3)}
            height={Math.max(1, y(base - desvio.ruler * 3) - y(base + desvio.ruler * 3))}
            fill="var(--color-track)"
          />
          <line
            x1={0}
            x2={width}
            y1={y(base)}
            y2={y(base)}
            stroke="var(--color-tick)"
            strokeDasharray="3 3"
          />

          {/* onde ela saiu do normal */}
          {chegou ? (
            <line
              x1={x(desvioEm)}
              x2={x(desvioEm)}
              y1={0}
              y2={H}
              stroke="var(--color-alarm-1)"
              strokeDasharray="2 2"
            />
          ) : null}

          <path
            d={caminho(até)}
            fill="none"
            stroke="var(--color-fg)"
            strokeWidth={1.4}
            strokeLinejoin="round"
          />

          <line
            x1={x(cursorS)}
            x2={x(cursorS)}
            y1={0}
            y2={H}
            stroke="var(--color-action)"
            strokeWidth={1}
          />
        </svg>
      </div>
    </div>
  );
}
