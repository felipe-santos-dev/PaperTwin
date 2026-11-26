import { useCallback, useMemo } from 'react';
import {
  gradeInForceAt,
  gsmTolerance,
  processVariable,
  type GradeChange,
  type WebBreak,
} from '@mp1/shared';

import type { CdMap, ReelHold } from '../api/fixtures';
import type { DataGateway } from '../api/gateway';
import type { ReelView } from '../api/process';
import { fraction } from '../ui/chart/scale';
import { seriesOf, valueAt, type Point } from '../ui/chart/series';
import { Sparkline } from '../ui/chart/Sparkline';
import { hhmm, int, num, tagValue } from '../ui/format';
import { Illustrative, Panel } from '../ui/Panel';
import { ResourceState } from '../ui/ResourceState';
import { useResource } from '../ui/useResource';
import { useWidth } from '../ui/useWidth';
import { breakMarks, merge, outRuns, reelLength, reelSpan, type Span } from './bobinas/derive';

/**
 * Bobinas — o que saiu da máquina, bobina a bobina.
 *
 * Em cima, uma faixa por bobina com o comprimento, os trechos em que o QCS viu
 * a folha fora da tolerância e as quebras. Embaixo, a bobina escolhida: o mapa
 * de umidade CD × MD e o perfil MD das três propriedades do QCS.
 *
 * Os trechos fora e o perfil MD saem da tendência real do QCS na janela da
 * bobina. O mapa CD × MD e as bobinas retidas são dado fixo, com selo.
 */

export interface BobinasScreenProps {
  readonly gateway: DataGateway;
  readonly selected: number | null;
  readonly onSelect: (number: number | null) => void;
  /** Abre o replay de uma quebra do período. */
  readonly onOpenBreak?: (id: string) => void;
}

/** As três propriedades do QCS que a faixa e o perfil olham. */
const QCS = [
  { tag: 'AIC-902', label: 'Gramatura', key: 'basisWeightGsm' },
  { tag: 'AIC-903', label: 'Umidade', key: 'moisturePct' },
  { tag: 'AIC-905', label: 'Espessura', key: 'caliperUm' },
] as const;

const REELS = 24;

export function BobinasScreen({ gateway, selected, onSelect, onOpenBreak }: BobinasScreenProps) {
  const data = useResource(
    useCallback(
      async (signal: AbortSignal) => {
        const [reels, values, breaks, holds, grades] = await Promise.all([
          gateway.reels({ limit: REELS }, signal),
          gateway.processValues({}, signal),
          gateway.webBreaks({ limit: 100 }, signal),
          gateway.reelHolds(signal),
          gateway.gradeChanges({ limit: 20 }, signal),
        ]);
        const now = Date.parse(values.ts);
        const oldest = reels.reels.at(-1);
        const from = oldest ? Date.parse(oldest.startedAt) : now - 3_600_000;
        const query = { from: new Date(from), to: new Date(now), buckets: 720 };
        if (reels.reels.length === 0)
          return {
            reels: reels.reels,
            values,
            breaks: breaks.webBreaks,
            holds: holds.holds,
            grades: grades.gradeChanges,
            trends: [],
            now,
          };
        const trends = await Promise.all(
          QCS.map((item) => gateway.tagTrend(item.tag, query, signal).catch(() => null)),
        );
        return {
          reels: reels.reels,
          values,
          breaks: breaks.webBreaks,
          holds: holds.holds,
          grades: grades.gradeChanges,
          trends,
          now,
        };
      },
      [gateway],
    ),
    { isEmpty: (result) => result.reels.length === 0 },
  );

  return (
    <ResourceState
      resource={data}
      label="as bobinas"
      emptyMessage="Nenhuma bobina fechada ainda. A primeira leva cerca de 53 min."
    >
      {(result) => {
        const series = result.trends.map((trend) => (trend ? seriesOf(trend, result.now) : []));
        const speed = result.values.values.find((v) => v.tag === 'SIC-1104')?.value ?? null;
        const pick =
          result.reels.find((reel) => reel.number === selected) ??
          result.reels.find((reel) => reel.endedAt !== null) ??
          result.reels[0];
        return (
          <div className="flex flex-col gap-4">
            <ReelList
              reels={result.reels}
              holds={result.holds}
              breaks={result.breaks}
              series={series}
              grades={result.grades}
              now={result.now}
              speed={speed}
              selected={pick?.number ?? null}
              onSelect={onSelect}
              onOpenBreak={onOpenBreak}
            />
            {pick ? (
              <div className="grid h-88 grid-cols-[minmax(0,1100fr)_minmax(0,716fr)] gap-4">
                <CdPanel
                  gateway={gateway}
                  reel={pick}
                  hold={result.holds.find((hold) => hold.reelNumber === pick.number) ?? null}
                  now={result.now}
                  speed={speed}
                  outside={QCS.some(
                    (item, i) =>
                      outOf(series[i] ?? [], item.tag, reelSpan(pick, result.now), result.grades)
                        .runs.length > 0,
                  )}
                />
                <MdProfile reel={pick} series={series} grades={result.grades} now={result.now} />
              </div>
            ) : null}
          </div>
        );
      }}
    </ResourceState>
  );
}

/**
 * A tolerância de uma TAG do QCS no instante `at`.
 *
 * Para a gramatura ela segue a gramatura em vigor — ver `gsmTolerance`. Para a
 * umidade e a espessura ficam os L/H do catálogo: a umidade final não depende
 * da gramatura, e para a espessura o projeto não tem regra declarada que
 * dependa dela, então inventar uma aqui seria pior que usar a do catálogo.
 */
export function toleranceOf(
  tag: string,
  grades: readonly GradeChange[],
  at: number,
): readonly [number | null, number | null] {
  const variable = processVariable(tag);
  const limits = variable?.limits;

  if (tag === 'AIC-902') {
    const gsm = gradeInForceAt(grades, at, variable?.target ?? 75);
    return gsmTolerance(gsm);
  }

  return [limits?.l ?? limits?.ll ?? null, limits?.h ?? limits?.hh ?? null];
}

function outOf(series: readonly Point[], tag: string, span: Span, grades: readonly GradeChange[]) {
  /**
   * A gramatura em vigor é a do **início** da bobina.
   *
   * Uma bobina que pega a troca no meio é justamente a que é rebaixada, e o
   * trecho fora que esta conta acha é a evidência disso. Medir o começo dela
   * contra a tolerância nova esconderia o trecho.
   */
  const [lo, hi] = toleranceOf(tag, grades, span.from);
  return outRuns(series, span, lo, hi);
}

/* ---------------------------------------------------------------- faixas */

const DEST: Readonly<Record<string, string>> = {
  aprovada: 'border-band text-fg-2',
  rebaixada: 'border-spec-out text-fg',
  segregada: 'border-spec-out bg-spec-out/20 text-fg',
};

function ReelList({
  reels,
  holds,
  breaks,
  series,
  grades,
  now,
  speed,
  selected,
  onSelect,
  onOpenBreak,
}: {
  readonly reels: readonly ReelView[];
  readonly holds: readonly ReelHold[];
  readonly breaks: readonly WebBreak[];
  readonly series: readonly (readonly Point[])[];
  readonly grades: readonly GradeChange[];
  readonly now: number;
  readonly speed: number | null;
  readonly selected: number | null;
  readonly onSelect: (number: number) => void;
  readonly onOpenBreak: ((id: string) => void) | undefined;
}) {
  const holdOf = new Map(holds.map((hold) => [hold.reelNumber, hold]));
  const lengths = reels.map((reel) => reelLength(reel, now, speed));
  const longest = Math.max(1, ...lengths.map((value) => value ?? 0));
  const scaleM = Math.ceil((longest * 1.02) / 20_000) * 20_000;
  const ticks = Array.from({ length: scaleM / 20_000 + 1 }, (_, i) => i * 20_000);
  const closed = reels.filter((reel) => reel.endedAt !== null);
  // o mesmo destino que a coluna mostra: a retenção da qualidade vence a disposição do QCS
  const destinoOf = (reel: ReelView) => holdOf.get(reel.number)?.status ?? reel.disposition;
  const count = (d: string) => closed.filter((reel) => destinoOf(reel) === d).length;
  const held = holds.filter((hold) => hold.status === 'retida').length;
  const day = reels[0] ? new Date(reels[0].startedAt) : null;

  return (
    <Panel
      help="bobinas.lista"
      title={
        <span className="text-[16px]">
          Bobinas jumbo
          {day
            ? ` · ${String(day.getDate()).padStart(2, '0')}/${String(day.getMonth() + 1).padStart(2, '0')}`
            : ''}
        </span>
      }
      label="Bobinas jumbo"
      context={
        <span>
          <span className="font-mono text-fg">{closed.length}</span> bobinas ·{' '}
          <span className="font-mono text-fg">
            {int(closed.reduce((t, r) => t + (r.weightT ?? 0), 0))}
          </span>{' '}
          t · <span className="font-mono text-fg">{count('rebaixada')}</span> rebaixada ·{' '}
          <span className="font-mono text-fg">{count('segregada')}</span> segregada
          {holds.length > 0 ? (
            <>
              {' '}
              · <span className="font-mono text-spec-out">{held}</span> retida{' '}
              <Illustrative title="Retenção pela qualidade: cenário fixo de demonstração." />
            </>
          ) : null}
        </span>
      }
      aside={
        <span className="flex items-center gap-4 text-[11px] text-fg-2">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-4 bg-track" />
            QCS dentro
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-4 bg-spec-out" />
            QCS fora
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-0.5 bg-alarm-1" />
            quebra
          </span>
        </span>
      }
      /*
        Altura **máxima**, não fixa.

        `h-142` reservava 568 px mesmo com seis bobinas na lista, e sobravam uns
        300 px de painel vazio embaixo da tabela — espaço que a tela precisa
        para o mapa CD e o perfil MD, logo abaixo. Com `max-h`, o painel cresce
        com o conteúdo até o mesmo teto, e a rolagem interna continua valendo
        quando as 24 bobinas chegam.
      */
      className="max-h-142"
      bodyClassName="flex min-h-0 flex-col"
    >
      <div className="grid grid-cols-[58px_52px_minmax(0,1fr)_104px_56px] items-end gap-x-2 text-[11px] text-fg-3 largo:grid-cols-[68px_62px_minmax(0,1fr)_124px_64px]">
        <span className="font-mono">bobina</span>
        <span className="font-mono">início</span>
        {/*
          Cada rótulo é deslocado pela própria posição.

          Com `left` sozinho, o rótulo começa na marca e cresce para a direita —
          então o último, em 100 %, começava na borda da coluna e seguia para
          dentro de "destino": era o "80 km" em cima do cabeçalho vizinho.
          Deslocando cada um por `-posição × largura dele`, o primeiro fica
          alinhado à esquerda, o último à direita, e os do meio proporcionalmente
          entre os dois. Nenhum passa da coluna, em qualquer largura de tela.
        */}
        <div className="relative h-4">
          {ticks.map((m) => {
            const f = fraction(m, 0, scaleM);
            return (
              <span
                key={m}
                className="absolute font-mono text-[10px] whitespace-nowrap"
                style={{
                  left: `${(f * 100).toFixed(2)}%`,
                  transform: `translateX(${String(-f * 100)}%)`,
                }}
              >
                {m === 0 ? '0' : `${String(m / 1000)} km`}
              </span>
            );
          })}
        </div>
        <span className="font-mono">destino</span>
        <span className="text-right font-mono">massa</span>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {reels.map((reel, index) => {
          const span = reelSpan(reel, now);
          const length = lengths[index] ?? null;
          const barW = length === null ? 0 : fraction(length, 0, scaleM);
          const runs = merge(
            QCS.flatMap((item, i) => outOf(series[i] ?? [], item.tag, span, grades).runs),
          );
          const marks = breakMarks(breaks, span);
          const hold = holdOf.get(reel.number);
          const open = reel.endedAt === null;
          const active = reel.number === selected;
          const destino = hold ? hold.status : open ? 'em formação' : (reel.disposition ?? '—');
          const destClass = hold
            ? hold.status === 'retida'
              ? 'border-spec-out bg-spec-out text-[#1a0a14]'
              : 'border-spec-out text-fg'
            : open
              ? 'border-fg-3 text-fg'
              : (DEST[reel.disposition ?? ''] ?? 'border-band text-fg-2');

          return (
            <li key={reel.number}>
              <button
                type="button"
                aria-pressed={active}
                aria-label={`Bobina ${String(reel.number)}`}
                onClick={() => {
                  onSelect(reel.number);
                }}
                title={
                  [
                    reel.dispositionReason,
                    hold ? `${hold.status} (ilustrativo): ${hold.reason}` : null,
                    reel.splices > 0 ? `${String(reel.splices)} emenda(s)` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || undefined
                }
                className={`grid h-5 w-full grid-cols-[58px_52px_minmax(0,1fr)_104px_56px] items-center gap-x-2 border text-left largo:grid-cols-[68px_62px_minmax(0,1fr)_124px_64px] ${
                  active ? 'border-action bg-hover' : 'border-transparent hover:bg-hover'
                }`}
              >
                <span className={`pl-1.5 font-mono text-[12px] ${active ? 'text-fg' : 'text-fg'}`}>
                  {reel.number}
                </span>
                <span className="font-mono text-[11px] text-fg-3">{hhmm(reel.startedAt)}</span>
                <span className="relative block h-5">
                  <span
                    className={`absolute top-1.5 left-0 h-2 ${open ? 'bg-track/70' : 'bg-track'}`}
                    style={{ width: `${(barW * 100).toFixed(2)}%` }}
                  />
                  {runs.map((run) => (
                    <span
                      key={run.from}
                      className="absolute top-1 h-3 bg-spec-out"
                      style={{
                        left: `${(run.from * barW * 100).toFixed(2)}%`,
                        width: `${(Math.max(0.002, (run.to - run.from) * barW) * 100).toFixed(2)}%`,
                      }}
                    />
                  ))}
                  {marks.map((at) => (
                    <span
                      key={at}
                      className="absolute top-0.5 h-4 w-0.5 bg-alarm-1"
                      style={{ left: `${(at * barW * 100).toFixed(2)}%` }}
                    />
                  ))}
                  {/*
                    A barra longa leva o rótulo para dentro dela, não para fora.

                    O arranjo anterior media de `right` e então empurrava o
                    rótulo 100 % + 6 px **para a direita** — ou seja, para fora
                    da barra, que é justamente o lado que não tem espaço quando
                    a barra é longa. O "66,5 km · 1 emenda" da bobina mais longa
                    entrava na coluna "destino" por esse caminho.

                    Agora, da marca dos 72 % em diante, o rótulo é ancorado no
                    fim da barra e deslocado para a esquerda: ele passa a correr
                    por cima da barra, que é escura e o aguenta.
                  */}
                  {length !== null ? (
                    <span
                      className="absolute top-0 font-mono text-[10px] whitespace-nowrap text-fg-2"
                      style={
                        barW > 0.72
                          ? {
                              left: `${(barW * 100).toFixed(2)}%`,
                              transform: 'translateX(calc(-100% - 6px))',
                              top: -1,
                            }
                          : { left: `calc(${(barW * 100).toFixed(2)}% + 6px)`, top: -1 }
                      }
                    >
                      {num(length / 1000, 1)} km
                      {reel.splices > 0
                        ? ` · ${String(reel.splices)} emenda${reel.splices > 1 ? 's' : ''}`
                        : ''}
                    </span>
                  ) : null}
                </span>
                <span className="flex min-w-0">
                  <span
                    title={destino}
                    className={`min-w-0 truncate border px-1.5 text-[11px] leading-4 ${destClass}`}
                  >
                    {destino}
                  </span>
                </span>
                <span className="pr-1.5 text-right">
                  <span className="font-mono text-[12px]">
                    {reel.weightT ? num(reel.weightT, 1) : '—'}
                  </span>
                  <span className="ml-0.5 text-[10px] text-fg-3">t</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <Quebras breaks={breaks} onOpenBreak={onOpenBreak} />
    </Panel>
  );
}

/**
 * As quebras do período, cada uma a um clique do replay.
 *
 * Elas já apareciam como um traço vermelho na faixa da bobina, mas um traço de
 * 2 px numa linha de 20 px não é um alvo de clique nem um caminho de teclado.
 * A lista embaixo é o que torna o replay alcançável de Bobinas — que é onde
 * alguém está quando percebe que uma bobina terminou mais curta do que devia.
 */
function Quebras({
  breaks,
  onOpenBreak,
}: {
  readonly breaks: readonly WebBreak[];
  readonly onOpenBreak: ((id: string) => void) | undefined;
}) {
  if (breaks.length === 0 || !onOpenBreak) return null;

  return (
    <div className="mt-2 flex shrink-0 flex-wrap items-center gap-2 border-t border-line pt-2 text-[11px] text-fg-3">
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-0.5 bg-alarm-1" />
        quebras no período:
      </span>
      {breaks.map((item) => (
        <button
          key={item.id}
          type="button"
          title={item.probableCause}
          onClick={() => {
            onOpenBreak(item.id);
          }}
          className="border border-line-strong px-1.5 py-px font-mono text-[11px] text-fg-2 hover:border-action hover:text-action"
        >
          {hhmm(item.startedAt)} · replay
        </button>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------- mapa CD × MD */

/** As classes de cor do mapa, da mais seca à mais úmida, em torno da tolerância. */
function bins(lo: number, hi: number, target: number) {
  const edge = (hi - lo) * 0.15;
  return [
    {
      label: `> ${num(hi + 0.2, 1)}`,
      test: (v: number) => v > hi + 0.2,
      color: 'var(--color-spec-out)',
    },
    {
      label: `${num(hi, 1)}–${num(hi + 0.2, 1)}`,
      test: (v: number) => v > hi,
      color: 'var(--color-spec-edge-line)',
    },
    {
      label: `${num(hi - edge, 2)}–${num(hi, 1)}`,
      test: (v: number) => v > hi - edge,
      color: 'var(--color-spec-edge)',
    },
    { label: num(target + 0.2, 1), test: (v: number) => v > target + 0.2, color: '#5d6673' },
    { label: num(target + 0.1, 1), test: (v: number) => v > target + 0.1, color: '#3a424e' },
    { label: `${num(target, 1)} alvo`, test: (v: number) => v >= target - 0.1, color: '#262d36' },
    { label: num(target - 0.2, 1), test: (v: number) => v >= lo + edge, color: '#1d232b' },
    {
      label: `${num(lo, 1)}–${num(lo + edge, 2)}`,
      test: (v: number) => v >= lo,
      color: 'var(--color-spec-edge)',
    },
    { label: `< ${num(lo, 1)}`, test: () => true, color: 'var(--color-spec-out)' },
  ];
}

function CdPanel({
  gateway,
  reel,
  hold,
  now,
  speed,
  outside,
}: {
  readonly gateway: DataGateway;
  readonly reel: ReelView;
  readonly hold: ReelHold | null;
  readonly now: number;
  readonly speed: number | null;
  readonly outside: boolean;
}) {
  const map = useResource(
    useCallback(
      (signal: AbortSignal) => gateway.cdMap(reel.number, signal),
      [gateway, reel.number],
    ),
  );
  const length = reelLength(reel, now, speed);
  const open = reel.endedAt === null;

  return (
    <Panel
      help="bobinas.mapa"
      title="Umidade CD × MD"
      label="Umidade CD × MD"
      /*
        O contexto era um `flex` de pedaços que não encolhem.

        Bobina, janela, comprimento, massa e o chip de retenção, todos
        `shrink-0` por serem filhos de flex sem `min-w-0`: a linha estourava a
        caixa e subia por cima da legenda à direita. Como texto corrido num
        `truncate`, ela cede pelo fim — e o fim é a massa, que a tabela acima já
        mostra.
      */
      context={
        <span className="min-w-0 truncate">
          bobina <span className="font-mono text-fg">{reel.number}</span> ·{' '}
          <span className="font-mono">
            {hhmm(reel.startedAt)}–{open ? 'agora' : hhmm(reel.endedAt)}
          </span>
          {length !== null ? (
            <>
              {' '}
              · <span className="font-mono">{num(length / 1000, 1)}</span> km
            </>
          ) : null}
          {reel.weightT ? (
            <>
              {' '}
              · <span className="font-mono">{num(reel.weightT, 1)}</span> t
            </>
          ) : null}
          {hold ? (
            <span
              className={`px-1.5 text-[11px] ${hold.status === 'retida' ? 'bg-spec-out text-[#1a0a14]' : 'border border-spec-out text-fg'}`}
            >
              {hold.status}
            </span>
          ) : null}
        </span>
      }
      aside={
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate">
            {hold
              ? `${hold.reason} · `
              : reel.dispositionReason
                ? `${reel.dispositionReason} · `
                : open
                  ? 'A bobina está na Pope. O destino é decidido quando ela fecha. · '
                  : ''}
            {outside ? 'QCS fora em trecho da bobina' : 'QCS dentro em toda a bobina'}
          </span>
          <Illustrative title="Mapa CD × MD: desenho fixo escalado pela média e pelo 2σ CD reais da bobina." />
        </span>
      }
      bodyClassName="min-h-0"
    >
      <ResourceState resource={map} label="o mapa CD">
        {(data) => <CdGrid map={data} lengthM={length} />}
      </ResourceState>
    </Panel>
  );
}

function CdGrid({ map, lengthM }: { readonly map: CdMap; readonly lengthM: number | null }) {
  const [ref, width] = useWidth<HTMLDivElement>(900);
  const variable = processVariable(map.tag);
  const lo = variable?.limits.l ?? 4.3;
  const hi = variable?.limits.h ?? 5.3;
  const target = variable?.target ?? 4.8;
  const scale = useMemo(() => bins(lo, hi, target), [lo, hi, target]);
  const rows = map.values.length;
  const cols = map.values[0]?.length ?? 0;
  const height = 240;
  const cw = width / Math.max(1, cols);
  const ch = height / Math.max(1, rows);

  return (
    <div className="flex h-full gap-3">
      <div
        className="flex w-8 shrink-0 flex-col justify-between pb-6 font-mono text-[10px] text-fg-3"
        style={{ height: height + 24 }}
      >
        <span>LC</span>
        <span>{int(map.widthM / 2)} m</span>
        <span>LA</span>
      </div>
      <div ref={ref} className="min-w-0 flex-1">
        <svg
          role="img"
          aria-label={`Mapa de umidade da bobina ${String(map.reelNumber)}`}
          width={width}
          height={height}
        >
          {map.values.map((row, r) =>
            row.map((v, c) => (
              <rect
                key={`${String(r)}-${String(c)}`}
                x={c * cw}
                y={r * ch}
                width={cw + 0.5}
                height={ch + 0.5}
                fill={scale.find((bin) => bin.test(v))?.color ?? '#262d36'}
              />
            )),
          )}
        </svg>
        <div className="mt-1.5 flex justify-between font-mono text-[10px] text-fg-3">
          <span>0 km</span>
          <span>MD →</span>
          <span>{lengthM !== null ? `${num(lengthM / 1000, 1)} km` : '—'}</span>
        </div>
      </div>
      <ul className="w-28 shrink-0 text-[11px] text-fg-2">
        <li className="mb-1 text-fg-3">umidade %</li>
        {scale.map((bin) => (
          <li key={bin.label} className="flex items-center gap-2 font-mono leading-[17px]">
            <span className="size-2.5 shrink-0" style={{ background: bin.color }} />
            {bin.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* --------------------------------------------------------------- perfil MD */

function MdProfile({
  reel,
  series,
  grades,
  now,
}: {
  readonly reel: ReelView;
  readonly series: readonly (readonly Point[])[];
  readonly grades: readonly GradeChange[];
  readonly now: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>(470);
  const span = reelSpan(reel, now);
  const length = reel.lengthM;

  return (
    <Panel
      help="bobinas.perfil"
      title="Perfil MD · média CD"
      aside="QCS · banda = tolerância"
      bodyClassName="flex min-h-0 flex-col"
    >
      {QCS.map((item, i) => {
        const variable = processVariable(item.tag);
        const [lo, hi] = toleranceOf(item.tag, grades, span.from);
        const points = series[i] ?? [];
        const samples = Array.from(
          { length: 160 },
          (_, k) => valueAt(points, span.from + (k / 159) * (span.to - span.from)) ?? Number.NaN,
        );
        const value = reel[item.key];
        const unit = variable?.unit ?? '';
        const out = value !== null && ((lo !== null && value < lo) || (hi !== null && value > hi));
        return (
          <div
            key={item.tag}
            className="grid flex-1 grid-cols-[88px_minmax(0,1fr)_76px] items-center gap-2 border-t border-line largo:grid-cols-[104px_minmax(0,1fr)_88px] largo:gap-3"
          >
            <div className="min-w-0">
              <div className="truncate text-[12px]">{item.label}</div>
              <div className="truncate font-mono text-[10px] text-fg-3">
                {lo !== null && hi !== null ? `tolerância ${num(lo, 1)}–${num(hi, 1)}` : '—'}
              </div>
            </div>
            <div ref={i === 0 ? ref : undefined} className="min-w-0">
              {samples.some(Number.isFinite) ? (
                <Sparkline
                  values={samples}
                  band={lo !== null && hi !== null ? { lo, hi } : null}
                  {...(variable
                    ? { domain: padDomain(lo ?? variable.min, hi ?? variable.max, samples) }
                    : {})}
                  width={width}
                  height={46}
                  bandColor="#1a2028"
                  color="var(--color-fg-2)"
                  label={`Perfil MD de ${item.label.toLowerCase()} da bobina ${String(reel.number)}`}
                />
              ) : (
                <p className="text-[11px] text-fg-3">
                  sem tendência no historiador para esta bobina
                </p>
              )}
            </div>
            <div className="text-right">
              <span className={`font-mono text-[14px] ${out ? 'text-spec-out' : ''}`}>
                {tagValue(value, unit)}
              </span>
              <span className="ml-1 text-[11px] text-fg-2">{unit}</span>
            </div>
          </div>
        );
      })}
      <div className="grid grid-cols-[88px_minmax(0,1fr)_76px] gap-2 pt-2 font-mono text-[10px] text-fg-3 largo:grid-cols-[104px_minmax(0,1fr)_88px] largo:gap-3">
        <span />
        <span className="flex justify-between">
          <span>0</span>
          <span>km</span>
          <span>
            {length !== null && length > 0 ? `${num(length / 1000, 1)} km` : 'em formação'}
          </span>
        </span>
      </div>
    </Panel>
  );
}

/** A tolerância com folga, aberta até onde a série for: valor fora não some do gráfico. */
function padDomain(lo: number, hi: number, values: readonly number[]): [number, number] {
  const pad = (hi - lo) * 0.6;
  const finite = values.filter(Number.isFinite);
  const min = Math.min(lo - pad, ...finite.map((v) => v - pad * 0.3));
  const max = Math.max(hi + pad, ...finite.map((v) => v + pad * 0.3));
  return [min, max];
}
