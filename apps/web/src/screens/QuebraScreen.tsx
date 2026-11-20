import { useCallback, useEffect, useMemo, useState } from 'react';
import { assetByTag, MP1, type MaintenanceNote, type WebBreak } from '@mp1/shared';

import type { DataGateway } from '../api/gateway';
import type { BreakReplayView } from '../api/process';
import { ResourceState } from '../ui/ResourceState';
import { useResource } from '../ui/useResource';
import { Linha } from './quebra/Linha';
import { Variaveis } from './quebra/Variaveis';
import { Local } from './quebra/Local';

/**
 * O replay de uma quebra: os 10 min anteriores, passo a passo.
 *
 * É a tela que responde a pergunta mais cara da operação — "por que a folha
 * quebrou" — do único jeito honesto que um gêmeo pode: mostrando **o que se
 * mexeu primeiro**, com a régua à vista, e deixando a conclusão com quem
 * conhece a máquina.
 *
 * ## Por que ela não está na navegação lateral
 *
 * Porque não se abre uma quebra, abre-se **uma** quebra. A tela só existe no
 * contexto de um evento, e os dois caminhos até aqui são os dois lugares onde
 * uma quebra aparece: a linha do tempo do Turno e a lista de bobinas. Uma
 * entrada na barra levaria a um "escolha uma quebra" que é exatamente o que as
 * duas telas já fazem melhor.
 *
 * Ela continua tendo URL própria (`#quebra`), que é o que faz o link ser
 * colável numa conversa — e abrir sem quebra escolhida mostra a mais recente.
 */

export interface QuebraScreenProps {
  readonly gateway: DataGateway;
  /** A quebra escolhida; `null` abre a mais recente. */
  readonly id: string | null;
  readonly onOpenNote: (number: string) => void;
  readonly onOpenTag: (tag: string) => void;
}

export function QuebraScreen({ gateway, id, onOpenNote, onOpenTag }: QuebraScreenProps) {
  const dados = useResource(
    useCallback(
      async (signal: AbortSignal) => {
        const escolhida = id ?? (await maisRecente(gateway, signal));
        if (escolhida === null) return null;

        const [replay, notas] = await Promise.all([
          gateway.breakReplay(escolhida, signal),
          gateway.notes({ limit: 100 }, signal),
        ]);
        return { replay, notas: notas.notes };
      },
      [gateway, id],
    ),
    { isEmpty: (resultado) => resultado === null },
  );

  return (
    <ResourceState
      resource={dados}
      label="a quebra"
      emptyMessage="Nenhuma quebra de folha registrada no período."
    >
      {(resultado) =>
        resultado === null ? null : (
          <Replay
            key={resultado.replay.webBreak.id}
            view={resultado.replay}
            notas={resultado.notas}
            onOpenNote={onOpenNote}
            onOpenTag={onOpenTag}
          />
        )
      }
    </ResourceState>
  );
}

/** A quebra mais recente, para quem abre a tela pela URL. */
async function maisRecente(gateway: DataGateway, signal: AbortSignal): Promise<string | null> {
  const { webBreaks } = await gateway.webBreaks({ limit: 1 }, signal);
  return webBreaks[0]?.id ?? null;
}

/** Velocidades de reprodução, da fase. */
const VELOCIDADES = [1, 4, 16] as const;

/** De quanto em quanto o relógio da reprodução anda, em ms. */
const PASSO_MS = 100;

function Replay({
  view,
  notas,
  onOpenNote,
  onOpenTag,
}: {
  readonly view: BreakReplayView;
  readonly notas: readonly MaintenanceNote[];
  readonly onOpenNote: (number: string) => void;
  readonly onOpenTag: (tag: string) => void;
}) {
  const janela = view.replay.windowS;

  /** Onde o cursor está, em segundos desde o começo da janela. */
  const [cursorS, setCursorS] = useState(janela);
  const [tocando, setTocando] = useState(false);
  const [velocidade, setVelocidade] = useState<(typeof VELOCIDADES)[number]>(4);
  const [escolhida, setEscolhida] = useState<string | null>(null);

  useEffect(() => {
    if (!tocando) return;

    const timer = setInterval(() => {
      setCursorS((atual) => {
        const próximo = atual + (velocidade * PASSO_MS) / 1000;
        if (próximo >= janela) {
          setTocando(false);
          return janela;
        }
        return próximo;
      });
    }, PASSO_MS);

    return () => {
      clearInterval(timer);
    };
  }, [tocando, velocidade, janela]);

  /** Quem já tinha desviado no instante do cursor. */
  const jáDesviaram = useMemo(
    () =>
      new Set(
        view.replay.deviations
          .filter((desvio) => janela - desvio.leadTimeS <= cursorS)
          .map((desvio) => desvio.tag),
      ),
    [view.replay.deviations, janela, cursorS],
  );

  const notasDaSeção = notas.filter((nota) => {
    const ativo = assetByTag(MP1, nota.assetTag);
    return ativo?.section === view.webBreak.section && nota.status !== 'encerrada';
  });

  return (
    <div className="grid h-[calc(100vh-152px)] min-h-[720px] grid-cols-[minmax(0,1fr)_388px] grid-rows-[minmax(0,1fr)_340px] gap-4">
      <Linha
        view={view}
        cursorS={cursorS}
        onCursor={(valor) => {
          setCursorS(valor);
          setTocando(false);
        }}
        tocando={tocando}
        onTocar={(valor) => {
          // recomeçar do início quando a reprodução já chegou ao fim
          if (valor && cursorS >= janela) setCursorS(0);
          setTocando(valor);
        }}
        velocidade={velocidade}
        velocidades={VELOCIDADES}
        onVelocidade={setVelocidade}
        escolhida={escolhida}
        onEscolher={setEscolhida}
      />

      <Variaveis
        view={view}
        cursorS={cursorS}
        jáDesviaram={jáDesviaram}
        escolhida={escolhida}
        onEscolher={setEscolhida}
        onOpenTag={onOpenTag}
      />

      <Local
        webBreak={view.webBreak}
        pattern={view.pattern}
        notas={notasDaSeção}
        onOpenNote={onOpenNote}
        className="col-span-2"
      />
    </div>
  );
}

export type { WebBreak };
