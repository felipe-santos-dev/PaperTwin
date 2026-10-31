import { ASSET_KINDS, ISO_ZONES, SECTION_IDS, VIBRATION_BUCKETS } from '@mp1/shared';

/**
 * Os schemas das rotas, em JSON Schema.
 *
 * O Fastify usa o mesmo objeto para três coisas: validar o que entra,
 * serializar o que sai — descartando campo que não está declarado — e alimentar
 * o OpenAPI. Uma descrição só, e não três que se desencontram.
 */

export const assetSchema = {
  $id: 'Asset',
  type: 'object',
  description: 'Um ativo da máquina, como declarado no modelo.',
  properties: {
    tag: { type: 'string', examples: ['MP1-SEC-G4-CS23-MLA'] },
    kind: { type: 'string', enum: [...ASSET_KINDS] },
    label: { type: 'string' },
    section: { type: 'string', enum: [...SECTION_IDS] },
    position: {
      type: 'array',
      description: 'Centro do ativo em metros: X ao longo da máquina, Y altura, Z largura.',
      items: { type: 'number' },
      minItems: 3,
      maxItems: 3,
    },
    radius: { type: ['number', 'null'], description: 'Raio em metros, para corpos girantes.' },
    lengthM: { type: ['number', 'null'] },
    side: { type: ['string', 'null'], enum: ['LA', 'LC', null] },
    parentTag: { type: ['string', 'null'] },
    steamGroup: { type: ['string', 'null'] },
    iso: {
      type: ['object', 'null'],
      description: 'Classe da ISO 20816-3. Nulo nos ativos sem medição de vibração.',
      properties: {
        group: { type: 'string', enum: ['group1', 'group2'] },
        support: { type: 'string', enum: ['rigid', 'flexible'] },
      },
      required: ['group', 'support'],
      additionalProperties: false,
    },
    source: {
      type: 'string',
      enum: ['validated', 'assumed'],
      description: 'Se a existência deste ativo foi confirmada ou é suposição do protótipo.',
    },
  },
  required: [
    'tag',
    'kind',
    'label',
    'section',
    'position',
    'radius',
    'lengthM',
    'side',
    'parentTag',
    'steamGroup',
    'iso',
    'source',
  ],
  additionalProperties: false,
} as const;

export const readingSchema = {
  $id: 'VibrationReading',
  type: 'object',
  properties: {
    assetTag: { type: 'string' },
    ts: { type: 'string', format: 'date-time' },
    rmsMmS: { type: 'number', description: 'Velocidade de vibração RMS, mm/s.' },
    tempC: { type: 'number' },
    envelopeGe: { type: 'number', description: 'Envelope de aceleração, gE.' },
  },
  required: ['assetTag', 'ts', 'rmsMmS', 'tempC', 'envelopeGe'],
  additionalProperties: false,
} as const;

export const isoLimitsSchema = {
  $id: 'IsoLimits',
  type: 'object',
  description: 'Fronteiras entre zonas da ISO 20816-3, em mm/s RMS.',
  properties: {
    aToB: { type: 'number' },
    bToC: { type: 'number' },
    cToD: { type: 'number' },
  },
  required: ['aToB', 'bToC', 'cToD'],
  additionalProperties: false,
} as const;

export const assetStatusSchema = {
  $id: 'AssetStatus',
  type: 'object',
  description: 'Estado atual do ativo, derivado da última leitura.',
  properties: {
    assetTag: { type: 'string' },
    zone: { type: ['string', 'null'], enum: [...ISO_ZONES, null] },
    health: { type: ['string', 'null'], enum: ['normal', 'attention', 'critical', null] },
    latest: { ...readingSchema, $id: undefined, type: ['object', 'null'] },
  },
  required: ['assetTag', 'zone', 'health', 'latest'],
  additionalProperties: false,
} as const;

export const bucketSchema = {
  $id: 'VibrationBucket',
  type: 'object',
  properties: {
    bucketStart: { type: 'string', format: 'date-time' },
    samples: { type: 'integer' },
    rmsAvgMmS: { type: 'number' },
    rmsMaxMmS: { type: 'number' },
    tempAvgC: { type: 'number' },
    envelopeMaxGe: { type: 'number' },
  },
  required: ['bucketStart', 'samples', 'rmsAvgMmS', 'rmsMaxMmS', 'tempAvgC', 'envelopeMaxGe'],
  additionalProperties: false,
} as const;

export const remainingLifeSchema = {
  $id: 'RemainingLife',
  type: 'object',
  description:
    'Vida útil restante por tendência linear. Subestima de propósito: a degradação de rolamento acelera.',
  properties: {
    trendMmSPerDay: { type: 'number' },
    daysToZoneD: {
      type: ['number', 'null'],
      description: 'Nulo quando a tendência não leva à zona D.',
    },
    samples: { type: 'integer' },
  },
  required: ['trendMmSPerDay', 'daysToZoneD', 'samples'],
  additionalProperties: false,
} as const;

export const errorSchema = {
  $id: 'Error',
  type: 'object',
  properties: {
    statusCode: { type: 'integer' },
    error: { type: 'string' },
    message: { type: 'string' },
  },
  required: ['message'],
} as const;

/** Todos os schemas nomeados, registrados de uma vez na aplicação. */
export const SHARED_SCHEMAS = [
  assetSchema,
  readingSchema,
  isoLimitsSchema,
  assetStatusSchema,
  bucketSchema,
  remainingLifeSchema,
  errorSchema,
];

const ref = (id: string) => ({ $ref: id });

export const listAssetsSchema = {
  tags: ['Ativos'],
  summary: 'Lista os ativos da máquina',
  querystring: {
    type: 'object',
    properties: {
      section: { type: 'string', enum: [...SECTION_IDS] },
      kind: { type: 'string', enum: [...ASSET_KINDS] },
    },
    additionalProperties: false,
  },
  response: {
    200: {
      type: 'object',
      properties: {
        count: { type: 'integer' },
        assets: { type: 'array', items: ref('Asset') },
      },
      required: ['count', 'assets'],
    },
  },
} as const;

export const getAssetSchema = {
  tags: ['Ativos'],
  summary: 'Um ativo e o seu estado atual',
  params: {
    type: 'object',
    properties: { tag: { type: 'string', minLength: 1 } },
    required: ['tag'],
  },
  response: {
    200: {
      type: 'object',
      properties: {
        asset: ref('Asset'),
        status: ref('AssetStatus'),
        limits: { ...isoLimitsSchema, $id: undefined, type: ['object', 'null'] },
      },
      required: ['asset', 'status', 'limits'],
    },
    404: ref('Error'),
  },
} as const;

export const getVibrationSchema = {
  tags: ['Vibração'],
  summary: 'Série de vibração agregada por janela',
  description:
    'Agrega com date_bin(), alinhando as janelas a uma origem fixa — assim dois recortes diferentes devolvem as mesmas bordas.',
  params: {
    type: 'object',
    properties: { tag: { type: 'string', minLength: 1 } },
    required: ['tag'],
  },
  querystring: {
    type: 'object',
    properties: {
      from: { type: 'string', format: 'date-time', description: 'Padrão: 72 h atrás.' },
      to: { type: 'string', format: 'date-time', description: 'Padrão: agora.' },
      bucket: { type: 'string', enum: [...VIBRATION_BUCKETS], default: '1 hour' },
    },
    additionalProperties: false,
  },
  response: {
    200: {
      type: 'object',
      properties: {
        assetTag: { type: 'string' },
        from: { type: 'string', format: 'date-time' },
        to: { type: 'string', format: 'date-time' },
        bucket: { type: 'string', enum: [...VIBRATION_BUCKETS] },
        limits: { ...isoLimitsSchema, $id: undefined, type: ['object', 'null'] },
        buckets: { type: 'array', items: ref('VibrationBucket') },
        remainingLife: { ...remainingLifeSchema, $id: undefined, type: ['object', 'null'] },
      },
      required: ['assetTag', 'from', 'to', 'bucket', 'limits', 'buckets', 'remainingLife'],
    },
    400: ref('Error'),
    404: ref('Error'),
  },
} as const;
