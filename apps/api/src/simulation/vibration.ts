/**
 * A série de vibração, agora em `bearings.ts`.
 *
 * O módulo foi dividido na Fase 5: o modelo do mancal passou a ser função do
 * passo da simulação, para a série gravada e o valor ao vivo saírem do mesmo
 * lugar. Este arquivo continua existindo porque as rotas e a semeadura o
 * importam por este nome, e trocar o nome do import em cinco arquivos para
 * ganhar nada seria mexer em código que funciona.
 */

export {
  bearingSampleAt,
  bearingsOf,
  DEFAULT_INTERVAL_MS,
  DEFAULT_WINDOW_MS,
  DEGRADED_PEAK_MM_S,
  degradationProgress,
  readingAt,
  signatureOf,
  simulateVibration,
  TICKS_PER_SAMPLE,
  type BearingSample,
  type DegradationScenario,
  type SimulatedBearing,
  type SimulationOptions,
} from './bearings';
