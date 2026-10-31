import { useCallback } from 'react';

import { processVariable } from '@mp1/shared';

import type { DataGateway } from '../api/gateway';
import type { ReelView } from '../api/process';
import { Block, ScreenTitle, StatRow } from '../ui/Shell';
import { Facts, Table } from '../ui/Table';
import { hhmm, int, num, span } from '../ui/format';
import { ResourceState } from '../ui/ResourceState';
import { useResource } from '../ui/useResource';

/**
 * Bobinas — a qualidade do que a máquina entregou.
 *
 * A tela tem duas metades: a lista, para comparar bobinas, e o detalhe, para
 * entender uma. A pergunta que ela responde é **por que esta bobina foi
 * rebaixada** — e a resposta tem de estar na própria tela, não numa conversa.
 *
 * ## Especificação ao lado do medido
 *
 * Cada média vem com a tolerância do catálogo ao lado, e o desvio marcado quando
 * sai dela. Sem a tolerância, "75,8 g/m²" não diz nada a quem não decorou que a
 * faixa é 73,5–76,5; com ela, a mesma linha responde "está dentro".
 */

export interface BobinasScreenProps {
  readonly gateway: DataGateway;
  readonly selected: number | null;
  readonly onSelect: (number: number | null) => void;
}

export function BobinasScreen({ gateway, selected, onSelect }: BobinasScreenProps) {
  const reels = useResource(
    useCallback((signal) => gateway.reels({ limit: 40 }, signal), [gateway]),
    { isEmpty: (data) => data.reels.length === 0 },
  );

  const current =
    reels.data?.reels.find((reel) => reel.number === selected) ??
    reels.data?.reels.find((reel) => reel.endedAt !== null) ??
    reels.data?.reels[0] ??
    null;

  return (
    <ResourceState
      resource={reels}
      label="as bobinas"
      emptyMessage="Nenhuma bobina fechada ainda. A primeira leva cerca de 53 min."
    >
      {(data) => (
        <>
          <ScreenTitle
            eyebrow={`Bobina jumbo${current ? ` · turno ${current.shiftId.slice(-1)}` : ''}`}
            title={current ? `Nº ${int(current.number)}` : 'Bobinas'}
            aside={current ? dispositionLabel(current) : undefined}
          />

          {current && <ReelSummary reel={current} />}

          <Block title="Bobinas recentes" aside="clique para abrir">
            <Table
              caption="Bobinas jumbo recentes"
              rows={data.reels}
              keyOf={(reel) => String(reel.number)}
              selected={(reel) => reel.number === current?.number}
              onSelect={(reel) => {
                onSelect(reel.number);
              }}
              columns={[
                { key: 'n', header: 'Nº', numeric: true, render: (r) => int(r.number) },
                { key: 'turno', header: 'Turno', hideBelow: 'md', render: (r) => r.shiftId },
                { key: 'ini', header: 'Início', render: (r) => hhmm(r.startedAt) },
                {
                  key: 'dur',
                  header: 'Duração',
                  hideBelow: 'lg',
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
                  render: (r) => <SpecValue value={r.basisWeightGsm} tag="AIC-902" />,
                },
                {
                  key: 'umid',
                  header: 'Umidade',
                  numeric: true,
                  hideBelow: 'md',
                  render: (r) => <SpecValue value={r.moisturePct} tag="AIC-903" />,
                },
                {
                  key: 'esp',
                  header: 'Espessura',
                  numeric: true,
                  hideBelow: 'xl',
                  render: (r) => <SpecValue value={r.caliperUm} tag="AIC-905" />,
                },
                {
                  key: 'emend',
                  header: 'Emendas',
                  numeric: true,
                  hideBelow: 'lg',
                  render: (r) => int(r.splices),
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
          </Block>
        </>
      )}
    </ResourceState>
  );
}

function ReelSummary({ reel }: { readonly reel: ReelView }) {
  const open = reel.endedAt === null;

  return (
    <>
      <StatRow
        stats={[
          {
            label: 'Peso',
            value:
              reel.weightT === null ? (
                '—'
              ) : (
                <>
                  {num(reel.weightT, 1)} <span className="text-[13px] text-mill-muted">t</span>
                </>
              ),
            hint: reel.lengthM === null ? 'em formação' : `${int(reel.lengthM)} m`,
          },
          {
            label: 'Diâmetro final',
            value: reel.finalDiameterMm === null ? '—' : int(reel.finalDiameterMm),
            hint: 'mm · troca em 3.000',
          },
          {
            label: 'Gramatura média',
            value: <SpecValue value={reel.basisWeightGsm} tag="AIC-902" />,
            hint: toleranceHint('AIC-902'),
          },
          {
            label: 'Umidade média',
            value: <SpecValue value={reel.moisturePct} tag="AIC-903" />,
            hint: toleranceHint('AIC-903'),
          },
          {
            label: 'Espessura média',
            value: <SpecValue value={reel.caliperUm} tag="AIC-905" />,
            hint: toleranceHint('AIC-905'),
          },
        ]}
      />

      <Block
        title="Dispersão no sentido da largura"
        aside="2σ do perfil CD medido pelo scanner final"
      >
        {reel.cdSpread === null ? (
          <p className="text-sm text-mill-muted">
            {open
              ? 'A dispersão só é fechada quando a bobina fecha.'
              : 'Sem perfil CD registrado nesta bobina.'}
          </p>
        ) : (
          <Facts
            columns={3}
            items={[
              {
                label: 'Gramatura 2σ',
                value: <SpecValue value={reel.cdSpread.basisWeightGsm} tag="AI-912" />,
              },
              {
                label: 'Umidade 2σ',
                value: <SpecValue value={reel.cdSpread.moisturePct} tag="AI-913" />,
              },
              {
                label: 'Espessura 2σ',
                value: <SpecValue value={reel.cdSpread.caliperUm} tag="AI-915" />,
              },
            ]}
          />
        )}
      </Block>

      <Block title="Destino">
        {reel.disposition === null ? (
          <p className="text-sm text-mill-muted">
            A bobina está na Pope. O destino é decidido quando ela fecha.
          </p>
        ) : (
          <div className="flex flex-col gap-2 border-t border-mill-line pt-3 text-sm">
            <div className="flex flex-wrap items-baseline gap-3">
              <span
                className={
                  reel.disposition === 'aprovada'
                    ? 'font-semibold'
                    : 'font-semibold text-mill-attention'
                }
              >
                {reel.disposition}
              </span>
              <span className="text-mill-muted">
                {reel.splices === 0
                  ? 'sem emenda'
                  : `${int(reel.splices)} ${reel.splices === 1 ? 'emenda' : 'emendas'}`}
              </span>
            </div>
            {reel.dispositionReason !== null && (
              <p className="text-mill-muted">{reel.dispositionReason}</p>
            )}
          </div>
        )}
      </Block>
    </>
  );
}

/** `aprovada` ou `rebaixada · motivo`, para o título. */
function dispositionLabel(reel: ReelView): string {
  if (reel.disposition === null) return '· em formação';
  if (reel.disposition === 'aprovada') return '· aprovada';
  return `· ${reel.disposition}${reel.dispositionReason ? ` · ${reel.dispositionReason}` : ''}`;
}

/** A tolerância de uma tag, do catálogo, em texto curto. */
function toleranceHint(tag: string): string {
  const variable = processVariable(tag);
  const low = variable?.limits.l;
  const high = variable?.limits.h;

  if (low === null || low === undefined || high === null || high === undefined) {
    return variable ? `faixa ${num(variable.min, 1)}–${num(variable.max, 1)}` : '';
  }

  return `tolerância ${num(low, 1)}–${num(high, 1)}`;
}

/**
 * Um valor medido com o desvio da tolerância marcado.
 *
 * A marca é a cor e **também** o texto do título: cor sozinha não serve a quem
 * não distingue vermelho de amarelo, e numa sala de controle isso é comum o
 * bastante para não valer o risco.
 */
function SpecValue({ value, tag }: { readonly value: number | null; readonly tag: string }) {
  const variable = processVariable(tag);
  if (value === null || !variable) return <>{num(value, 2)}</>;

  const low = variable.limits.l;
  const high = variable.limits.h;
  const out = (low !== null && value < low) || (high !== null && value > high) ? true : false;

  if (!out) return <>{num(value, 2)}</>;

  return (
    <span className="text-mill-attention" title={`fora da tolerância de ${tag}`}>
      {num(value, 2)}
      <span className="sr-only"> — fora da tolerância</span>
    </span>
  );
}
