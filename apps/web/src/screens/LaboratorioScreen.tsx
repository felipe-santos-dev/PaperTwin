import { useCallback, useState } from 'react';

import type { LabResult, LabSpec, ReelHold } from '../api/fixtures';
import type { DataGateway } from '../api/gateway';
import type { QualityReport, ReelView } from '../api/process';
import { fraction, linear } from '../ui/chart/scale';
import { seriesOf, type Point } from '../ui/chart/series';
import { hhmm, num } from '../ui/format';
import { Illustrative, Panel } from '../ui/Panel';
import { ResourceState } from '../ui/ResourceState';
import { digits } from '../ui/tagScale';
import { useResource } from '../ui/useResource';
import { useWidth } from '../ui/useWidth';
import {
  cellOf,
  controlChart,
  meanIn,
  scheduled,
  stateOf,
  typicalReelMs,
  type CellState,
} from './laboratorio/derive';
import { SensorVirtual } from './laboratorio/SensorVirtual';

/**
 * Laboratório — os ensaios por bobina.
 *
 * A matriz bobina × ensaio é o visual principal: cada célula é a posição do
 * resultado dentro da especificação. Ao lado, a carta de controle do ensaio
 * escolhido, a fila e a comparação com o QCS.
 *
 * A API não tem laboratório: todos os resultados são dado fixo, ancorados nas
 * bobinas reais, e cada painel leva o selo. A comparação lab × QCS põe lado a
 * lado o QCS real e o ensaio fixo, com a fonte de cada um escrita.
 */

const ROWS = 12;

/** O ensaio que virou entidade na Fase 7: a tração MD. */
const TENSILE_TAG = 'LAB-1206';

export function LaboratorioScreen({ gateway }: { readonly gateway: DataGateway }) {
  const data = useResource(
    useCallback(
      async (signal: AbortSignal) => {
        const [reels, lab, holds, values, quality] = await Promise.all([
          gateway.reels({ limit: 40 }, signal),
          gateway.labResults({}, signal),
          gateway.reelHolds(signal),
          gateway.processValues({}, signal),
          /**
           * O ensaio que deixou de ser ilustrativo.
           *
           * Falha vira `null` em vez de derrubar a tela: uma API mais velha
           * não tem a rota, e os outros 18 ensaios continuam valendo. O que
           * some é o painel do sensor, não o Laboratório.
           */
          gateway.quality(TENSILE_TAG, {}, signal).catch(() => null),
        ]);
        const now = Date.parse(values.ts);
        const closed = reels.reels.filter((r) => r.endedAt !== null);
        const oldest = closed[ROWS - 1] ?? closed.at(-1);
        const ash = oldest
          ? await gateway
              .tagTrend(
                'AIC-904',
                { from: new Date(Date.parse(oldest.startedAt)), to: new Date(now), buckets: 480 },
                signal,
              )
              .catch(() => null)
          : null;
        /**
         * A coluna da tração MD passa a mostrar os laudos de verdade.
         *
         * Duas versões do mesmo ensaio na mesma tela — um número fixo na
         * matriz e um laudo na API — seria a pior forma de meia-verdade. Os
         * resultados da API substituem os ilustrativos daquela TAG, e só
         * daquela.
         */
        const results = quality
          ? [
              ...lab.results.filter((item) => item.tag !== TENSILE_TAG),
              ...quality.results.map((item) => ({
                reelNumber: item.reelNumber,
                tag: item.tag,
                value: item.value,
                unit: item.unit,
                analyzedAt: item.reportedAt,
              })),
            ]
          : lab.results;

        return {
          reels: reels.reels,
          lab: { specs: lab.specs, results },
          quality,
          holds: holds.holds,
          now,
          ash: ash ? seriesOf(ash, now) : [],
        };
      },
      [gateway],
    ),
    { isEmpty: (result) => result.reels.every((r) => r.endedAt === null) },
  );

  return (
    <ResourceState
      resource={data}
      label="o laboratório"
      emptyMessage="Nenhuma bobina fechada ainda: o laboratório ensaia a bobina depois que ela sai da Pope."
    >
      {(result) => <LabView {...result} />}
    </ResourceState>
  );
}

function LabView({
  reels,
  lab,
  quality,
  holds,
  now,
  ash,
}: {
  readonly reels: readonly ReelView[];
  readonly lab: { readonly specs: readonly LabSpec[]; readonly results: readonly LabResult[] };
  readonly quality: QualityReport | null;
  readonly holds: readonly ReelHold[];
  readonly now: number;
  readonly ash: readonly Point[];
}) {
  const closed = reels.filter((r) => r.endedAt !== null);
  const rows = closed.slice(0, ROWS);
  const held = holds.find((h) => h.status === 'retida');
  /**
   * A tela abre no ensaio que é medido de verdade.
   *
   * Antes ela abria no ensaio da bobina retida, que é o que alguém viria
   * olhar. A Fase 7 inverte essa ordem por um motivo que vale enquanto durar:
   * a retenção sai de dado **ilustrativo**, e deixar o dado fixo decidir o que
   * a tela mostra na frente do único ensaio medido seria pôr a demonstração à
   * frente da medida. Quando o Cobb₆₀ também for medido, a retida volta a
   * ganhar a vez.
   */
  const [selected, setSelected] = useState<string>(
    quality ? TENSILE_TAG : (held?.tag ?? lab.specs[0]?.tag ?? ''),
  );
  const spec = lab.specs.find((s) => s.tag === selected) ?? lab.specs[0];

  return (
    <div className="grid h-[calc(100vh-152px)] min-h-[760px] grid-cols-[minmax(0,1180fr)_minmax(0,636fr)] gap-4">
      <Matrix
        rows={rows}
        specs={lab.specs}
        results={lab.results}
        holds={holds}
        measured={quality ? TENSILE_TAG : null}
        selected={spec?.tag ?? ''}
        onSelect={setSelected}
      />
      <div className="flex min-h-0 flex-col gap-4">
        {quality && selected === TENSILE_TAG ? (
          <SensorVirtual quality={quality} className="h-[340px] shrink-0" />
        ) : spec ? (
          <Chart spec={spec} results={lab.results} className="h-[340px] shrink-0" />
        ) : null}
        <Queue reels={reels} specs={lab.specs} results={lab.results} holds={holds} now={now} />
        <LabVsQcs
          rows={rows}
          results={lab.results}
          specs={lab.specs}
          ash={ash}
          className="min-h-0 flex-1"
        />
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- matriz */

const CELL: Readonly<Record<CellState, string>> = {
  dentro: 'bg-cell',
  limite: 'bg-spec-edge border border-spec-edge-line',
  fora: 'bg-spec-out',
  atrasado: 'border border-dashed border-tick',
  'não programado': 'border border-dashed border-line',
};

function Matrix({
  rows,
  specs,
  results,
  holds,
  measured,
  selected,
  onSelect,
}: {
  readonly rows: readonly ReelView[];
  readonly specs: readonly LabSpec[];
  readonly results: readonly LabResult[];
  readonly holds: readonly ReelHold[];
  /** A TAG cujos resultados vêm da API, e não do dado fixo. */
  readonly measured: string | null;
  readonly selected: string;
  readonly onSelect: (tag: string) => void;
}) {
  const cells = rows.flatMap((reel) => specs.map((spec) => cellOf(spec, reel, results)));
  const out = cells.filter((c) => c.state === 'fora').length;
  const edge = cells.filter((c) => c.state === 'limite').length;
  const holdOf = new Map(holds.map((h) => [h.reelNumber, h]));
  const grid = { gridTemplateColumns: `112px repeat(${String(specs.length)}, minmax(0, 1fr))` };

  return (
    <Panel
      help="laboratorio.matriz"
      title={<span className="text-[16px]">Bobinas × ensaios</span>}
      label="Bobinas × ensaios"
      context={
        <span>
          últimas <span className="font-mono text-fg">{rows.length}</span> jumbos ·{' '}
          <span className="font-mono text-spec-out">{out}</span> fora ·{' '}
          <span className="font-mono text-spec-edge-fg">{edge}</span> no limite · clique numa coluna
          para a carta de controle
        </span>
      }
      aside={
        measured ? (
          <span className="flex items-center gap-2">
            <span className="border border-band px-1.5 py-0.5 text-[11px] text-fg-2">
              {measured} medido
            </span>
            <Illustrative
              title={`Os outros ensaios são dado fixo de demonstração, ancorado nas bobinas reais. ${measured} vem da API: amostra por bobina, com laudo.`}
            />
          </span>
        ) : (
          <Illustrative title="Resultados de laboratório: dado fixo de demonstração, ancorado nas bobinas reais." />
        )
      }
      bodyClassName="flex min-h-0 flex-col"
    >
      <div role="table" aria-label="Ensaios por bobina" className="flex min-h-0 flex-1 flex-col">
        <div role="row" className="grid gap-1 pb-2" style={grid}>
          <span />
          {specs.map((spec) => (
            <button
              key={spec.tag}
              type="button"
              role="columnheader"
              aria-pressed={spec.tag === selected}
              onClick={() => {
                onSelect(spec.tag);
              }}
              className={`flex min-w-0 flex-col items-start border-b-2 px-1 pt-2 pb-1 text-left ${
                spec.tag === selected
                  ? 'border-action bg-hover'
                  : 'border-transparent hover:bg-hover'
              }`}
            >
              <span className="w-full truncate text-[12px] text-fg" title={spec.label}>
                {spec.label}
              </span>
              <span className="w-full truncate font-mono text-[10px] text-fg-3">{spec.tag}</span>
              <span className="w-full truncate font-mono text-[10px] text-fg-3">
                {num(spec.lo, digits(spec.lo))}–{num(spec.hi, digits(spec.hi))}
              </span>
            </button>
          ))}
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
          {rows.map((reel) => {
            const hold = holdOf.get(reel.number);
            const chip = hold
              ? hold.status === 'retida'
                ? 'bg-spec-out text-[#1a0a14]'
                : 'border border-spec-out text-fg'
              : reel.disposition === 'aprovada'
                ? 'border border-band text-fg-2'
                : 'border border-spec-out text-fg';
            return (
              <div key={reel.number} role="row" className="grid min-h-12 flex-1 gap-1" style={grid}>
                <div role="rowheader" className="flex items-center gap-2">
                  <div>
                    <div className="font-mono text-[13px]">{reel.number}</div>
                    <div className="font-mono text-[10px] text-fg-3">{hhmm(reel.endedAt)}</div>
                  </div>
                  <span className={`px-1 text-[10px] ${chip}`}>
                    {hold ? hold.status : (reel.disposition ?? '—')}
                  </span>
                </div>
                {specs.map((spec) => {
                  const cell = cellOf(spec, reel, results);
                  const value = cell.result?.value ?? null;
                  const at = value === null ? 0 : fraction(value, spec.lo, spec.hi);
                  return (
                    <div
                      key={spec.tag}
                      role="cell"
                      title={
                        value === null
                          ? `${spec.label} · bobina ${String(reel.number)}: ${cell.state}`
                          : `${spec.label} · bobina ${String(reel.number)}: ${num(value, digits(spec.hi - spec.lo < 5 ? 0.1 : 1))} ${spec.unit} (${cell.state})`
                      }
                      className={`relative ${CELL[cell.state]} ${spec.tag === selected ? 'outline outline-1 -outline-offset-1 outline-action' : ''}`}
                    >
                      {value !== null ? (
                        <>
                          <span
                            className={`absolute inset-x-[12%] top-1/2 h-px ${cell.state === 'fora' ? 'bg-[#1a0a14]/40' : 'bg-line-strong'}`}
                          />
                          <span
                            className={`absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${
                              cell.state === 'fora'
                                ? 'bg-[#1a0a14]'
                                : cell.state === 'limite'
                                  ? 'bg-spec-out'
                                  : 'bg-fg-2'
                            }`}
                            style={{ left: `${(12 + at * 76).toFixed(1)}%` }}
                          />
                        </>
                      ) : cell.state === 'atrasado' ? (
                        <span className="absolute inset-0 flex items-center justify-center font-mono text-[10px] text-fg-3">
                          atraso
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-line pt-2.5 text-[11px] text-fg-2">
          {(['dentro', 'limite', 'fora', 'atrasado', 'não programado'] as const).map((state) => (
            <span key={state} className="flex items-center gap-1.5">
              <span className={`h-3 w-4 ${CELL[state]}`} />
              {state === 'limite' ? 'no limite (10 % da faixa)' : state}
            </span>
          ))}
          <span className="text-fg-3">
            ponto = posição na especificação (LIE à esquerda, LSE à direita)
          </span>
        </div>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------- carta de controle */

function Chart({
  spec,
  results,
  className,
}: {
  readonly spec: LabSpec;
  readonly results: readonly LabResult[];
  readonly className: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>(560);
  const chart = controlChart(spec, results);
  const d = (v: number) => num(v, Math.max(1, digits(spec.lo)));

  return (
    <Panel
      help="laboratorio.carta"
      title="Carta de controle"
      context={
        <span>
          {spec.label}{' '}
          <span className="font-mono text-[11px] text-fg-3">
            {spec.tag} · {spec.unit}
          </span>
        </span>
      }
      aside={<Illustrative />}
      className={className}
      bodyClassName="flex min-h-0 flex-col"
    >
      {!chart ? (
        <p className="text-[12px] text-fg-3">
          Poucos resultados para uma carta: o ensaio sai a cada {spec.everyReels} bobinas.
        </p>
      ) : (
        <>
          <div ref={ref} className="relative min-h-0 flex-1">
            <ChartSvg spec={spec} chart={chart} width={width} />
          </div>
          <div className="mt-2 flex gap-6 text-[12px] text-fg-2">
            <span>
              média <span className="font-mono text-fg">{d(chart.mean)}</span>
            </span>
            <span>
              σ <span className="font-mono text-fg">{num(chart.sigma, 2)}</span>
            </span>
            <span>
              Cpk{' '}
              <span className="font-mono text-fg">
                {chart.cpk === null ? '—' : num(chart.cpk, 2)}
              </span>
            </span>
            {chart.base ? (
              <span className="text-fg-3">
                limites de controle da base {chart.base[0]}–{chart.base[1]}
              </span>
            ) : null}
          </div>
        </>
      )}
    </Panel>
  );
}

function ChartSvg({
  spec,
  chart,
  width,
}: {
  readonly spec: LabSpec;
  readonly chart: NonNullable<ReturnType<typeof controlChart>>;
  readonly width: number;
}) {
  const H = 236;
  const L = 64;
  const values = chart.points.map((p) => p.value);
  const lo = Math.min(spec.lo, chart.lcl, ...values);
  const hi = Math.max(spec.hi, chart.ucl, ...values);
  const pad = (hi - lo) * 0.08;
  const y = linear([lo - pad, hi + pad], [H - 24, 8]);
  const first = chart.points[0]?.reel ?? 0;
  const last = chart.points.at(-1)?.reel ?? 1;
  const x = linear([first, last], [L, width - 8]);
  const d = (v: number) => num(v, Math.max(1, digits(spec.lo)));
  const lines = [
    { v: spec.hi, label: `LSE ${d(spec.hi)}`, color: 'var(--color-spec-out)', dash: undefined },
    { v: spec.lo, label: `LIE ${d(spec.lo)}`, color: 'var(--color-spec-out)', dash: undefined },
    { v: chart.ucl, label: `LSC ${num(chart.ucl, 2)}`, color: 'var(--color-fg-3)', dash: '4 3' },
    { v: chart.lcl, label: `LIC ${num(chart.lcl, 2)}`, color: 'var(--color-fg-3)', dash: '4 3' },
  ];
  const path = chart.points
    .map((p, i) => `${i ? 'L' : 'M'}${x(p.reel).toFixed(1)} ${y(p.value).toFixed(1)}`)
    .join(' ');

  return (
    <svg role="img" aria-label={`Carta de controle de ${spec.label}`} width={width} height={H}>
      <rect
        x={L}
        width={width - L - 8}
        y={y(chart.ucl)}
        height={y(chart.lcl) - y(chart.ucl)}
        fill="#161b22"
      />
      {lines.map((line) => (
        <g key={line.label}>
          <line
            x1={L}
            x2={width - 8}
            y1={y(line.v)}
            y2={y(line.v)}
            stroke={line.color}
            strokeDasharray={line.dash}
          />
          <text
            x={4}
            y={y(line.v) + 3}
            fill={line.color}
            fontSize={10}
            fontFamily="JetBrains Mono, monospace"
          >
            {line.label}
          </text>
        </g>
      ))}
      {chart.base ? (
        <line
          x1={x(chart.base[1] + 0.5)}
          x2={x(chart.base[1] + 0.5)}
          y1={8}
          y2={H - 24}
          stroke="var(--color-line-strong)"
          strokeDasharray="2 3"
        />
      ) : null}
      <path d={path} fill="none" stroke="var(--color-fg-3)" />
      {chart.points.map((p) => {
        const state = stateOf(spec, p.value);
        return (
          <circle
            key={p.reel}
            cx={x(p.reel)}
            cy={y(p.value)}
            r={state === 'dentro' ? 3 : 4}
            fill={
              state === 'fora'
                ? 'var(--color-spec-out)'
                : state === 'limite'
                  ? 'var(--color-spec-edge-line)'
                  : 'var(--color-panel)'
            }
            stroke={state === 'dentro' ? 'var(--color-fg)' : 'none'}
            strokeWidth={1.3}
          >
            <title>{`bobina ${String(p.reel)}: ${d(p.value)}`}</title>
          </circle>
        );
      })}
      <text
        x={L}
        y={H - 6}
        fill="var(--color-fg-3)"
        fontSize={10}
        fontFamily="JetBrains Mono, monospace"
      >
        {first}
      </text>
      <text
        x={width - 8}
        y={H - 6}
        textAnchor="end"
        fill="var(--color-fg-3)"
        fontSize={10}
        fontFamily="JetBrains Mono, monospace"
      >
        {last}
      </text>
    </svg>
  );
}

/* -------------------------------------------------------------------- fila */

/** Quanto depois do fim da bobina o ensaio deveria sair (o mesmo prazo do dado fixo). */
const DUE_MS = 35 * 60_000;
/** Prazo do reteste de uma bobina retida. Suposição do cenário. */
const RETEST_MS = 2 * 3_600_000;

function Queue({
  reels,
  specs,
  results,
  holds,
  now,
}: {
  readonly reels: readonly ReelView[];
  readonly specs: readonly LabSpec[];
  readonly results: readonly LabResult[];
  readonly holds: readonly ReelHold[];
  readonly now: number;
}) {
  const last = reels.find((r) => r.endedAt !== null);
  const open = reels.find((r) => r.endedAt === null);
  const typical = typicalReelMs(reels);
  const items: {
    key: string;
    title: string;
    detail: string;
    progress: number;
    right: string;
    late: boolean;
  }[] = [];

  if (last?.endedAt) {
    const due = Date.parse(last.endedAt) + DUE_MS;
    for (const spec of specs) {
      if (!scheduled(spec, last)) continue;
      if (results.some((r) => r.tag === spec.tag && r.reelNumber === last.number)) continue;
      const over = Math.round((now - due) / 60_000);
      items.push({
        key: `late-${spec.tag}`,
        title: `${spec.label} · ${String(last.number)}`,
        detail: `${spec.tag} · a cada ${String(spec.everyReels)} bobina${spec.everyReels > 1 ? 's' : ''}`,
        progress: fraction(now - Date.parse(last.endedAt), 0, DUE_MS),
        right: over > 0 ? `+${String(over)} min` : `${String(-over)} min rest.`,
        late: over > 0,
      });
    }
  }
  for (const hold of holds.filter((h) => h.status === 'retida')) {
    const since = Date.parse(hold.since);
    const left = Math.round((since + RETEST_MS - now) / 60_000);
    items.push({
      key: `retest-${String(hold.reelNumber)}`,
      title: `Reteste ${hold.tag === 'LAB-1211' ? 'Cobb' : hold.tag} · ${String(hold.reelNumber)}`,
      detail: `${hold.tag} · prazo ${hhmm(new Date(since + RETEST_MS).toISOString())}`,
      progress: fraction(now - since, 0, RETEST_MS),
      right: left >= 0 ? `${String(left)} min rest.` : `+${String(-left)} min`,
      late: left < 0,
    });
  }
  if (open) {
    const count = specs.filter((s) => scheduled(s, open)).length;
    items.push({
      key: 'next',
      title: `Bobina ${String(open.number)} · ${String(count)} ensaios`,
      detail: typical
        ? `troca prevista ${hhmm(new Date(Date.parse(open.startedAt) + typical).toISOString())}`
        : 'em formação',
      progress: 0,
      right: 'na fila',
      late: false,
    });
  }

  return (
    <Panel
      help="laboratorio.fila"
      title="Ensaios em atraso e na fila"
      aside={
        <span className="flex items-center gap-2">
          tempo decorrido × prazo <Illustrative />
        </span>
      }
      className="shrink-0"
    >
      <ul>
        {items.slice(0, 3).map((item) => (
          <li
            key={item.key}
            className="grid grid-cols-[minmax(0,180px)_minmax(0,1fr)_88px] items-center gap-4 border-t border-line py-2"
          >
            <div className="min-w-0">
              <div className="truncate text-[13px]">{item.title}</div>
              <div className="truncate font-mono text-[10px] text-fg-3">{item.detail}</div>
            </div>
            <div
              className={`relative h-2.5 ${item.progress === 0 ? 'border border-dashed border-line-strong' : 'bg-line'}`}
            >
              {item.progress > 0 ? (
                <div
                  className={`absolute inset-y-0 left-0 ${item.late ? 'bg-fg-2' : 'bg-band'}`}
                  style={{ width: `${(item.progress * 100).toFixed(1)}%` }}
                />
              ) : null}
            </div>
            <span
              className={`text-right text-[12px] ${item.late ? 'font-mono font-semibold text-fg' : 'text-fg-2'}`}
            >
              {item.right}
            </span>
          </li>
        ))}
        {items.length === 0 ? (
          <li className="border-t border-line py-3 text-[12px] text-fg-3">
            Nada atrasado nem na fila.
          </li>
        ) : null}
      </ul>
    </Panel>
  );
}

/* ------------------------------------------------------------- lab × QCS */

function LabVsQcs({
  rows,
  results,
  specs,
  ash,
  className,
}: {
  readonly rows: readonly ReelView[];
  readonly results: readonly LabResult[];
  readonly specs: readonly LabSpec[];
  readonly ash: readonly Point[];
  readonly className: string;
}) {
  const qcsOf = (key: 'LAB-1201' | 'LAB-1202' | 'LAB-1208', reel: ReelView): number | null => {
    if (key === 'LAB-1201') return reel.basisWeightGsm;
    if (key === 'LAB-1202') return reel.moisturePct;
    return meanIn(ash, Date.parse(reel.startedAt), Date.parse(reel.endedAt ?? reel.startedAt));
  };
  const lines = (['LAB-1201', 'LAB-1202', 'LAB-1208'] as const).map((tag) => {
    const spec = specs.find((s) => s.tag === tag);
    const pairs = rows
      .map((reel) => {
        const lab =
          results.find((r) => r.tag === tag && r.reelNumber === reel.number)?.value ?? null;
        const qcs = qcsOf(tag, reel);
        return {
          reel: reel.number,
          lab,
          qcs,
          delta: lab !== null && qcs !== null ? lab - qcs : null,
        };
      })
      .filter((p) => p.lab !== null);
    return { tag, spec, pairs };
  });
  const latest = lines[0]?.pairs[0]?.reel ?? null;

  return (
    <Panel
      help="laboratorio.lab-qcs"
      title="Laboratório × QCS online"
      aside={
        <span className="flex items-center gap-2">
          {latest !== null ? (
            <>
              bobina <span className="font-mono">{latest}</span> · Δ das últimas {rows.length}
            </>
          ) : null}
          <Illustrative title="QCS: média real da bobina. Laboratório: dado fixo. Fontes diferentes, marcadas." />
        </span>
      }
      className={className}
      bodyClassName="flex min-h-0 flex-col overflow-y-auto"
    >
      <div className="grid grid-cols-[minmax(0,110px)_minmax(0,1fr)_64px_minmax(0,150px)] gap-x-4 pb-1 text-[10px] text-fg-3">
        <span />
        <span className="flex gap-3">
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-fg" />
            lab
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full border border-fg-2" />
            QCS
          </span>
        </span>
        <span className="text-right">Δ lab − QCS</span>
        <span className="truncate" title="banda = ¼ da faixa de especificação">
          histórico do Δ
        </span>
      </div>
      {lines.map(({ tag, spec, pairs }) => {
        const now = pairs[0];
        if (!spec || !now) {
          return (
            <div key={tag} className="border-t border-line py-3 text-[12px] text-fg-3">
              {spec?.label ?? tag}: sem resultado nas últimas bobinas.
            </div>
          );
        }
        const tol = (spec.hi - spec.lo) / 4;
        const scaleLo = spec.lo - (spec.hi - spec.lo) * 0.2;
        const scaleHi = spec.hi + (spec.hi - spec.lo) * 0.2;
        const pos = (v: number) => `${(fraction(v, scaleLo, scaleHi) * 100).toFixed(1)}%`;
        const deltaOut = now.delta !== null && Math.abs(now.delta) > tol;
        return (
          <div
            key={tag}
            className="grid min-h-11 flex-1 grid-cols-[minmax(0,110px)_minmax(0,1fr)_64px_minmax(0,150px)] items-center gap-x-4 border-t border-line"
          >
            <div>
              <div className="text-[13px]">{spec.label}</div>
              <div className="font-mono text-[10px] text-fg-3">
                {spec.unit} · {num(spec.lo, digits(spec.lo))}–{num(spec.hi, digits(spec.hi))}
              </div>
            </div>
            <div className="relative h-6">
              <div className="absolute inset-x-0 top-3 h-px bg-line-strong" />
              <div
                className="absolute top-2.5 h-1 bg-band"
                style={{ left: pos(spec.lo), width: `calc(${pos(spec.hi)} - ${pos(spec.lo)})` }}
              />
              {now.qcs !== null ? (
                <span
                  className="absolute top-1.5 size-2.5 -translate-x-1/2 rounded-full border border-fg-2 bg-panel"
                  style={{ left: pos(now.qcs) }}
                />
              ) : null}
              {now.lab !== null ? (
                <span
                  className="absolute top-1.5 size-2.5 -translate-x-1/2 rounded-full bg-fg"
                  style={{ left: pos(now.lab) }}
                />
              ) : null}
            </div>
            <span className={`text-right font-mono text-[14px] ${deltaOut ? 'text-spec-out' : ''}`}>
              {now.delta === null
                ? '—'
                : `${now.delta >= 0 ? '+' : '−'}${num(Math.abs(now.delta), 1)}`}
            </span>
            <DeltaBars pairs={[...pairs].reverse()} tol={tol} />
          </div>
        );
      })}
    </Panel>
  );
}

function DeltaBars({
  pairs,
  tol,
}: {
  readonly pairs: readonly { readonly reel: number; readonly delta: number | null }[];
  readonly tol: number;
}) {
  const max = Math.max(tol * 2, ...pairs.map((p) => Math.abs(p.delta ?? 0)));
  const y = linear([-max, max], [26, 2]);
  const w = 150 / Math.max(1, pairs.length);
  return (
    <svg role="img" aria-label="Histórico do Δ" width={150} height={28} className="bg-[#161b22]">
      <rect x={0} width={150} y={y(tol)} height={y(-tol) - y(tol)} fill="var(--color-track)" />
      <line x1={0} x2={150} y1={y(0)} y2={y(0)} stroke="var(--color-line-strong)" />
      {pairs.map((p, i) =>
        p.delta === null ? null : (
          <rect
            key={p.reel}
            x={i * w + 1}
            width={Math.max(1, w - 2)}
            y={Math.min(y(0), y(p.delta))}
            height={Math.max(1, Math.abs(y(p.delta) - y(0)))}
            fill={Math.abs(p.delta) > tol ? 'var(--color-spec-out)' : 'var(--color-fg-3)'}
          />
        ),
      )}
    </svg>
  );
}
