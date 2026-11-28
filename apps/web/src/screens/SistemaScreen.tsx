import type { ReactNode } from 'react';

import { BearingBar, TemperatureBar } from '../ui/BearingBar';
import { DataSourcePill } from '../ui/DataSourcePill';
import { EventMarker } from '../ui/EventMarker';
import { InstrumentRow } from '../ui/InstrumentRow';
import { Num, Tag } from '../ui/Num';
import { ModeChip } from '../ui/Panel';
import { RangeBar } from '../ui/RangeBar';
import { SectionBlock } from '../ui/SectionBlock';

/**
 * Amostras do sistema visual, para revisão contra `reference/design/0-sistema-visual.png`.
 *
 * Só existe nos builds de desenvolvimento e de teste, em `#sistema`. Os valores
 * são os do quadro do design — esta página mostra componentes, não dados.
 */

const ISO = { aToB: 1.4, bToC: 2.8, cToD: 4.5 };

function Swatch({
  color,
  label,
  children,
}: {
  color: string;
  label: string;
  children?: ReactNode;
}) {
  return (
    <div>
      <div
        className="flex h-9 w-18 items-center justify-center border border-line-strong font-mono text-[12px]"
        style={{ background: color }}
      >
        {children}
      </div>
      <div className="mt-1 font-mono text-[10px] text-fg-3">{label}</div>
    </div>
  );
}

function Title({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-4 text-[12px] font-semibold tracking-[0.08em] text-fg-2 uppercase">
      {children}
    </h2>
  );
}

function Sub({ children }: { children: ReactNode }) {
  return <div className="mb-2 text-[12px] text-fg-2">{children}</div>;
}

export function SistemaScreen() {
  return (
    <div className="mx-auto w-[1440px] max-w-full bg-base px-14 py-12 text-fg">
      <h1 className="text-[22px] font-semibold">
        Sistema visual{' '}
        <span className="ml-3 text-[13px] font-normal text-fg-2">
          Cinza quando normal. Cor só para estado fora do normal. Azul só para interação.
        </span>
      </h1>

      <div className="mt-12 grid grid-cols-2 gap-16">
        <section>
          <Title>Cores</Title>
          <Sub>Base</Sub>
          <div className="flex gap-2">
            <Swatch color="var(--color-base)" label="fundo" />
            <Swatch color="var(--color-panel)" label="painel" />
            <Swatch color="var(--color-line)" label="linha" />
            <Swatch color="var(--color-band)" label="faixa normal" />
            <Swatch color="var(--color-fg-3)" label="texto 3" />
            <Swatch color="var(--color-fg-2)" label="texto 2" />
            <Swatch color="var(--color-fg)" label="texto 1 · PV" />
          </div>
          <div className="mt-6 flex gap-10">
            <div>
              <Sub>Interação</Sub>
              <Swatch color="var(--color-action)" label="#4F8CFF" />
            </div>
            <div>
              <Sub>Alarmes · prioridade</Sub>
              <div className="flex gap-2 text-on-alarm">
                <Swatch color="var(--color-alarm-1)" label="alta">
                  1
                </Swatch>
                <Swatch color="var(--color-alarm-2)" label="média">
                  2
                </Swatch>
                <Swatch color="var(--color-alarm-3)" label="baixa">
                  3
                </Swatch>
              </div>
            </div>
          </div>
          <div className="mt-6 flex gap-10">
            <div>
              <Sub>Especificação</Sub>
              <div className="flex gap-2">
                <div>
                  <div className="flex h-9 w-18 items-center justify-center bg-spec-in font-mono text-[12px] text-spec-in-fg">
                    25,1
                  </div>
                  <div className="mt-1 text-[10px] text-fg-3">dentro</div>
                </div>
                <div>
                  <div className="flex h-9 w-18 items-center justify-center border border-spec-edge-line bg-spec-edge font-mono text-[12px] text-spec-edge-fg">
                    27,6
                  </div>
                  <div className="mt-1 text-[10px] text-fg-3">no limite (≥ 85 %)</div>
                </div>
                <div>
                  <div className="flex h-9 w-18 items-center justify-center bg-spec-out font-mono text-[12px] font-semibold text-spec-out-fg">
                    29,4
                  </div>
                  <div className="mt-1 text-[10px] text-fg-3">fora</div>
                </div>
              </div>
            </div>
            <div>
              <Sub>ISO 20816-3 · zonas</Sub>
              <div className="flex">
                {(['A', 'B', 'C', 'D'] as const).map((zone) => (
                  <div key={zone} className="text-center">
                    <div
                      className={`flex h-9 w-14 items-center justify-center font-semibold ${
                        zone === 'A'
                          ? 'bg-iso-a text-fg-2'
                          : zone === 'B'
                            ? 'bg-iso-b text-fg-2'
                            : zone === 'C'
                              ? 'border-t-2 border-iso-c-line bg-iso-c text-iso-c-line'
                              : 'border-t-2 border-iso-d-line bg-iso-d text-alarm-1'
                      }`}
                    >
                      {zone}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-6">
            <Sub>Fonte de dados</Sub>
            <div className="flex gap-3">
              <DataSourcePill source="live" />
              <DataSourcePill source="demo" />
              <DataSourcePill source="offline" />
            </div>
          </div>
        </section>

        <section>
          <Title>Tipografia</Title>
          <div className="grid grid-cols-[140px_1fr] items-baseline gap-y-4 text-[12px]">
            <span className="font-mono text-[10px] text-fg-3">Inter 600 · 14</span>
            <span className="text-[14px] font-semibold">Título de bloco</span>
            <span className="font-mono text-[10px] text-fg-3">Inter 400 · 12</span>
            <span>Rótulo curto de variável</span>
            <span className="font-mono text-[10px] text-fg-3">Mono 400 · 10–11</span>
            <span className="font-mono text-[11px]">FIC-107 · TAG e escala</span>
            <span className="font-mono text-[10px] text-fg-3">Mono 500 · 22</span>
            <Num unit="m/min" className="text-[22px] font-medium">
              1.247
            </Num>
            <span className="font-mono text-[10px] text-fg-3">Mono 600 · 13</span>
            <span className="flex gap-8">
              <Num unit="g/m²" className="text-[13px] font-semibold">
                29,4
              </Num>
              <Num unit="bar" className="text-[13px] font-semibold">
                0,24
              </Num>
              <Num unit="%" className="text-[13px] font-semibold">
                93,1
              </Num>
            </span>
          </div>
          <p className="mt-6 text-[12px] leading-relaxed text-fg-2">
            Vírgula decimal, ponto de milhar, dígitos tabulares. Unidade sempre ao lado, em cinza.
            Cantos de 2–4 px, sem relevo, sem sombra exceto em pop-over.
          </p>
        </section>
      </div>

      <div className="mt-12 border-t border-line pt-10">
        <Title>Componentes</Title>
        <div className="grid grid-cols-2 gap-16">
          <div>
            <Sub>Barra de faixa</Sub>
            <RangeBar
              min={0}
              max={2}
              ll={0.26}
              l={0.6}
              h={1.38}
              hh={1.74}
              target={0.78}
              pv={0.52}
              sp={1.4}
              priority={2}
            />
            <div className="mt-6">
              <RangeBar
                min={0}
                max={2}
                ll={0.26}
                l={0.6}
                h={1.38}
                hh={1.74}
                target={0.78}
                pv={0.9}
                sp={0.9}
              />
            </div>
          </div>
          <div>
            <Sub>Bloco de seção</Sub>
            <div className="flex gap-1">
              <SectionBlock label="Prensas" out={[]} />
              <SectionBlock label="Pré-secagem" out={[{ tag: 'PDIC-523', priority: 2 }]} />
              <SectionBlock label="Pós-secagem" out={[{ tag: 'quebra', priority: 1 }]} />
            </div>
            <div className="mt-6">
              <Sub>Marcadores de evento</Sub>
              <div className="flex gap-4">
                <EventMarker kind="quebra" />
                <EventMarker kind="gramatura" />
                <EventMarker kind="alarme" />
                <EventMarker kind="setpoint" />
                <EventMarker kind="bobina" />
              </div>
            </div>
          </div>
        </div>
        <div className="mt-10">
          <div>
            <Sub>Linha de instrumento</Sub>
            <InstrumentRow
              name="Cola AKD"
              tag="FIC-107"
              unit="kg/t"
              pv={1.1}
              pvText="1,1"
              sp={1.4}
              spText="1,4"
              mode="AUT"
              limits={{ min: 0, max: 2.4, ll: 0.6, l: 0.8, h: 2.0, hh: 2.2, target: 1.4 }}
              history={[1.4, 1.41, 1.39, 1.4, 1.4, 1.38, 1.15, 1.1, 1.11, 1.09, 1.1]}
              priority={2}
            />
            <div className="mt-3 flex gap-2">
              <ModeChip mode="AUT" />
              <ModeChip mode="MAN" />
              <ModeChip mode="CAS" />
            </div>
          </div>
        </div>
        <div className="mt-10 max-w-[900px]">
          <Sub>Barra de mancal sobre zonas ISO 20816-3</Sub>
          <div className="grid grid-cols-[120px_1fr_100px_140px] items-center gap-4">
            <div>
              <div className="text-[13px]">CS23 · LC</div>
              <Tag>VI-5123B</Tag>
            </div>
            <BearingBar value={3.4} limits={ISO} weekAgo={2.9} />
            <Num unit="mm/s" className="text-[13px] font-semibold text-iso-c-line">
              3,4
            </Num>
            <div className="flex items-center gap-2">
              <TemperatureBar value={77} className="w-20" />
              <Num unit="°C" className="text-[12px]">
                77
              </Num>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
