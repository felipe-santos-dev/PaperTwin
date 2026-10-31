import { useCallback, useState } from 'react';

import {
  NOTE_PRIORITY_LABELS,
  NOTE_STATUSES,
  type MaintenanceNote,
  type NoteStatus,
} from '@mp1/shared';

import type { DataGateway } from '../api/gateway';
import { Block, ScreenTitle, StatRow } from '../ui/Shell';
import { Facts, Table } from '../ui/Table';
import { dayTime, int } from '../ui/format';
import { ResourceState } from '../ui/ResourceState';
import { useResource } from '../ui/useResource';

/**
 * Notas de manutenção — a fila de trabalho.
 *
 * A ordem é por prioridade e depois por data, e isso vem do banco: numa fila de
 * trabalho, a nota de prioridade 1 de ontem vem antes da de prioridade 4 de hoje.
 *
 * ## A evidência é um link, não um anexo
 *
 * O gêmeo não guarda foto. A evidência de uma nota aponta para o que ele já tem
 * — o alarme que a abriu, a tendência da tag, o ponto da ronda. Clicar leva ao
 * registro, que é o que alguém faria com a foto de todo jeito. O aviso de que os
 * números são simulados fica no alto da tela, onde não dá para não ver.
 */

export interface NotasScreenProps {
  readonly gateway: DataGateway;
  /** Abre a tendência de uma tag na tela de Processo. */
  readonly onOpenTrend: (tag: string) => void;
  /** Abre um mancal na tela de Mancais. */
  readonly onOpenBearing: (assetTag: string) => void;
}

export function NotasScreen({ gateway, onOpenTrend, onOpenBearing }: NotasScreenProps) {
  const [status, setStatus] = useState<NoteStatus | 'todas'>('todas');
  const [selected, setSelected] = useState<string | null>(null);

  const notes = useResource(
    useCallback(
      (signal) =>
        gateway.notes(status === 'todas' ? { limit: 100 } : { status, limit: 100 }, signal),
      [gateway, status],
    ),
    { isEmpty: (data) => data.notes.length === 0 },
  );

  const current =
    notes.data?.notes.find((note) => note.number === selected) ?? notes.data?.notes[0] ?? null;

  const open = notes.data?.notes.filter((note) => note.status !== 'encerrada').length ?? 0;
  const urgent =
    notes.data?.notes.filter((note) => note.priority === 1 && note.status !== 'encerrada').length ??
    0;
  const shutdown =
    notes.data?.notes.filter((note) => note.requiresShutdown && note.status !== 'encerrada')
      .length ?? 0;

  return (
    <>
      <ScreenTitle
        eyebrow="Manutenção · números simulados, sem ligação com sistema real"
        title="Notas de manutenção"
        actions={
          <div className="flex flex-wrap gap-1.5">
            {(['todas', ...NOTE_STATUSES] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  setStatus(option);
                  setSelected(null);
                }}
                aria-pressed={status === option}
                className={`min-h-11 rounded border px-3 py-1.5 text-sm transition-colors ${
                  status === option
                    ? 'border-mill-accent/50 bg-mill-accent/12 text-mill-fg'
                    : 'border-mill-line text-mill-muted hover:text-mill-fg'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        }
      />

      <StatRow
        stats={[
          { label: 'Abertas', value: int(open) },
          {
            label: 'Prioridade 1',
            value: int(urgent),
            tone: urgent > 0 ? 'critical' : 'normal',
            hint: NOTE_PRIORITY_LABELS[1].toLowerCase(),
          },
          {
            label: 'Exigem parada',
            value: int(shutdown),
            tone: shutdown > 0 ? 'attention' : 'normal',
          },
          { label: 'No recorte', value: int(notes.data?.count ?? 0) },
        ]}
      />

      <ResourceState
        resource={notes}
        label="as notas"
        emptyMessage={
          status === 'todas'
            ? 'Nenhuma nota aberta. As notas nascem de alarme de mancal de prioridade alta ou crítica.'
            : `Nenhuma nota ${status}.`
        }
      >
        {(data) => (
          <>
            <Block title="Fila de trabalho" aside="por prioridade, depois por data">
              <Table
                caption="Notas de manutenção"
                rows={data.notes}
                keyOf={(note) => note.number}
                selected={(note) => note.number === current?.number}
                onSelect={(note) => {
                  setSelected(note.number);
                }}
                columns={[
                  {
                    key: 'num',
                    header: 'Nota',
                    render: (n) => <span className="font-mono">{n.number}</span>,
                  },
                  {
                    key: 'pri',
                    header: 'Prio.',
                    numeric: true,
                    render: (n) => (
                      <span
                        className={n.priority === 1 ? 'text-mill-critical' : undefined}
                        title={NOTE_PRIORITY_LABELS[n.priority]}
                      >
                        {int(n.priority)}
                      </span>
                    ),
                  },
                  {
                    key: 'ativo',
                    header: 'Equipamento',
                    render: (n) => <span className="font-mono text-xs">{n.assetTag}</span>,
                  },
                  { key: 'sint', header: 'Sintoma', render: (n) => n.symptom },
                  { key: 'orig', header: 'Origem', hideBelow: 'md', render: (n) => n.origin },
                  { key: 'sit', header: 'Situação', render: (n) => n.status },
                  {
                    key: 'par',
                    header: 'Parada',
                    hideBelow: 'lg',
                    render: (n) =>
                      n.requiresShutdown ? (
                        <span className="text-mill-attention">exige</span>
                      ) : (
                        <span className="text-mill-muted">não</span>
                      ),
                  },
                  {
                    key: 'data',
                    header: 'Aberta em',
                    hideBelow: 'lg',
                    render: (n) => dayTime(n.createdAt),
                  },
                ]}
              />
            </Block>

            {current && (
              <NoteDetail note={current} onOpenTrend={onOpenTrend} onOpenBearing={onOpenBearing} />
            )}
          </>
        )}
      </ResourceState>
    </>
  );
}

function NoteDetail({
  note,
  onOpenTrend,
  onOpenBearing,
}: {
  readonly note: MaintenanceNote;
  readonly onOpenTrend: (tag: string) => void;
  readonly onOpenBearing: (assetTag: string) => void;
}) {
  return (
    <Block title={`Nota ${note.number}`} aside={NOTE_PRIORITY_LABELS[note.priority]}>
      <div className="flex flex-col gap-4 border-t border-mill-line pt-3">
        <Facts
          columns={4}
          items={[
            {
              label: 'Equipamento',
              value: (
                <button
                  type="button"
                  onClick={() => {
                    onOpenBearing(note.assetTag);
                  }}
                  className="min-h-11 text-left underline decoration-mill-line underline-offset-4 hover:decoration-mill-fg"
                >
                  {note.assetTag}
                </button>
              ),
            },
            { label: 'Origem', value: note.origin },
            { label: 'Situação', value: note.status },
            { label: 'Exige parada', value: note.requiresShutdown ? 'sim' : 'não' },
            { label: 'Aberta em', value: dayTime(note.createdAt) },
            { label: 'Encerrada em', value: dayTime(note.closedAt) },
            {
              label: 'Referência de origem',
              value: <span className="text-xs">{note.originRef ?? '—'}</span>,
            },
            { label: 'Prioridade', value: int(note.priority) },
          ]}
        />

        <div>
          <h3 className="text-sm font-semibold">Sintoma</h3>
          <p className="mt-1 text-sm text-mill-muted">{note.symptom}</p>
        </div>

        <div>
          <h3 className="text-sm font-semibold">Evidências</h3>
          <p className="mt-1 text-xs text-mill-muted">
            O gêmeo não guarda anexo. Cada evidência aponta para um registro que ele tem.
          </p>
          <ul className="mt-2 flex flex-col gap-1.5 text-sm">
            {note.evidence.map((item) => (
              <li key={`${item.kind}-${item.ref}`} className="flex flex-wrap items-baseline gap-3">
                <span className="w-24 shrink-0 text-xs text-mill-muted">{item.kind}</span>
                {item.kind === 'tendência' ? (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenTrend(item.ref);
                    }}
                    className="min-h-11 font-mono text-sm underline decoration-mill-line underline-offset-4 hover:decoration-mill-fg"
                  >
                    {item.ref}
                  </button>
                ) : (
                  <span className="font-mono text-xs">{item.ref}</span>
                )}
                <span className="text-mill-muted">{item.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Block>
  );
}
