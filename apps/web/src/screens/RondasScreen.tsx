import { useCallback, useState } from 'react';

import type { Round, RoundPoint } from '@mp1/shared';

import type { DataGateway } from '../api/gateway';
import { Block, ScreenTitle, StatRow } from '../ui/Shell';
import { Table } from '../ui/Table';
import { hhmm, int, num, span } from '../ui/format';
import { ResourceState } from '../ui/ResourceState';
import { useResource } from '../ui/useResource';

/**
 * Rondas — o que a pessoa vê e o instrumento não vê.
 *
 * Esta é a tela que justifica a ronda existir num gêmeo digital. Um mancal com
 * 2,1 mm/s no sistema e ruído anormal na ronda é um caso diferente de um mancal
 * com 2,1 mm/s e ronda limpa, **e a diferença não está em nenhuma tag**.
 *
 * Por isso a coluna central é o par campo × online, com a diferença calculada.
 * Em operação normal ela fica pequena e constante — o pirômetro lê a carcaça por
 * fora, uns três graus abaixo do sensor que está dentro. Quando ela abre, ou o
 * sensor está mentindo ou o mancal está esquentando por fora, e as duas coisas
 * importam.
 */

export interface RondasScreenProps {
  readonly gateway: DataGateway;
  /** Abre o mancal na tela de Mancais. */
  readonly onOpenBearing: (assetTag: string) => void;
}

export function RondasScreen({ gateway, onOpenBearing }: RondasScreenProps) {
  const [selected, setSelected] = useState<string | null>(null);

  const rounds = useResource(
    useCallback((signal) => gateway.rounds({ limit: 20 }, signal), [gateway]),
    { isEmpty: (data) => data.rounds.length === 0 },
  );

  const current =
    rounds.data?.rounds.find((round) => round.id === selected) ?? rounds.data?.rounds[0] ?? null;

  return (
    <>
      <ScreenTitle
        eyebrow="Ronda de inspeção · elétrica e mecânica"
        title={current ? `Ronda das ${hhmm(current.startedAt)}` : 'Rondas'}
        aside={
          current
            ? `· ${current.inspector} · ${String(current.points.length)} pontos · ${span(
                current.startedAt,
                current.finishedAt,
              )}`
            : undefined
        }
      />

      <ResourceState
        resource={rounds}
        label="as rondas"
        emptyMessage="Nenhuma ronda registrada. Há uma por turno, duas horas depois do começo."
      >
        {(data) => (
          <>
            {current && <RoundSummary round={current} />}

            <Block title="Rondas recentes" aside="clique para abrir">
              <Table
                caption="Rondas recentes"
                rows={data.rounds}
                keyOf={(round) => round.id}
                selected={(round) => round.id === current?.id}
                onSelect={(round) => {
                  setSelected(round.id);
                }}
                columns={[
                  { key: 'hora', header: 'Início', render: (r) => hhmm(r.startedAt) },
                  { key: 'turno', header: 'Turno', hideBelow: 'md', render: (r) => r.shiftId },
                  { key: 'exec', header: 'Executante', render: (r) => r.inspector },
                  {
                    key: 'pontos',
                    header: 'Pontos',
                    numeric: true,
                    render: (r) => int(r.points.length),
                  },
                  {
                    key: 'atencao',
                    header: 'Com nota',
                    numeric: true,
                    render: (r) => {
                      const count = needingAttention(r).length;
                      return count === 0 ? (
                        <span className="text-mill-muted">0</span>
                      ) : (
                        <span className="text-mill-attention">{int(count)}</span>
                      );
                    },
                  },
                  {
                    key: 'dur',
                    header: 'Duração',
                    hideBelow: 'lg',
                    render: (r) => span(r.startedAt, r.finishedAt),
                  },
                ]}
              />
            </Block>

            {current && <RoundPoints round={current} onOpenBearing={onOpenBearing} />}
          </>
        )}
      </ResourceState>
    </>
  );
}

function RoundSummary({ round }: { readonly round: Round }) {
  const attention = needingAttention(round);
  const gaps = round.points
    .map((point) => gapOf(point))
    .filter((gap): gap is number => gap !== null);

  const widest = gaps.length === 0 ? null : Math.max(...gaps.map(Math.abs));

  return (
    <StatRow
      stats={[
        { label: 'Pontos', value: int(round.points.length) },
        {
          label: 'Com algo a relatar',
          value: int(attention.length),
          tone: attention.length > 0 ? 'attention' : 'normal',
          hint: attention.length === 0 ? 'ronda limpa' : 'ruído ou vazamento',
        },
        {
          label: 'Maior diferença campo × online',
          value: widest === null ? '—' : num(widest, 1),
          hint: '°C',
        },
        {
          label: 'Duração',
          value: span(round.startedAt, round.finishedAt),
        },
      ]}
    />
  );
}

function RoundPoints({
  round,
  onOpenBearing,
}: {
  readonly round: Round;
  readonly onOpenBearing: (assetTag: string) => void;
}) {
  return (
    <Block
      title="Roteiro"
      aside="o valor online é o que a tela mostrava no momento da ronda, guardado junto"
    >
      <Table
        caption={`Pontos da ronda das ${hhmm(round.startedAt)}`}
        rows={round.points}
        keyOf={(point) => point.assetTag}
        onSelect={(point) => {
          onOpenBearing(point.assetTag);
        }}
        columns={[
          {
            key: 'ativo',
            header: 'Ponto',
            render: (p) => <span className="font-mono text-xs">{p.assetTag}</span>,
          },
          {
            key: 'campo',
            header: 'Campo',
            numeric: true,
            render: (p) => (p.fieldTempC === null ? '—' : `${num(p.fieldTempC, 1)} °C`),
          },
          {
            key: 'online',
            header: 'Online',
            numeric: true,
            render: (p) => (p.onlineValue === null ? '—' : `${num(p.onlineValue, 1)} °C`),
          },
          {
            key: 'dif',
            header: 'Diferença',
            numeric: true,
            render: (p) => <Gap point={p} />,
          },
          {
            key: 'tag',
            header: 'TAG online',
            hideBelow: 'lg',
            render: (p) => <span className="font-mono text-xs">{p.onlineTag ?? '—'}</span>,
          },
          {
            key: 'ruido',
            header: 'Ruído',
            render: (p) =>
              p.noise === 'normal' ? (
                <span className="text-mill-muted">normal</span>
              ) : (
                <span
                  className={p.noise === 'anormal' ? 'text-mill-critical' : 'text-mill-attention'}
                >
                  {p.noise}
                </span>
              ),
          },
          {
            key: 'vaz',
            header: 'Vazamento',
            render: (p) =>
              p.leak === 'nenhum' ? (
                <span className="text-mill-muted">nenhum</span>
              ) : (
                <span className="text-mill-attention">{p.leak}</span>
              ),
          },
          {
            key: 'obs',
            header: 'Observação',
            hideBelow: 'md',
            render: (p) => (p.note === null ? <span className="text-mill-muted">—</span> : p.note),
          },
        ]}
      />
    </Block>
  );
}

/**
 * A diferença entre campo e online.
 *
 * `null` quando falta um dos dois — e a ausência importa: uma ronda sem
 * temperatura de campo não contradiz nem confirma o instrumento, e mostrar zero
 * ali diria que eles concordam.
 */
function gapOf(point: RoundPoint): number | null {
  if (point.fieldTempC === null || point.onlineValue === null) return null;
  return point.fieldTempC - point.onlineValue;
}

/**
 * Quanto a diferença pode abrir antes de valer uma olhada, em °C.
 *
 * **Suposição.** O pirômetro lê a carcaça por fora e o sensor está dentro, então
 * uma diferença de alguns graus é o normal. Oito graus é o ponto em que ela deixa
 * de ser geometria e passa a ser notícia — ou o sensor está mentindo, ou o mancal
 * está esquentando por fora.
 */
const GAP_ATTENTION_C = 8;

function Gap({ point }: { readonly point: RoundPoint }) {
  const gap = gapOf(point);
  if (gap === null) return <span className="text-mill-muted">—</span>;

  const wide = Math.abs(gap) > GAP_ATTENTION_C;
  const text = `${gap > 0 ? '+' : ''}${num(gap, 1)}`;

  if (!wide) return <>{text}</>;

  return (
    <span className="text-mill-attention" title="diferença grande entre campo e online">
      {text}
      <span className="sr-only"> — diferença grande</span>
    </span>
  );
}

function needingAttention(round: Round): readonly RoundPoint[] {
  return round.points.filter((point) => point.noise !== 'normal' || point.leak !== 'nenhum');
}
