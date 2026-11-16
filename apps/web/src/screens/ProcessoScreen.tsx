import { useCallback, useMemo, useState } from 'react';
import {
  bearingOfProcessTag,
  variablesOfArea,
  type Alarm,
  type ProcessVariable,
} from '@mp1/shared';

import { FIXED_VARIABLES } from '../api/fixtures';
import type { DataGateway } from '../api/gateway';
import type { TagTrend } from '../api/process';
import { seriesOf, valueAt } from '../ui/chart/series';
import { tagValue } from '../ui/format';
import { INSTRUMENT_GRID, InstrumentRow } from '../ui/InstrumentRow';
import { Illustrative, Panel } from '../ui/Panel';
import { designPriority, worst, type DesignPriority } from '../ui/priority';
import { ResourceState } from '../ui/ResourceState';
import { areaOfTag, isStanding, PROCESS_AREAS } from '../ui/sections';
import { isOut, tagScale } from '../ui/tagScale';
import { useResource } from '../ui/useResource';
import { RefiningEffect } from './processo/RefiningEffect';
import { SetpointPanel } from './processo/SetpointPanel';
import { MAX_TREND_TAGS, TrendStack } from './processo/TrendStack';

/**
 * Processo — uma seção da máquina por vez.
 *
 * O padrão das duas seções desenhadas (preparo e pré-secagem) vale para as dez:
 * à esquerda as variáveis da seção, do catálogo, com faixa, PV, SP e a última
 * hora; à direita a tendência multi-TAG e a alteração de setpoint. A seção vem
 * da faixa do processo, no alto.
 *
 * O preparo tem sete variáveis que o catálogo não tem; elas vêm do dado fixo,
 * com o selo, e o painel "Efeito do refino" só aparece ali.
 */

export interface ProcessoScreenProps {
  readonly gateway: DataGateway;
  /** A seção escolhida na faixa; `null` usa a da TAG, ou o preparo. */
  readonly area?: string | null;
  readonly tag: string | null;
  readonly onSelectTag: (tag: string | null) => void;
  readonly onOpenBearing?: (assetTag: string) => void;
}

export function ProcessoScreen({
  gateway,
  area = null,
  tag,
  onSelectTag,
  onOpenBearing,
}: ProcessoScreenProps) {
  const current = area ?? (tag ? areaOfTag(tag) : null) ?? 'preparo';
  return (
    <AreaView
      key={current}
      gateway={gateway}
      area={current}
      tag={tag}
      onSelectTag={onSelectTag}
      onOpenBearing={onOpenBearing}
    />
  );
}

/** Grupos da tabela: o grupo de vapor (G1…G4) quando o nome o diz, senão o grupo do catálogo. */
function groupOf(variable: ProcessVariable): string {
  const steam = /\bG(\d)\b/.exec(variable.name);
  return steam ? `Grupo ${steam[1] ?? ''}` : variable.group;
}

/** As variáveis da seção: catálogo (sem as por cilindro) e, no preparo, as fixas. */
export function variablesFor(area: string): ProcessVariable[] {
  const catalog = variablesOfArea(area).filter((v) => v.cylinder === null);
  const all = area === 'preparo' ? [...catalog, ...FIXED_VARIABLES] : catalog;
  const order = new Map<string, number>();
  for (const v of all) if (!order.has(groupOf(v))) order.set(groupOf(v), order.size);
  return [...all].sort((a, b) => (order.get(groupOf(a)) ?? 0) - (order.get(groupOf(b)) ?? 0));
}

const FIXED_TAGS = new Set(FIXED_VARIABLES.map((v) => v.tag));

function AreaView({
  gateway,
  area,
  tag,
  onSelectTag,
  onOpenBearing,
}: {
  readonly gateway: DataGateway;
  readonly area: string;
  readonly tag: string | null;
  readonly onSelectTag: (tag: string | null) => void;
  readonly onOpenBearing: ((assetTag: string) => void) | undefined;
}) {
  const label = PROCESS_AREAS.find((item) => item.id === area)?.label ?? area;
  const variables = useMemo(() => variablesFor(area), [area]);
  const [reload, setReload] = useState(0);
  const [onlyOut, setOnlyOut] = useState(false);

  const data = useResource(
    useCallback(
      async (signal: AbortSignal) => {
        const [values, alarms, fixed, setpoints] = await Promise.all([
          gateway.processValues({}, signal),
          gateway.alarms({}, signal),
          area === 'preparo' ? gateway.fixedProcess(signal) : Promise.resolve(null),
          gateway.setpointChanges({ limit: 100 }, signal),
        ]);
        return { values, alarms, fixed, setpoints, reload };
      },
      [gateway, area, reload],
    ),
    { isEmpty: (result) => variables.length === 0 && result.values.values.length === 0 },
  );

  /** A última hora de cada variável, para o minigráfico da linha. */
  const history = useResource(
    useCallback(
      async (signal: AbortSignal) => {
        const values = await gateway.processValues({}, signal);
        const now = Date.parse(values.ts);
        const query = { from: new Date(now - 3_600_000), to: new Date(now), buckets: 60 };
        const trends = await Promise.all(
          variables.map((v) =>
            (FIXED_TAGS.has(v.tag)
              ? (gateway.fixedTrend(v.tag, query, signal) as Promise<TagTrend>)
              : gateway.tagTrend(v.tag, query, signal)
            ).catch(() => null),
          ),
        );
        const out = new Map<string, number[]>();
        variables.forEach((v, i) => {
          const trend = trends[i];
          if (!trend) return;
          const points = seriesOf(trend, now);
          out.set(
            v.tag,
            Array.from(
              { length: 60 },
              (_, k) => valueAt(points, now - 3_600_000 + (k / 59) * 3_600_000) ?? Number.NaN,
            ),
          );
        });
        return out;
      },
      [gateway, variables],
    ),
  );

  return (
    <ResourceState
      resource={data}
      label="o processo"
      emptyMessage="A seção não tem variável no catálogo."
    >
      {({ values, alarms, fixed, setpoints }) => {
        const now = Date.parse(values.ts);
        const pv = new Map(values.values.map((v) => [v.tag, v]));
        for (const v of fixed?.values ?? []) pv.set(v.tag, v);
        const standing: Alarm[] = [...alarms.alarms, ...(fixed?.alarms ?? [])].filter(isStanding);
        const priorityOf = (t: string): DesignPriority | null =>
          worst(standing.filter((a) => a.tag === t).map((a) => designPriority(a.priority)));
        const outOf = (v: ProcessVariable) => {
          const value = pv.get(v.tag)?.value;
          const scale = tagScale(v.tag);
          return (
            priorityOf(v.tag) !== null ||
            (value !== undefined && scale !== null && isOut(scale, value))
          );
        };
        const outCount = variables.filter(outOf).length;
        // um link por mancal: VI e VE do mesmo mancal são o mesmo assunto
        const byBearing = new Map<string, string>();
        for (const a of standing) {
          const bearing = bearingOfProcessTag(a.tag);
          if (bearing && areaOfTag(a.tag) === area && !byBearing.has(bearing.assetTag)) {
            byBearing.set(bearing.assetTag, a.tag);
          }
        }
        const bearings = [...byBearing.values()];
        const shown = onlyOut ? variables.filter(outOf) : variables;
        const areaTags = new Set(variables.map((v) => v.tag));
        const loops = variables.filter((v) => v.controlled && !FIXED_TAGS.has(v.tag));
        const history2 = setpoints.changes.filter((c) => areaTags.has(c.tag));

        return (
          <div className="grid h-[calc(100vh-152px)] min-h-[760px] grid-cols-[minmax(0,1100fr)_minmax(0,716fr)] gap-4">
            <Panel
              help="processo.variaveis"
              heading={1}
              label={label}
              title={<span className="text-[17px]">{label}</span>}
              bodyClassName="flex min-h-0 flex-col"
              context={
                <span>
                  <span className="font-mono text-fg">{variables.length}</span> variáveis ·{' '}
                  <span className={`font-mono ${outCount > 0 ? 'text-alarm-2' : 'text-fg'}`}>
                    {outCount}
                  </span>{' '}
                  fora da faixa
                  {bearings.map((b) => {
                    const bearing = bearingOfProcessTag(b);
                    return (
                      <span key={b}>
                        {' '}
                        · mancal{' '}
                        <button
                          type="button"
                          className="font-mono text-alarm-3 hover:underline"
                          onClick={() => {
                            if (bearing) onOpenBearing?.(bearing.assetTag);
                          }}
                        >
                          {b}
                        </button>{' '}
                        em Mancais
                      </span>
                    );
                  })}
                </span>
              }
              aside={
                <>
                  {area === 'preparo' ? (
                    <Illustrative title="Sete variáveis do preparo não estão no catálogo e vêm do dado fixo; cada uma leva o selo." />
                  ) : null}
                  <label className="flex items-center gap-2 text-[12px] text-fg-2">
                    <input
                      type="checkbox"
                      checked={onlyOut}
                      onChange={(event) => {
                        setOnlyOut(event.target.checked);
                      }}
                      className="size-4 accent-action"
                    />
                    Só fora da faixa
                  </label>
                </>
              }
            >
              <div
                role="table"
                aria-label={`Variáveis de ${label}`}
                className="flex min-h-0 flex-1 flex-col"
              >
                <div
                  role="row"
                  className={`${INSTRUMENT_GRID} border-b border-line pb-1.5 text-[11px] text-fg-3`}
                >
                  <span role="columnheader">Variável</span>
                  <span role="columnheader">Faixa · PV ▾ SP</span>
                  <span role="columnheader" className="text-right">
                    PV
                  </span>
                  <span role="columnheader" className="text-right">
                    SP
                  </span>
                  <span
                    role="columnheader"
                    title="A API não informa o modo do controlador; a coluna diz se a TAG é malha."
                  >
                    Malha
                  </span>
                  <span role="columnheader">Última 1 h</span>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {shown.length === 0 ? (
                    <p className="py-4 text-[12px] text-fg-2">
                      Nenhuma variável fora da faixa nesta seção.
                    </p>
                  ) : (
                    shown.map((v, index) => {
                      const group = groupOf(v);
                      const value = pv.get(v.tag);
                      const sp = value?.setpoint ?? null;
                      return (
                        <div key={v.tag} role="rowgroup">
                          {index === 0 || groupOf(shown[index - 1] as ProcessVariable) !== group ? (
                            <div className="border-b border-line pt-3 pb-1.5 text-[11px] font-semibold tracking-[0.05em] text-fg-2 uppercase">
                              {group}
                            </div>
                          ) : null}
                          <InstrumentRow
                            name={v.name}
                            tag={v.tag}
                            unit={v.unit}
                            pv={value?.value ?? null}
                            pvText={tagValue(value?.value, v.unit)}
                            sp={sp}
                            spText={sp === null ? '–' : tagValue(sp, v.unit)}
                            mode={v.controlled ? 'malha' : null}
                            limits={{ min: v.min, max: v.max, ...v.limits, target: v.target }}
                            history={history.data?.get(v.tag) ?? []}
                            priority={priorityOf(v.tag)}
                            badge={FIXED_TAGS.has(v.tag) ? <Illustrative /> : undefined}
                            selected={v.tag === tag}
                            onSelect={() => {
                              onSelectTag(v.tag);
                            }}
                          />
                        </div>
                      );
                    })
                  )}
                </div>
                <p className="border-t border-line py-2.5 text-[11px] text-fg-3">
                  Faixa clara = L–H · marcas = LL/HH · ▾ = SP · minigráfico com a banda L–H
                </p>
              </div>
            </Panel>

            <Side
              gateway={gateway}
              area={area}
              now={now}
              tag={tag}
              variables={variables}
              loops={loops}
              standing={standing}
              setpoints={setpoints.changes}
              history={history2}
              onSelectTag={onSelectTag}
              onWritten={() => {
                setReload((n) => n + 1);
              }}
            />
          </div>
        );
      }}
    </ResourceState>
  );
}

function Side({
  gateway,
  area,
  now,
  tag,
  variables,
  loops,
  standing,
  setpoints,
  history,
  onSelectTag,
  onWritten,
}: {
  readonly gateway: DataGateway;
  readonly area: string;
  readonly now: number;
  readonly tag: string | null;
  readonly variables: readonly ProcessVariable[];
  readonly loops: readonly ProcessVariable[];
  readonly standing: readonly Alarm[];
  readonly setpoints: React.ComponentProps<typeof SetpointPanel>['history'];
  readonly history: React.ComponentProps<typeof SetpointPanel>['history'];
  readonly onSelectTag: (tag: string | null) => void;
  readonly onWritten: () => void;
}) {
  const areaTags = useMemo(() => new Set(variables.map((v) => v.tag)), [variables]);
  /** Começa pela TAG escolhida e pelas que estão em alarme na seção. */
  const [tags, setTags] = useState<string[]>(() => {
    const alarmed = standing.map((a) => a.tag).filter((t) => areaTags.has(t));
    const fill = [...loops, ...variables].map((v) => v.tag);
    const start = [...new Set([...(tag && areaTags.has(tag) ? [tag] : []), ...alarmed, ...fill])];
    return start.slice(0, 3);
  });
  const [lastTag, setLastTag] = useState(tag);
  if (tag !== lastTag) {
    setLastTag(tag);
    if (tag && !tags.includes(tag)) setTags((list) => [tag, ...list].slice(0, MAX_TREND_TAGS));
  }

  const setpointTag =
    tag && loops.some((l) => l.tag === tag)
      ? tag
      : (tags.find((t) => loops.some((l) => l.tag === t)) ?? null);

  return (
    <div className="flex min-h-0 flex-col gap-4">
      {area === 'preparo' ? (
        <RefiningEffect
          gateway={gateway}
          now={now}
          setpoints={setpoints}
          className="h-[288px] shrink-0"
        />
      ) : null}
      <TrendStack
        gateway={gateway}
        tags={tags}
        now={now}
        fixedTags={FIXED_TAGS}
        options={variables.map((v) => ({ tag: v.tag, name: v.name }))}
        setpoints={setpoints}
        alarms={standing}
        onAdd={(t) => {
          setTags((list) => [...list, t].slice(0, MAX_TREND_TAGS));
        }}
        onRemove={(t) => {
          setTags((list) => list.filter((item) => item !== t));
        }}
        className="min-h-0 flex-1"
      />
      <SetpointPanel
        gateway={gateway}
        loops={loops}
        tag={setpointTag}
        onTag={(t) => {
          onSelectTag(t);
        }}
        history={history}
        onWritten={onWritten}
        className={area === 'preparo' ? 'h-[330px] shrink-0' : 'h-[440px] shrink-0'}
      />
    </div>
  );
}
