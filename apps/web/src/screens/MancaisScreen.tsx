import { useCallback, useMemo, useState } from 'react';
import {
  assetByTag,
  DRYER_BEARING_ISO,
  DRYER_BEARING_TAGS,
  isoLimitsOf,
  monitoredAssets,
  MP1,
  type AssetTag,
  type IsoZone,
} from '@mp1/shared';

import type { DataGateway } from '../api/gateway';
import { BearingBar, TemperatureBar } from '../ui/BearingBar';
import { Sparkline } from '../ui/chart/Sparkline';
import { num } from '../ui/format';
import { Panel } from '../ui/Panel';
import { ResourceState } from '../ui/ResourceState';
import { useResource } from '../ui/useResource';
import { BearingDetail } from './mancais/BearingDetail';
import { rank, visible, zoneOf, type BearingRow } from './mancais/derive';
import { Scene3DPanel } from './mancais/Scene3DPanel';

/**
 * Mancais — os mancais monitorados, do pior para o melhor.
 *
 * Mancal de cilindro secador vem dos valores de processo (`VI-51nn`,
 * `TI-53nn`); os outros, que não têm TAG no catálogo, vêm da rota do ativo,
 * que traz a última leitura e a classe ISO. A lista mostra sempre os que estão
 * em zona B, C ou D e os dez de maior vibração; o resto fica atrás de "mostrar
 * todos". À direita, o mancal escolhido e a cena 3D sincronizada com a lista.
 */

export interface MancaisScreenProps {
  readonly gateway: DataGateway;
  /** O mancal aberto, pela tag do ativo, quando outra tela pediu. */
  readonly assetTag: string | null;
  readonly onSelect: (assetTag: string | null) => void;
}

const DRYER_LIMITS = isoLimitsOf(DRYER_BEARING_ISO);
const DRYER = new Set<string>(DRYER_BEARING_TAGS.map((b) => b.assetTag));

export function MancaisScreen({ gateway, assetTag, onSelect }: MancaisScreenProps) {
  const data = useResource(
    useCallback(
      async (signal: AbortSignal) => {
        const others = monitoredAssets(MP1).filter(
          (a) => a.kind === 'bearing' && !DRYER.has(a.tag),
        );
        const [values, details, rounds, notes] = await Promise.all([
          gateway.processValues({ area: 'mancais' }, signal),
          Promise.all(others.map((a) => gateway.asset(a.tag, signal).catch(() => null))),
          gateway.rounds({ limit: 20 }, signal),
          gateway.notes({ limit: 100 }, signal),
        ]);
        const byTag = new Map(values.values.map((v) => [v.tag, v.value]));
        const rows: BearingRow[] = [
          ...DRYER_BEARING_TAGS.map((b) => {
            const rms = byTag.get(b.vibration) ?? null;
            return {
              assetTag: b.assetTag,
              label: assetByTag(MP1, b.assetTag)?.label ?? b.assetTag,
              side: b.side,
              vibrationTag: b.vibration,
              temperatureTag: b.temperature,
              rms,
              temperature: byTag.get(b.temperature) ?? null,
              limits: DRYER_LIMITS,
              zone: zoneOf(rms, DRYER_LIMITS),
            };
          }),
          ...others.map((a, i) => {
            const detail = details[i];
            const rms = detail?.status.latest?.rmsMmS ?? null;
            const limits = detail?.limits ?? (a.iso ? isoLimitsOf(a.iso) : null);
            return {
              assetTag: a.tag,
              label: a.label,
              side: a.side,
              vibrationTag: null,
              temperatureTag: null,
              rms,
              temperature: detail?.status.latest?.tempC ?? null,
              limits,
              zone: zoneOf(rms, limits),
            };
          }),
        ];
        return { rows: rank(rows), rounds: rounds.rounds, notes: notes.notes };
      },
      [gateway],
    ),
    { isEmpty: (result) => result.rows.every((row) => row.rms === null) },
  );

  return (
    <ResourceState
      resource={data}
      label="os mancais"
      emptyMessage="Nenhuma leitura de mancal. A simulação precisa rodar um intervalo."
    >
      {({ rows, rounds, notes }) => {
        const current = rows.find((row) => row.assetTag === assetTag) ?? rows[0] ?? null;
        const zones = new Map<AssetTag, IsoZone>();
        for (const row of rows) if (row.zone) zones.set(row.assetTag, row.zone);
        return (
          <div className="grid h-[calc(100vh-152px)] min-h-[760px] grid-cols-[minmax(0,1100fr)_minmax(0,716fr)] gap-4">
            <Ranking
              gateway={gateway}
              rows={rows}
              selected={current?.assetTag ?? null}
              onSelect={onSelect}
            />
            <div className="flex min-h-0 flex-col gap-4">
              {current ? (
                <BearingDetail
                  key={current.assetTag}
                  gateway={gateway}
                  row={current}
                  rounds={rounds}
                  notes={notes}
                  className="h-[470px] shrink-0"
                />
              ) : null}
              <Scene3DPanel
                selected={current?.assetTag ?? null}
                onSelect={onSelect}
                zones={zones}
                className="min-h-0 flex-1"
              />
            </div>
          </div>
        );
      }}
    </ResourceState>
  );
}

const GRID =
  'grid grid-cols-[minmax(150px,200px)_minmax(180px,1fr)_88px_minmax(90px,150px)_48px_minmax(100px,180px)] items-center gap-x-4';

function Ranking({
  gateway,
  rows,
  selected,
  onSelect,
}: {
  readonly gateway: DataGateway;
  readonly rows: readonly BearingRow[];
  readonly selected: string | null;
  readonly onSelect: (assetTag: string | null) => void;
}) {
  const [all, setAll] = useState(false);
  const shortList = useMemo(() => visible(rows), [rows]);
  const shown = all ? rows : shortList;
  const count = (zone: IsoZone) => rows.filter((row) => row.zone === zone).length;
  const hidden = rows.length - shortList.length;

  return (
    <Panel
      title={<span className="text-[16px]">Mancais por severidade</span>}
      label="Mancais por severidade"
      context={
        <span>
          <span className="font-mono text-fg">{rows.length}</span> mancais ·{' '}
          <span className="font-mono text-fg">{count('B')}</span> em B ·{' '}
          <span className={`font-mono ${count('C') > 0 ? 'text-alarm-3' : 'text-fg'}`}>
            {count('C')}
          </span>{' '}
          em C ·{' '}
          <span className={`font-mono ${count('D') > 0 ? 'text-alarm-1' : 'text-fg'}`}>
            {count('D')}
          </span>{' '}
          em D · velocidade RMS 10–1.000 Hz
        </span>
      }
      bodyClassName="flex min-h-0 flex-col"
    >
      <div
        role="table"
        aria-label="Mancais do pior para o melhor"
        className="flex min-h-0 flex-1 flex-col"
      >
        <div role="row" className={`${GRID} border-b border-line pb-1.5 text-[11px] text-fg-3`}>
          <span role="columnheader">Mancal</span>
          <span role="columnheader" className="truncate">
            ISO 20816-3 · zonas A B C D
          </span>
          <span role="columnheader" className="text-right">
            vibração
          </span>
          <span role="columnheader" className="truncate">
            temperatura · 80 / 90 °C
          </span>
          <span role="columnheader" />
          <span role="columnheader">janela da API</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {shown.map((row) => (
            <Row
              key={row.assetTag}
              gateway={gateway}
              row={row}
              active={row.assetTag === selected}
              onSelect={() => {
                onSelect(row.assetTag);
              }}
            />
          ))}
        </div>
        <div className="flex items-center gap-5 border-t border-line pt-2.5 text-[11px] text-fg-3">
          {hidden > 0 || all ? (
            <button
              type="button"
              onClick={() => {
                setAll((value) => !value);
              }}
              className="text-action hover:text-action-hover"
            >
              {all ? 'mostrar só os principais' : `mostrar todos (+${String(hidden)})`}
            </button>
          ) : null}
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-px bg-fg" /> valor no início da janela
          </span>
          <span>sempre visíveis: zona B, C ou D e os 10 de maior vibração</span>
        </div>
      </div>
    </Panel>
  );
}

function Row({
  gateway,
  row,
  active,
  onSelect,
}: {
  readonly gateway: DataGateway;
  readonly row: BearingRow;
  readonly active: boolean;
  readonly onSelect: () => void;
}) {
  const history = useResource(
    useCallback(
      (signal: AbortSignal) => gateway.vibration(row.assetTag, {}, signal),
      [gateway, row.assetTag],
    ),
  );
  const values = history.data?.buckets.map((b) => b.rmsAvgMmS) ?? [];
  const color =
    row.zone === 'D'
      ? 'var(--color-alarm-1)'
      : row.zone === 'C'
        ? 'var(--color-alarm-3)'
        : 'var(--color-fg)';

  return (
    <div
      role="row"
      data-asset={row.assetTag}
      aria-selected={active}
      onClick={onSelect}
      className={`${GRID} min-h-14 cursor-pointer border border-b-line px-1 ${
        active ? 'border-action bg-hover' : 'border-transparent border-b-line hover:bg-hover'
      }`}
    >
      <div role="cell" className="min-w-0">
        <div className="truncate text-[13px]" title={row.label}>
          {row.label.replace(/^Mancal (LA|LC) · /, '')}
        </div>
        <div className="font-mono text-[10px] text-fg-3">
          {row.vibrationTag ?? row.assetTag}
          {row.side ? ` · ${row.side}` : ''}
        </div>
      </div>
      <div role="cell">
        {row.limits ? (
          <BearingBar
            value={row.rms}
            limits={row.limits}
            weekAgo={values[0] ?? null}
            label={`${row.label}: zona ${row.zone ?? '—'}`}
          />
        ) : (
          <span className="text-[11px] text-fg-3">sem classe ISO</span>
        )}
      </div>
      <div role="cell" className="text-right">
        <span className="font-mono text-[16px]" style={{ color }}>
          {row.rms === null ? '—' : num(row.rms, 1)}
        </span>
        <span className="ml-1 text-[11px] text-fg-2">mm/s</span>
      </div>
      <div role="cell">
        <TemperatureBar value={row.temperature} />
      </div>
      <div role="cell" className="text-right">
        <span className="font-mono text-[13px]">
          {row.temperature === null ? '—' : num(row.temperature, 0)}
        </span>
        <span className="ml-1 text-[10px] text-fg-2">°C</span>
      </div>
      <div role="cell" className="min-w-0">
        <Sparkline
          values={values}
          band={row.limits ? { lo: row.limits.bToC, hi: row.limits.cToD } : null}
          bandColor="color-mix(in srgb, var(--color-iso-c-line) 22%, transparent)"
          lastColor={color}
          className="h-[22px] w-full"
          label={`${row.label}: vibração na janela`}
        />
      </div>
    </div>
  );
}
