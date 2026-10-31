import { ALARM_PRIORITIES, ALARM_STATES, NOTE_STATUSES } from '@mp1/shared';

import { MAX_PLOT_BUCKETS } from '../db/historian-store';
import { MAX_LIST_LIMIT } from '../db/operations-store';

/**
 * Os schemas das rotas da Fase 5 — o que entra e o que sai de cada uma.
 *
 * Os tetos vêm das constantes do repositório, e não escritos de novo: o teto da
 * lista e o teto das colunas do gráfico já existem lá por razões de banco, e
 * repeti-los aqui daria dois números para manter.
 */

const ref = (id: string) => ({ $ref: id });

const error = ref('Error');

const errors = {
  400: error,
  404: error,
} as const;

/** Uma janela de tempo, nas rotas que aceitam recorte. */
const timeWindow = {
  from: { type: 'string', format: 'date-time' },
  to: { type: 'string', format: 'date-time' },
} as const;

const limit = {
  type: 'integer',
  minimum: 1,
  maximum: MAX_LIST_LIMIT,
  description: `Teto de linhas. O máximo é ${String(MAX_LIST_LIMIT)}.`,
} as const;

// ------------------------------------------------------------- processo

export const listProcessValuesSchema = {
  tags: ['Processo'],
  summary: 'Os valores atuais das variáveis de processo',
  querystring: {
    type: 'object',
    properties: {
      area: { type: 'string', examples: ['pré-secagem'] },
      group: { type: 'string', examples: ['vapor'] },
    },
    additionalProperties: false,
  },
  response: {
    200: {
      type: 'object',
      properties: {
        ts: { type: 'string', format: 'date-time' },
        count: { type: 'integer' },
        values: { type: 'array', items: ref('TagValue') },
      },
      required: ['ts', 'count', 'values'],
    },
  },
} as const;

export const getTagSchema = {
  tags: ['Processo'],
  summary: 'Uma variável do catálogo, com o valor atual',
  params: {
    type: 'object',
    properties: { tag: { type: 'string', minLength: 1 } },
    required: ['tag'],
  },
  response: {
    200: {
      type: 'object',
      properties: {
        variable: ref('ProcessVariable'),
        value: { ...ref('TagValue'), nullable: true },
        writable: { type: 'boolean' },
        notWritableBecause: { type: ['string', 'null'] },
        archived: { type: 'boolean' },
      },
      required: ['variable', 'writable', 'notWritableBecause', 'archived'],
    },
    ...errors,
  },
} as const;

export const getTagTrendSchema = {
  tags: ['Processo'],
  summary: 'A tendência de uma tag, em colunas de mínimo, máximo, primeiro e último',
  params: {
    type: 'object',
    properties: { tag: { type: 'string', minLength: 1 } },
    required: ['tag'],
  },
  querystring: {
    type: 'object',
    properties: {
      ...timeWindow,
      buckets: {
        type: 'integer',
        minimum: 1,
        maximum: MAX_PLOT_BUCKETS,
        description: `Quantas colunas o gráfico tem. O máximo é ${String(MAX_PLOT_BUCKETS)}.`,
      },
    },
    additionalProperties: false,
  },
  response: {
    200: {
      type: 'object',
      properties: {
        tag: { type: 'string' },
        unit: { type: 'string' },
        pointId: { type: 'integer' },
        from: { type: 'string', format: 'date-time' },
        to: { type: 'string', format: 'date-time' },
        bucketS: { type: 'integer' },
        buckets: { type: 'array', items: ref('PlotBucket') },
        before: { ...ref('ArchivedSample'), nullable: true },
        after: { ...ref('ArchivedSample'), nullable: true },
        timeWeightedAverage: { type: ['number', 'null'] },
        limits: {
          type: ['object', 'null'],
          properties: {
            ll: { type: ['number', 'null'] },
            l: { type: ['number', 'null'] },
            h: { type: ['number', 'null'] },
            hh: { type: ['number', 'null'] },
          },
          required: ['ll', 'l', 'h', 'hh'],
          additionalProperties: false,
        },
        target: { type: ['number', 'null'] },
      },
      required: ['tag', 'unit', 'from', 'to', 'bucketS', 'buckets', 'timeWeightedAverage'],
    },
    ...errors,
  },
} as const;

export const writeSetpointSchema = {
  tags: ['Processo'],
  summary: 'Escreve o setpoint de uma malha, com auditoria',
  description: [
    'Recusa pelo catálogo: tag desconhecida (404), medição em vez de malha,',
    'fora da faixa de operação, sem motivo, ou escrava de cascata (422).',
    'O valor anterior é lido pelo servidor, nunca enviado por quem escreve.',
  ].join(' '),
  params: {
    type: 'object',
    properties: { tag: { type: 'string', minLength: 1 } },
    required: ['tag'],
  },
  body: {
    type: 'object',
    properties: {
      value: { type: 'number' },
      reason: {
        type: 'string',
        minLength: 1,
        description: 'Obrigatório: é o campo que nenhum sistema preenche depois.',
      },
      changedBy: { type: 'string', minLength: 1 },
    },
    required: ['value', 'reason'],
    additionalProperties: false,
  },
  response: {
    200: {
      type: 'object',
      properties: {
        change: ref('SetpointChange'),
        min: { type: ['number', 'null'] },
        max: { type: ['number', 'null'] },
      },
      required: ['change'],
    },
    404: error,
    422: {
      type: 'object',
      properties: {
        statusCode: { type: 'integer' },
        error: { type: 'string' },
        message: { type: 'string' },
        rejection: { type: ['string', 'null'] },
        min: { type: ['number', 'null'] },
        max: { type: ['number', 'null'] },
      },
      required: ['statusCode', 'error', 'message', 'rejection'],
    },
  },
} as const;

export const listSteamGroupsSchema = {
  tags: ['Processo'],
  summary: 'Os seis grupos de vapor, com as tags resolvidas e o valor de cada uma',
  response: {
    200: {
      type: 'object',
      properties: {
        ts: { type: 'string', format: 'date-time' },
        groups: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              label: { type: 'string' },
              role: { type: ['string', 'null'] },
              section: { type: 'string' },
              cylinders: { type: 'array', items: { type: 'integer' } },
              pressure: { ...ref('TagValue'), nullable: true },
              siphonDeltaP: { ...ref('TagValue'), nullable: true },
              condensateLevel: { ...ref('TagValue'), nullable: true },
              condensateNote: { type: ['string', 'null'] },
              division: {
                type: 'object',
                properties: {
                  source: { type: 'string' },
                  note: { type: 'string' },
                },
                required: ['source', 'note'],
                additionalProperties: false,
              },
              tagMap: {
                type: 'object',
                properties: {
                  source: { type: 'string' },
                  note: { type: 'string' },
                },
                required: ['source', 'note'],
                additionalProperties: false,
              },
            },
            required: ['id', 'label', 'section', 'cylinders', 'condensateNote'],
          },
        },
      },
      required: ['ts', 'groups'],
    },
  },
} as const;

// -------------------------------------------------------------- alarmes

export const listAlarmsSchema = {
  tags: ['Alarmes'],
  summary: 'Os alarmes, do mais recente para o mais antigo',
  querystring: {
    type: 'object',
    properties: {
      state: { type: 'string', enum: [...ALARM_STATES] },
      priority: { type: 'string', enum: [...ALARM_PRIORITIES] },
      tag: { type: 'string' },
      needsAction: {
        type: 'boolean',
        description:
          'Só os que pedem ação: ou ninguém reconheceu, ou ainda estão ativos. ' +
          'Mantém na lista o alarme que normalizou sozinho sem ninguém ficar sabendo.',
      },
      ...timeWindow,
      limit,
    },
    additionalProperties: false,
  },
  response: {
    200: {
      type: 'object',
      properties: {
        count: { type: 'integer' },
        floodWindowS: { type: 'integer' },
        floodThreshold: { type: 'integer' },
        inFloodWindow: {
          type: 'integer',
          description: 'Quantos dispararam nos últimos 10 min — a taxa da ISA-18.2.',
        },
        flooding: { type: 'boolean' },
        alarms: { type: 'array', items: ref('Alarm') },
      },
      required: ['count', 'floodWindowS', 'floodThreshold', 'inFloodWindow', 'flooding', 'alarms'],
    },
  },
} as const;

export const acknowledgeAlarmSchema = {
  tags: ['Alarmes'],
  summary: 'Reconhece um alarme',
  description: [
    'Reconhecer é idempotente no efeito e não na resposta: o segundo',
    'reconhecimento devolve 409, porque quem chamou precisa saber que não foi',
    'ele que reconheceu.',
  ].join(' '),
  params: {
    type: 'object',
    properties: { id: { type: 'string', minLength: 1 } },
    required: ['id'],
  },
  body: {
    type: 'object',
    properties: { acknowledgedBy: { type: 'string', minLength: 1 } },
    required: ['acknowledgedBy'],
    additionalProperties: false,
  },
  response: {
    200: { type: 'object', properties: { alarm: ref('Alarm') }, required: ['alarm'] },
    404: error,
    409: error,
  },
} as const;

export const shelveAlarmSchema = {
  tags: ['Alarmes'],
  summary: 'Engaveta um alarme por um prazo',
  description: [
    'A gaveta suprime o anúncio, não a detecção: o alarme continua acompanhando',
    'o processo e normaliza quando o valor volta. O prazo tem teto de um turno.',
  ].join(' '),
  params: {
    type: 'object',
    properties: { id: { type: 'string', minLength: 1 } },
    required: ['id'],
  },
  body: {
    type: 'object',
    properties: {
      shelvedBy: { type: 'string', minLength: 1 },
      hours: { type: 'number', exclusiveMinimum: 0 },
    },
    required: ['shelvedBy', 'hours'],
    additionalProperties: false,
  },
  response: {
    200: { type: 'object', properties: { alarm: ref('Alarm') }, required: ['alarm'] },
    404: error,
    422: error,
  },
} as const;

// ------------------------------------------------------------- operação

const listOf = (item: string, key: string) =>
  ({
    type: 'object',
    properties: {
      count: { type: 'integer' },
      [key]: { type: 'array', items: ref(item) },
    },
    required: ['count', key],
  }) as const;

export const listShiftsSchema = {
  tags: ['Operação'],
  summary: 'Os turnos, do mais recente para o mais antigo',
  querystring: {
    type: 'object',
    properties: { ...timeWindow, limit },
    additionalProperties: false,
  },
  response: { 200: listOf('Shift', 'shifts') },
} as const;

export const getShiftSchema = {
  tags: ['Operação'],
  summary: 'Um turno, com as bobinas, quebras, trocas e rondas dele',
  params: {
    type: 'object',
    properties: { id: { type: 'string', minLength: 1 } },
    required: ['id'],
  },
  response: {
    200: {
      type: 'object',
      properties: {
        shift: ref('Shift'),
        reels: { type: 'array', items: ref('JumboReel') },
        webBreaks: { type: 'array', items: ref('WebBreak') },
        gradeChanges: { type: 'array', items: ref('GradeChange') },
        rounds: { type: 'array', items: ref('Round') },
      },
      required: ['shift', 'reels', 'webBreaks', 'gradeChanges', 'rounds'],
    },
    404: error,
  },
} as const;

export const listReelsSchema = {
  tags: ['Operação'],
  summary: 'As bobinas jumbo, da mais recente para a mais antiga',
  querystring: {
    type: 'object',
    properties: { shiftId: { type: 'string' }, limit },
    additionalProperties: false,
  },
  response: { 200: listOf('JumboReel', 'reels') },
} as const;

export const getReelSchema = {
  tags: ['Operação'],
  summary: 'Uma bobina jumbo',
  params: {
    type: 'object',
    properties: { number: { type: 'integer', minimum: 1 } },
    required: ['number'],
  },
  response: {
    200: { type: 'object', properties: { reel: ref('JumboReel') }, required: ['reel'] },
    404: error,
  },
} as const;

export const listWebBreaksSchema = {
  tags: ['Operação'],
  summary: 'As quebras de folha, com os sinais dos 10 min anteriores',
  querystring: {
    type: 'object',
    properties: { shiftId: { type: 'string' }, ...timeWindow, limit },
    additionalProperties: false,
  },
  response: { 200: listOf('WebBreak', 'webBreaks') },
} as const;

export const listGradeChangesSchema = {
  tags: ['Operação'],
  summary: 'As trocas de gramatura',
  querystring: {
    type: 'object',
    properties: { shiftId: { type: 'string' }, ...timeWindow, limit },
    additionalProperties: false,
  },
  response: { 200: listOf('GradeChange', 'gradeChanges') },
} as const;

export const listRoundsSchema = {
  tags: ['Operação'],
  summary: 'As rondas, com o valor de campo ao lado do online',
  querystring: {
    type: 'object',
    properties: { shiftId: { type: 'string' }, limit },
    additionalProperties: false,
  },
  response: { 200: listOf('Round', 'rounds') },
} as const;

export const getRoundSchema = {
  tags: ['Operação'],
  summary: 'Uma ronda',
  params: {
    type: 'object',
    properties: { id: { type: 'string', minLength: 1 } },
    required: ['id'],
  },
  response: {
    200: { type: 'object', properties: { round: ref('Round') }, required: ['round'] },
    404: error,
  },
} as const;

export const listNotesSchema = {
  tags: ['Operação'],
  summary: 'As notas de manutenção, por prioridade e depois por data',
  querystring: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: [...NOTE_STATUSES] },
      assetTag: { type: 'string' },
      limit,
    },
    additionalProperties: false,
  },
  response: { 200: listOf('MaintenanceNote', 'notes') },
} as const;

export const getNoteSchema = {
  tags: ['Operação'],
  summary: 'Uma nota de manutenção',
  params: {
    type: 'object',
    properties: { number: { type: 'string', minLength: 1 } },
    required: ['number'],
  },
  response: {
    200: {
      type: 'object',
      properties: { note: ref('MaintenanceNote') },
      required: ['note'],
    },
    404: error,
  },
} as const;

export const listSetpointChangesSchema = {
  tags: ['Operação'],
  summary: 'A auditoria das escritas de setpoint',
  querystring: {
    type: 'object',
    properties: { tag: { type: 'string' }, limit },
    additionalProperties: false,
  },
  response: { 200: listOf('SetpointChange', 'changes') },
} as const;
