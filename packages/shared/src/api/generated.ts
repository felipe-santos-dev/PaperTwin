/**
 * GERADO — não edite à mão.
 *
 * Saída de `packages/shared/scripts/generate-api-types.ts`, que lê
 * `apps/api-java/openapi.json`. Para mudar um tipo, mude a rota no Java,
 * regrave o contrato e rode:
 *
 *     npm run generate:api-types --workspace @mp1/shared
 *
 * O contrato é conferido no Java (`OpenApiContractTest`) e estes tipos são
 * conferidos no CI, de modo que os dois lados nunca se afastam em silêncio.
 */

export interface paths {
  '/alarms': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['alarms'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/alarms/{id}/ack': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['acknowledge'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/alarms/{id}/shelve': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['shelve'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/alarms/{id}/unshelve': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put?: never;
    post: operations['unshelve'];
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/assets': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['list'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/assets/{tag}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['detail'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/assets/{tag}/vibration': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['vibration'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/grade-changes': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['gradeChanges'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/health': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['health'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/notes': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['notes'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/notes/{number}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['note'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/process/steam-groups': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['steamGroups'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/process/tags/{tag}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['tag'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/process/tags/{tag}/setpoint': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get?: never;
    put: operations['writeSetpoint'];
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/process/tags/{tag}/trend': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['trend'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/process/values': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['values'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/reels': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['reels'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/reels/{number}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['reel'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/rounds': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['rounds'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/rounds/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['round'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/setpoint-changes': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['setpointChanges'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/shifts': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['shifts'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/shifts/{id}': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['shift'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/stream': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['stream'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
  '/web-breaks': {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    get: operations['webBreaks'];
    put?: never;
    post?: never;
    delete?: never;
    options?: never;
    head?: never;
    patch?: never;
    trace?: never;
  };
}
export type webhooks = Record<string, never>;
export interface components {
  schemas: {
    Acknowledge: {
      acknowledgedBy: string;
    };
    Alarm: {
      acknowledgedAt: string | null;
      acknowledgedBy: string | null;
      clearedAt: string | null;
      id: string;
      /** @enum {string} */
      limit: 'LL' | 'L' | 'H' | 'HH';
      /** Format: double */
      peakValue: number;
      /** @enum {string} */
      priority: 'baixa' | 'média' | 'alta' | 'crítica';
      /** Format: date-time */
      raisedAt: string;
      shelvedBy: string | null;
      shelvedUntil: string | null;
      /** @enum {string} */
      state: 'ativo' | 'reconhecido' | 'normalizado';
      tag: string;
      /** Format: double */
      threshold: number;
    };
    AlarmLimits: {
      h: number | null;
      hh: number | null;
      l: number | null;
      ll: number | null;
    };
    AlarmResponse: {
      alarm: components['schemas']['Alarm'];
    };
    Alarms: {
      alarms: components['schemas']['Alarm'][];
      /** Format: int32 */
      count: number;
      flooding: boolean;
      /** Format: int32 */
      floodThreshold: number;
      /** Format: int32 */
      floodWindowS: number;
      /** Format: int32 */
      inFloodWindow: number;
    };
    ArchivedSample: {
      /** @enum {string} */
      reason: 'INICIAL' | 'PORTA' | 'INTERVALO' | 'EVENTO' | 'FINAL';
      /** Format: int64 */
      t: number;
      /** Format: double */
      v: number;
    };
    AssetDetail: {
      asset: components['schemas']['AssetView'];
      limits: components['schemas']['Limits'] | null;
      status: components['schemas']['Status'] | null;
    };
    Assets: {
      assets: components['schemas']['AssetView'][];
      /** Format: int32 */
      count: number;
    };
    AssetView: {
      iso: components['schemas']['IsoClass'] | null;
      kind: string;
      label: string;
      lengthM: number | null;
      parentTag: string | null;
      position: number[];
      radius: number | null;
      section: string;
      side: string | null;
      source: string;
      steamGroup: string | null;
      tag: string;
    };
    Bucket: {
      /** Format: date-time */
      bucketStart: string;
      /** Format: double */
      envelopeMaxGe: number;
      /** Format: double */
      rmsAvgMmS: number;
      /** Format: double */
      rmsMaxMmS: number;
      /** Format: int32 */
      samples: number;
      /** Format: double */
      tempAvgC: number;
    };
    CdSpread: {
      /** Format: double */
      basisWeightGsm: number;
      /** Format: double */
      caliperUm: number;
      /** Format: double */
      moisturePct: number;
    };
    Compression: {
      compDev: number | null;
      excDev: number | null;
    };
    Estimate: {
      daysToZoneD: number | null;
      /** Format: int32 */
      samples: number;
      /** Format: double */
      trendMmSPerDay: number;
    };
    Evidence: {
      /** @enum {string} */
      kind: 'tendência' | 'alarme' | 'ronda' | 'medição';
      label: string;
      ref: string;
    };
    GradeChange: {
      affectedReels: number[];
      /** Format: double */
      fromGsm: number;
      id: string;
      shiftId: string;
      stabilizedAt: string | null;
      /** Format: date-time */
      startedAt: string;
      /** Format: double */
      toGsm: number;
    };
    GradeChanges: {
      /** Format: int32 */
      count: number;
      gradeChanges: components['schemas']['GradeChange'][];
    };
    Health: {
      database: string;
      databaseUp: boolean;
      service: string;
      simulation: components['schemas']['Simulation'] | null;
      status: string;
      /** Format: int64 */
      uptimeS: number;
      version: string;
    };
    IsoClass: {
      group: string;
      support: string;
    };
    Limits: {
      /** Format: double */
      aToB: number;
      /** Format: double */
      bToC: number;
      /** Format: double */
      cToD: number;
    };
    MaintenanceNote: {
      assetTag: string;
      closedAt: string | null;
      /** Format: date-time */
      createdAt: string;
      evidence: components['schemas']['Evidence'][];
      number: string;
      /** @enum {string} */
      origin: 'alarme' | 'ronda' | 'operação';
      originRef: string | null;
      /** Format: int32 */
      priority: number;
      requiresShutdown: boolean;
      /** @enum {string} */
      status: 'aberta' | 'planejada' | 'em execução' | 'encerrada';
      symptom: string;
    };
    NoteDetail: {
      note: components['schemas']['MaintenanceNote'];
    };
    Notes: {
      /** Format: int32 */
      count: number;
      notes: components['schemas']['MaintenanceNote'][];
    };
    PlotBucket: {
      /** Format: date-time */
      bucketStart: string;
      /** Format: double */
      first: number;
      /** Format: double */
      last: number;
      /** Format: double */
      max: number;
      /** Format: double */
      min: number;
      /** Format: int32 */
      samples: number;
    };
    Precursor: {
      description: string;
      /** Format: int32 */
      leadTimeS: number;
      tag: string;
      /** Format: double */
      valueAtSignal: number;
      /** Format: double */
      valueBefore: number;
    };
    ProcessVariable: {
      area: string;
      compression: components['schemas']['Compression'];
      /** @enum {string} */
      confidence: 'alta' | 'média' | 'baixa';
      controlled: boolean;
      cylinder: number | null;
      group: string;
      limits: components['schemas']['AlarmLimits'];
      /** Format: double */
      max: number;
      /** Format: double */
      min: number;
      mv: string | null;
      name: string;
      note: string | null;
      /** @enum {string} */
      source: 'B' | 'ISO 20816-3' | 'assumed';
      steamGroup: string | null;
      tag: string;
      target: number | null;
      unit: string;
    };
    Provenance: {
      note: string;
      source: string;
    };
    Reading: {
      assetTag: string;
      /** Format: double */
      envelopeGe: number;
      /** Format: double */
      rmsMmS: number;
      /** Format: double */
      tempC: number;
      /** Format: date-time */
      ts: string;
    };
    Reel: {
      basisWeightGsm: number | null;
      caliperUm: number | null;
      cdSpread: components['schemas']['CdSpread'] | null;
      disposition: ('aprovada' | 'rebaixada' | 'segregada') | null;
      dispositionReason: string | null;
      endedAt: string | null;
      finalDiameterMm: number | null;
      lengthM: number | null;
      moisturePct: number | null;
      /** Format: int32 */
      number: number;
      shiftId: string;
      /** Format: int32 */
      splices: number;
      /** Format: date-time */
      startedAt: string;
      weightT: number | null;
    };
    ReelDetail: {
      reel: components['schemas']['Reel'];
    };
    Reels: {
      /** Format: int32 */
      count: number;
      reels: components['schemas']['Reel'][];
    };
    Round: {
      /** Format: date-time */
      finishedAt: string;
      id: string;
      inspector: string;
      points: components['schemas']['RoundPoint'][];
      shiftId: string;
      /** Format: date-time */
      startedAt: string;
    };
    RoundDetail: {
      round: components['schemas']['Round'];
    };
    RoundPoint: {
      assetTag: string;
      fieldTempC: number | null;
      /** @enum {string} */
      leak: 'nenhum' | 'gotejamento' | 'jato';
      /** @enum {string} */
      noise: 'normal' | 'elevado' | 'anormal';
      note: string | null;
      onlineTag: string | null;
      onlineValue: number | null;
    };
    Rounds: {
      /** Format: int32 */
      count: number;
      rounds: components['schemas']['Round'][];
    };
    SetpointChange: {
      /** Format: date-time */
      changedAt: string;
      changedBy: string;
      id: string;
      /** Format: double */
      newValue: number;
      /** Format: double */
      previousValue: number;
      reason: string;
      tag: string;
      unit: string;
    };
    SetpointChanges: {
      changes: components['schemas']['SetpointChange'][];
      /** Format: int32 */
      count: number;
    };
    SetpointWritten: {
      change: components['schemas']['SetpointChange'];
      /** Format: double */
      max: number;
      /** Format: double */
      min: number;
    };
    Shelve: {
      /** Format: int32 */
      hours: number;
      shelvedBy: string;
    };
    Shift: {
      /** Format: double */
      efficiencyPct: number;
      endedAt: string | null;
      handover: string[];
      id: string;
      letter: string;
      /** Format: date */
      operationDate: string;
      operator: string;
      /** Format: double */
      productionT: number;
      /** Format: date-time */
      startedAt: string;
    };
    ShiftDetail: {
      gradeChanges: components['schemas']['GradeChange'][];
      reels: components['schemas']['Reel'][];
      rounds: components['schemas']['Round'][];
      shift: components['schemas']['Shift'];
      webBreaks: components['schemas']['WebBreak'][];
    };
    Shifts: {
      /** Format: int32 */
      count: number;
      shifts: components['schemas']['Shift'][];
    };
    Simulation: {
      /** Format: int64 */
      behindS: number;
      /** Format: date-time */
      lastRunAt: string;
      /** Format: int64 */
      lastTick: number;
      /** Format: int64 */
      maxHours: number;
      /** Format: int32 */
      seed: number;
    };
    SseEmitter: {
      /** Format: int64 */
      timeout?: number;
    };
    Status: {
      assetTag: string;
      /** @enum {string} */
      health: 'normal' | 'attention' | 'critical';
      latest: components['schemas']['Reading'];
      /** @enum {string} */
      zone: 'A' | 'B' | 'C' | 'D';
    };
    SteamGroupsView: {
      groups: components['schemas']['SteamGroupView'][];
      /** Format: date-time */
      ts: string;
    };
    SteamGroupView: {
      condensateLevel: components['schemas']['TagValue'] | null;
      condensateNote: string | null;
      cylinders: number[];
      division: components['schemas']['Provenance'];
      id: string;
      label: string;
      pressure: components['schemas']['TagValue'] | null;
      role: string | null;
      section: string;
      siphonDeltaP: components['schemas']['TagValue'] | null;
      tagMap: components['schemas']['Provenance'];
    };
    TagDetail: {
      archived: boolean;
      notWritableBecause: string | null;
      value: components['schemas']['TagValue'];
      variable: components['schemas']['ProcessVariable'];
      writable: boolean;
    };
    TagTrend: {
      after: components['schemas']['ArchivedSample'] | null;
      before: components['schemas']['ArchivedSample'] | null;
      buckets: components['schemas']['PlotBucket'][];
      /** Format: int64 */
      bucketS: number;
      /** Format: date-time */
      from: string;
      limits: components['schemas']['AlarmLimits'] | null;
      tag: string;
      target: number | null;
      timeWeightedAverage: number | null;
      /** Format: date-time */
      to: string;
      unit: string;
    };
    TagValue: {
      setpoint: number | null;
      tag: string;
      /** Format: date-time */
      ts: string;
      unit: string;
      value: number | null;
      zone: string | null;
    };
    Values: {
      /** Format: int32 */
      count: number;
      /** Format: date-time */
      ts: string;
      values: components['schemas']['TagValue'][];
    };
    Vibration: {
      assetTag: string;
      /** @enum {string} */
      bucket: '1 minute' | '5 minutes' | '15 minutes' | '1 hour' | '6 hours' | '1 day';
      buckets: components['schemas']['Bucket'][];
      /** Format: date-time */
      from: string;
      limits: components['schemas']['Limits'] | null;
      remainingLife: components['schemas']['Estimate'] | null;
      /** Format: date-time */
      to: string;
    };
    WebBreak: {
      endedAt: string | null;
      id: string;
      precursors: components['schemas']['Precursor'][];
      probableCause: string;
      section: string;
      shiftId: string;
      /** Format: date-time */
      startedAt: string;
    };
    WebBreaks: {
      /** Format: int32 */
      count: number;
      webBreaks: components['schemas']['WebBreak'][];
    };
    WriteSetpoint: {
      changedBy: string | null;
      reason: string;
      /** Format: double */
      value: number;
    };
  };
  responses: never;
  parameters: never;
  requestBodies: never;
  headers: never;
  pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
  alarms: {
    parameters: {
      query?: {
        limit?: number;
        priority?: string;
        state?: string;
        tag?: string;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          '*/*': components['schemas']['Alarms'];
        };
      };
    };
  };
  acknowledge: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['Acknowledge'];
      };
    };
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          '*/*': components['schemas']['AlarmResponse'];
        };
      };
    };
  };
  shelve: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['Shelve'];
      };
    };
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          '*/*': components['schemas']['AlarmResponse'];
        };
      };
    };
  };
  unshelve: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          '*/*': components['schemas']['AlarmResponse'];
        };
      };
    };
  };
  list: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          '*/*': components['schemas']['Assets'];
        };
      };
    };
  };
  detail: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        tag: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          '*/*': components['schemas']['AssetDetail'];
        };
      };
    };
  };
  vibration: {
    parameters: {
      query?: {
        bucket?: string;
        from?: string;
        to?: string;
      };
      header?: never;
      path: {
        tag: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          '*/*': components['schemas']['Vibration'];
        };
      };
    };
  };
  gradeChanges: {
    parameters: {
      query?: {
        limit?: number;
        shiftId?: string;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          '*/*': components['schemas']['GradeChanges'];
        };
      };
    };
  };
  health: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          '*/*': components['schemas']['Health'];
        };
      };
    };
  };
  notes: {
    parameters: {
      query?: {
        assetTag?: string;
        limit?: number;
        status?: string;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          '*/*': components['schemas']['Notes'];
        };
      };
    };
  };
  note: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        number: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          '*/*': components['schemas']['NoteDetail'];
        };
      };
    };
  };
  steamGroups: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          '*/*': components['schemas']['SteamGroupsView'];
        };
      };
    };
  };
  tag: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        tag: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          '*/*': components['schemas']['TagDetail'];
        };
      };
    };
  };
  writeSetpoint: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        tag: string;
      };
      cookie?: never;
    };
    requestBody: {
      content: {
        'application/json': components['schemas']['WriteSetpoint'];
      };
    };
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          '*/*': components['schemas']['SetpointWritten'];
        };
      };
    };
  };
  trend: {
    parameters: {
      query?: {
        buckets?: number;
        from?: string;
        to?: string;
      };
      header?: never;
      path: {
        tag: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          '*/*': components['schemas']['TagTrend'];
        };
      };
    };
  };
  values: {
    parameters: {
      query?: {
        area?: string;
        group?: string;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          '*/*': components['schemas']['Values'];
        };
      };
    };
  };
  reels: {
    parameters: {
      query?: {
        limit?: number;
        shiftId?: string;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          '*/*': components['schemas']['Reels'];
        };
      };
    };
  };
  reel: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        number: number;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          '*/*': components['schemas']['ReelDetail'];
        };
      };
    };
  };
  rounds: {
    parameters: {
      query?: {
        limit?: number;
        shiftId?: string;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          '*/*': components['schemas']['Rounds'];
        };
      };
    };
  };
  round: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          '*/*': components['schemas']['RoundDetail'];
        };
      };
    };
  };
  setpointChanges: {
    parameters: {
      query?: {
        limit?: number;
        tag?: string;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          '*/*': components['schemas']['SetpointChanges'];
        };
      };
    };
  };
  shifts: {
    parameters: {
      query?: {
        from?: string;
        limit?: number;
        to?: string;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          '*/*': components['schemas']['Shifts'];
        };
      };
    };
  };
  shift: {
    parameters: {
      query?: never;
      header?: never;
      path: {
        id: string;
      };
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          '*/*': components['schemas']['ShiftDetail'];
        };
      };
    };
  };
  stream: {
    parameters: {
      query?: never;
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          'text/event-stream': components['schemas']['SseEmitter'];
        };
      };
    };
  };
  webBreaks: {
    parameters: {
      query?: {
        limit?: number;
        shiftId?: string;
      };
      header?: never;
      path?: never;
      cookie?: never;
    };
    requestBody?: never;
    responses: {
      /** @description OK */
      200: {
        headers: {
          [name: string]: unknown;
        };
        content: {
          '*/*': components['schemas']['WebBreaks'];
        };
      };
    };
  };
}
