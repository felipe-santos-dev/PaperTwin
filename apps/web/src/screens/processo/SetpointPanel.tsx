import { useCallback, useState } from 'react';
import type { ProcessVariable, SetpointChange } from '@mp1/shared';

import type { DataGateway } from '../../api/gateway';
import type { SetpointRejection } from '../../api/process';
import { hhmm, num, tagValue } from '../../ui/format';
import { Panel } from '../../ui/Panel';
import { RangeBar } from '../../ui/RangeBar';
import { ResourceState } from '../../ui/ResourceState';
import { useResource } from '../../ui/useResource';

/**
 * Alteração de setpoint, pela rota real `POST /process/tags/:tag/setpoint`.
 *
 * O motivo é obrigatório. A categoria não existe na API: ela entra no começo do
 * motivo (`Equipamento: …`), que é o campo auditado que a rota guarda — assim
 * ela fica no registro sem a tela inventar um campo que o servidor não tem.
 *
 * O valor anterior é lido pelo servidor, não enviado pela tela: quem escreve
 * não tem como saber se alguém mexeu entre a leitura e o clique.
 */

export const SETPOINT_CATEGORIES = [
  'Correção de qualidade',
  'Equipamento',
  'Produção',
  'Troca de gramatura',
  'Outro',
] as const;

export interface SetpointPanelProps {
  readonly gateway: DataGateway;
  /** As malhas da seção, na ordem da tabela. */
  readonly loops: readonly ProcessVariable[];
  readonly tag: string | null;
  readonly onTag: (tag: string) => void;
  /** Histórico da seção, mais recente primeiro. */
  readonly history: readonly SetpointChange[];
  /** Chamado depois de uma escrita aceita, para a tela reler os valores. */
  readonly onWritten: () => void;
  readonly className?: string;
}

type Result =
  | { kind: 'ok'; message: string }
  | { kind: 'erro'; rejected: SetpointRejection | null; message: string }
  | null;

export function SetpointPanel(props: SetpointPanelProps) {
  const { loops } = props;
  const current = loops.find((loop) => loop.tag === props.tag) ?? loops[0] ?? null;

  return (
    <Panel
      title="Alteração de setpoint"
      aside="motivo obrigatório · registro auditado"
      className={props.className ?? ''}
      bodyClassName="flex min-h-0 flex-col"
    >
      {current ? (
        <TagForm key={current.tag} {...props} variable={current} />
      ) : (
        <p className="text-[12px] text-fg-2">Esta seção não tem malha no catálogo: só medições.</p>
      )}
      <h3 className="mt-4 mb-1 text-[11px] text-fg-3">Histórico da seção</h3>
      {props.history.length === 0 ? (
        <p className="text-[12px] text-fg-3">Nenhuma alteração registrada.</p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {props.history.map((change) => (
            <li
              key={change.id}
              className="grid grid-cols-[72px_84px_128px_minmax(0,1fr)_auto] items-center gap-x-3 border-t border-line py-2 text-[12px]"
            >
              <span className="font-mono text-fg-2">{when(change.changedAt)}</span>
              <span className="font-mono text-[11px] text-fg-2">{change.tag}</span>
              <span className="font-mono">
                {tagValue(change.previousValue, change.unit)} →{' '}
                {tagValue(change.newValue, change.unit)}{' '}
                <span className="text-[10px] text-fg-3">{change.unit}</span>
              </span>
              <span className="truncate" title={change.reason}>
                {change.reason}
              </span>
              <span className="text-[11px] text-fg-3">{change.changedBy}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** Hora se for de hoje, dia e hora se for de antes. */
function when(iso: string): string {
  const date = new Date(iso);
  if (date.toDateString() === new Date().toDateString()) return hhmm(iso);
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')} ${hhmm(iso)}`;
}

function TagForm({
  gateway,
  loops,
  onTag,
  onWritten,
  variable,
}: SetpointPanelProps & { readonly variable: ProcessVariable }) {
  const [value, setValue] = useState('');
  const [category, setCategory] = useState<string>(SETPOINT_CATEGORIES[0]);
  const [reason, setReason] = useState('');
  const [result, setResult] = useState<Result>(null);
  const [sending, setSending] = useState(false);

  const detail = useResource(
    useCallback(
      (signal: AbortSignal) => gateway.tag(variable.tag, signal),
      [gateway, variable.tag],
    ),
  );
  const write = gateway.writeSetpoint;
  const parsed = Number(value.replace(',', '.'));
  const typed = value.trim() !== '' && Number.isFinite(parsed);

  const submit = (event: React.FormEvent): void => {
    event.preventDefault();
    if (!write) return;
    if (!typed) {
      setResult({ kind: 'erro', rejected: null, message: 'Escreva um número.' });
      return;
    }
    setSending(true);
    write(variable.tag, {
      value: parsed,
      reason: `${category}: ${reason.trim()}`,
      changedBy: 'operador',
    })
      .then((response) => {
        if (response.ok) {
          const change = response.accepted.change;
          setResult({
            kind: 'ok',
            message: `Setpoint de ${variable.tag} em ${num(change.newValue, 2)} ${change.unit}. Anterior: ${num(change.previousValue, 2)}.`,
          });
          setValue('');
          setReason('');
          onWritten();
        } else {
          setResult({
            kind: 'erro',
            rejected: response.rejected,
            message: response.rejected.message,
          });
        }
      })
      .catch((cause: unknown) => {
        setResult({
          kind: 'erro',
          rejected: null,
          message: cause instanceof Error ? cause.message : 'Falha ao escrever o setpoint',
        });
      })
      .finally(() => {
        setSending(false);
      });
  };

  const field =
    'h-9 border border-line-strong bg-cell px-2.5 text-[13px] text-fg focus-visible:border-action';

  return (
    <ResourceState resource={detail} label="a malha">
      {(data) => {
        const sp = data.value?.setpoint ?? null;
        const pv = data.value?.value ?? null;
        const blocked = !data.writable
          ? `${variable.tag} não aceita escrita — ${data.notWritableBecause ?? 'sem motivo informado'}.`
          : !write
            ? 'O modo de demonstração é um instantâneo: ele não aceita escrita. Suba a API para mexer no processo.'
            : null;
        return (
          <form onSubmit={submit} className="flex flex-col gap-3">
            <div className="grid grid-cols-[minmax(0,132px)_96px_minmax(0,96px)_minmax(0,1fr)] items-end gap-3">
              <label className="flex flex-col gap-1 text-[11px] text-fg-3">
                TAG
                <select
                  value={variable.tag}
                  onChange={(event) => {
                    onTag(event.target.value);
                  }}
                  className={`${field} font-mono`}
                >
                  {loops.map((loop) => (
                    <option key={loop.tag} value={loop.tag}>
                      {loop.tag}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-col gap-1 text-[11px] text-fg-3">
                SP atual
                <span className="flex h-9 items-center font-mono text-[13px] text-fg">
                  {tagValue(sp, variable.unit)}
                  <span className="ml-1 text-[11px] text-fg-2">{variable.unit}</span>
                </span>
              </div>
              <label className="flex flex-col gap-1 text-[11px] text-fg-3">
                Novo SP
                <input
                  value={value}
                  onChange={(event) => {
                    setValue(event.target.value);
                  }}
                  inputMode="decimal"
                  required
                  disabled={blocked !== null}
                  className={`${field} font-mono disabled:opacity-50`}
                />
              </label>
              <div className="flex min-w-0 flex-col gap-1 text-[11px] text-fg-3">
                <span>
                  Faixa{' '}
                  <span className="font-mono">
                    {num(variable.min, digitsOf(variable.min))}–
                    {num(variable.max, digitsOf(variable.max))}
                  </span>
                </span>
                <RangeBar
                  size="sm"
                  className="mb-3"
                  min={variable.min}
                  max={variable.max}
                  ll={variable.limits.ll}
                  l={variable.limits.l}
                  h={variable.limits.h}
                  hh={variable.limits.hh}
                  target={variable.target}
                  pv={pv}
                  sp={typed ? parsed : sp}
                  label={`Faixa de ${variable.tag}`}
                />
              </div>
            </div>
            <div className="grid grid-cols-[minmax(0,180px)_minmax(0,1fr)_96px] items-end gap-3">
              <label className="flex flex-col gap-1 text-[11px] text-fg-3">
                Categoria
                <select
                  value={category}
                  onChange={(event) => {
                    setCategory(event.target.value);
                  }}
                  disabled={blocked !== null}
                  className={`${field} disabled:opacity-50`}
                >
                  {SETPOINT_CATEGORIES.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[11px] text-fg-3">
                Motivo
                <input
                  value={reason}
                  onChange={(event) => {
                    setReason(event.target.value);
                  }}
                  required
                  disabled={blocked !== null}
                  placeholder="por que a malha está sendo movida"
                  className={`${field} disabled:opacity-50`}
                />
              </label>
              <button
                type="submit"
                disabled={blocked !== null || sending || !typed || reason.trim() === ''}
                className="h-9 border border-action text-[13px] text-action-hover hover:bg-action/10 disabled:border-line-strong disabled:text-fg-3"
              >
                {sending ? 'Aplicando…' : 'Aplicar'}
              </button>
            </div>
            {blocked ? <p className="text-[12px] text-fg-2">{blocked}</p> : null}
            {result ? (
              <p
                role={result.kind === 'ok' ? 'status' : 'alert'}
                className={`text-[12px] ${result.kind === 'ok' ? 'text-fg' : 'text-alarm-1'}`}
              >
                {result.message}
                {result.kind === 'erro' &&
                result.rejected &&
                result.rejected.min !== null &&
                result.rejected.max !== null ? (
                  <span className="text-fg-2">
                    {' '}
                    Faixa: {num(result.rejected.min, 1)}–{num(result.rejected.max, 1)}.
                  </span>
                ) : null}
              </p>
            ) : null}
          </form>
        );
      }}
    </ResourceState>
  );
}

function digitsOf(value: number): number {
  return Number.isInteger(value) ? 0 : Math.abs(value) < 10 ? 1 : 0;
}
