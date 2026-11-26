import { describe, expect, it } from 'vitest';

import { sseHeaders } from './stream';

/**
 * O stream tinha de sair com os cabeçalhos que os plugins puseram.
 *
 * `reply.raw.writeHead` escreve direto no socket e ignora tudo o que está em
 * `reply` — inclusive o `access-control-allow-origin` do `@fastify/cors`. Sem
 * ele, o navegador abre a conexão, recebe o primeiro evento e o descarta por
 * política de origem: `onerror`, reconecta, `onerror`, em ciclo. E como a API
 * responde normalmente ao `curl` e o log não acusa nada, o defeito só aparece
 * na tela — que é onde ele importa.
 */
describe('cabeçalhos do stream', () => {
  it('leva adiante o que o Fastify já montou', () => {
    const saída = sseHeaders({
      'access-control-allow-origin': 'http://localhost:4173',
      vary: 'Origin',
    });

    expect(saída['access-control-allow-origin']).toBe('http://localhost:4173');
    expect(saída['vary']).toBe('Origin');
  });

  it('declara o tipo e desliga cache e tamponamento', () => {
    const saída = sseHeaders({});

    expect(saída['Content-Type']).toBe('text/event-stream');
    expect(saída['Cache-Control']).toBe('no-cache, no-transform');
    expect(saída['Connection']).toBe('keep-alive');
    // sem isto, um proxy que tampona guarda os eventos e entrega em lote
    expect(saída['X-Accel-Buffering']).toBe('no');
  });

  /** O tipo é do stream, e não o que o Fastify tivesse posto antes. */
  it('o tipo do stream vence o que viesse antes', () => {
    expect(sseHeaders({ 'Content-Type': 'application/json' })['Content-Type']).toBe(
      'text/event-stream',
    );
  });
});
