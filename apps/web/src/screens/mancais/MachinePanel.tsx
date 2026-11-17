import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import { assetByTag, MP1, type AssetTag, type IsoZone } from '@mp1/shared';

import type { SceneState } from '../../scene/sceneState';
import { DEFAULT_VIEW, viewForAsset } from '../../scene/views';
import { Panel } from '../../ui/Panel';
import type { BearingRow } from './derive';
import { MachineMap2D } from './MachineMap2D';

/**
 * Onde o mancal está na máquina — em mapa, e em 3D a um clique.
 *
 * O padrão é o mapa 2D: ele responde "onde, na máquina, está o que está pior"
 * em um quadro, sem baixar nada. A cena 3D continua aqui, atrás do botão, e o
 * pedaço do three só é pedido quando alguém clica — numa tela que existe para
 * ler vibração, 1,7 MB de biblioteca e 3,6 MB de cena não podem ser o pedágio
 * de entrada.
 *
 * A tela de Máquina continua com o 3D em tela cheia; é lá que ele é o assunto.
 */

const MachineScene = lazy(() => import('../../scene/MachineScene'));

const LEGENDA: readonly { zone: IsoZone | null; label: string; cor: string | null }[] = [
  { zone: 'A', label: 'A·B', cor: 'var(--color-fg-3)' },
  { zone: 'C', label: 'C', cor: 'var(--color-iso-c-line)' },
  { zone: 'D', label: 'D', cor: 'var(--color-iso-d-line)' },
  { zone: null, label: 'sem leitura', cor: null },
];

export function MachinePanel({
  rows,
  selected,
  onSelect,
  zones,
  className = '',
}: {
  readonly rows: readonly BearingRow[];
  readonly selected: string | null;
  readonly onSelect: (assetTag: string) => void;
  readonly zones: ReadonlyMap<AssetTag, IsoZone>;
  readonly className?: string;
}) {
  const [tridimensional, setTridimensional] = useState(false);

  return (
    <Panel
      help="mancais.mapa"
      title="Máquina · mancais"
      label="Máquina · mancais"
      aside={
        <span className="flex items-center gap-3">
          <ul className="flex items-center gap-2.5">
            {LEGENDA.map((item) => (
              <li key={item.label} className="flex items-center gap-1">
                <span
                  aria-hidden="true"
                  className={`size-2 rounded-full ${item.cor ? '' : 'border border-dashed border-fg-3'}`}
                  style={item.cor ? { background: item.cor } : undefined}
                />
                {item.label}
              </li>
            ))}
          </ul>
          <button
            type="button"
            aria-pressed={tridimensional}
            onClick={() => {
              setTridimensional((valor) => !valor);
            }}
            className="h-6 border border-line-strong px-2 text-[11px] text-fg-2 hover:border-action hover:text-action"
          >
            {tridimensional ? 'ver o mapa' : 'ver em 3D'}
          </button>
        </span>
      }
      className={className}
      bodyClassName={
        tridimensional
          ? 'relative min-h-0 overflow-hidden border border-line'
          : 'flex min-h-0 flex-col overflow-hidden'
      }
    >
      {tridimensional ? (
        <Cena selected={selected} onSelect={onSelect} zones={zones} />
      ) : (
        <MachineMap2D
          rows={rows}
          selected={selected}
          onSelect={onSelect}
          className="min-h-0 w-full flex-1"
        />
      )}
    </Panel>
  );
}

/**
 * A cena de verdade, a mesma da tela de Máquina, em tamanho reduzido.
 *
 * Fica num componente à parte para o `lazy` só ser exercido quando ele entra —
 * é o que mantém o three fora da tela de Mancais enquanto ninguém pede.
 */
function Cena({
  selected,
  onSelect,
  zones,
}: {
  readonly selected: string | null;
  readonly onSelect: (assetTag: string) => void;
  readonly zones: ReadonlyMap<AssetTag, IsoZone>;
}) {
  const [hovered, setHovered] = useState<AssetTag | null>(null);
  const asset = selected ? assetByTag(MP1, selected) : null;
  const view = useMemo(() => (asset ? viewForAsset(asset) : DEFAULT_VIEW), [asset]);

  const select = useCallback(
    (tag: AssetTag | null) => {
      if (tag && assetByTag(MP1, tag)?.kind === 'bearing') onSelect(tag);
    },
    [onSelect],
  );

  const state: SceneState = useMemo(
    () => ({
      selectedTag: selected,
      select,
      hoveredTag: hovered,
      hover: setHovered,
      playing: true,
      steam: false,
    }),
    [selected, select, hovered],
  );

  return (
    <Suspense
      fallback={
        <div role="status" className="grid h-full place-items-center text-[12px] text-fg-3">
          Carregando a cena 3D…
        </div>
      }
    >
      <MachineScene view={view} state={state} bearingZones={zones} />
    </Suspense>
  );
}
