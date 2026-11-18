import { useCallback, useState } from 'react';
import type { LoopMode, WhatIfVariable } from '@mp1/shared/simulation';
import { processVariable, type ProcessVariable } from '@mp1/shared';

import type { DataGateway } from '../../api/gateway';
import type { WhatIfResponse } from '../../api/whatif';
import { linear } from '../../ui/chart/scale';
import { num, tagValue } from '../../ui/format';
import { Panel } from '../../ui/Panel';
import { useWidth } from '../../ui/useWidth';

/**
 * Simular antes de aplicar.
 *
 * O caminho que isto encurta é o mais caro da operação: mexer no setpoint para
 * ver o que acontece. Aqui a pessoa propõe o valor, vê a resposta prevista
 * sobre o estado de agora, e **depois** decide — e aplicar continua sendo a
 * rota de setpoint de sempre, com motivo obrigatório e auditoria.
 *
 * ## Automático e manual
 *
 * Em automático a previsão é o que a máquina faria: as malhas reagem, a cascata
 * puxa de volta. Em manual as malhas ficam abertas e aparece a resposta pura do
 * processo — o ganho, o tempo morto e o τ da relação. É a mesma mudança vista
 * de dois jeitos, e a diferença entre as duas curvas é o que o controle faz.
 *
 * ## O que o gráfico mostra
 *
 * Duas linhas: a cinza é o que aconteceria sem mexer, a azul é a proposta. O
 * que importa é a **distância entre elas** — numa máquina que já estava se
 * movendo, a curva sozinha mistura a mudança com o que ia acontecer de todo
 * jeito.
 */

/** Os três atalhos de quem abre a tela pela primeira vez. */
const PRESETS: readonly {
  readonly label: string;
  readonly tag: string;
  readonly delta: number;
  readonly mode: LoopMode;
}[] = [
  { label: 'Vapor do grupo principal', tag: 'PIC-514', delta: 30, mode: 'manual' },
  { label: 'Velocidade da máquina', tag: 'SIC-1104', delta: 20, mode: 'auto' },
  { label: 'Carga da prensa', tag: 'WIC-401', delta: 80, mode: 'auto' },
];

const HORIZONS: readonly { readonly label: string; readonly s: number }[] = [
  { label: '5 min', s: 300 },
  { label: '10 min', s: 600 },
  { label: '30 min', s: 1800 },
];

/** Quantas variáveis o painel desenha: as que mais se mexeram. */
const MAX_CHARTS = 3;

export interface WhatIfPanelProps {
  readonly gateway: DataGateway;
  /** As malhas da seção, de onde sai a lista de TAGs que dá para mexer. */
  readonly loops: readonly ProcessVariable[];
  /** O valor atual de cada TAG, para o campo começar de onde a máquina está. */
  readonly values: ReadonlyMap<string, number>;
  readonly className?: string;
}

export function WhatIfPanel({ gateway, loops, values, className = '' }: WhatIfPanelProps) {
  const [tag, setTag] = useState(() => loops[0]?.tag ?? '');
  const [value, setValue] = useState('');
  const [mode, setMode] = useState<LoopMode>('auto');
  const [horizonS, setHorizonS] = useState(600);
  const [result, setResult] = useState<WhatIfResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const variable = loops.find((loop) => loop.tag === tag) ?? null;
  const atual = values.get(tag) ?? variable?.target ?? null;

  const simular = useCallback(
    async (changes: { tag: string; value: number }[], comModo: LoopMode, janela: number) => {
      setRunning(true);
      setError(null);
      try {
        setResult(await gateway.whatIf({ changes, horizonS: janela, mode: comModo, points: 120 }));
      } catch (problema) {
        setResult(null);
        setError((problema as Error).message);
      } finally {
        setRunning(false);
      }
    },
    [gateway],
  );

  const aplicar = useCallback(
    (preset: (typeof PRESETS)[number]) => {
      const base = values.get(preset.tag);
      if (base === undefined) {
        setError(`${preset.tag} não está nesta seção.`);
        return;
      }
      setTag(preset.tag);
      setValue(String(Math.round((base + preset.delta) * 100) / 100));
      setMode(preset.mode);
      void simular([{ tag: preset.tag, value: base + preset.delta }], preset.mode, horizonS);
    },
    [horizonS, simular, values],
  );

  return (
    <Panel
      help="processo.e-se"
      title="Simular antes de aplicar"
      aside={
        <span className="flex items-center gap-2">
          <ModeToggle mode={mode} onMode={setMode} />
          <HorizonToggle horizonS={horizonS} onHorizon={setHorizonS} />
        </span>
      }
      className={className}
      bodyClassName="flex min-h-0 flex-col overflow-y-auto"
    >
      <form
        className="grid grid-cols-[minmax(0,1fr)_110px_auto] items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const proposto = Number(value.replace(',', '.'));
          if (!Number.isFinite(proposto)) {
            setError('Põe um número no valor proposto.');
            return;
          }
          void simular([{ tag, value: proposto }], mode, horizonS);
        }}
      >
        <label className="flex flex-col gap-1 text-[11px] text-fg-3">
          Malha
          <select
            value={tag}
            onChange={(event) => {
              setTag(event.target.value);
              setValue('');
              setResult(null);
            }}
            className="h-8 border border-line-strong bg-cell px-2 font-mono text-[12px] text-fg"
          >
            {loops.map((loop) => (
              <option key={loop.tag} value={loop.tag}>
                {loop.tag} · {loop.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-[11px] text-fg-3">
          Novo valor
          <input
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
            }}
            inputMode="decimal"
            placeholder={atual === null ? '' : num(atual, 1)}
            aria-label={`Novo valor para ${tag}`}
            className="h-8 border border-line-strong bg-cell px-2 font-mono text-[12px] text-fg"
          />
        </label>

        <button
          type="submit"
          disabled={running || value.trim() === ''}
          className="h-8 border border-action px-3 text-[12px] text-action hover:border-action-hover hover:text-action-hover disabled:border-line-strong disabled:text-fg-3"
        >
          {running ? 'Simulando…' : 'Simular'}
        </button>
      </form>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-fg-3">
        exemplos:
        {PRESETS.map((preset) => (
          <button
            key={preset.tag}
            type="button"
            disabled={!values.has(preset.tag)}
            title={
              values.has(preset.tag)
                ? `${preset.tag} ${preset.delta > 0 ? '+' : ''}${String(preset.delta)}`
                : `${preset.tag} não está nesta seção`
            }
            onClick={() => {
              aplicar(preset);
            }}
            className="border border-line-strong px-1.5 py-0.5 text-fg-2 hover:border-action hover:text-action disabled:border-line disabled:text-fg-3/50"
          >
            {preset.label}
          </button>
        ))}
      </div>

      {error ? (
        <p role="alert" className="mt-3 border-l-2 border-alarm-2 pl-2 text-[12px] text-fg-2">
          {error}
        </p>
      ) : null}

      {result ? <Resultado result={result} /> : null}

      {!result && !error ? (
        <p className="mt-3 text-[12px] text-fg-3">
          A previsão roda sobre o estado de agora, sem ruído, e não altera nada: nenhum setpoint é
          escrito, nada vai para o historiador.
        </p>
      ) : null}
    </Panel>
  );
}

function ModeToggle({
  mode,
  onMode,
}: {
  readonly mode: LoopMode;
  readonly onMode: (mode: LoopMode) => void;
}) {
  return (
    <span role="group" aria-label="Modo das malhas" className="flex border border-line-strong">
      {(['auto', 'manual'] as const).map((item, index) => (
        <button
          key={item}
          type="button"
          aria-pressed={mode === item}
          title={
            item === 'auto'
              ? 'As malhas reagem, como na máquina'
              : 'Malha aberta: a resposta pura do processo'
          }
          onClick={() => {
            onMode(item);
          }}
          className={`h-6 px-2 text-[11px] ${index > 0 ? 'border-l border-line-strong' : ''} ${
            mode === item ? 'bg-[#1b2a44] text-[#cfe0ff]' : 'text-fg-2 hover:bg-hover hover:text-fg'
          }`}
        >
          {item === 'auto' ? 'Automático' : 'Manual'}
        </button>
      ))}
    </span>
  );
}

function HorizonToggle({
  horizonS,
  onHorizon,
}: {
  readonly horizonS: number;
  readonly onHorizon: (s: number) => void;
}) {
  return (
    <span role="group" aria-label="Horizonte" className="flex border border-line-strong">
      {HORIZONS.map((item, index) => (
        <button
          key={item.s}
          type="button"
          aria-pressed={horizonS === item.s}
          onClick={() => {
            onHorizon(item.s);
          }}
          className={`h-6 px-2 text-[11px] ${index > 0 ? 'border-l border-line-strong' : ''} ${
            horizonS === item.s
              ? 'bg-[#1b2a44] text-[#cfe0ff]'
              : 'text-fg-2 hover:bg-hover hover:text-fg'
          }`}
        >
          {item.label}
        </button>
      ))}
    </span>
  );
}

function Resultado({ result }: { readonly result: WhatIfResponse }) {
  const mexidas = result.variables.filter((item) => item.manipulated);
  const efeitos = result.variables
    .filter((item) => !item.manipulated)
    .sort((a, b) => relativo(b) - relativo(a));
  const mostrar = efeitos.slice(0, MAX_CHARTS);

  return (
    <div className="mt-3 flex min-h-0 flex-col gap-3">
      <p className="text-[13px] text-fg">{frase(result)}</p>

      {efeitos.length === 0 ? (
        <p className="text-[12px] text-fg-3">
          Nada mais se move: a mudança não alcança outra variável do catálogo neste horizonte.
        </p>
      ) : null}

      {[...mexidas, ...mostrar].map((item) => (
        <Curva key={item.tag} item={item} stepS={result.stepS} />
      ))}

      {efeitos.length > MAX_CHARTS ? (
        <p className="text-[11px] text-fg-3">
          e mais {efeitos.length - MAX_CHARTS} variável(is) com efeito menor.
        </p>
      ) : null}
    </div>
  );
}

/**
 * O quanto a variável se mexeu, medido na régua dela.
 *
 * A régua é a banda L–H quando existe — é nela que a mudança importa para quem
 * opera — e a faixa de operação do catálogo quando não existe. Sem isso, uma
 * variável sem limites ganharia a comparação por acidente: a conta cairia num
 * divisor de 1 e qualquer casa decimal pareceria grande.
 */
function relativo(item: WhatIfVariable): number {
  const variable = processVariable(item.tag);
  const banda =
    item.limits.l !== null && item.limits.h !== null
      ? item.limits.h - item.limits.l
      : (variable?.max ?? 1) - (variable?.min ?? 0);

  // o pico, e não o fim: em automático a malha devolve a variável ao setpoint
  return Math.max(Math.abs(item.finalDelta), Math.abs(item.peakDelta)) / (Math.abs(banda) || 1);
}

/**
 * A frase, gerada dos números.
 *
 * Ela diz três coisas, nesta ordem: o que muda, em quanto tempo, e o que isso
 * atravessa. É o resumo que alguém repetiria para o colega do lado — e se o
 * gráfico some, a frase ainda responde.
 */
function frase(result: WhatIfResponse): string {
  const efeito = result.variables
    .filter((item) => !item.manipulated)
    .sort((a, b) => relativo(b) - relativo(a))[0];

  if (!efeito) return 'A mudança não move nenhuma outra variável neste horizonte.';

  const cruzamento = efeito.crossings[0];
  const limite = cruzamento ? `; cruza ${cruzamento.limit} em ${minutos(cruzamento.atS)}` : '';
  const satura = result.variables.some((item) => item.manipulated && item.saturated)
    ? '; a válvula satura'
    : '';

  /**
   * Em automático a malha costuma devolver a variável ao setpoint, e aí o
   * desvio final é quase zero. Dizer "cai 0,00" seria dizer que não aconteceu
   * nada — quando o que aconteceu foi uma perturbação e uma correção.
   */
  const volta = Math.abs(efeito.finalDelta) < Math.abs(efeito.peakDelta) * 0.4;

  if (volta && Math.abs(efeito.peakDelta) > 0) {
    const direção = efeito.peakDelta > 0 ? 'sobe' : 'cai';
    const pico = `${num(Math.abs(efeito.peakDelta), 2)} ${efeito.unit}`;
    const quando = efeito.peakAtS === null ? '' : ` em ${minutos(efeito.peakAtS)}`;
    return `${efeito.name} ${direção} ${pico} no pico${quando} e a malha traz de volta${limite}${satura}.`;
  }

  const direção = efeito.finalDelta > 0 ? 'sobe' : 'cai';
  const quanto = `${num(Math.abs(efeito.finalDelta), 2)} ${efeito.unit}`;
  const quando =
    efeito.t63S === null
      ? 'e ainda está indo no fim do horizonte'
      : `em cerca de ${minutos(efeito.t63S)}`;

  return `${efeito.name} ${direção} ${quanto} ${quando}${limite}${satura}.`;
}

function minutos(segundos: number): string {
  if (segundos < 90) return `${String(Math.round(segundos))} s`;
  return `${num(segundos / 60, 1)} min`;
}

/** Uma variável: a linha de base, a proposta e as marcas de tempo e limite. */
function Curva({ item, stepS }: { readonly item: WhatIfVariable; readonly stepS: number }) {
  const [ref, width] = useWidth<HTMLDivElement>(420);
  const H = 56;

  const todos = [...item.base, ...item.proposed];
  const limites = [item.limits.l, item.limits.h].filter((v): v is number => v !== null);
  const lo = Math.min(...todos, ...limites);
  const hi = Math.max(...todos, ...limites);
  const pad = (hi - lo) * 0.15 || 0.5;

  const x = linear([0, Math.max(1, item.base.length - 1)], [0, width]);
  const y = linear([lo - pad, hi + pad], [H - 4, 4]);
  const path = (serie: readonly number[]) =>
    serie.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');

  const faixa =
    item.limits.l !== null && item.limits.h !== null
      ? { top: y(item.limits.h), height: Math.max(1, y(item.limits.l) - y(item.limits.h)) }
      : null;

  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] items-center gap-3">
      <div className="min-w-0">
        <div className="truncate text-[12px] text-fg">{item.name}</div>
        <div className="font-mono text-[10px] text-fg-3">
          {item.tag}
          {item.manipulated ? ' · proposta' : ''}
        </div>
        <div className="font-mono text-[11px] text-fg-2">
          {item.finalDelta > 0 ? '+' : '−'}
          {tagValue(Math.abs(item.finalDelta), item.unit)} {item.unit}
        </div>
      </div>

      <div ref={ref} className="relative" style={{ height: H }}>
        <svg role="img" aria-label={`Previsão de ${item.name}`} width={width} height={H}>
          <rect width={width} height={H} fill="var(--color-cell)" />
          {faixa ? (
            <rect y={faixa.top} width={width} height={faixa.height} fill="var(--color-track)" />
          ) : null}

          {/* o tempo morto: até aqui a mudança ainda não apareceu */}
          {item.deadTimeS !== null && item.deadTimeS > 0 ? (
            <line
              x1={x(item.deadTimeS / stepS)}
              x2={x(item.deadTimeS / stepS)}
              y1={0}
              y2={H}
              stroke="var(--color-fg-3)"
              strokeDasharray="2 3"
            />
          ) : null}

          <path d={path(item.base)} fill="none" stroke="var(--color-fg-3)" strokeWidth={1.1} />
          <path
            d={path(item.proposed)}
            fill="none"
            stroke="var(--color-action)"
            strokeWidth={1.4}
          />

          {item.crossings.map((crossing) => (
            <line
              key={crossing.limit}
              x1={x(crossing.atS / stepS)}
              x2={x(crossing.atS / stepS)}
              y1={0}
              y2={H}
              stroke="var(--color-alarm-2)"
            />
          ))}
        </svg>
        {item.saturated ? (
          <span className="absolute top-0.5 right-1 font-mono text-[10px] text-alarm-2">
            satura
          </span>
        ) : null}
      </div>
    </div>
  );
}
