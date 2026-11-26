import { useEffect, useMemo, useState } from 'react';

import { API_URL } from '../api/client';

/**
 * O "AO VIVO" da barra superior, ligado no stream de verdade.
 *
 * ## O que estava errado
 *
 * A API serve `/stream` por SSE desde a Fase 5 — dois segundos de intervalo, só
 * as tags que mudaram, evento de manutenção a cada quinze segundos. **Nenhuma
 * tela assinava.** A moldura buscava `/process/values` uma vez, no `useFrame`,
 * e nada mais saía: o relógio ficava parado no instante daquela leitura, e
 * Gramatura e Velocidade congelavam no valor dela.
 *
 * O selo, enquanto isso, dizia AO VIVO. A fonte era a API, o que o selo
 * respondia era "de onde vêm os números" — e a resposta estava certa. Mas quem
 * olha um painel com AO VIVO escrito e um relógio correndo não lê "a fonte é a
 * API": lê "isto é agora". Um relógio parado com AO VIVO ao lado é a pior
 * combinação possível num painel de operação, porque não há nada na tela que
 * desminta.
 *
 * ## Por que não um `setInterval` buscando `/process/values`
 *
 * Porque o stream existe, e existe fazendo a coisa certa: manda só o que mudou.
 * Repetir as 320 tags a cada dois segundos seriam ~30 kB por evento contra ~2
 * kB — e o host é de graça. O navegador também reconecta o SSE sozinho e manda
 * o `Last-Event-ID`, o que não há como escrever melhor à mão.
 *
 * ## A queda tem de aparecer
 *
 * `state` é o que o selo lê. Enquanto o `EventSource` está reconectando, a tela
 * **não** está ao vivo, e dizer que está é o mesmo erro de antes com outra
 * causa. O valor de `ts` também para junto: o relógio mostra o instante do
 * último evento que chegou, que é a verdade sobre o dado, e o selo diz que a
 * ligação caiu. As duas coisas juntas respondem "quando foi isto" e "ainda está
 * chegando" — que são perguntas diferentes.
 */

/** O quadro que um evento do stream carrega — o `StreamFrame` da API. */
export interface StreamFrame {
  readonly ts: string;
  readonly tick: number;
  /** Só as tags que mudaram mais que o `excDev` do catálogo desde o anterior. */
  readonly values: Record<string, number>;
  readonly alarmsNeedingAction: number;
  readonly flooding: boolean;
}

/**
 * Em que pé está a ligação.
 *
 * - `off` — não se pediu stream (a fonte é o instantâneo, ou ainda se procura).
 * - `connecting` — abrindo, ou reabrindo, e nada chegou ainda.
 * - `open` — chegou evento e a ligação está de pé.
 * - `down` — caiu depois de ter aberto; o navegador tenta de novo sozinho.
 */
export type StreamState = 'off' | 'connecting' | 'open' | 'down';

export interface Live {
  readonly state: StreamState;
  /** O último quadro recebido; `null` enquanto nenhum chegou. */
  readonly frame: StreamFrame | null;
  /**
   * O valor corrente de cada tag que já mudou desde a abertura.
   *
   * Acumulado, e não o do último evento: o evento traz só o que mudou, então o
   * que não veio continua valendo o que veio antes. Quem não está aqui nunca
   * mudou desde a abertura — e aí o valor certo é o da busca inicial.
   */
  readonly values: ReadonlyMap<string, number>;
}

const OFF: Live = { state: 'off', frame: null, values: new Map() };

/**
 * O ambiente não tem SSE.
 *
 * É o caso do jsdom dos testes de componente. Fica como constante de módulo
 * porque é propriedade do ambiente, não do render: assim a resposta é derivada
 * na hora de devolver, sem um efeito só para gravar um estado que nunca muda.
 */
const SEM_SSE = typeof EventSource === 'undefined';

/**
 * Assina `/stream` enquanto `enabled`.
 *
 * `enabled` é falso no instantâneo e enquanto a fonte não foi escolhida: um
 * stream aberto contra uma API que não respondeu à sondagem só geraria
 * tentativas de reconexão no console.
 */
export function useStream(enabled: boolean): Live {
  const [state, setState] = useState<StreamState>(enabled ? 'connecting' : 'off');
  const [frame, setFrame] = useState<StreamFrame | null>(null);

  /**
   * O acumulado é estado, e cada evento troca o `Map` por um novo.
   *
   * Um `Map` mutado no lugar seria mais barato, mas o React compara por
   * identidade: mutar não acordaria ninguém, e a tela ficaria parada com os
   * dados novos na memória. Um `Map` novo a cada dois segundos com ~320 chaves
   * é trabalho irrelevante perto de desenhar a tela que ele atualiza.
   */
  const [values, setValues] = useState<ReadonlyMap<string, number>>(() => new Map());

  /**
   * A troca de `enabled` é ajustada no render, não num efeito.
   *
   * É o padrão que o React documenta para estado derivado de uma prop: comparar
   * com o valor anterior e corrigir ali mesmo. Um efeito só para chamar
   * `setState` faria a tela desenhar uma vez com o estado errado — e, no caso
   * do selo, "errado" quer dizer dizer AO VIVO enquanto nada está ligado.
   */
  const [ligado, setLigado] = useState(enabled);
  if (ligado !== enabled) {
    setLigado(enabled);
    setState(enabled ? 'connecting' : 'off');
  }

  useEffect(() => {
    if (!enabled || SEM_SSE) return;

    const source = new EventSource(`${API_URL}/stream`);

    source.onopen = () => {
      setState('open');
    };

    source.onmessage = (event: MessageEvent<string>) => {
      let next: StreamFrame;
      try {
        next = JSON.parse(event.data) as StreamFrame;
      } catch {
        // um evento quebrado não derruba a assinatura: o próximo vem em 2 s
        return;
      }

      setValues((atual) => {
        const proximo = new Map(atual);
        for (const [tag, value] of Object.entries(next.values)) proximo.set(tag, value);
        return proximo;
      });

      setFrame(next);
      setState('open');
    };

    source.onerror = () => {
      /**
       * `onerror` é "caiu" e "não consegui abrir" ao mesmo tempo.
       *
       * O `EventSource` reconecta sozinho, e `readyState` diz em qual dos dois
       * estamos: `CONNECTING` é ele já tentando de novo, `CLOSED` é desistência
       * definitiva. Nos dois casos a tela não está ao vivo agora, e é isso que
       * o selo precisa saber.
       */
      setState('down');
    };

    return () => {
      source.close();
    };
  }, [enabled]);

  return useMemo(() => {
    if (!enabled) return OFF;
    // sem `EventSource` nunca haverá evento, e o selo não promete estar ao vivo
    if (SEM_SSE) return { state: 'down', frame, values };
    return { state, frame, values };
  }, [enabled, state, frame, values]);
}
