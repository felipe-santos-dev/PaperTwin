import { useState } from 'react';
import {
  NOTE_PRIORITIES,
  NOTE_PRIORITY_LABELS,
  type MaintenanceNote,
  type NotePriority,
  type NoteSuggestion,
} from '@mp1/shared';

import type { DataGateway } from '../../api/gateway';
import { hhmm, num } from '../../ui/format';

import { Panel } from '../../ui/Panel';

/**
 * O cartão da nota sugerida, no detalhe do mancal.
 *
 * É o fim do ciclo da Fase 6: a tendência virou uma nota pronta, e o que falta
 * é alguém dizer sim ou não. O cartão mostra a nota como ela vai nascer — o
 * sintoma gerado dos números, a prioridade, se exige parada e as evidências —
 * e três saídas: confirmar, editar e confirmar, ou dispensar com motivo.
 *
 * ## Três coisas que ele não faz
 *
 * 1. **Não diz que o mancal vai falhar.** A frase é a projeção da reta, com o
 *    prazo e a inclinação à vista, e o rodapé lembra que um defeito que acelera
 *    chega antes do que a reta diz.
 * 2. **Não deixa dispensar sem motivo.** O motivo é o que faz a linha
 *    dispensada servir de auditoria — e é ele que a próxima retomada lê para
 *    não propor a mesma coisa de novo.
 * 3. **Não finge decidir no instantâneo.** Sem escrita, os botões ficam
 *    desligados com a explicação, como no painel de setpoint.
 */

const PRIORITY_BAR: Readonly<Record<NotePriority, string>> = {
  1: 'var(--color-alarm-1)',
  2: 'var(--color-alarm-2)',
  3: 'var(--color-alarm-3)',
  4: 'var(--color-tick)',
};

/** `12/06 09:00` — a janela começa dias atrás, então a hora sozinha não diz nada. */
function quando(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const dia = String(date.getDate()).padStart(2, '0');
  const mês = String(date.getMonth() + 1).padStart(2, '0');
  return `${dia}/${mês} ${hhmm(iso)}`;
}

/** O prazo em texto. Zero dias não é "em 0 dias": é já passou. */
export function prazoDe(days: number): string {
  if (days <= 0) return 'já passou';
  if (days < 1) return 'menos de 1 dia';
  return `${num(days, 0)} dias`;
}

const UNIDADE: Readonly<Record<NoteSuggestion['measure'], string>> = {
  vibração: 'mm/s',
  temperatura: '°C',
};

export function Sugestao({
  gateway,
  suggestion,
  onOpenTag,
  onOpenNote,
  onDecided,
  className = '',
}: {
  readonly gateway: DataGateway;
  readonly suggestion: NoteSuggestion;
  readonly onOpenTag: (tag: string) => void;
  readonly onOpenNote: (number: string) => void;
  /** Recarrega a tela depois de uma decisão. */
  readonly onDecided: () => void;
  readonly className?: string;
}) {
  const [modo, setModo] = useState<'parado' | 'editando' | 'dispensando'>('parado');
  const [sintoma, setSintoma] = useState(suggestion.symptom);
  const [prioridade, setPrioridade] = useState<NotePriority>(suggestion.priority);
  const [parada, setParada] = useState(suggestion.requiresShutdown);
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [nota, setNota] = useState<MaintenanceNote | null>(null);

  const confirmar = gateway.confirmSuggestion;
  const dispensar = gateway.dismissSuggestion;
  const bloqueado =
    confirmar === null || dispensar === null
      ? 'O modo de demonstração é um instantâneo: ele não aceita decisão. Suba a API para confirmar ou dispensar.'
      : null;

  const unidade = UNIDADE[suggestion.measure];
  const casas = suggestion.measure === 'vibração' ? 2 : 1;

  const falhou = (cause: unknown): void => {
    setErro(cause instanceof Error ? cause.message : 'Falha ao decidir a sugestão');
  };

  const enviarConfirmação = (editado: boolean): void => {
    if (!confirmar) return;
    setEnviando(true);
    setErro(null);
    confirmar(suggestion.id, {
      confirmedBy: 'operador',
      ...(editado ? { symptom: sintoma, priority: prioridade, requiresShutdown: parada } : {}),
    })
      .then((response) => {
        setNota(response.note);
        setModo('parado');
        onDecided();
      })
      .catch(falhou)
      .finally(() => {
        setEnviando(false);
      });
  };

  const enviarDispensa = (): void => {
    if (!dispensar) return;
    setEnviando(true);
    setErro(null);
    dispensar(suggestion.id, { reason: motivo.trim(), dismissedBy: 'operador' })
      .then(() => {
        setMotivo('');
        setModo('parado');
        onDecided();
      })
      .catch(falhou)
      .finally(() => {
        setEnviando(false);
      });
  };

  /**
   * `shrink-0` e `whitespace-nowrap` no botão de ação.
   *
   * Três botões e uma nota de rodapé numa linha de 411 px: sem isso os botões
   * encolhiam e o rótulo quebrava dentro deles — "Editar e confirmar" em três
   * linhas numa caixa de 32 px de altura. O que cede é a nota, que desce para a
   * linha de baixo abaixo de `largo`.
   */
  const botão =
    'h-8 shrink-0 border px-3 text-[12px] whitespace-nowrap disabled:border-line-strong disabled:text-fg-3';
  const campo =
    'h-8 border border-line-strong bg-cell px-2 text-[12px] text-fg focus-visible:border-action';

  return (
    <Panel
      help="mancais.sugestao"
      title="Nota sugerida"
      label="Nota sugerida pela tendência"
      /*
        O selo PARADA é o último a ceder, e nunca cede.

        Os quatro pedaços do contexto eram filhos de flex sem `min-w-0`: a linha
        estourava a caixa e o PARADA acabava debaixo da legenda da direita —
        ilegível justamente o pedaço que diz que a máquina precisa parar. Agora
        quem cede é o rótulo da prioridade ("ação imediata", "próxima parada"),
        que o `P1` ao lado já resume, e abaixo de `largo` ele sai de vez.
      */
      context={
        <span className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className="h-0.5 w-4 shrink-0"
            style={{ background: PRIORITY_BAR[suggestion.priority] }}
          />
          <span className="shrink-0 font-mono text-fg">P{suggestion.priority}</span>
          <span className="min-w-0 truncate text-fg-2 max-largo:hidden">
            {NOTE_PRIORITY_LABELS[suggestion.priority]}
          </span>
          {suggestion.requiresShutdown ? (
            <span className="shrink-0 border border-fg-2 px-1.5 text-[10px] font-semibold tracking-[0.04em] whitespace-nowrap text-fg">
              PARADA
            </span>
          ) : null}
        </span>
      }
      aside={
        <span className="min-w-0 truncate">
          origem <span className="text-fg">tendência</span>
          <span className="max-largo:hidden"> · sem número até confirmar</span>
        </span>
      }
      className={className}
      bodyClassName="flex flex-col gap-3"
    >
      <p className="text-[13px] leading-snug text-fg">{suggestion.symptom}</p>

      <dl className="grid grid-cols-4 gap-x-4 gap-y-1 border-y border-line py-2">
        <Número rótulo="prazo" valor={prazoDe(suggestion.daysToLimit)} />
        <Número
          rótulo="agora"
          valor={`${num(suggestion.level, casas)} ${unidade}`}
          título="Média da última janela da série."
        />
        <Número rótulo="subida" valor={`${num(suggestion.perDay, casas)} ${unidade}/dia`} />
        <Número rótulo="limite" valor={`${num(suggestion.limit, 1)} ${unidade}`} />
      </dl>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-fg-3">
        <span>evidências:</span>
        {suggestion.evidence.map((item) => (
          <span key={`${item.kind}-${item.ref}`} className="flex items-center gap-1">
            {item.kind === 'tendência' ? (
              <button
                type="button"
                onClick={() => {
                  onOpenTag(item.ref);
                }}
                className="border-b border-dashed border-action font-mono text-action-hover hover:text-fg"
              >
                {item.ref}
              </button>
            ) : (
              <span className="font-mono text-fg-2">{item.ref}</span>
            )}
            <span>({item.label})</span>
          </span>
        ))}
      </div>

      {modo === 'editando' ? (
        <div className="flex flex-col gap-2 border border-line-strong bg-base/60 p-2.5">
          <label className="flex flex-col gap-1 text-[11px] text-fg-3">
            Sintoma
            <textarea
              value={sintoma}
              onChange={(event) => {
                setSintoma(event.target.value);
              }}
              rows={2}
              className="border border-line-strong bg-cell px-2 py-1.5 text-[12px] text-fg focus-visible:border-action"
            />
          </label>
          <div className="flex items-end gap-3">
            <label className="flex flex-col gap-1 text-[11px] text-fg-3">
              Prioridade
              <select
                value={prioridade}
                onChange={(event) => {
                  setPrioridade(Number(event.target.value) as NotePriority);
                }}
                className={`${campo} font-mono`}
              >
                {NOTE_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    P{p} · {NOTE_PRIORITY_LABELS[p]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex h-8 items-center gap-2 text-[12px] text-fg-2">
              <input
                type="checkbox"
                checked={parada}
                onChange={(event) => {
                  setParada(event.target.checked);
                }}
                className="size-3.5 accent-action"
              />
              exige parada
            </label>
            <button
              type="button"
              disabled={enviando || sintoma.trim().length < 3}
              onClick={() => {
                enviarConfirmação(true);
              }}
              className={`${botão} ml-auto border-action text-action-hover hover:bg-action/10`}
            >
              Confirmar editada
            </button>
          </div>
        </div>
      ) : null}

      {modo === 'dispensando' ? (
        <div className="flex items-end gap-2 border border-line-strong bg-base/60 p-2.5">
          <label className="flex flex-1 flex-col gap-1 text-[11px] text-fg-3">
            Motivo da dispensa (obrigatório)
            <input
              value={motivo}
              onChange={(event) => {
                setMotivo(event.target.value);
              }}
              placeholder="já programado para a parada de agosto"
              className={campo}
            />
          </label>
          <button
            type="button"
            disabled={enviando || motivo.trim().length < 3}
            onClick={enviarDispensa}
            className={`${botão} border-line-strong text-fg hover:border-action`}
          >
            Confirmar a dispensa
          </button>
        </div>
      ) : null}

      {nota ? (
        <p role="status" className="text-[12px] text-fg-2">
          Nota{' '}
          <button
            type="button"
            onClick={() => {
              onOpenNote(nota.number);
            }}
            className="border-b border-dashed border-action font-mono text-action-hover hover:text-fg"
          >
            {nota.number}
          </button>{' '}
          aberta a partir desta sugestão.
        </p>
      ) : null}

      {erro ? (
        <p role="alert" className="text-[12px] text-alarm-1">
          {erro}
        </p>
      ) : null}

      {bloqueado ? <p className="text-[12px] text-fg-3">{bloqueado}</p> : null}

      <div className="mt-auto flex flex-wrap items-center gap-2 largo:flex-nowrap">
        <button
          type="button"
          disabled={bloqueado !== null || enviando}
          onClick={() => {
            enviarConfirmação(false);
          }}
          className={`${botão} border-action text-action-hover hover:bg-action/10`}
        >
          Confirmar
        </button>
        <button
          type="button"
          disabled={bloqueado !== null || enviando}
          onClick={() => {
            setModo(modo === 'editando' ? 'parado' : 'editando');
          }}
          className={`${botão} border-line-strong text-fg hover:border-action`}
        >
          Editar e confirmar
        </button>
        <button
          type="button"
          disabled={bloqueado !== null || enviando}
          onClick={() => {
            setModo(modo === 'dispensando' ? 'parado' : 'dispensando');
          }}
          className={`${botão} border-line-strong text-fg hover:border-action`}
        >
          Dispensar
        </button>
        <span className="w-full text-[11px] text-fg-3 largo:ml-auto largo:w-auto largo:text-right">
          reta sobre <span className="font-mono text-fg-2">{suggestion.samples}</span> janelas desde{' '}
          <span className="font-mono text-fg-2">{quando(suggestion.trendStart)}</span> · defeito que
          acelera chega antes
        </span>
      </div>
    </Panel>
  );
}

function Número({
  rótulo,
  valor,
  título,
}: {
  readonly rótulo: string;
  readonly valor: string;
  readonly título?: string;
}) {
  return (
    <div className="flex flex-col" title={título}>
      <dt className="text-[11px] text-fg-3">{rótulo}</dt>
      <dd className="font-mono text-[13px] text-fg">{valor}</dd>
    </div>
  );
}
