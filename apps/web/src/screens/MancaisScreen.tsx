import { useCallback, useMemo, useState } from 'react';

import {
  bearingTagsOf,
  classifyIsoZone,
  DRYER_BEARING_ISO,
  DRYER_BEARING_TAGS,
  isoLimitsOf,
  type IsoZone,
} from '@mp1/shared';

import type { DataGateway } from '../api/gateway';
import { Block, ScreenTitle, StatRow } from '../ui/Shell';
import { Facts, Table } from '../ui/Table';
import { Trend } from '../ui/chart/Trend';
import { hhmm, int, num } from '../ui/format';
import { ResourceState } from '../ui/ResourceState';
import { useResource } from '../ui/useResource';

/**
 * Mancais — a condição dos 72 mancais dos cilindros secadores.
 *
 * A ordem é **pior primeiro**, e é a única ordem que serve: numa lista de 72
 * linhas ordenada por número de cilindro, o mancal em zona D está na posição 46
 * e ninguém o encontra. Ordenada por vibração, ele é a primeira linha.
 *
 * ## As zonas vêm da norma, não de uma escala inventada
 *
 * As fronteiras A/B, B/C e C/D saem da ISO 20816-3 para grupo 2 com apoio
 * rígido, que é a classe que o modelo declara em cada mancal. Os limites de
 * alarme `H` e `HH` do catálogo são as mesmas fronteiras B/C e C/D — e isso não
 * é coincidência: foi assim que a lista base os escolheu.
 */

const LIMITS = isoLimitsOf(DRYER_BEARING_ISO);

/** Quantos mancais a tela acompanha, do modelo. */
const COUNT = DRYER_BEARING_TAGS.length;

const ZONE_TONE: Readonly<Record<IsoZone, string>> = {
  A: 'text-mill-fg',
  B: 'text-mill-fg',
  C: 'text-mill-attention',
  D: 'text-mill-critical',
};

export interface MancaisScreenProps {
  readonly gateway: DataGateway;
  /** O mancal aberto, pela tag do ativo, quando outra tela pediu. */
  readonly assetTag: string | null;
  readonly onSelect: (assetTag: string | null) => void;
}

interface BearingRow {
  readonly assetTag: string;
  readonly cylinder: number;
  readonly side: string;
  readonly vibrationTag: string;
  readonly envelopeTag: string;
  readonly temperatureTag: string;
  readonly rms: number | null;
  readonly envelope: number | null;
  readonly temperature: number | null;
  readonly zone: IsoZone | null;
}

export function MancaisScreen({ gateway, assetTag, onSelect }: MancaisScreenProps) {
  const values = useResource(
    useCallback((signal) => gateway.processValues({ area: 'mancais' }, signal), [gateway]),
    { isEmpty: (data) => data.values.length === 0 },
  );

  const rows = useMemo<BearingRow[]>(() => {
    const byTag = new Map(values.data?.values.map((item) => [item.tag, item.value]) ?? []);

    return DRYER_BEARING_TAGS.map((bearing) => {
      const rms = byTag.get(bearing.vibration) ?? null;

      return {
        assetTag: bearing.assetTag,
        cylinder: bearing.cylinder,
        side: bearing.side,
        vibrationTag: bearing.vibration,
        envelopeTag: bearing.envelope,
        temperatureTag: bearing.temperature,
        rms,
        envelope: byTag.get(bearing.envelope) ?? null,
        temperature: byTag.get(bearing.temperature) ?? null,
        zone: rms === null ? null : classifyIsoZone(rms, LIMITS),
      };
    }).sort((a, b) => (b.rms ?? -1) - (a.rms ?? -1));
  }, [values.data]);

  const current = rows.find((row) => row.assetTag === assetTag) ?? rows[0] ?? null;

  const inZone = (zone: IsoZone): number => rows.filter((row) => row.zone === zone).length;

  return (
    <>
      <ScreenTitle
        eyebrow="Condição · vibração e temperatura"
        title="Mancais"
        aside={`· ${String(COUNT)} dos cilindros secadores`}
      />

      <StatRow
        stats={[
          { label: 'Zona A', value: int(inZone('A')), hint: 'máquina nova' },
          { label: 'Zona B', value: int(inZone('B')), hint: 'operação normal' },
          {
            label: 'Zona C',
            value: int(inZone('C')),
            tone: inZone('C') > 0 ? 'attention' : 'normal',
            hint: 'aceitável por tempo limitado',
          },
          {
            label: 'Zona D',
            value: int(inZone('D')),
            tone: inZone('D') > 0 ? 'critical' : 'normal',
            hint: 'dano é provável',
          },
          {
            label: 'Fronteira C→D',
            value: num(LIMITS.cToD, 1),
            hint: 'mm/s · grupo 2, apoio rígido',
          },
        ]}
      />

      <ResourceState
        resource={values}
        label="os mancais"
        emptyMessage="Nenhuma leitura de mancal. A simulação precisa rodar um intervalo."
      >
        {() => (
          <>
            <Block title="Pior primeiro" aside="clique para abrir o mancal">
              <Table
                caption="Mancais dos cilindros secadores, do pior para o melhor"
                rows={rows.slice(0, 20)}
                keyOf={(row) => row.assetTag}
                selected={(row) => row.assetTag === current?.assetTag}
                onSelect={(row) => {
                  onSelect(row.assetTag);
                }}
                columns={[
                  {
                    key: 'cil',
                    header: 'Cilindro',
                    render: (row) => `${int(row.cylinder)} · ${row.side}`,
                  },
                  {
                    key: 'tag',
                    header: 'TAG',
                    hideBelow: 'md',
                    render: (row) => <span className="font-mono text-xs">{row.vibrationTag}</span>,
                  },
                  {
                    key: 'rms',
                    header: 'Vibração',
                    numeric: true,
                    render: (row) => (
                      <span className={row.zone ? ZONE_TONE[row.zone] : undefined}>
                        {num(row.rms, 2)}
                      </span>
                    ),
                  },
                  {
                    key: 'zona',
                    header: 'Zona',
                    render: (row) =>
                      row.zone === null ? (
                        <span className="text-mill-muted">sem dados</span>
                      ) : (
                        <span className={ZONE_TONE[row.zone]}>{row.zone}</span>
                      ),
                  },
                  {
                    key: 'env',
                    header: 'Envelope',
                    numeric: true,
                    hideBelow: 'md',
                    render: (row) => num(row.envelope, 2),
                  },
                  {
                    key: 'temp',
                    header: 'Temperatura',
                    numeric: true,
                    hideBelow: 'lg',
                    render: (row) => num(row.temperature, 1),
                  },
                ]}
              />
              {rows.length > 20 && (
                <p className="text-xs text-mill-muted">
                  Mostrando os 20 piores de {String(rows.length)}. Os demais estão em zona A ou B.
                </p>
              )}
            </Block>

            {current && <BearingPanel gateway={gateway} row={current} />}
          </>
        )}
      </ResourceState>
    </>
  );
}

function BearingPanel({
  gateway,
  row,
}: {
  readonly gateway: DataGateway;
  readonly row: BearingRow;
}) {
  const [days, setDays] = useState(3);

  const trend = useResource(
    useCallback(
      (signal) => {
        const to = new Date();
        return gateway.tagTrend(
          row.vibrationTag,
          { from: new Date(to.getTime() - days * 86_400_000), to, buckets: 300 },
          signal,
        );
      },
      [gateway, row.vibrationTag, days],
    ),
    { isEmpty: (data) => data.buckets.length === 0 },
  );

  const envelope = useResource(
    useCallback(
      (signal) => {
        const to = new Date();
        return gateway.tagTrend(
          row.envelopeTag,
          { from: new Date(to.getTime() - days * 86_400_000), to, buckets: 300 },
          signal,
        );
      },
      [gateway, row.envelopeTag, days],
    ),
    { isEmpty: (data) => data.buckets.length === 0 },
  );

  const notes = useResource(
    useCallback(
      (signal) => gateway.notes({ assetTag: row.assetTag, limit: 10 }, signal),
      [gateway, row.assetTag],
    ),
    { isEmpty: (data) => data.notes.length === 0 },
  );

  const bearing = bearingTagsOf(row.assetTag);

  return (
    <Block
      title={`Cilindro ${int(row.cylinder)} · mancal ${row.side}`}
      aside={
        <div className="flex items-center gap-3">
          <span className="font-mono">{row.vibrationTag}</span>
          <div className="flex gap-1.5">
            {[1, 3, 7].map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  setDays(option);
                }}
                aria-pressed={days === option}
                className={`min-h-11 rounded border px-2.5 py-1 text-xs transition-colors ${
                  days === option
                    ? 'border-mill-accent/50 bg-mill-accent/12 text-mill-fg'
                    : 'border-mill-line text-mill-muted hover:text-mill-fg'
                }`}
              >
                {option} d
              </button>
            ))}
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4 border-t border-mill-line pt-3">
        <Facts
          columns={4}
          items={[
            {
              label: 'Vibração RMS',
              value: (
                <span className={row.zone ? ZONE_TONE[row.zone] : undefined}>
                  {num(row.rms, 2)} mm/s
                </span>
              ),
            },
            { label: 'Zona ISO 20816-3', value: row.zone ?? 'sem dados' },
            { label: 'Envelope', value: `${num(row.envelope, 2)} gE` },
            { label: 'Temperatura', value: `${num(row.temperature, 1)} °C` },
            { label: 'Ativo', value: <span className="text-xs">{row.assetTag}</span> },
            { label: 'Envelope · TAG', value: <span className="text-xs">{row.envelopeTag}</span> },
            {
              label: 'Temperatura · TAG',
              value: <span className="text-xs">{row.temperatureTag}</span>,
            },
            {
              label: 'Fronteiras',
              value: `${num(LIMITS.aToB, 1)} / ${num(LIMITS.bToC, 1)} / ${num(LIMITS.cToD, 1)}`,
            },
          ]}
        />

        <div>
          <h3 className="text-sm font-semibold">Vibração</h3>
          <ResourceState
            resource={trend}
            label="a tendência de vibração"
            emptyMessage="Sem valores arquivados nesta janela."
          >
            {(series) => (
              <Trend
                buckets={series.buckets}
                unit={series.unit}
                limits={series.limits}
                target={null}
                height={220}
                label={`Vibração do mancal ${row.assetTag} nos últimos ${String(days)} dias, com as fronteiras da ISO 20816-3`}
              />
            )}
          </ResourceState>
        </div>

        <div>
          <h3 className="text-sm font-semibold">Envelope de aceleração</h3>
          <p className="text-xs text-mill-muted">
            O envelope pega impacto de rolamento antes de a velocidade sair da faixa normal — é por
            isso que ele é medido à parte.
          </p>
          <ResourceState
            resource={envelope}
            label="a tendência de envelope"
            emptyMessage="Sem valores arquivados nesta janela."
          >
            {(series) => (
              <Trend
                buckets={series.buckets}
                unit={series.unit}
                limits={series.limits}
                target={null}
                height={180}
                label={`Envelope de aceleração do mancal ${row.assetTag} nos últimos ${String(days)} dias`}
              />
            )}
          </ResourceState>
        </div>

        {bearing && (
          <p className="text-xs text-mill-muted">
            As três medições deste mancal no catálogo: {bearing.vibration}, {bearing.envelope} e{' '}
            {bearing.temperature}.
          </p>
        )}

        <div>
          <h3 className="text-sm font-semibold">Notas deste mancal</h3>
          <ResourceState
            resource={notes}
            label="as notas"
            emptyMessage="Nenhuma nota aberta para este mancal."
          >
            {(data) => (
              <ul className="mt-1 flex flex-col gap-1 text-sm">
                {data.notes.map((note) => (
                  <li key={note.number} className="flex flex-wrap gap-x-3">
                    <span className="font-mono text-xs">{note.number}</span>
                    <span className="text-xs text-mill-muted">
                      prioridade {int(note.priority)} · {note.status} · {hhmm(note.createdAt)}
                    </span>
                    <span>{note.symptom}</span>
                  </li>
                ))}
              </ul>
            )}
          </ResourceState>
        </div>
      </div>
    </Block>
  );
}
