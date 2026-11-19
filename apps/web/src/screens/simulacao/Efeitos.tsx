import { processVariable } from '@mp1/shared';
import { isDerivedTag, type WhatIfVariable } from '@mp1/shared/simulation';

import { num } from '../../ui/format';
import { Panel } from '../../ui/Panel';
import { minutos } from './frase';

/**
 * A direita: o número de cada variável e por onde o efeito chegou.
 *
 * O gráfico mostra a forma; a tabela mostra o valor. São leituras diferentes da
 * mesma conta, e quem opera usa as duas em momentos diferentes — a forma para
 * decidir, o número para escrever no relatório do turno.
 *
 * ## O caminho de causa e efeito
 *
 * Abaixo da tabela, a cadeia de cada variável: da malha mexida até ela, passo a
 * passo. Ela sai do grafo de relações do simulador — o mesmo que o motor
 * integra —, e não de um texto escrito à mão, porque um texto envelheceria no
 * dia em que uma relação entrasse no CSV.
 */

const GRID = 'grid grid-cols-[minmax(0,1fr)_54px_54px_42px_42px_34px_26px] items-center gap-x-1.5';

export interface EfeitosProps {
  readonly variables: readonly WhatIfVariable[];
  readonly selected: string | null;
  readonly onSelect: (tag: string | null) => void;
  readonly className?: string;
}

export function Efeitos({ variables, selected, onSelect, className = '' }: EfeitosProps) {
  const alcançadas = variables.filter((item) => !item.manipulated);
  const escolhida = variables.find((item) => item.tag === selected) ?? null;

  return (
    <Panel
      help="simulacao.efeitos"
      title="Variáveis alcançadas"
      context={
        <span>
          <span className="font-mono text-fg">{alcançadas.length}</span> variáveis
        </span>
      }
      className={className}
      bodyClassName="flex min-h-0 flex-col"
    >
      <div role="table" aria-label="Variáveis alcançadas" className="flex min-h-0 flex-1 flex-col">
        <div role="row" className={`${GRID} border-b border-line pb-1 text-[10px] text-fg-3`}>
          <span role="columnheader">Variável</span>
          <span role="columnheader" className="text-right" title="Variação no fim do horizonte">
            Δ fim
          </span>
          <span role="columnheader" className="text-right" title="Maior desvio, com sinal">
            pico
          </span>
          <span role="columnheader" className="text-right" title="Tempo morto">
            t.morto
          </span>
          <span role="columnheader" className="text-right" title="Tempo até 63 % da variação">
            63 %
          </span>
          <span role="columnheader" title="Limite de alarme que a previsão cruza">
            limite
          </span>
          <span role="columnheader" title="A válvula encosta no fim de curso">
            sat.
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {variables.length === 0 ? (
            <p className="py-3 text-[12px] text-fg-3">
              A mudança não alcança nenhuma variável do catálogo neste horizonte.
            </p>
          ) : (
            variables.map((item) => (
              <Linha
                key={item.tag}
                item={item}
                selected={item.tag === selected}
                onSelect={() => {
                  onSelect(item.tag === selected ? null : item.tag);
                }}
              />
            ))
          )}
        </div>
      </div>

      <Caminho item={escolhida} variables={variables} />
    </Panel>
  );
}

function Linha({
  item,
  selected,
  onSelect,
}: {
  readonly item: WhatIfVariable;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  const cruzamento = item.crossings[0];
  const casas = Math.abs(item.finalDelta) >= 100 ? 0 : Math.abs(item.finalDelta) >= 10 ? 1 : 2;

  return (
    <button
      type="button"
      role="row"
      aria-pressed={selected}
      onClick={onSelect}
      className={`${GRID} w-full border-b border-line py-1.5 text-left font-mono text-[11px] ${
        selected ? 'bg-hover text-fg' : 'text-fg-2 hover:bg-hover/60'
      }`}
    >
      <span role="cell" className="min-w-0">
        <span className="block truncate font-sans text-[11px] text-fg" title={item.name}>
          {item.name}
        </span>
        <span className="block text-[10px] text-fg-3">
          {item.tag}
          {item.manipulated ? ' · mexida' : isDerivedTag(item.tag) ? ' · calculada' : ''}
        </span>
      </span>
      <span role="cell" className="text-right">
        {sinal(item.finalDelta)}
        {num(Math.abs(item.finalDelta), casas)}
      </span>
      <span role="cell" className="text-right">
        {sinal(item.peakDelta)}
        {num(Math.abs(item.peakDelta), casas)}
      </span>
      <span role="cell" className="text-right text-[10px]">
        {item.deadTimeS === null ? '–' : minutos(item.deadTimeS)}
      </span>
      <span role="cell" className="text-right text-[10px]">
        {item.t63S === null ? '–' : minutos(item.t63S)}
      </span>
      <span role="cell" className={cruzamento ? 'text-alarm-1' : 'text-fg-3'}>
        {cruzamento ? cruzamento.limit : '–'}
      </span>
      <span role="cell" className={item.saturated ? 'text-alarm-2' : 'text-fg-3'}>
        {item.saturated ? 'sim' : '–'}
      </span>
    </button>
  );
}

/** A cadeia da malha mexida até a variável escolhida. */
function Caminho({
  item,
  variables,
}: {
  readonly item: WhatIfVariable | null;
  readonly variables: readonly WhatIfVariable[];
}) {
  const mostrar = item ?? variables.find((candidate) => !candidate.manipulated) ?? null;

  return (
    <div className="mt-3 shrink-0 border-t border-line pt-2.5">
      <h3 className="mb-1.5 text-[11px] tracking-[0.05em] text-fg-3 uppercase">Causa e efeito</h3>
      {mostrar === null || mostrar.path.length < 2 ? (
        <p className="text-[11px] text-fg-3">
          Escolha uma variável na tabela para ver por onde o efeito chega nela.
        </p>
      ) : (
        <ol className="flex flex-wrap items-center gap-x-1 gap-y-1 text-[11px]">
          {mostrar.path.map((tag, index) => (
            <li key={tag} className="flex items-center gap-1">
              {index > 0 ? <span className="text-fg-3">→</span> : null}
              <span
                title={processVariable(tag)?.name ?? tag}
                className={`border px-1 py-px font-mono text-[10px] ${
                  index === 0
                    ? 'border-action text-action'
                    : index === mostrar.path.length - 1
                      ? 'border-line-strong bg-hover text-fg'
                      : 'border-line-strong text-fg-2'
                }`}
              >
                {tag}
              </span>
            </li>
          ))}
        </ol>
      )}
      {mostrar === null || mostrar.path.length < 2 ? null : (
        <p className="mt-1.5 text-[11px] leading-[1.4] text-fg-3">
          {processVariable(mostrar.path[0] ?? '')?.name ?? mostrar.path[0]} → {mostrar.name}, pelo
          grafo de relações do simulador.
        </p>
      )}
    </div>
  );
}

function sinal(value: number): string {
  return value >= 0 ? '+' : '−';
}
