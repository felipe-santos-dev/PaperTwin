/**
 * Uma busca de cada URL por vez.
 *
 * ## O que acontecia
 *
 * Na carga, o navegador pedia `/process/values`, `/alarms?limit=200` e `/reels`
 * **três vezes cada**. Não era laço nem efeito mal escrito: eram três pedidos
 * legítimos, de lugares diferentes, pela mesma coisa, no mesmo instante.
 *
 * - a moldura (`useFrame`) precisa dos valores, dos alarmes e do turno, porque
 *   a barra superior aparece em todas as telas;
 * - a tela aberta precisa dos mesmos valores para saber o instante da leitura;
 * - as rotas de dado fixo (`fixtureRoutes`) derivam as bobinas retidas das
 *   bobinas e o alarme da cola dos alarmes, então pedem as duas listas de novo.
 *
 * Cada um está certo sozinho. Quem estava errado era a camada de baixo, que
 * atendia três vezes uma pergunta que tem **uma** resposta por instante.
 *
 * ## Por que aqui e não no `useResource`
 *
 * O caminho natural seria o `useResource`, que é por onde toda busca de tela
 * passa. Mas ele recebe uma função opaca — `(signal) => gateway.reels(…)` — e
 * não tem como saber que duas dessas funções pedem a mesma URL. Daria para
 * exigir uma chave em cada uma das ~40 chamadas, e bastaria uma errada ou
 * esquecida para o problema voltar sem avisar.
 *
 * A URL **é** a chave, e quem a conhece é esta camada. Represar aqui cobre
 * também os pedidos que não vêm de hook nenhum — os de dentro das rotas de dado
 * fixo, que eram metade da duplicação.
 *
 * ## O que isto não é
 *
 * Não é cache: nada fica guardado depois da resposta. A entrada sai do mapa no
 * instante em que a promessa resolve ou falha, então o pedido seguinte sai de
 * verdade. É só o intervalo entre "saiu" e "chegou" que é compartilhado — que é
 * exatamente a janela em que as cópias nasciam.
 *
 * Isso também é o que o faz seguro sob `StrictMode`: as duas montagens que o
 * React faz no desenvolvimento acontecem no mesmo tique, caem na mesma entrada
 * e viram um pedido; e, se não caíssem, o resultado seria o certo de novo, só
 * com dois pedidos.
 *
 * ## O `AbortSignal` de quem chama, e por que ele não pode ser ignorado
 *
 * A tentação é rodar o pedido represado sem sinal nenhum: com duas telas
 * esperando a mesma resposta, o `abort` de uma cancelaria a da outra. Mas
 * ignorar o sinal quebra algo pior. A sondagem da fonte de dados
 * (`useDataSource`) desiste da API em quatro segundos **abortando** o pedido:
 * é o `abort` que faz a busca falhar, e é a falha que faz a tela cair para o
 * instantâneo. Sem o sinal, nada falha, o prazo não existe, e uma API dormindo
 * deixa a tela em "Procurando a API…" para sempre.
 *
 * Então o pedido tem um sinal próprio, e ele é abortado quando **todos** os
 * interessados desistirem. Um contador de interessados resolve os dois lados:
 * a tela que trocou de aba não cancela a busca da outra, e a sondagem sozinha
 * no prazo dela ainda consegue cortar o pedido.
 */

interface Entry {
  /** Atribuída logo depois de criada a entrada — ver `coalesce`. */
  promise: Promise<unknown>;
  readonly controller: AbortController;
  /** Quantos ainda querem a resposta. Chega a zero, o pedido é abortado. */
  waiters: number;
}

const inflight = new Map<string, Entry>();

/**
 * Executa `run` para `key`, ou junta-se à execução que já está em andamento.
 *
 * `key` é a URL completa, com a query: `/alarms?limit=200` e `/alarms` são
 * perguntas diferentes e têm respostas diferentes.
 *
 * `run` recebe o sinal **do pedido**, que não é o de nenhum dos interessados —
 * ver acima.
 */
export function coalesce<T>(
  key: string,
  run: (signal: AbortSignal) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  const joined = inflight.get(key);
  const entry: Entry =
    joined ??
    (() => {
      /**
       * A entrada entra no mapa **antes** de o pedido sair.
       *
       * Quem chama duas vezes no mesmo tique — `Promise.all` com duas telas
       * pedindo a mesma lista — tem de achar a primeira entrada já lá. Adiar o
       * pedido um microtique resolveria isso também, mas atrasaria toda busca
       * da aplicação por causa de um detalhe de contabilidade.
       */
      const controller = new AbortController();
      const fresh: Entry = {
        controller,
        waiters: 0,
        promise: Promise.resolve(),
      };
      inflight.set(key, fresh);
      fresh.promise = run(controller.signal).finally(() => {
        // só apaga se ainda for esta: uma corrida improvável, mas o custo é um `if`
        if (inflight.get(key) === fresh) inflight.delete(key);
      });
      return fresh;
    })();

  if (!signal) {
    // quem não trouxe sinal nunca desiste, então o pedido também não pode ser
    // abortado por conta dos outros: um interessado que não sai da conta
    entry.waiters += 1;
    return entry.promise as Promise<T>;
  }

  if (signal.aborted) return entry.promise as Promise<T>;

  entry.waiters += 1;
  signal.addEventListener(
    'abort',
    () => {
      entry.waiters -= 1;
      if (entry.waiters <= 0) entry.controller.abort(signal.reason);
    },
    { once: true },
  );

  return entry.promise as Promise<T>;
}

/** Quantas buscas estão em andamento. Para o teste, e para o painel de Sistema. */
export function inflightCount(): number {
  return inflight.size;
}

/** Esquece o que está em andamento. Só o teste usa, entre casos. */
export function resetInflight(): void {
  inflight.clear();
}
