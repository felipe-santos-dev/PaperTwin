import { useCallback, useMemo, useState } from 'react';

import { PROCESS_CATALOG } from '@mp1/shared';

import type { DataGateway } from '../api/gateway';
import type { SetpointRejection, TagDetail } from '../api/process';
import { Block, ScreenTitle } from '../ui/Shell';
import { Facts, Table } from '../ui/Table';
import { Trend } from '../ui/chart/Trend';
import { hhmm, num, tagValue } from '../ui/format';
import { ResourceState } from '../ui/ResourceState';
import { useResource } from '../ui/useResource';

/**
 * Processo — as variáveis, a tendência e a escrita de setpoint.
 *
 * As áreas vêm do catálogo, não de uma lista escrita aqui: são as mesmas 14
 * áreas que o CSV declara, e uma lista à mão divergiria na primeira área nova.
 *
 * ## A escrita é a parte séria da tela
 *
 * É a única coisa que o gêmeo deixa mexer no processo, e por isso o formulário
 * cobra motivo, mostra a faixa do catálogo antes de o usuário digitar, e explica
 * a recusa com as palavras da API em vez de um "valor inválido" genérico.
 */

const AREAS = [...new Set(PROCESS_CATALOG.map((variable) => variable.area))].sort();

const DEFAULT_AREA = 'pré-secagem';

export interface ProcessoScreenProps {
  readonly gateway: DataGateway;
  /** A tag aberta no detalhe, quando outra tela pediu. */
  readonly tag: string | null;
  readonly onSelectTag: (tag: string | null) => void;
}

export function ProcessoScreen({ gateway, tag, onSelectTag }: ProcessoScreenProps) {
  const [area, setArea] = useState<string>(() => {
    const requested = tag
      ? PROCESS_CATALOG.find((variable) => variable.tag === tag)?.area
      : undefined;
    return requested ?? DEFAULT_AREA;
  });

  const values = useResource(
    useCallback((signal) => gateway.processValues({ area }, signal), [gateway, area]),
    { isEmpty: (data) => data.values.length === 0 },
  );

  const rows = useMemo(() => {
    const byTag = new Map(values.data?.values.map((item) => [item.tag, item]) ?? []);

    return PROCESS_CATALOG.filter((variable) => variable.area === area).map((variable) => ({
      variable,
      value: byTag.get(variable.tag)?.value ?? null,
    }));
  }, [values.data, area]);

  const selectedTag = tag ?? rows.find((row) => row.variable.controlled)?.variable.tag ?? null;

  return (
    <>
      <ScreenTitle
        eyebrow="Processo e controle"
        title={area}
        aside={`· ${String(rows.length)} variáveis`}
        actions={
          <label className="flex min-h-11 items-center gap-2 text-sm text-mill-muted">
            Área
            <select
              value={area}
              onChange={(event) => {
                setArea(event.target.value);
                onSelectTag(null);
              }}
              className="min-h-11 rounded border border-mill-line bg-mill-panel px-2 py-1.5 text-mill-fg"
            >
              {AREAS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        }
      />

      <ResourceState
        resource={values}
        label="as variáveis"
        emptyMessage="Nenhuma variável desta área tem valor. A simulação precisa rodar um intervalo."
      >
        {(data) => (
          <>
            <Block title="Variáveis" aside={`valores de ${hhmm(data.ts)}`}>
              <Table
                caption={`Variáveis de ${area}`}
                rows={rows}
                keyOf={(row) => row.variable.tag}
                selected={(row) => row.variable.tag === selectedTag}
                onSelect={(row) => {
                  onSelectTag(row.variable.tag);
                }}
                columns={[
                  {
                    key: 'tag',
                    header: 'TAG',
                    render: (row) => <span className="font-mono text-xs">{row.variable.tag}</span>,
                  },
                  { key: 'nome', header: 'Variável', render: (row) => row.variable.name },
                  {
                    key: 'valor',
                    header: 'Valor',
                    numeric: true,
                    render: (row) => <LimitValue value={row.value} variable={row.variable} />,
                  },
                  {
                    key: 'un',
                    header: 'Un.',
                    hideBelow: 'md',
                    render: (row) => (
                      <span className="text-xs text-mill-muted">{row.variable.unit}</span>
                    ),
                  },
                  {
                    key: 'alvo',
                    header: 'Alvo',
                    numeric: true,
                    hideBelow: 'md',
                    render: (row) => tagValue(row.variable.target, row.variable.unit),
                  },
                  {
                    key: 'faixa',
                    header: 'Faixa',
                    numeric: true,
                    hideBelow: 'lg',
                    render: (row) =>
                      `${tagValue(row.variable.min, row.variable.unit)}–${tagValue(
                        row.variable.max,
                        row.variable.unit,
                      )}`,
                  },
                  {
                    key: 'malha',
                    header: 'Malha',
                    hideBelow: 'lg',
                    render: (row) =>
                      row.variable.controlled ? (
                        'sim'
                      ) : (
                        <span className="text-mill-muted">medição</span>
                      ),
                  },
                  {
                    key: 'fonte',
                    header: 'Fonte',
                    hideBelow: 'xl',
                    render: (row) => (
                      <span
                        className={
                          row.variable.source === 'assumed' ? 'text-mill-muted' : undefined
                        }
                        title={row.variable.note ?? undefined}
                      >
                        {row.variable.source}
                      </span>
                    ),
                  },
                ]}
              />
            </Block>

            {selectedTag && <TagPanel gateway={gateway} tag={selectedTag} />}
          </>
        )}
      </ResourceState>
    </>
  );
}

/** Quanto tempo a tendência mostra. */
const WINDOWS = [
  { label: '1 h', hours: 1 },
  { label: '3 h', hours: 3 },
  { label: '8 h', hours: 8 },
  { label: '24 h', hours: 24 },
] as const;

function TagPanel({ gateway, tag }: { readonly gateway: DataGateway; readonly tag: string }) {
  const [hours, setHours] = useState(3);

  const detail = useResource(useCallback((signal) => gateway.tag(tag, signal), [gateway, tag]));

  const trend = useResource(
    useCallback(
      (signal) => {
        const to = new Date();
        return gateway.tagTrend(
          tag,
          { from: new Date(to.getTime() - hours * 3_600_000), to, buckets: 240 },
          signal,
        );
      },
      [gateway, tag, hours],
    ),
    { isEmpty: (data) => data.buckets.length === 0 },
  );

  return (
    <ResourceState resource={detail} label="a variável">
      {(data) => (
        <>
          <Block
            title={`${data.variable.tag} · ${data.variable.name}`}
            aside={
              <div className="flex gap-1.5">
                {WINDOWS.map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    onClick={() => {
                      setHours(option.hours);
                    }}
                    aria-pressed={hours === option.hours}
                    className={`min-h-11 rounded border px-2.5 py-1 text-xs transition-colors ${
                      hours === option.hours
                        ? 'border-mill-accent/50 bg-mill-accent/12 text-mill-fg'
                        : 'border-mill-line text-mill-muted hover:text-mill-fg'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            }
          >
            <Facts
              columns={4}
              items={[
                {
                  label: 'Agora',
                  value: `${tagValue(data.value?.value, data.variable.unit)} ${data.variable.unit}`,
                },
                {
                  label: 'Alvo',
                  value: tagValue(data.variable.target, data.variable.unit),
                },
                {
                  label: 'Faixa de operação',
                  value: `${tagValue(data.variable.min, data.variable.unit)}–${tagValue(
                    data.variable.max,
                    data.variable.unit,
                  )}`,
                },
                {
                  label: 'Média no tempo',
                  value: tagValue(trend.data?.timeWeightedAverage, data.variable.unit),
                },
              ]}
            />

            <ResourceState
              resource={trend}
              label="a tendência"
              emptyMessage="Sem valores arquivados nesta janela. O historiador só tem os períodos em que a simulação rodou."
            >
              {(series) => (
                <Trend
                  buckets={series.buckets}
                  unit={series.unit}
                  limits={series.limits}
                  target={series.target}
                  label={`Tendência de ${series.tag} nas últimas ${String(hours)} h, com a faixa de mínimo e máximo por coluna e os limites de alarme`}
                />
              )}
            </ResourceState>
          </Block>

          <SetpointForm gateway={gateway} detail={data} />
        </>
      )}
    </ResourceState>
  );
}

/**
 * O formulário de escrita.
 *
 * Ele não aparece quando a tag não aceita escrita — e no lugar dele vai a razão,
 * que a API já mandou. Mostrar um campo desabilitado sem dizer por quê é pior
 * que não mostrar campo nenhum.
 */
function SetpointForm({
  gateway,
  detail,
}: {
  readonly gateway: DataGateway;
  readonly detail: TagDetail;
}) {
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [result, setResult] = useState<
    | { kind: 'ok'; message: string }
    | { kind: 'erro'; rejected: SetpointRejection | null; message: string }
    | null
  >(null);
  const [sending, setSending] = useState(false);

  const write = gateway.writeSetpoint;

  if (!detail.writable) {
    return (
      <Block title="Escrita de setpoint">
        <p className="text-sm text-mill-muted">
          {detail.variable.tag} não aceita escrita — {detail.notWritableBecause}.
        </p>
      </Block>
    );
  }

  if (!write) {
    return (
      <Block title="Escrita de setpoint">
        <p className="text-sm text-mill-muted">
          O modo de demonstração é um instantâneo: ele não aceita escrita. Suba a API para mexer no
          processo.
        </p>
      </Block>
    );
  }

  const submit = (event: React.FormEvent): void => {
    event.preventDefault();
    const parsed = Number(value.replace(',', '.'));

    if (!Number.isFinite(parsed)) {
      setResult({ kind: 'erro', rejected: null, message: 'Escreva um número.' });
      return;
    }

    setSending(true);
    write(detail.variable.tag, { value: parsed, reason, changedBy: 'operador' })
      .then((response) => {
        if (response.ok) {
          setResult({
            kind: 'ok',
            message:
              `Setpoint de ${detail.variable.tag} em ${num(response.accepted.change.newValue, 2)} ` +
              `${response.accepted.change.unit}. Anterior: ${num(response.accepted.change.previousValue, 2)}.`,
          });
          setValue('');
          setReason('');
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

  return (
    <Block
      title="Escrita de setpoint"
      aside={`faixa ${num(detail.variable.min, 1)}–${num(detail.variable.max, 1)} ${detail.variable.unit}`}
    >
      <form onSubmit={submit} className="flex flex-col gap-3 border-t border-mill-line pt-3">
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-xs text-mill-muted">
            Novo valor ({detail.variable.unit})
            <input
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
              }}
              inputMode="decimal"
              required
              className="min-h-11 w-36 rounded border border-mill-line bg-mill-bg px-2.5 py-1.5 font-mono text-mill-fg"
            />
          </label>

          <label className="flex min-w-60 flex-1 flex-col gap-1 text-xs text-mill-muted">
            Motivo
            <input
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
              }}
              required
              placeholder="por que a malha está sendo movida"
              className="min-h-11 rounded border border-mill-line bg-mill-bg px-2.5 py-1.5 text-mill-fg"
            />
          </label>

          <button
            type="submit"
            disabled={sending}
            className="min-h-11 rounded bg-mill-fg px-5 py-2 text-sm font-semibold text-mill-panel transition-opacity disabled:opacity-50"
          >
            {sending ? 'Escrevendo…' : 'Escrever'}
          </button>
        </div>

        <p className="text-xs text-mill-muted">
          O valor anterior é lido pelo servidor, não enviado pela tela — quem escreve não tem como
          saber se alguém mexeu entre a leitura e o clique.
        </p>

        {result && (
          <p
            role={result.kind === 'ok' ? 'status' : 'alert'}
            className={`text-sm ${result.kind === 'ok' ? 'text-mill-fg' : 'text-mill-critical'}`}
          >
            {result.message}
            {result.kind === 'erro' &&
              result.rejected?.min !== null &&
              result.rejected?.max !== null &&
              result.rejected !== null && (
                <span className="text-mill-muted">
                  {' '}
                  Faixa: {num(result.rejected.min, 1)}–{num(result.rejected.max, 1)}.
                </span>
              )}
          </p>
        )}
      </form>
    </Block>
  );
}

/** Um valor com a cor do limite que ele estourou, e o motivo no título. */
function LimitValue({
  value,
  variable,
}: {
  readonly value: number | null;
  readonly variable: (typeof PROCESS_CATALOG)[number];
}) {
  if (value === null) return <span className="text-mill-muted">—</span>;

  const { ll, l, h, hh } = variable.limits;
  const critical = (ll !== null && value <= ll) || (hh !== null && value >= hh);
  const attention = !critical && ((l !== null && value <= l) || (h !== null && value >= h));

  const text = tagValue(value, variable.unit);
  if (!critical && !attention) return <>{text}</>;

  const level = critical ? 'LL/HH' : 'L/H';

  return (
    <span
      className={critical ? 'text-mill-critical' : 'text-mill-attention'}
      title={`fora do limite ${level} de ${variable.tag}`}
    >
      {text}
      <span className="sr-only"> — fora do limite {level}</span>
    </span>
  );
}
