import { processVariable, type ProcessVariable } from '@mp1/shared';
import { changeableTags, type LoopMode, type WhatIfChange } from '@mp1/shared/simulation';

import { num } from '../../ui/format';
import { Panel } from '../../ui/Panel';
import { PROCESS_AREAS } from '../../ui/sections';

/**
 * A coluna da entrada: o que vai ser mexido.
 *
 * Tudo aqui dispara a conta sozinho. Não há botão "simular" porque não há nada
 * para confirmar: mudar o valor **é** o pedido, e esperar um segundo clique só
 * adiaria a resposta que a pessoa já pediu ao arrastar o controle.
 *
 * ## Por que a lista de malhas muda com o modo
 *
 * Em automático escreve-se setpoint, e a escrava de cascata não tem o seu —
 * quem o escreve é o mestre. Em manual força-se a válvula, e a PV de cascata
 * não é válvula: é medida. A regra vem de `changeableTags`, do mesmo núcleo que
 * recusaria o pedido; aqui ela só chega antes, como uma lista mais curta em vez
 * de um erro depois.
 */

/** Teto de mudanças por pedido, o mesmo que a rota aceita. */
export const MAX_CHANGES = 4;

export const HORIZONS: readonly { readonly label: string; readonly s: number }[] = [
  { label: '5 min', s: 300 },
  { label: '10 min', s: 600 },
  { label: '30 min', s: 1800 },
];

export interface Preset {
  readonly label: string;
  readonly tag: string;
  readonly delta: number;
  readonly mode: LoopMode;
}

/** Os três atalhos: uma malha de cada natureza, nos dois modos de ler. */
export const PRESETS: readonly Preset[] = [
  { label: 'Vapor do grupo principal', tag: 'PIC-514', delta: 30, mode: 'manual' },
  { label: 'Velocidade da máquina', tag: 'SIC-1104', delta: 20, mode: 'auto' },
  { label: 'Carga da prensa', tag: 'WIC-401', delta: 80, mode: 'auto' },
];

/** O atalho de abertura: a tela nunca aparece vazia. */
export const PRESET_INICIAL = PRESETS[1] as Preset;

const AREA_LABEL = new Map(PROCESS_AREAS.map((area) => [area.id as string, area.label]));

/** Casas decimais do campo e do controle, pela faixa da válvula. */
export function casasDe(variable: ProcessVariable): number {
  const faixa = variable.max - variable.min;
  if (faixa >= 100) return 0;
  if (faixa >= 10) return 1;
  return 2;
}

export function arredonda(value: number, variable: ProcessVariable): number {
  const fator = 10 ** casasDe(variable);
  return Math.round(value * fator) / fator;
}

/**
 * O degrau que a tela propõe sozinha, em 2 % da faixa da válvula.
 *
 * Quem chega aqui pela malha — do painel de setpoint, ou trocando a malha na
 * lista — ainda não tem um valor em mente, e abrir no valor atual mostraria
 * duas curvas em cima uma da outra. 2 % é pequeno o bastante para ser uma
 * proposta e não uma afirmação, e a pessoa arrasta a partir dali.
 */
export function degrauDe(variable: ProcessVariable, atual: number): number {
  const passo = (variable.max - variable.min) * 0.02;
  return arredonda(Math.min(variable.max, atual + passo), variable);
}

export interface EntradaProps {
  readonly changes: readonly WhatIfChange[];
  readonly onChanges: (changes: WhatIfChange[]) => void;
  readonly mode: LoopMode;
  readonly onMode: (mode: LoopMode) => void;
  readonly horizonS: number;
  readonly onHorizon: (s: number) => void;
  /** O valor de cada TAG agora, de onde a proposta parte. */
  readonly values: ReadonlyMap<string, number>;
  readonly onPreset: (preset: Preset) => void;
  /** Leva a proposta para o painel de setpoint, na tela de Processo. */
  readonly onApply: (change: WhatIfChange) => void;
  readonly className?: string;
}

export function Entrada(props: EntradaProps) {
  const { changes, onChanges, mode, values } = props;
  const disponíveis = changeableTags(mode);
  const usadas = new Set(changes.map((change) => change.tag));
  const livre = disponíveis.find((tag) => !usadas.has(tag));

  /** Põe uma malha na lista já com um degrau, para a conta ter o que mostrar. */
  const comDegrau = (tag: string): WhatIfChange => {
    const variable = processVariable(tag);
    const base = values.get(tag);
    return {
      tag,
      value: variable && base !== undefined ? degrauDe(variable, base) : (base ?? 0),
    };
  };

  return (
    <Panel
      help="simulacao.entrada"
      heading={1}
      title="O que mexer"
      className={props.className ?? ''}
      bodyClassName="flex min-h-0 flex-col gap-4 overflow-y-auto"
    >
      <div className="flex flex-col gap-3">
        {changes.map((change, index) => (
          <Mudanca
            key={`${change.tag}-${String(index)}`}
            change={change}
            disponíveis={disponíveis.filter((tag) => tag === change.tag || !usadas.has(tag))}
            atual={values.get(change.tag) ?? null}
            onTag={(tag) => {
              onChanges(changes.map((item, k) => (k === index ? comDegrau(tag) : item)));
            }}
            onValue={(value) => {
              onChanges(changes.map((item, k) => (k === index ? { ...item, value } : item)));
            }}
            onRemove={
              changes.length > 1
                ? () => {
                    onChanges(changes.filter((_, k) => k !== index));
                  }
                : null
            }
          />
        ))}
      </div>

      {changes.length < MAX_CHANGES && livre !== undefined ? (
        <button
          type="button"
          onClick={() => {
            onChanges([...changes, comDegrau(livre)]);
          }}
          className="h-7 shrink-0 border border-dashed border-action px-2 text-[12px] text-action hover:text-action-hover"
        >
          + malha
        </button>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] text-fg-3">Modo das malhas</span>
        <Alternador
          label="Modo das malhas"
          options={[
            { id: 'auto', label: 'Automático', title: 'As malhas reagem, como na máquina' },
            { id: 'manual', label: 'Manual', title: 'Malha aberta: a resposta pura do processo' },
          ]}
          selected={mode}
          onSelect={(id) => {
            props.onMode(id as LoopMode);
          }}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] text-fg-3">Horizonte</span>
        <Alternador
          label="Horizonte"
          options={HORIZONS.map((item) => ({ id: String(item.s), label: item.label }))}
          selected={String(props.horizonS)}
          onSelect={(id) => {
            props.onHorizon(Number(id));
          }}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] text-fg-3">Atalhos</span>
        {PRESETS.map((preset) => (
          <button
            key={preset.tag}
            type="button"
            disabled={!values.has(preset.tag)}
            title={`${preset.tag} ${preset.delta > 0 ? '+' : ''}${String(preset.delta)} · ${
              preset.mode === 'auto' ? 'automático' : 'manual'
            }`}
            onClick={() => {
              props.onPreset(preset);
            }}
            className="h-7 border border-line-strong px-2 text-left text-[12px] text-fg-2 hover:border-action hover:text-action disabled:border-line disabled:text-fg-3/50"
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="mt-auto flex shrink-0 flex-col gap-2 border-t border-line pt-3">
        <button
          type="button"
          disabled={changes[0] === undefined}
          onClick={() => {
            const primeira = changes[0];
            if (primeira) props.onApply(primeira);
          }}
          className="h-8 border border-action text-[12px] text-action-hover hover:bg-action/10 disabled:border-line-strong disabled:text-fg-3"
        >
          Aplicar no processo
        </button>
        <p className="text-[11px] leading-[1.4] text-fg-3">
          Esta tela não escreve nada. O botão leva a proposta para o painel de setpoint, em
          Processo, onde o motivo é obrigatório e a escrita fica no registro.
        </p>
      </div>
    </Panel>
  );
}

function Mudanca({
  change,
  disponíveis,
  atual,
  onTag,
  onValue,
  onRemove,
}: {
  readonly change: WhatIfChange;
  readonly disponíveis: readonly string[];
  readonly atual: number | null;
  readonly onTag: (tag: string) => void;
  readonly onValue: (value: number) => void;
  readonly onRemove: (() => void) | null;
}) {
  const variable = processVariable(change.tag);
  if (!variable) return null;

  const casas = casasDe(variable);
  const passo = Number(((variable.max - variable.min) / 200).toFixed(casas + 1));

  /** Agrupadas por seção, na ordem do caminho do papel. */
  const porÁrea = new Map<string, string[]>();
  for (const area of PROCESS_AREAS) porÁrea.set(area.id, []);
  for (const tag of disponíveis) {
    const item = processVariable(tag);
    if (!item) continue;
    const lista = porÁrea.get(item.area);
    if (lista) lista.push(tag);
    else porÁrea.set(item.area, [tag]);
  }

  return (
    <div className="flex flex-col gap-1.5 border-l-2 border-line-strong pl-2">
      <div className="flex items-center gap-1.5">
        <select
          value={change.tag}
          aria-label="Malha"
          onChange={(event) => {
            onTag(event.target.value);
          }}
          className="h-8 min-w-0 flex-1 border border-line-strong bg-cell px-1.5 font-mono text-[12px] text-fg"
        >
          {[...porÁrea]
            .filter(([, tags]) => tags.length > 0)
            .map(([area, tags]) => (
              <optgroup key={area} label={AREA_LABEL.get(area) ?? area}>
                {tags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag} · {processVariable(tag)?.name ?? ''}
                  </option>
                ))}
              </optgroup>
            ))}
        </select>
        {onRemove ? (
          <button
            type="button"
            aria-label={`Tirar ${change.tag} da simulação`}
            onClick={onRemove}
            className="size-6 shrink-0 border border-line-strong text-[12px] text-fg-3 hover:border-fg-3 hover:text-fg"
          >
            ×
          </button>
        ) : null}
      </div>

      <div className="truncate text-[11px] text-fg-2" title={variable.name}>
        {variable.name}
      </div>

      <div className="flex items-baseline justify-between text-[11px] text-fg-3">
        <span>
          agora{' '}
          <span className="font-mono text-fg-2">{atual === null ? '–' : num(atual, casas)}</span>
        </span>
        <span className="font-mono text-[10px]">{variable.unit}</span>
      </div>

      <label className="flex items-center gap-1.5 text-[11px] text-fg-3">
        novo
        <input
          value={String(change.value)}
          aria-label={`Novo valor de ${change.tag}`}
          inputMode="decimal"
          onChange={(event) => {
            const parsed = Number(event.target.value.replace(',', '.'));
            if (Number.isFinite(parsed)) onValue(parsed);
          }}
          className="h-7 min-w-0 flex-1 border border-line-strong bg-cell px-1.5 text-right font-mono text-[12px] text-fg"
        />
      </label>

      <input
        type="range"
        aria-label={`Faixa de ${change.tag}`}
        min={variable.min}
        max={variable.max}
        step={passo > 0 ? passo : 0.01}
        value={change.value}
        onChange={(event) => {
          onValue(arredonda(Number(event.target.value), variable));
        }}
        className="h-4 w-full accent-action"
      />
      <div className="flex justify-between font-mono text-[10px] text-fg-3">
        <span>{num(variable.min, casas)}</span>
        <span>{num(variable.max, casas)}</span>
      </div>
    </div>
  );
}

/** Um grupo de botões com um escolhido, como a janela da tendência. */
function Alternador({
  label,
  options,
  selected,
  onSelect,
}: {
  readonly label: string;
  readonly options: readonly { readonly id: string; readonly label: string; title?: string }[];
  readonly selected: string;
  readonly onSelect: (id: string) => void;
}) {
  return (
    <span role="group" aria-label={label} className="flex border border-line-strong">
      {options.map((option, index) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={selected === option.id}
          {...(option.title === undefined ? {} : { title: option.title })}
          onClick={() => {
            onSelect(option.id);
          }}
          className={`h-7 flex-1 text-[11px] ${index > 0 ? 'border-l border-line-strong' : ''} ${
            selected === option.id
              ? 'bg-[#1b2a44] text-[#cfe0ff]'
              : 'text-fg-2 hover:bg-hover hover:text-fg'
          }`}
        >
          {option.label}
        </button>
      ))}
    </span>
  );
}
