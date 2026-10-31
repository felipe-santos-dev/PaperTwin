import {
  ALARM_LIMITS,
  ALARM_PRIORITIES,
  ALARM_STATES,
  ARCHIVE_REASONS,
  EVIDENCE_KINDS,
  LEAK_STATES,
  NOISE_LEVELS,
  NOTE_ORIGINS,
  NOTE_STATUSES,
  REEL_DISPOSITIONS,
  SECTION_IDS,
  SHIFT_LETTERS,
} from '@mp1/shared';

/**
 * Os schemas das rotas de processo, alarme e operação.
 *
 * Mesma ideia de `schemas.ts`: um objeto que valida o que entra, serializa o
 * que sai e alimenta o OpenAPI. Separado em outro arquivo só por tamanho — a
 * Fase 5 mais que dobrou a superfície da API.
 *
 * Duas convenções valem para tudo aqui:
 *
 * 1. **`additionalProperties: false` em tudo.** O padrão do Fastify é descartar
 *    em silêncio o que não está no schema, e aí um `?tags=` em vez de `?tag=`
 *    devolveria a lista inteira sem avisar.
 * 2. **Nulo é declarado, não omitido.** Uma bobina em andamento tem peso nulo, e
 *    o schema diz isso — `type: ['number', 'null']` — em vez de deixar o campo
 *    fora e o consumidor adivinhar se é ausência ou erro.
 */

export const processVariableSchema = {
  $id: 'ProcessVariable',
  type: 'object',
  description: 'Uma variável do catálogo, com faixa, limites e proveniência.',
  properties: {
    tag: { type: 'string', examples: ['PIC-514'] },
    name: { type: 'string' },
    area: { type: 'string' },
    group: { type: 'string' },
    unit: { type: 'string' },
    min: { type: 'number' },
    max: { type: 'number' },
    target: { type: ['number', 'null'] },
    limits: {
      type: 'object',
      description: 'Limites de alarme. Nulo no nível que a variável não tem.',
      properties: {
        ll: { type: ['number', 'null'] },
        l: { type: ['number', 'null'] },
        h: { type: ['number', 'null'] },
        hh: { type: ['number', 'null'] },
      },
      required: ['ll', 'l', 'h', 'hh'],
      additionalProperties: false,
    },
    controlled: { type: 'boolean' },
    mv: { type: ['string', 'null'] },
    compression: {
      type: 'object',
      description: 'Filtro de exceção e desvio da porta oscilante do historiador.',
      properties: {
        excDev: { type: ['number', 'null'] },
        compDev: { type: ['number', 'null'] },
      },
      required: ['excDev', 'compDev'],
      additionalProperties: false,
    },
    source: { type: 'string', enum: ['B', 'ISO 20816-3', 'assumed'] },
    confidence: { type: 'string', enum: ['alta', 'média', 'baixa'] },
    note: { type: ['string', 'null'] },
    cylinder: { type: ['integer', 'null'] },
    steamGroup: { type: ['string', 'null'] },
  },
  required: [
    'tag',
    'name',
    'area',
    'group',
    'unit',
    'min',
    'max',
    'target',
    'limits',
    'controlled',
    'mv',
    'compression',
    'source',
    'confidence',
    'note',
    'cylinder',
    'steamGroup',
  ],
  additionalProperties: false,
} as const;

export const tagValueSchema = {
  $id: 'TagValue',
  type: 'object',
  description: 'O valor de uma tag no instante da simulação.',
  properties: {
    tag: { type: 'string' },
    value: { type: 'number' },
    unit: { type: 'string' },
    ts: { type: 'string', format: 'date-time' },
    setpoint: {
      type: ['number', 'null'],
      description: 'Nulo nas tags sem setpoint: medições e escravas de cascata.',
    },
  },
  required: ['tag', 'value', 'unit', 'ts', 'setpoint'],
  additionalProperties: false,
} as const;

export const plotBucketSchema = {
  $id: 'PlotBucket',
  type: 'object',
  description:
    'Uma coluna do gráfico. Quatro valores por coluna para um pico curto não desaparecer.',
  properties: {
    bucketStart: { type: 'string', format: 'date-time' },
    samples: { type: 'integer' },
    min: { type: 'number' },
    max: { type: 'number' },
    first: { type: 'number' },
    last: { type: 'number' },
  },
  required: ['bucketStart', 'samples', 'min', 'max', 'first', 'last'],
  additionalProperties: false,
} as const;

export const archivedSampleSchema = {
  $id: 'ArchivedSample',
  type: 'object',
  properties: {
    t: { type: 'integer', description: 'Instante em ms do epoch.' },
    v: { type: 'number' },
    pointId: { type: 'integer' },
    reason: { type: 'string', enum: [...ARCHIVE_REASONS] },
  },
  required: ['t', 'v', 'pointId', 'reason'],
  additionalProperties: false,
} as const;

export const alarmSchema = {
  $id: 'Alarm',
  type: 'object',
  description: 'Um alarme no modelo da ISA-18.2.',
  properties: {
    id: { type: 'string' },
    tag: { type: 'string' },
    limit: { type: 'string', enum: [...ALARM_LIMITS] },
    threshold: { type: 'number' },
    priority: { type: 'string', enum: [...ALARM_PRIORITIES] },
    state: { type: 'string', enum: [...ALARM_STATES] },
    raisedAt: { type: 'string', format: 'date-time' },
    peakValue: { type: 'number', description: 'Pior valor desde o disparo.' },
    acknowledgedAt: { type: ['string', 'null'], format: 'date-time' },
    acknowledgedBy: { type: ['string', 'null'] },
    clearedAt: { type: ['string', 'null'], format: 'date-time' },
    shelvedUntil: { type: ['string', 'null'], format: 'date-time' },
    shelvedBy: { type: ['string', 'null'] },
  },
  required: [
    'id',
    'tag',
    'limit',
    'threshold',
    'priority',
    'state',
    'raisedAt',
    'peakValue',
    'acknowledgedAt',
    'acknowledgedBy',
    'clearedAt',
    'shelvedUntil',
    'shelvedBy',
  ],
  additionalProperties: false,
} as const;

export const shiftSchema = {
  $id: 'Shift',
  type: 'object',
  properties: {
    id: { type: 'string', examples: ['T-2026-06-15-B'] },
    letter: { type: 'string', enum: [...SHIFT_LETTERS] },
    operationDate: { type: 'string' },
    startedAt: { type: 'string' },
    endedAt: { type: ['string', 'null'] },
    operator: { type: 'string' },
    productionT: { type: 'number' },
    efficiencyPct: { type: 'number' },
    handover: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'id',
    'letter',
    'operationDate',
    'startedAt',
    'endedAt',
    'operator',
    'productionT',
    'efficiencyPct',
    'handover',
  ],
  additionalProperties: false,
} as const;

export const reelSchema = {
  $id: 'JumboReel',
  type: 'object',
  description: 'Uma bobina jumbo. Quase tudo é nulo enquanto ela está na Pope.',
  properties: {
    number: { type: 'integer' },
    shiftId: { type: 'string' },
    startedAt: { type: 'string' },
    endedAt: { type: ['string', 'null'] },
    weightT: { type: ['number', 'null'] },
    lengthM: { type: ['number', 'null'] },
    finalDiameterMm: { type: ['number', 'null'] },
    basisWeightGsm: { type: ['number', 'null'] },
    moisturePct: { type: ['number', 'null'] },
    caliperUm: { type: ['number', 'null'] },
    cdSpread: {
      type: ['object', 'null'],
      description: 'Dispersão 2σ do perfil CD medida pelo QCS.',
      properties: {
        basisWeightGsm: { type: 'number' },
        moisturePct: { type: 'number' },
        caliperUm: { type: 'number' },
      },
      required: ['basisWeightGsm', 'moisturePct', 'caliperUm'],
      additionalProperties: false,
    },
    splices: { type: 'integer' },
    disposition: { type: ['string', 'null'], enum: [...REEL_DISPOSITIONS, null] },
    dispositionReason: { type: ['string', 'null'] },
  },
  required: [
    'number',
    'shiftId',
    'startedAt',
    'endedAt',
    'weightT',
    'lengthM',
    'finalDiameterMm',
    'basisWeightGsm',
    'moisturePct',
    'caliperUm',
    'cdSpread',
    'splices',
    'disposition',
    'dispositionReason',
  ],
  additionalProperties: false,
} as const;

export const webBreakSchema = {
  $id: 'WebBreak',
  type: 'object',
  properties: {
    id: { type: 'string' },
    shiftId: { type: 'string' },
    startedAt: { type: 'string' },
    endedAt: { type: ['string', 'null'] },
    section: { type: 'string', enum: [...SECTION_IDS] },
    probableCause: { type: 'string' },
    precursors: {
      type: 'array',
      description: 'Sinais dos 10 min anteriores, do mais antigo ao mais recente.',
      items: {
        type: 'object',
        properties: {
          tag: { type: 'string' },
          description: { type: 'string' },
          leadTimeS: { type: 'integer', description: 'Segundos antes da quebra.' },
          valueBefore: { type: 'number' },
          valueAtSignal: { type: 'number' },
        },
        required: ['tag', 'description', 'leadTimeS', 'valueBefore', 'valueAtSignal'],
        additionalProperties: false,
      },
    },
  },
  required: ['id', 'shiftId', 'startedAt', 'endedAt', 'section', 'probableCause', 'precursors'],
  additionalProperties: false,
} as const;

export const gradeChangeSchema = {
  $id: 'GradeChange',
  type: 'object',
  properties: {
    id: { type: 'string' },
    shiftId: { type: 'string' },
    fromGsm: { type: 'number' },
    toGsm: { type: 'number' },
    startedAt: { type: 'string' },
    stabilizedAt: { type: ['string', 'null'] },
    affectedReels: { type: 'array', items: { type: 'integer' } },
  },
  required: ['id', 'shiftId', 'fromGsm', 'toGsm', 'startedAt', 'stabilizedAt', 'affectedReels'],
  additionalProperties: false,
} as const;

export const roundSchema = {
  $id: 'Round',
  type: 'object',
  properties: {
    id: { type: 'string' },
    shiftId: { type: 'string' },
    startedAt: { type: 'string' },
    finishedAt: { type: ['string', 'null'] },
    inspector: { type: 'string' },
    points: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          assetTag: { type: 'string' },
          fieldTempC: { type: ['number', 'null'] },
          noise: { type: 'string', enum: [...NOISE_LEVELS] },
          leak: { type: 'string', enum: [...LEAK_STATES] },
          note: { type: ['string', 'null'] },
          onlineTag: { type: ['string', 'null'] },
          onlineValue: { type: ['number', 'null'] },
        },
        required: ['assetTag', 'fieldTempC', 'noise', 'leak', 'note', 'onlineTag', 'onlineValue'],
        additionalProperties: false,
      },
    },
  },
  required: ['id', 'shiftId', 'startedAt', 'finishedAt', 'inspector', 'points'],
  additionalProperties: false,
} as const;

export const noteSchema = {
  $id: 'MaintenanceNote',
  type: 'object',
  properties: {
    number: { type: 'string', examples: ['NM-000123'] },
    assetTag: { type: 'string' },
    symptom: { type: 'string' },
    priority: { type: 'integer', enum: [1, 2, 3, 4] },
    origin: { type: 'string', enum: [...NOTE_ORIGINS] },
    originRef: { type: ['string', 'null'] },
    status: { type: 'string', enum: [...NOTE_STATUSES] },
    requiresShutdown: { type: 'boolean' },
    evidence: {
      type: 'array',
      description: 'Referências ao que o gêmeo já tem. Não há anexo de arquivo.',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: [...EVIDENCE_KINDS] },
          ref: { type: 'string' },
          label: { type: 'string' },
        },
        required: ['kind', 'ref', 'label'],
        additionalProperties: false,
      },
    },
    createdAt: { type: 'string' },
    closedAt: { type: ['string', 'null'] },
  },
  required: [
    'number',
    'assetTag',
    'symptom',
    'priority',
    'origin',
    'originRef',
    'status',
    'requiresShutdown',
    'evidence',
    'createdAt',
    'closedAt',
  ],
  additionalProperties: false,
} as const;

export const setpointChangeSchema = {
  $id: 'SetpointChange',
  type: 'object',
  description: 'Registro de auditoria de uma escrita de setpoint.',
  properties: {
    id: { type: 'string' },
    tag: { type: 'string' },
    previousValue: { type: 'number', description: 'Lido pelo servidor, não enviado.' },
    newValue: { type: 'number' },
    unit: { type: 'string' },
    changedBy: { type: 'string' },
    changedAt: { type: 'string' },
    reason: { type: 'string' },
  },
  required: ['id', 'tag', 'previousValue', 'newValue', 'unit', 'changedBy', 'changedAt', 'reason'],
  additionalProperties: false,
} as const;

/** Os schemas da Fase 5, registrados junto com os da Fase 3. */
export const PROCESS_SCHEMAS = [
  processVariableSchema,
  tagValueSchema,
  plotBucketSchema,
  archivedSampleSchema,
  alarmSchema,
  shiftSchema,
  reelSchema,
  webBreakSchema,
  gradeChangeSchema,
  roundSchema,
  noteSchema,
  setpointChangeSchema,
];
