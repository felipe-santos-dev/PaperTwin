import {
  processVariable,
  type GradeChange,
  type MaintenanceNote,
  type Round,
  type SetpointChange,
  type WebBreak,
} from '@mp1/shared';

import { ApiError } from './client';
import { fetchDemoAsset, fetchDemoVibration } from './demo';
import type { DataGateway } from './gateway';
import type { AlarmList, ProcessValues, ReelView, ShiftView } from './process';

/**
 * O portão que lê o instantâneo estático.
 *
 * Os arquivos em `public/demo/` são gerados no build pela própria API rodando
 * contra o PGlite, então têm exatamente o formato das respostas.
 *
 * ## Um arquivo por rota, não por consulta
 *
 * O nome do arquivo sai só do **caminho**: `/reels` vira `reels.json`,
 * `/shifts/T-2026-06-15-B` vira `shifts~T-2026-06-15-B.json`. Os parâmetros de
 * consulta são ignorados, e o filtro é aplicado aqui, no cliente.
 *
 * A primeira versão punha a consulta no nome do arquivo —
 * `reels--limit=40&shiftId=X.json` — e isso é uma armadilha: o gerador teria de
 * acertar **exatamente** as combinações que as sete telas pedem, e um filtro
 * novo em qualquer tela daria 404 no modo de demonstração sem ninguém notar até
 * alguém abrir o Pages. Com um arquivo por rota, o instantâneo é um espelho
 * completo e o filtro é problema de quem lê.
 *
 * O preço é baixar a lista inteira para mostrar um recorte dela. Num
 * instantâneo de algumas centenas de linhas isso é menos tráfego que a
 * alternativa, que seria um arquivo por combinação de filtro.
 *
 * ## O que ele não faz
 *
 * Escrita de setpoint e reconhecimento de alarme vêm nulos. Um instantâneo não
 * aceita escrita, e aceitar sem gravar seria pior que recusar: o número voltaria
 * ao anterior no próximo carregamento sem nenhuma explicação.
 */

/** `BASE_URL` já vem com a barra final; no Pages vale `/PaperTwin/`. */
const DEMO_BASE = `${import.meta.env.BASE_URL}demo`;

/**
 * O nome do arquivo de uma rota.
 *
 * A barra do caminho vira `~` porque um servidor estático trata barra como
 * diretório, e `demo/process/tags/PIC-514.json` daria uma árvore de pastas para
 * servir arquivos que são todos irmãos.
 */
export function demoFileName(path: string): string {
  return `${path.replace(/^\//, '').replace(/\//g, '~')}.json`;
}

/**
 * Um servidor estático responde a um caminho inexistente com a página de erro,
 * ou até com o `index.html`, e `response.ok` continua verdadeiro. Sem conferir
 * a forma do corpo, uma página HTML viraria "dados" e quebraria lá na frente,
 * longe da causa.
 */
function ensureShape<T>(body: unknown, required: readonly string[], file: string): T {
  if (typeof body !== 'object' || body === null) {
    throw new ApiError(502, `Resposta de demonstração inválida em ${file}`);
  }

  const missing = required.filter((key) => !(key in body));
  if (missing.length > 0) {
    throw new ApiError(502, `Resposta de demonstração sem ${missing.join(', ')} em ${file}`);
  }

  return body as T;
}

async function load<T>(
  path: string,
  required: readonly string[],
  signal?: AbortSignal,
): Promise<T> {
  const file = demoFileName(path);
  const response = await fetch(`${DEMO_BASE}/${file}`, signal ? { signal } : {});

  if (!response.ok) {
    throw new ApiError(
      response.status,
      `O instantâneo de demonstração não tem ${file} — ele cobre um recorte fixo, ` +
        'não a API inteira.',
    );
  }

  return ensureShape<T>(await response.json(), required, file);
}

/** Aplica um teto de linhas, como a API faria. */
function capped<T>(rows: readonly T[], limit: number | undefined): T[] {
  return rows.slice(0, limit ?? 100);
}

/** Filtra por turno as listas que aceitam esse filtro. */
function byShift<T extends { readonly shiftId: string }>(
  rows: readonly T[],
  shiftId: string | undefined,
): T[] {
  return rows.filter((row) => shiftId === undefined || row.shiftId === shiftId);
}

export const DEMO_GATEWAY: DataGateway = {
  kind: 'demo',

  // as duas rotas da Fase 3 já tinham instantâneo próprio, com o caminho
  // espelhando a rota; `demo.ts` continua sendo quem as lê
  asset: fetchDemoAsset,
  vibration: (tag, _query, signal) => fetchDemoVibration(tag, signal),

  async processValues(filter = {}, signal) {
    const all = await load<ProcessValues>('/process/values', ['ts', 'values'], signal);

    if (filter.area === undefined && filter.group === undefined) return all;

    /**
     * A área e o grupo vêm do catálogo, não do arquivo.
     *
     * O instantâneo guarda tag, valor e unidade — o que a API devolve. A área é
     * propriedade da variável, e a web tem o catálogo tanto quanto o servidor:
     * filtrar por ele é usar a mesma fonte dos dois lados.
     */
    const values = all.values.filter((item) => {
      const variable = processVariable(item.tag);
      if (!variable) return false;
      if (filter.area !== undefined && variable.area !== filter.area) return false;
      if (filter.group !== undefined && variable.group !== filter.group) return false;
      return true;
    });

    return { ts: all.ts, count: values.length, values };
  },

  tag: (tag, signal) =>
    load(`/process/tags/${encodeURIComponent(tag)}`, ['variable', 'writable'], signal),

  /**
   * A janela e o nº de colunas são os que o build gerou.
   *
   * A tela pede 240 ou 300 colunas de uma janela que ela escolheu; o instantâneo
   * tem uma janela só. Servir o que existe é mais honesto que recortar um pedaço
   * e deixar o gráfico mentir sobre o período — e o eixo do gráfico mostra as
   * horas que ele tem.
   */
  tagTrend: (tag, _options, signal) =>
    load(`/process/tags/${encodeURIComponent(tag)}/trend`, ['tag', 'buckets'], signal),

  steamGroups: (signal) => load('/process/steam-groups', ['ts', 'groups'], signal),

  async alarms(filter = {}, signal) {
    const all = await load<AlarmList>('/alarms', ['count', 'alarms'], signal);

    const alarms = all.alarms.filter((alarm) => {
      if (filter.state !== undefined && alarm.state !== filter.state) return false;
      if (filter.priority !== undefined && alarm.priority !== filter.priority) return false;
      if (filter.tag !== undefined && alarm.tag !== filter.tag) return false;
      // needsAction: ou ninguém reconheceu, ou ainda está ativo
      if (filter.needsAction === true && alarm.acknowledgedAt !== null && alarm.state !== 'ativo') {
        return false;
      }
      return true;
    });

    return { ...all, count: alarms.length, alarms: capped(alarms, filter.limit) };
  },

  async shifts(filter = {}, signal) {
    const all = await load<{ count: number; shifts: readonly ShiftView[] }>(
      '/shifts',
      ['count', 'shifts'],
      signal,
    );
    const shifts = capped(all.shifts, filter.limit);
    return { count: shifts.length, shifts };
  },

  shift: (id, signal) => load(`/shifts/${encodeURIComponent(id)}`, ['shift', 'reels'], signal),

  async reels(filter = {}, signal) {
    const all = await load<{ count: number; reels: readonly ReelView[] }>(
      '/reels',
      ['count', 'reels'],
      signal,
    );
    const rows = byShift(all.reels, filter.shiftId);
    return { count: rows.length, reels: capped(rows, filter.limit) };
  },

  reel: (number, signal) => load(`/reels/${String(number)}`, ['reel'], signal),

  async webBreaks(filter = {}, signal) {
    const all = await load<{ count: number; webBreaks: readonly WebBreak[] }>(
      '/web-breaks',
      ['count', 'webBreaks'],
      signal,
    );
    const rows = byShift(all.webBreaks, filter.shiftId);
    return { count: rows.length, webBreaks: capped(rows, filter.limit) };
  },

  async gradeChanges(filter = {}, signal) {
    const all = await load<{ count: number; gradeChanges: readonly GradeChange[] }>(
      '/grade-changes',
      ['count', 'gradeChanges'],
      signal,
    );
    const rows = byShift(all.gradeChanges, filter.shiftId);
    return { count: rows.length, gradeChanges: capped(rows, filter.limit) };
  },

  async rounds(filter = {}, signal) {
    const all = await load<{ count: number; rounds: readonly Round[] }>(
      '/rounds',
      ['count', 'rounds'],
      signal,
    );
    const rows = byShift(all.rounds, filter.shiftId);
    return { count: rows.length, rounds: capped(rows, filter.limit) };
  },

  async notes(filter = {}, signal) {
    const all = await load<{ count: number; notes: readonly MaintenanceNote[] }>(
      '/notes',
      ['count', 'notes'],
      signal,
    );

    const rows = all.notes.filter((note) => {
      if (filter.status !== undefined && note.status !== filter.status) return false;
      if (filter.assetTag !== undefined && note.assetTag !== filter.assetTag) return false;
      return true;
    });

    return { count: rows.length, notes: capped(rows, filter.limit) };
  },

  async setpointChanges(filter = {}, signal) {
    const all = await load<{ count: number; changes: readonly SetpointChange[] }>(
      '/setpoint-changes',
      ['count', 'changes'],
      signal,
    );

    const rows = all.changes.filter(
      (change) => filter.tag === undefined || change.tag === filter.tag,
    );
    return { count: rows.length, changes: capped(rows, filter.limit) };
  },

  // um instantâneo não aceita escrita, e dizer isso é melhor que simular
  writeSetpoint: null,
  acknowledgeAlarm: null,
};
