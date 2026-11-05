import type { components, paths } from './generated';

/**
 * As respostas da API, com os nomes que o front usa.
 *
 * Os tipos vêm todos de `generated.ts`, que sai de `apps/api-java/openapi.json`.
 * Aqui só há **apelidos**: nenhuma forma é escrita à mão. Era o que acontecia
 * antes — a web declarava a forma de cada resposta e o servidor tinha de
 * concordar, sem nada cobrando. Com os dois lados em TypeScript o compilador
 * cobrava, porque importavam o mesmo arquivo; com o back-end em Java não havia
 * mais quem cobrasse.
 *
 * Os nomes do esquema saem dos registros Java (`Shifts`, `TagDetail`,
 * `AssetView`), e alguns não são os que o front quer ler. Apelidar resolve isso
 * sem reescrever forma nenhuma: um `export type` não pode discordar do que
 * aponta.
 *
 * ## Por que tanta coisa é opcional
 *
 * O springdoc só marca obrigatório o que o tipo Java garante — primitivo e
 * coleção (ver `RequiredWhenNotNullable` no lado Java). `String` e `Double`
 * **podem** ser nulos, e vários são: a bobina aberta não tem gramatura, o ativo
 * sem classe ISO não tem limites. Então eles chegam aqui como
 * `string | undefined`, e o front trata. Apertar isso exigiria dizer nos
 * registros Java quais componentes aceitam nulo; enquanto não está dito, o
 * contrato prefere ser pessimista a mentir.
 */

type Schemas = components['schemas'];

// ------------------------------------------------------------------ saúde ----

export type HealthResponse = Schemas['Health'];
export type SimulationHealth = Schemas['Simulation'];

// --------------------------------------------------------------- processo ----

export type TagValue = Schemas['TagValue'];
export type ProcessValues = Schemas['Values'];
export type TagDetail = Schemas['TagDetail'];
export type ApiProcessVariable = Schemas['ProcessVariable'];
export type TagTrend = Schemas['TagTrend'];
export type PlotBucket = Schemas['PlotBucket'];
export type ArchivedSampleView = Schemas['ArchivedSample'];
export type SteamGroupView = Schemas['SteamGroupView'];
export type SteamGroupsResponse = Schemas['SteamGroupsView'];
export type SetpointAccepted = Schemas['SetpointWritten'];
export type WriteSetpointBody = Schemas['WriteSetpoint'];

// ---------------------------------------------------------------- alarmes ----

export type ApiAlarm = Schemas['Alarm'];
export type AlarmList = Schemas['Alarms'];
export type AlarmResponse = Schemas['AlarmResponse'];
export type AcknowledgeBody = Schemas['Acknowledge'];
export type ShelveBody = Schemas['Shelve'];

// ----------------------------------------------------------------- ativos ----

export type AssetView = Schemas['AssetView'];
export type AssetsResponse = Schemas['Assets'];
export type AssetDetail = Schemas['AssetDetail'];
export type AssetStatusView = Schemas['Status'];
export type IsoLimitsView = Schemas['Limits'];
export type VibrationSeries = Schemas['Vibration'];
export type VibrationBucketView = Schemas['Bucket'];
export type RemainingLifeView = Schemas['Estimate'];

// -------------------------------------------------------------- entidades ----

export type ShiftView = Schemas['Shift'];
export type ShiftDetail = Schemas['ShiftDetail'];
export type ShiftsResponse = Schemas['Shifts'];
export type ReelView = Schemas['Reel'];
export type ReelsResponse = Schemas['Reels'];
export type ReelDetail = Schemas['ReelDetail'];
export type CdSpreadView = Schemas['CdSpread'];
export type WebBreakView = Schemas['WebBreak'];
export type WebBreaksResponse = Schemas['WebBreaks'];
export type PrecursorView = Schemas['Precursor'];
export type GradeChangeView = Schemas['GradeChange'];
export type GradeChangesResponse = Schemas['GradeChanges'];
export type RoundView = Schemas['Round'];
export type RoundsResponse = Schemas['Rounds'];
export type RoundDetail = Schemas['RoundDetail'];
export type RoundPointView = Schemas['RoundPoint'];
export type MaintenanceNoteView = Schemas['MaintenanceNote'];
export type NotesResponse = Schemas['Notes'];
export type NoteDetail = Schemas['NoteDetail'];
export type EvidenceView = Schemas['Evidence'];
export type SetpointChangeView = Schemas['SetpointChange'];
export type SetpointChangesResponse = Schemas['SetpointChanges'];

/**
 * Os caminhos do contrato, para quem precisa do tipo de uma rota pelo caminho.
 *
 * Não é usado pelo cliente — ele chama cada rota numa função própria, que é mais
 * legível que um genérico indexado por string. Fica exportado porque é a parte
 * do contrato que diz **quais rotas existem**, e um teste pode cobrar isso.
 */
export type ApiPaths = paths;
