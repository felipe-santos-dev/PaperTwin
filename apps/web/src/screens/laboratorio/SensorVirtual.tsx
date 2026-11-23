import { hhmm, num } from '../../ui/format';
import { linear } from '../../ui/chart/scale';
import { Panel } from '../../ui/Panel';
import { useWidth } from '../../ui/useWidth';
import type { QualityReport } from '../../api/process';

/**
 * O sensor virtual de tração MD, entre uma análise e outra.
 *
 * O laboratório mede uma amostra por bobina e o laudo demora — entre um e o
 * próximo, a pergunta "o papel que está saindo agora está dentro?" não tinha
 * resposta. Este painel é a resposta, com a incerteza dela à vista.
 *
 * ## O que o desenho diz
 *
 * - A **faixa da especificação** é o fundo: é contra ela que a pergunta é
 *   feita.
 * - A **linha** é a estimativa, e a área clara em volta é a faixa de
 *   incerteza que o próprio sensor declara.
 * - Os **pontos** são os laudos, no instante em que a amostra foi cortada; o
 *   tracejado vertical é quando cada laudo ficou pronto.
 * O cabeçalho leva só a TAG: em 1440 o painel tem ~560 px, e "estimativa entre
 * análises" ao lado do título e do viés fazia as três coisas se sobreporem. O
 * que a frase diz está no rodapé e na ajuda, onde ela cabe inteira.
 *
 * - Onde a linha **degrau** é onde um laudo entrou e mudou o viés. O degrau é
 *   o sensor sendo corrigido, não um defeito do desenho.
 */

const H = 180;

export function SensorVirtual({
  quality,
  className = '',
}: {
  readonly quality: QualityReport;
  readonly className?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>(560);

  const { spec, points, results, now, calibration } = quality;
  const dentro = now === null ? null : now.value >= spec.lo && now.value <= spec.hi;

  const from = Date.parse(quality.from);
  const to = Date.parse(quality.to);

  const valores = [
    ...points.flatMap((p) => [p.value, p.lo ?? p.value, p.hi ?? p.value]),
    ...results.map((r) => r.value),
    spec.lo,
    spec.hi,
  ];
  const top = Math.max(...valores);
  const bottom = Math.min(...valores);
  const pad = (top - bottom) * 0.12 || 0.2;
  const y = linear([bottom - pad, top + pad], [H, 0]);
  const x = linear([from, to], [0, width]);

  const linha = points
    .map((p, i) => `${i ? 'L' : 'M'}${x(Date.parse(p.t)).toFixed(1)} ${y(p.value).toFixed(1)}`)
    .join(' ');

  /** A faixa de incerteza, como área fechada: sobe pelo teto e volta pelo piso. */
  const área =
    points.every((p) => p.hi === null) || points.length === 0
      ? null
      : [
          ...points.map(
            (p, i) =>
              `${i ? 'L' : 'M'}${x(Date.parse(p.t)).toFixed(1)} ${y(p.hi ?? p.value).toFixed(1)}`,
          ),
          ...[...points]
            .reverse()
            .map((p) => `L${x(Date.parse(p.t)).toFixed(1)} ${y(p.lo ?? p.value).toFixed(1)}`),
          'Z',
        ].join(' ');

  return (
    <Panel
      help="laboratorio.sensor"
      title="Sensor virtual · tração MD"
      label="Sensor virtual de tração MD"
      context={<span className="font-mono whitespace-nowrap text-fg">{quality.tag}</span>}
      aside={
        <span className="whitespace-nowrap">
          {calibration.samples > 0 ? (
            <>
              viés{' '}
              <span className="font-mono text-fg">
                {calibration.bias >= 0 ? '+' : '−'}
                {num(Math.abs(calibration.bias), 2)}
              </span>{' '}
              · <span className="font-mono text-fg">{calibration.samples}</span> laudos
            </>
          ) : (
            'sem laudo: só o modelo'
          )}
        </span>
      }
      className={className}
      bodyClassName="flex min-h-0 flex-col gap-2"
    >
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-[28px] leading-none font-medium">
          {now === null ? '—' : num(now.value, 2)}
        </span>
        <span className="text-[12px] text-fg-2">{quality.unit}</span>
        {now?.hi !== null && now !== null ? (
          <span className="font-mono text-[13px] text-fg-3">
            ± {num((now.hi ?? 0) - now.value, 2)}
          </span>
        ) : (
          <span className="text-[12px] text-fg-3">sem faixa: menos de três laudos</span>
        )}
        {dentro === null ? null : (
          <span
            className={`border px-1.5 py-0.5 text-[11px] ${
              dentro ? 'border-band text-fg-2' : 'border-spec-out text-spec-out'
            }`}
          >
            {dentro ? 'dentro da faixa' : 'fora da faixa'}
          </span>
        )}
        <span className="ml-auto text-[11px] text-fg-3">
          último laudo{' '}
          <span className="font-mono text-fg-2">
            {quality.lastResult ? hhmm(quality.lastResult.sampledAt) : '—'}
          </span>
        </span>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[34px_minmax(0,1fr)] gap-x-2">
        {/* o eixo em texto, fora do SVG: a mesma convenção dos outros gráficos */}
        {/*
          Só os dois limites da especificação.

          O topo e o piso do eixo são escolha de desenho — eles existem para
          sobrar margem — e rotulá-los punha dois números a cinco pixels um do
          outro. Os que respondem a pergunta da tela são 4,6 e 6,0.
        */}
        <div className="relative font-mono text-[10px] text-fg-3" style={{ height: H }}>
          <span className="absolute" style={{ top: y(spec.hi) - 5 }}>
            {num(spec.hi, 1)}
          </span>
          <span className="absolute" style={{ top: y(spec.lo) - 5 }}>
            {num(spec.lo, 1)}
          </span>
        </div>
        <div ref={ref} className="min-w-0">
          <svg
            width={width}
            height={H}
            viewBox={`0 0 ${String(width)} ${String(H)}`}
            role="img"
            aria-label="Estimativa de tração MD entre análises"
            className="block"
          >
            {/* a faixa da especificação, que é contra o que a pergunta é feita */}
            <rect
              x={0}
              y={y(spec.hi)}
              width={width}
              height={Math.max(0, y(spec.lo) - y(spec.hi))}
              fill="var(--color-track)"
            />
            <line
              x1={0}
              x2={width}
              y1={y(spec.target)}
              y2={y(spec.target)}
              stroke="var(--color-tick)"
              strokeDasharray="4 4"
            />

            {área ? <path d={área} fill="var(--color-action)" opacity={0.22} /> : null}
            <path d={linha} fill="none" stroke="var(--color-action-hover)" strokeWidth={1.4} />

            {/* cada laudo: o ponto na amostra e o tracejado em que ele ficou pronto */}
            {results.map((result) => (
              <g key={result.id}>
                <line
                  x1={x(Date.parse(result.reportedAt))}
                  x2={x(Date.parse(result.reportedAt))}
                  y1={0}
                  y2={H}
                  stroke="var(--color-band)"
                  strokeDasharray="2 4"
                />
                <circle
                  cx={x(Date.parse(result.sampledAt))}
                  cy={y(result.value)}
                  r={3.5}
                  fill={result.withinSpec === false ? 'var(--color-spec-out)' : 'var(--color-fg)'}
                />
              </g>
            ))}
          </svg>
        </div>
      </div>

      <p className="text-[11px] leading-snug text-fg-3">
        Modelo de regime do ganho medido ({quality.model.terms.map((term) => term.tag).join(', ')})
        mais o viés dos últimos laudos. O degrau na linha é um laudo entrando. Numa mudança de
        refino a estimativa chega <span className="text-fg-2">antes</span> do papel, pelo tempo
        morto da relação.
      </p>
    </Panel>
  );
}
