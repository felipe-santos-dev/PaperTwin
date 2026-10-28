import type { FastifyInstance } from 'fastify';
import {
  classifyIsoZone,
  estimateRemainingLife,
  healthFromZone,
  isoLimitsOf,
  type AssetStatus,
  type MachineAsset,
  type SectionId,
  type VibrationBucketSize,
} from '@mp1/shared';
import { DEFAULT_WINDOW_MS } from '../simulation/vibration';
import { getAssetSchema, getVibrationSchema, listAssetsSchema } from './schemas';

/** Estado do ativo a partir da sua última leitura. */
async function statusOf(app: FastifyInstance, asset: MachineAsset): Promise<AssetStatus> {
  const latest = await app.db.latestReading(asset.tag);

  if (!latest || !asset.iso) {
    return { assetTag: asset.tag, zone: null, health: null, latest };
  }

  const zone = classifyIsoZone(latest.rmsMmS, isoLimitsOf(asset.iso));
  return { assetTag: asset.tag, zone, health: healthFromZone(zone), latest };
}

export async function assetRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { section?: SectionId; kind?: MachineAsset['kind'] } }>(
    '/assets',
    { schema: listAssetsSchema },
    async (request) => {
      const assets = await app.db.listAssets({
        ...(request.query.section ? { section: request.query.section } : {}),
        ...(request.query.kind ? { kind: request.query.kind } : {}),
      });
      return { count: assets.length, assets };
    },
  );

  app.get<{ Params: { tag: string } }>(
    '/assets/:tag',
    { schema: getAssetSchema },
    async (request, reply) => {
      const asset = await app.db.findAsset(request.params.tag);
      if (!asset) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Ativo ${request.params.tag} não existe`,
        });
      }

      return {
        asset,
        status: await statusOf(app, asset),
        limits: asset.iso ? isoLimitsOf(asset.iso) : null,
      };
    },
  );

  app.get<{
    Params: { tag: string };
    Querystring: { from?: string; to?: string; bucket?: VibrationBucketSize };
  }>('/assets/:tag/vibration', { schema: getVibrationSchema }, async (request, reply) => {
    const asset = await app.db.findAsset(request.params.tag);
    if (!asset) {
      return reply.code(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Ativo ${request.params.tag} não existe`,
      });
    }

    const to = request.query.to ? new Date(request.query.to) : new Date();
    const from = request.query.from
      ? new Date(request.query.from)
      : new Date(to.getTime() - DEFAULT_WINDOW_MS);

    if (from >= to) {
      return reply.code(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: '`from` precisa ser anterior a `to`',
      });
    }

    const bucket = request.query.bucket ?? '1 hour';
    const buckets = await app.db.readingsByBucket({ tag: asset.tag, from, to, bucket });
    const limits = asset.iso ? isoLimitsOf(asset.iso) : null;

    return {
      assetTag: asset.tag,
      from: from.toISOString(),
      to: to.toISOString(),
      bucket,
      limits,
      buckets,
      // sem classe ISO não há fronteira para cruzar, então não há o que estimar
      remainingLife: limits ? estimateRemainingLife(buckets, limits) : null,
    };
  });
}
