import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import { assetByTag, MP1, type AssetTag, type IsoZone } from '@mp1/shared';

import type { SceneState } from '../../scene/sceneState';
import { DEFAULT_VIEW, viewForAsset } from '../../scene/views';
import { Panel } from '../../ui/Panel';

/**
 * Vista 3D da máquina, dentro da tela de Mancais.
 *
 * É a cena real, a mesma da tela Máquina, em tamanho reduzido: os mancais com
 * a cor da zona ISO e o clique sincronizado com a lista nos dois sentidos —
 * escolher na lista enquadra o mancal na cena, clicar na cena escolhe na lista.
 *
 * O three.js entra por `lazy`, como na tela Máquina: o pedaço só é baixado
 * quando este painel aparece, e o carregamento inicial continua sem ele.
 */

const MachineScene = lazy(() => import('../../scene/MachineScene'));

const ZONE_SWATCH: readonly { zone: IsoZone | null; label: string; className: string }[] = [
  { zone: 'A', label: 'A', className: 'bg-iso-a border border-fg-3' },
  { zone: 'B', label: 'B', className: 'bg-iso-b border border-fg-3' },
  { zone: 'C', label: 'C', className: 'bg-iso-c-line' },
  { zone: 'D', label: 'D', className: 'bg-iso-d-line' },
  { zone: null, label: 'sem leitura', className: 'border border-dashed border-fg-3' },
];

export function Scene3DPanel({
  selected,
  onSelect,
  zones,
  className = '',
}: {
  readonly selected: string | null;
  readonly onSelect: (assetTag: string) => void;
  readonly zones: ReadonlyMap<AssetTag, IsoZone>;
  readonly className?: string;
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
    }),
    [selected, select, hovered],
  );

  return (
    <Panel
      help="mancais.cena"
      title="Vista 3D da máquina"
      aside={
        <span className="font-mono">mancais pela zona ISO · clique sincroniza com a lista</span>
      }
      className={className}
      bodyClassName="relative min-h-0 overflow-hidden border border-line"
    >
      <Suspense
        fallback={
          <div role="status" className="grid h-full place-items-center text-[12px] text-fg-3">
            Carregando a cena 3D…
          </div>
        }
      >
        <MachineScene view={view} state={state} bearingZones={zones} />
      </Suspense>
      <ul className="absolute bottom-3 left-3 flex items-center gap-3 border border-line bg-panel/90 px-2.5 py-1 text-[11px] text-fg-2">
        {ZONE_SWATCH.map((item) => (
          <li key={item.label} className="flex items-center gap-1.5">
            <span className={`size-2.5 ${item.className}`} />
            {item.label}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
