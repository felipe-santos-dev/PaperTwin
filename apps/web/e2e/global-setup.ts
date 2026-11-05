/**
 * Acorda a simulação uma vez, antes do primeiro teste.
 *
 * A **primeira** requisição de verdade à API paga a retomada: a simulação
 * reexecuta o intervalo que faltou dentro da requisição, e num banco
 * recém-nascido isso é a janela inteira do teto — 13 s num desktop ocioso, mais
 * que isso numa máquina que está desenhando WebGL por software ao mesmo tempo.
 *
 * Sem isto, o custo cai sobre **o teste que calhar de ser o primeiro**, que
 * passa a falhar por capacidade e não por defeito — e muda a cada reordenação
 * da suíte. Pagá-lo aqui, com a máquina ociosa, é mais honesto: o que o e2e
 * mede é a aplicação funcionando, e o custo da JVM fria tem um teste próprio no
 * lado Java (`ColdStartTest`), onde dá para medi-lo sem um navegador no meio.
 *
 * O `/health` não serve para acordar: ele lê o marcador e **não** roda a
 * retomada, de propósito. Qualquer rota de dados serve; `/process/values` é a
 * mais barata depois da retomada.
 */

const API = 'http://127.0.0.1:3333';

/** Prazo largo: é a retomada inteira, numa máquina que ainda vai compilar o build. */
const PRAZO_MS = 180_000;

export default async function globalSetup(): Promise<void> {
  const começou = Date.now();

  const resposta = await fetch(`${API}/process/values`, {
    signal: AbortSignal.timeout(PRAZO_MS),
  });

  if (!resposta.ok) {
    throw new Error(`a API respondeu ${String(resposta.status)} ao acordar a simulação`);
  }

  const corpo = (await resposta.json()) as { count: number };
  const segundos = ((Date.now() - começou) / 1000).toFixed(1);

  console.log(`[e2e] simulação acordada em ${segundos}s — ${String(corpo.count)} tags`);
}
