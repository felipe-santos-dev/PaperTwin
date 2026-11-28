import { processVariable } from '@mp1/shared';

import type { BreakReplayView } from '../../api/process';
import { Panel } from '../../ui/Panel';
import { oQueFez, quando } from './frase';

/**
 * As variáveis na ordem em que saíram do normal.
 *
 * A ordem é a informação. A primeira linha é a que a investigação vai olhar
 * primeiro — e as que vieram atrás dela aparecem recuadas, com o nome de quem
 * as puxou, porque uma lista plana faria parecer que dez coisas deram errado
 * quando uma deu errado e nove responderam.
 *
 * As que ainda não desviaram **no instante do cursor** ficam apagadas: é o que
 * liga a lista à reprodução ao lado.
 */

export interface VariaveisProps {
  readonly view: BreakReplayView;
  readonly cursorS: number;
  readonly jáDesviaram: ReadonlySet<string>;
  readonly escolhida: string | null;
  readonly onEscolher: (tag: string | null) => void;
  readonly onOpenTag: (tag: string) => void;
}

export function Variaveis({ view, jáDesviaram, escolhida, onEscolher, onOpenTag }: VariaveisProps) {
  const { deviations, quiet, unknown } = view.replay;
  const janela = view.replay.windowS;

  return (
    <Panel
      help="quebra.variaveis"
      title="O que se mexeu"
      context={
        <span>
          <span className="font-mono text-fg">{deviations.length}</span> de{' '}
          <span className="font-mono">{deviations.length + quiet.length + unknown.length}</span>{' '}
          observadas
        </span>
      }
      bodyClassName="flex min-h-0 flex-col"
    >
      <div className="min-h-0 flex-1">
        {deviations.length === 0 ? (
          <p className="py-3 text-[12px] text-fg-2">
            Nenhuma saiu do normal. O replay não tem culpado para apontar, e isso é uma resposta: o
            que arrebentou a folha não está entre as variáveis observadas.
          </p>
        ) : (
          <ol>
            {deviations.map((desvio, índice) => {
              const chegou = jáDesviaram.has(desvio.tag);
              const consequência = desvio.consequenceOf !== null;

              return (
                <li key={desvio.tag}>
                  <button
                    type="button"
                    aria-pressed={escolhida === desvio.tag}
                    onClick={() => {
                      onEscolher(escolhida === desvio.tag ? null : desvio.tag);
                    }}
                    className={`flex w-full flex-col gap-0.5 border-b border-line py-2 text-left transition-opacity ${
                      consequência ? 'pl-4' : ''
                    } ${chegou ? '' : 'opacity-40'} ${
                      escolhida === desvio.tag ? 'bg-hover' : 'hover:bg-hover/60'
                    }`}
                  >
                    <span className="flex items-baseline gap-2">
                      <span
                        className={`font-mono text-[11px] ${
                          índice === 0 && !consequência ? 'text-alarm-1' : 'text-fg-3'
                        }`}
                      >
                        {quando(desvio.leadTimeS)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[12px] text-fg">
                        {desvio.name}
                      </span>
                    </span>
                    <span className="flex items-baseline gap-2 font-mono text-[10px] text-fg-3">
                      {desvio.tag}
                      <span className="text-fg-2">{oQueFez(desvio)}</span>
                    </span>
                    {consequência ? (
                      <span className="text-[10px] text-fg-3">
                        depois de {desvio.consequenceOf} — que a move no grafo de relações
                      </span>
                    ) : (
                      <span className="text-[10px] text-fg-2">
                        {índice === 0 ? 'primeiro desvio' : 'não depende de nenhuma anterior'}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
        )}

        {quiet.length === 0 ? null : (
          <div className="pt-3">
            <h3 className="mb-1 text-[11px] tracking-[0.05em] text-fg-3 uppercase">
              Não se mexeram
            </h3>
            <ul className="flex flex-wrap gap-1">
              {quiet.map((tag) => (
                <li key={tag}>
                  <button
                    type="button"
                    title={processVariable(tag)?.name ?? tag}
                    onClick={() => {
                      onOpenTag(tag);
                    }}
                    className="border border-line-strong px-1.5 py-px font-mono text-[10px] text-fg-3 hover:border-action hover:text-action"
                  >
                    {tag}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <p className="mt-2 shrink-0 border-t border-line pt-2 text-[11px] leading-[1.4] text-fg-3">
        A régua de cada variável é a maior entre a banda do instrumento e a dispersão da hora
        anterior; sai do normal quem anda três vezes a régua. A janela tem{' '}
        {String(Math.round(janela / 60))} min.
      </p>
    </Panel>
  );
}
