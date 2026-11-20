import {
  assetByTag,
  BEARING_TEMP_LIMITS,
  DRYER_BEARING_TAGS,
  isoLimitsOf,
  MP1,
  reopensAfterDismissal,
  suggestFromTrend,
  type Alarm,
  type NoteSuggestion,
  type Round,
  type VibrationBucketSize,
} from '@mp1/shared';

import type { Database } from '../db';

/**
 * A nota sugerida, derivada do arquivo a cada retomada.
 *
 * ## De qual série, e por quê
 *
 * Da série de vibração dos mancais (`vibration_reading`) — **não** do arquivo
 * do historiador. A diferença não é de gosto: o cenário de degradação é
 * ancorado para terminar **agora**, então cada retomada grava no historiador
 * valores de mancal consistentes com o seu próprio instante final. A série
 * arquivada fica com um dente a cada retomada, e uma regressão de três dias
 * sobre ela leria os dentes em vez da tendência.
 *
 * A série de vibração é escrita uma vez e não é reescrita, e é a mesma que a
 * tela de Mancais desenha e que `/assets/:tag/vibration` devolve. A sugestão e
 * o gráfico ao lado dela contam a mesma história — que é o requisito que
 * decide, porque os dois aparecem juntos.
 *
 * ## Por que isto é idempotente
 *
 * Nada aqui acumula. A conta é função do arquivo e do instante, e a gravação
 * **substitui** as sugestões em pé. Uma retomada em três pedaços deixa o mesmo
 * banco que uma retomada de uma vez: as linhas que os pedaços intermediários
 * criaram saem na gravação seguinte, e a última conta é a mesma nos dois
 * caminhos, porque é a mesma série e o mesmo instante final.
 *
 * O que não sai são as decididas — confirmada e dispensada são decisão de
 * alguém, não projeção.
 */

/** A janela da regressão: as mesmas 72 h que a tela de Mancais mostra. */
export const SUGGESTION_WINDOW_MS = 72 * 60 * 60 * 1000;

/** O tamanho da janela de agregação, o mesmo padrão da rota de vibração. */
export const SUGGESTION_BUCKET: VibrationBucketSize = '1 hour';

/**
 * O alarme que acompanha o mancal, se houver.
 *
 * Prefere o que ainda está ativo; sem nenhum ativo, o mais recente das três
 * tags do mancal. Um alarme já normalizado continua sendo a evidência de que
 * aquele mancal passou do limite ontem.
 */
function alarmFor(alarms: readonly Alarm[], tags: readonly string[]): Alarm | null {
  const doMancal = alarms.filter((alarm) => tags.includes(alarm.tag));
  if (doMancal.length === 0) return null;

  const ativos = doMancal.filter((alarm) => alarm.state === 'ativo');
  const candidatos = ativos.length > 0 ? ativos : doMancal;

  return [...candidatos].sort((a, b) => Date.parse(b.raisedAt) - Date.parse(a.raisedAt))[0] ?? null;
}

/** O ponto da ronda no mancal, com a leitura de campo. */
function roundFor(
  round: Round | null,
  assetTag: string,
): { readonly id: string; readonly fieldTempC: number | null } | null {
  if (!round) return null;
  const point = round.points.find((item) => item.assetTag === assetTag);
  return point ? { id: round.id, fieldTempC: point.fieldTempC } : null;
}

export interface DeriveOptions {
  readonly now: Date;
}

/**
 * Roda a regra em todos os mancais e grava as sugestões em pé.
 *
 * Os mancais sem tag de processo no catálogo ficam de fora: são os dos rolos de
 * prensa, do Speed Sizer, da calandra e da Pope, que o gêmeo acompanha e que
 * não têm instrumento declarado. Sem a tag, a sugestão não teria para onde
 * apontar a evidência da tendência — e inventar a tag daria ao simulador um
 * instrumento que ninguém especificou.
 */
export async function deriveSuggestions(
  db: Database,
  options: DeriveOptions,
): Promise<NoteSuggestion[]> {
  const to = options.now;
  const from = new Date(to.getTime() - SUGGESTION_WINDOW_MS);

  const [séries, bloqueados, dispensadas, alarmes, rondas] = await Promise.all([
    db.readingsByBucketForAll({ from, to, bucket: SUGGESTION_BUCKET }),
    db.assetsWithOpenTrendNote(),
    db.lastDismissedSuggestions(),
    db.listAlarms({ limit: 1000 }),
    db.listRounds({ limit: 1 }),
  ]);

  const comNotaAberta = new Set(bloqueados);
  const última = rondas[0] ?? null;
  const at = to.toISOString();

  const sugestões: NoteSuggestion[] = [];

  for (const mancal of DRYER_BEARING_TAGS) {
    if (comNotaAberta.has(mancal.assetTag)) continue;

    const buckets = séries.get(mancal.assetTag);
    const iso = assetByTag(MP1, mancal.assetTag)?.iso;
    if (!buckets || !iso) continue;

    const alarme = alarmFor(alarmes, [mancal.vibration, mancal.envelope, mancal.temperature]);
    const ronda = roundFor(última, mancal.assetTag);

    const sugestão = suggestFromTrend({
      assetTag: mancal.assetTag,
      buckets,
      limits: isoLimitsOf(iso),
      tempLimitC: BEARING_TEMP_LIMITS.attention,
      at,
      refs: {
        vibrationTag: mancal.vibration,
        temperatureTag: mancal.temperature,
        alarm: alarme ? { id: alarme.id, tag: alarme.tag, limit: alarme.limit } : null,
        round: ronda,
      },
    });

    if (!sugestão) continue;

    /**
     * Uma sugestão dispensada não volta enquanto a tendência não piorar.
     *
     * Sem isto, dispensar não serviria para nada: a retomada seguinte recriaria
     * a mesma sugestão com a mesma frase, e a fila voltaria a pedir a mesma
     * decisão que alguém acabou de tomar.
     */
    const antes = dispensadas.get(mancal.assetTag);
    if (antes && !reopensAfterDismissal(antes, sugestão)) continue;

    sugestões.push(sugestão);
  }

  await db.replaceStandingSuggestions(sugestões);
  return sugestões;
}
