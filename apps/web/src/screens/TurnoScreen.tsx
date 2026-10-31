import { useCallback } from 'react';

import type { DataGateway } from '../api/gateway';
import type { ShiftDetail } from '../api/process';
import { Block, ScreenTitle, StatRow } from '../ui/Shell';
import { Facts, Table } from '../ui/Table';
import { hhmm, int, num, span } from '../ui/format';
import { ResourceState } from '../ui/ResourceState';
import { useResource } from '../ui/useResource';

/**
 * Turno — a passagem de turno.
 *
 * É a primeira tela porque é o recorte em que tudo acontece: a produção, as
 * bobinas, as quebras, a ronda e o que fica para quem assume. A pergunta que
 * ela responde é a que se faz às 13h55: **o que eu conto para o turno C?**
 *
 * Por isso a passagem vem antes das tabelas. Os números do resumo situam, mas o
 * que muda de mão é a lista de pendências — e ela é montada do que aconteceu, não
 * digitada.
 */

export interface TurnoScreenProps {
  readonly gateway: DataGateway;
  readonly onSelectReel: (number: number) => void;
}

export function TurnoScreen({ gateway, onSelectReel }: TurnoScreenProps) {
  /**
   * O turno aberto é o mais recente, e vem da lista.
   *
   * Pedir "o turno de agora" por uma rota própria seria uma rota a mais para
   * dizer o que a lista ordenada já diz na primeira linha.
   */
  const shifts = useResource(
    useCallback((signal) => gateway.shifts({ limit: 10 }, signal), [gateway]),
    { isEmpty: (data) => data.shifts.length === 0 },
  );

  const currentId = shifts.data?.shifts[0]?.id ?? null;

  const detail = useResource(
    useCallback((signal) => gateway.shift(currentId ?? '', signal), [gateway, currentId]),
    { enabled: currentId !== null },
  );

  /**
   * Um estado por vez.
   *
   * A primeira versão desenhava os dois `ResourceState` em sequência, e enquanto
   * as duas buscas corriam a tela mostrava "Carregando os turnos…" e
   * "Carregando o turno…" uma embaixo da outra. Duas frases dizendo a mesma
   * coisa é pior que uma: quem olha fica procurando a diferença entre elas.
   *
   * Aninhar resolve e também fica mais honesto — o detalhe do turno só existe
   * depois de haver turno.
   */
  return (
    <ResourceState
      resource={shifts}
      label="os turnos"
      emptyMessage="Nenhum turno registrado ainda. A simulação precisa rodar pelo menos um intervalo."
    >
      {() => (
        <ResourceState resource={detail} label="o turno">
          {(data) => <ShiftView data={data} onSelectReel={onSelectReel} />}
        </ResourceState>
      )}
    </ResourceState>
  );
}

function ShiftView({
  data,
  onSelectReel,
}: {
  readonly data: ShiftDetail;
  readonly onSelectReel: (number: number) => void;
}) {
  const { shift, reels, webBreaks, gradeChanges, rounds } = data;

  const closed = reels.filter((reel) => reel.endedAt !== null);
  const approved = closed.filter((reel) => reel.disposition === 'aprovada').length;
  const downgraded = closed.filter((reel) => reel.disposition !== 'aprovada').length;

  const downtimeS = webBreaks.reduce(
    (total, item) =>
      item.endedAt === null
        ? total
        : total + (Date.parse(item.endedAt) - Date.parse(item.startedAt)) / 1000,
    0,
  );

  const grade = gradeChanges[0];

  return (
    <>
      <ScreenTitle
        eyebrow="Passagem de turno"
        title={`Turno ${shift.letter}`}
        aside={`· ${hhmm(shift.startedAt)}–${hhmm(shift.endedAt ?? shift.startedAt)} · ${
          shift.endedAt === null ? 'em andamento' : 'encerrado'
        }`}
      />

      <StatRow
        stats={[
          {
            label: 'Produção',
            value: (
              <>
                {num(shift.productionT, 1)} <span className="text-[13px] text-mill-muted">t</span>
              </>
            ),
            hint: `eficiência ${num(shift.efficiencyPct, 1)} %`,
          },
          {
            label: 'Bobinas',
            value: int(closed.length),
            hint: `${String(approved)} aprovadas · ${String(downgraded)} rebaixadas`,
          },
          {
            label: 'Quebras de folha',
            value: int(webBreaks.length),
            tone: webBreaks.length > 0 ? 'attention' : 'normal',
            hint:
              webBreaks.length === 0
                ? 'nenhuma'
                : `${String(Math.round(downtimeS / 60))} min de máquina sem folha`,
          },
          {
            label: 'Troca de gramatura',
            value: grade ? `${int(grade.fromGsm)} → ${int(grade.toGsm)}` : '—',
            hint: grade
              ? `estabilizou em ${span(grade.startedAt, grade.stabilizedAt)}`
              : 'nenhuma no turno',
          },
          {
            label: 'Ronda',
            value: rounds.length > 0 ? hhmm(rounds[0]?.startedAt) : '—',
            hint:
              rounds.length === 0
                ? 'não executada'
                : `${String(rounds[0]?.points.length ?? 0)} pontos`,
          },
        ]}
      />

      <Block
        title={`Fica para o turno ${nextLetter(shift.letter)}`}
        aside={`${String(shift.handover.length)} ${shift.handover.length === 1 ? 'pendência' : 'pendências'}`}
      >
        {shift.handover.length === 0 ? (
          <p className="text-sm text-mill-muted">
            Nada pendente. O turno correu sem quebra, sem troca e sem bobina rebaixada.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5 text-sm">
            {shift.handover.map((line) => (
              <li key={line} className="flex gap-2.5 border-b border-mill-line pb-1.5">
                <span aria-hidden="true" className="text-mill-accent">
                  —
                </span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block title="Bobinas do turno" aside="clique para abrir a bobina">
        {closed.length === 0 && reels.length > 0 ? (
          <p className="text-sm text-mill-muted">A primeira bobina do turno ainda está na Pope.</p>
        ) : (
          <Table
            caption={`Bobinas do turno ${shift.letter}`}
            rows={reels}
            keyOf={(reel) => String(reel.number)}
            onSelect={(reel) => {
              onSelectReel(reel.number);
            }}
            columns={[
              { key: 'n', header: 'Nº', numeric: true, render: (r) => int(r.number) },
              { key: 'ini', header: 'Início', render: (r) => hhmm(r.startedAt) },
              {
                key: 'dur',
                header: 'Duração',
                hideBelow: 'md',
                render: (r) => span(r.startedAt, r.endedAt),
              },
              {
                key: 'peso',
                header: 'Peso',
                numeric: true,
                render: (r) => (r.weightT === null ? '—' : `${num(r.weightT, 1)} t`),
              },
              {
                key: 'gram',
                header: 'Gramatura',
                numeric: true,
                render: (r) => (r.basisWeightGsm === null ? '—' : num(r.basisWeightGsm, 2)),
              },
              {
                key: 'umid',
                header: 'Umidade',
                numeric: true,
                hideBelow: 'lg',
                render: (r) => (r.moisturePct === null ? '—' : num(r.moisturePct, 2)),
              },
              {
                key: 'dest',
                header: 'Destino',
                render: (r) =>
                  r.disposition === null ? (
                    <span className="text-mill-muted">em formação</span>
                  ) : r.disposition === 'aprovada' ? (
                    'aprovada'
                  ) : (
                    <span className="text-mill-attention">{r.disposition}</span>
                  ),
              },
            ]}
          />
        )}
      </Block>

      {webBreaks.length > 0 && (
        <Block title="Quebras de folha" aside="os sinais são lidos do historiador">
          <div className="flex flex-col gap-4">
            {webBreaks.map((item) => (
              <article key={item.id} className="border-t border-mill-line pt-3">
                <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <h3 className="font-mono text-sm">
                    {hhmm(item.startedAt)} · {item.section}
                  </h3>
                  <span className="text-xs text-mill-muted">
                    parada de {span(item.startedAt, item.endedAt)}
                  </span>
                  <span className="text-sm">{item.probableCause}</span>
                </header>

                {item.precursors.length === 0 ? (
                  <p className="mt-2 text-xs text-mill-muted">
                    Nenhum sinal passou do limiar nos 10 min anteriores.
                  </p>
                ) : (
                  <ol className="mt-2 flex flex-col gap-1 text-xs">
                    {item.precursors.map((signal) => (
                      <li
                        key={`${signal.tag}-${String(signal.leadTimeS)}`}
                        className="flex flex-wrap gap-x-3"
                      >
                        <span className="w-20 shrink-0 font-mono text-mill-muted">
                          −{String(Math.round(signal.leadTimeS / 60))} min
                        </span>
                        <span className="w-24 shrink-0 font-mono">{signal.tag}</span>
                        <span className="text-mill-muted">{signal.description}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </article>
            ))}
          </div>
        </Block>
      )}

      {rounds.length > 0 && rounds[0] && (
        <Block title={`Ronda de inspeção · ${hhmm(rounds[0].startedAt)}`}>
          <Facts
            columns={4}
            items={[
              { label: 'Executante', value: rounds[0].inspector },
              { label: 'Pontos', value: int(rounds[0].points.length) },
              {
                label: 'Com algo a relatar',
                value: int(
                  rounds[0].points.filter((p) => p.noise !== 'normal' || p.leak !== 'nenhum')
                    .length,
                ),
              },
              { label: 'Duração', value: span(rounds[0].startedAt, rounds[0].finishedAt) },
            ]}
          />
        </Block>
      )}
    </>
  );
}

/** A letra do turno seguinte, no quadro de três. */
function nextLetter(letter: string): string {
  const order = ['A', 'B', 'C'];
  const index = order.indexOf(letter);
  return index === -1 ? '—' : (order[(index + 1) % order.length] ?? '—');
}
