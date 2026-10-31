import { useMemo } from 'react';

import type { PlotBucket } from '../../api/process';

/**
 * O gráfico de tendência, em SVG, sem biblioteca.
 *
 * A regra do projeto pede "sem biblioteca pesada se der; se usar, uma só". Aqui
 * deu, e vale dizer por que: o que este gráfico precisa fazer é desenhar uma
 * faixa de mínimo e máximo, uma linha de média e três linhas de limite num eixo
 * de tempo. São quatro `path` e alguns `line`. A biblioteca entraria para
 * resolver eixos, zoom, legenda e tooltip — e desses, só o eixo é necessário
 * aqui, porque a leitura fina é feita na tabela ao lado e não passando o mouse.
 *
 * ## A faixa é o dado, não um enfeite
 *
 * A API devolve **quatro** valores por coluna: mínimo, máximo, primeiro e
 * último. Desenhar só a média jogaria fora exatamente o que a compressão se
 * esforçou para guardar — um pico de meio segundo numa janela de uma semana. A
 * faixa entre o mínimo e o máximo é o que o sinal percorreu dentro daquele
 * pixel; a linha é por onde ele andou.
 *
 * ## Os limites de alarme vão desenhados
 *
 * Um gráfico de processo sem os limites obriga quem olha a lembrar de cor onde
 * eles ficam. Com eles, "está perto do H" é uma coisa que se vê.
 */

/** O domínio vertical, já com folga. */
interface Scale {
  readonly min: number;
  readonly max: number;
}

export interface TrendProps {
  readonly buckets: readonly PlotBucket[];
  readonly unit: string;
  /** Limites de alarme do catálogo, desenhados como linhas tracejadas. */
  readonly limits?: {
    readonly ll: number | null;
    readonly l: number | null;
    readonly h: number | null;
    readonly hh: number | null;
  } | null;
  /** Alvo de operação, desenhado como linha fina. */
  readonly target?: number | null;
  /** Rótulo acessível: o que o gráfico mostra, em português. */
  readonly label: string;
  /** Altura em pixels do desenho. O padrão serve à tela de Processo. */
  readonly height?: number;
}

const WIDTH = 1000;
const PADDING = { top: 10, right: 54, bottom: 22, left: 8 } as const;

/**
 * O domínio vertical sai dos dados **e** dos limites.
 *
 * Só dos dados, um sinal estável em 230 kPa desenharia uma linha reta no meio e
 * os limites ficariam fora do quadro — e aí a pergunta "está longe do limite?"
 * não teria resposta visual. Só dos limites, um sinal que estourou sairia do
 * quadro. Os dois juntos, com 6 % de folga.
 */
function scaleOf(
  buckets: readonly PlotBucket[],
  limits: TrendProps['limits'],
  target: number | null | undefined,
): Scale {
  const values: number[] = [];

  for (const bucket of buckets) {
    values.push(bucket.min, bucket.max);
  }
  for (const limit of [limits?.ll, limits?.l, limits?.h, limits?.hh, target]) {
    if (limit !== null && limit !== undefined) values.push(limit);
  }

  if (values.length === 0) return { min: 0, max: 1 };

  const min = Math.min(...values);
  const max = Math.max(...values);

  // sinal perfeitamente constante: inventa uma faixa para a linha não ficar na
  // borda do quadro
  if (max === min) return { min: min - 1, max: max + 1 };

  const slack = (max - min) * 0.06;
  return { min: min - slack, max: max + slack };
}

export function Trend({ buckets, unit, limits, target, label, height = 300 }: TrendProps) {
  const scale = useMemo(() => scaleOf(buckets, limits, target), [buckets, limits, target]);

  const plot = {
    x: PADDING.left,
    y: PADDING.top,
    width: WIDTH - PADDING.left - PADDING.right,
    height: height - PADDING.top - PADDING.bottom,
  };

  const toY = (value: number): number =>
    plot.y + plot.height - ((value - scale.min) / (scale.max - scale.min)) * plot.height;

  const toX = (index: number): number =>
    buckets.length <= 1
      ? plot.x + plot.width / 2
      : plot.x + (index / (buckets.length - 1)) * plot.width;

  /** A faixa mínimo–máximo, como um polígono fechado. */
  const band = useMemo(() => {
    if (buckets.length === 0) return '';

    const top = buckets.map((bucket, index) => `${String(toX(index))},${String(toY(bucket.max))}`);
    const bottom = [...buckets]
      .reverse()
      .map(
        (bucket, index) => `${String(toX(buckets.length - 1 - index))},${String(toY(bucket.min))}`,
      );

    return `M${top.join(' L')} L${bottom.join(' L')} Z`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buckets, scale, height]);

  /** A linha do meio de cada coluna — por onde o sinal andou. */
  const line = useMemo(() => {
    if (buckets.length === 0) return '';

    return buckets
      .map((bucket, index) => {
        const mid = (bucket.min + bucket.max) / 2;
        return `${index === 0 ? 'M' : 'L'}${String(toX(index))},${String(toY(mid))}`;
      })
      .join(' ');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buckets, scale, height]);

  if (buckets.length === 0) {
    return (
      <p role="status" className="py-8 text-sm text-mill-muted">
        Sem valores arquivados nesta janela.
      </p>
    );
  }

  const first = buckets[0];
  const last = buckets.at(-1);

  const guides: { value: number; kind: 'limit' | 'target'; name: string }[] = [];
  for (const [name, value] of [
    ['LL', limits?.ll],
    ['L', limits?.l],
    ['H', limits?.h],
    ['HH', limits?.hh],
  ] as const) {
    if (value !== null && value !== undefined) guides.push({ value, kind: 'limit', name });
  }
  if (target !== null && target !== undefined) {
    guides.push({ value: target, kind: 'target', name: 'alvo' });
  }

  return (
    <svg
      viewBox={`0 0 ${String(WIDTH)} ${String(height)}`}
      role="img"
      aria-label={label}
      className="w-full"
      preserveAspectRatio="none"
    >
      {/* o eixo é só a linha de base: grade cheia competiria com o sinal */}
      <line
        x1={plot.x}
        y1={plot.y + plot.height}
        x2={plot.x + plot.width}
        y2={plot.y + plot.height}
        stroke="var(--color-mill-line)"
      />

      {guides.map((guide) => (
        <g key={`${guide.kind}-${guide.name}`}>
          <line
            x1={plot.x}
            y1={toY(guide.value)}
            x2={plot.x + plot.width}
            y2={toY(guide.value)}
            stroke={
              guide.kind === 'target'
                ? 'var(--color-mill-line)'
                : guide.name === 'HH' || guide.name === 'LL'
                  ? 'var(--color-mill-critical)'
                  : 'var(--color-mill-attention)'
            }
            strokeWidth={guide.kind === 'target' ? 1 : 1}
            strokeDasharray={guide.kind === 'target' ? '1 3' : '4 4'}
            opacity={guide.kind === 'target' ? 1 : 0.55}
          />
          <text
            x={plot.x + plot.width + 6}
            y={toY(guide.value) + 4}
            fill={
              guide.kind === 'target'
                ? 'var(--color-mill-dim)'
                : guide.name === 'HH' || guide.name === 'LL'
                  ? 'var(--color-mill-critical)'
                  : 'var(--color-mill-attention)'
            }
            fontSize="11"
            fontFamily="var(--font-mono)"
          >
            {guide.name}
          </text>
        </g>
      ))}

      <path d={band} fill="var(--color-series-1)" opacity="0.22" />
      <path
        d={line}
        fill="none"
        stroke="var(--color-series-1)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />

      {/* a hora das duas pontas, que é o que situa a janela */}
      <text
        x={plot.x}
        y={height - 6}
        fill="var(--color-mill-dim)"
        fontSize="11"
        fontFamily="var(--font-mono)"
      >
        {timeOf(first?.bucketStart)}
      </text>
      <text
        x={plot.x + plot.width}
        y={height - 6}
        textAnchor="end"
        fill="var(--color-mill-dim)"
        fontSize="11"
        fontFamily="var(--font-mono)"
      >
        {timeOf(last?.bucketStart)}
      </text>

      <text
        x={plot.x + plot.width + 6}
        y={plot.y + 10}
        fill="var(--color-mill-dim)"
        fontSize="11"
        fontFamily="var(--font-mono)"
      >
        {unit}
      </text>
    </svg>
  );
}

/** `HH:MM` de um instante ISO, no fuso de quem está olhando. */
export function timeOf(iso: string | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
