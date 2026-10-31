import { PROCESS_CATALOG, processVariable } from '@mp1/shared';
import type { FastifyInstance, FastifyReply } from 'fastify';

import { tickTime } from '../simulation/clock';

/**
 * O stream ao vivo, por SSE.
 *
 * ## Por que SSE e não WebSocket
 *
 * O tráfego aqui é de uma direção só: o servidor manda valores, o navegador não
 * manda nada. SSE faz exatamente isso sobre HTTP comum — e isso importa num
 * deploy gratuito, porque o proxy do host, o CORS e o cache já funcionam sem
 * configuração extra. Um WebSocket pediria um caminho separado na borda e um
 * protocolo de reconexão escrito à mão, para transportar dados que só descem.
 *
 * A reconexão, aliás, é a parte boa: o navegador reconecta sozinho e manda o
 * `Last-Event-ID` de volta. Não há nada a escrever no cliente.
 *
 * ## Por que o intervalo é generoso
 *
 * O host dorme sem tráfego, e um stream aberto é tráfego — então um stream
 * também **mantém a API acordada**, o que é bom para quem está olhando e ruim
 * para a cota de horas do plano gratuito. Dois segundos é o compromisso: a tela
 * parece viva, e são 1.800 eventos por hora de aba aberta em vez de 7.200.
 *
 * Cada evento carrega só o que **mudou** desde o anterior, pela mesma régua do
 * historiador — o `excDev` do catálogo. Numa máquina em regime isso é um punhado
 * de tags em vez de 320, e é a diferença entre 2 kB e 30 kB a cada dois
 * segundos.
 */

/** Intervalo entre eventos, em milissegundos. */
export const STREAM_INTERVAL_MS = 2000;

/**
 * Teto de tempo sem mandar nada, em milissegundos.
 *
 * Uma máquina perfeitamente parada não mandaria evento nenhum, e aí o proxy do
 * host fecharia a conexão por inatividade e a tela ficaria num "ao vivo" que
 * não está. A cada quinze segundos vai um evento, mesmo vazio.
 */
export const STREAM_KEEPALIVE_MS = 15_000;

/** O que um evento do stream carrega. */
export interface StreamFrame {
  readonly ts: string;
  readonly tick: number;
  /** Só as tags que mudaram mais que o `excDev` desde o evento anterior. */
  readonly values: Record<string, number>;
  /** Quantos alarmes pedem ação agora. */
  readonly alarmsNeedingAction: number;
  readonly flooding: boolean;
}

/** O limiar de mudança de cada tag, pelo `excDev` do catálogo. */
function thresholds(): Map<string, number> {
  const map = new Map<string, number>();

  for (const variable of PROCESS_CATALOG) {
    map.set(variable.tag, variable.compression.excDev ?? 0);
  }

  return map;
}

export async function streamRoutes(app: FastifyInstance): Promise<void> {
  const changeThreshold = thresholds();

  app.get(
    '/stream',
    {
      schema: {
        tags: ['Processo'],
        summary: 'Stream ao vivo dos valores que mudaram, por SSE',
        description: [
          'Cada evento traz só as tags que mudaram mais que o excDev do catálogo',
          'desde o anterior. Intervalo de 2 s, com evento de manutenção a cada 15 s',
          'para o proxy não fechar a conexão.',
        ].join(' '),
        produces: ['text/event-stream'],
        response: {
          200: {
            description: 'Fluxo de eventos SSE. Cada `data:` é um StreamFrame em JSON.',
            type: 'string',
          },
        },
      },
    },
    async (request, reply: FastifyReply) => {
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        // sem isto, um proxy que tampona guarda os eventos e entrega em lote
        'X-Accel-Buffering': 'no',
      });

      const previous = new Map<string, number>();
      let lastSentAt = 0;
      let closed = false;

      const send = (frame: StreamFrame): void => {
        reply.raw.write(`id: ${String(frame.tick)}\n`);
        reply.raw.write(`data: ${JSON.stringify(frame)}\n\n`);
        lastSentAt = Date.now();
      };

      async function tickOnce(): Promise<void> {
        if (closed) return;

        const report = await app.simulation.ensureCurrent();
        const changed: Record<string, number> = {};

        for (const [tag, value] of report.values) {
          const before = previous.get(tag);
          const threshold = changeThreshold.get(tag) ?? 0;

          if (before === undefined || Math.abs(value - before) > threshold) {
            changed[tag] = Number(value.toFixed(4));
            previous.set(tag, value);
          }
        }

        const needingAction = await app.db.listAlarms({ needsAction: true, limit: 200 });

        const quiet = Object.keys(changed).length === 0;
        if (quiet && Date.now() - lastSentAt < STREAM_KEEPALIVE_MS) return;

        send({
          ts: tickTime(report.toTick).toISOString(),
          tick: report.toTick,
          values: changed,
          alarmsNeedingAction: needingAction.length,
          flooding: report.alarmsRaised > 0 && needingAction.length > 10,
        });
      }

      // o primeiro evento vai na hora: a tela não pode esperar dois segundos
      // para mostrar o primeiro número
      await tickOnce();

      const timer = setInterval(() => {
        void tickOnce().catch((error: unknown) => {
          app.log.error({ error }, 'stream ao vivo falhou');
          clearInterval(timer);
          reply.raw.end();
        });
      }, STREAM_INTERVAL_MS);

      /**
       * O fechamento é do cliente, e tem de ser tratado.
       *
       * Sem isto, cada aba fechada deixaria um `setInterval` rodando para
       * sempre, somando uma retomada a cada dois segundos por aba que já foi —
       * e num host de 512 MB isso derruba o processo em minutos.
       */
      const stop = (): void => {
        closed = true;
        clearInterval(timer);
      };

      request.raw.on('close', stop);
      request.raw.on('error', stop);
      reply.raw.on('close', stop);
    },
  );
}

/** A unidade de uma tag, para quem consome o stream montar o rótulo. */
export function unitOf(tag: string): string {
  return processVariable(tag)?.unit ?? '';
}
