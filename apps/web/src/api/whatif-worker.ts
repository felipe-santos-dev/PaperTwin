/// <reference lib="webworker" />
import {
  runWhatIf,
  type EngineState,
  type WhatIfOptions,
  type WhatIfResult,
} from '@mp1/shared/simulation';

/**
 * O "e se" rodando no navegador, no modo de demonstração.
 *
 * No GitHub Pages não há API: o que existe é o instantâneo, e dentro dele o
 * **estado do motor** no instante em que ele foi gerado. Este worker pega esse
 * estado e roda o mesmo `runWhatIf` que o servidor roda — o mesmo código, do
 * mesmo pacote, não uma reimplementação.
 *
 * ## Por que num worker, e não na própria página
 *
 * Porque meia hora de previsão são 3.600 passos de motor, duas vezes. Na
 * thread da interface isso trava a tela por alguns décimos de segundo no
 * melhor caso — e a tela que trava é justamente aquela em que a pessoa acabou
 * de clicar. Aqui, ela continua respondendo enquanto a conta roda.
 *
 * É também o que mantém o motor fora do pedaço inicial: o import de
 * `@mp1/shared/simulation` vive neste arquivo, e o empacotador o põe no pedaço
 * do worker, que só é baixado quando alguém simula.
 */

export interface WhatIfJob {
  readonly state: EngineState;
  readonly options: WhatIfOptions;
}

export type WhatIfReply =
  | { readonly ok: true; readonly result: WhatIfResult }
  | { readonly ok: false; readonly message: string };

self.onmessage = (event: MessageEvent<WhatIfJob>) => {
  try {
    const result = runWhatIf(event.data.state, event.data.options);
    const reply: WhatIfReply = { ok: true, result };
    postMessage(reply);
  } catch (error) {
    const reply: WhatIfReply = { ok: false, message: (error as Error).message };
    postMessage(reply);
  }
};
