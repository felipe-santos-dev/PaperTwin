import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import { assetByTag, MP1, type AssetTag } from '@mp1/shared';
import { fetchAsset, fetchHealth, fetchVibration } from './api/client';
import { fetchDemoAsset, fetchDemoHealth, fetchDemoVibration } from './api/demo';
import { DataSourcePill } from './ui/DataSourcePill';
import { useDataSource, type DataSourceProbes } from './ui/useDataSource';
import type { SceneState } from './scene/sceneState';
import { DEFAULT_VIEW, SCENE_VIEWS, viewForAsset, type SceneView } from './scene/views';
import { AssetPanel } from './ui/AssetPanel';
import { useAssetDetail, type AssetFetchers } from './ui/useAssetDetail';
import { useAssetSelection } from './ui/useAssetUrl';

/** Estáveis entre renders, para os hooks não refazerem a busca à toa. */
const LIVE_FETCHERS: AssetFetchers = { fetchAsset, fetchVibration };
const DEMO_FETCHERS: AssetFetchers = {
  fetchAsset: fetchDemoAsset,
  fetchVibration: fetchDemoVibration,
};

const PROBES: DataSourceProbes = { probeApi: fetchHealth, probeDemo: fetchDemoHealth };

/**
 * O three.js só é baixado quando a cena entra — é cerca de 1 MB que não pesa no
 * primeiro carregamento.
 */
const MachineScene = lazy(() => import('./scene/MachineScene'));

const SOURCE_LABEL = {
  checking: 'procurando a API…',
  live: 'API no ar',
  demo: 'API fora do ar',
  offline: 'sem fonte de dados',
} as const;

export function App() {
  const source = useDataSource(PROBES);

  const { selectedTag, selected, select, initialTag } = useAssetSelection();

  /** Abrir por `?asset=` já enquadra a câmera no ativo pedido. */
  const [view, setView] = useState<SceneView>(() => {
    const asset = initialTag ? assetByTag(MP1, initialTag) : null;
    return asset ? viewForAsset(asset) : DEFAULT_VIEW;
  });

  const [hoveredTag, setHoveredTag] = useState<AssetTag | null>(null);
  const [playing, setPlaying] = useState(true);
  const [doorsOpen, setDoorsOpen] = useState(true);

  const hover = useCallback((tag: AssetTag | null) => {
    setHoveredTag(tag);
  }, []);

  const sceneState: SceneState = useMemo(
    () => ({ selectedTag, select, hoveredTag, hover, playing, doorsOpen }),
    [selectedTag, select, hoveredTag, hover, playing, doorsOpen],
  );

  /**
   * A fonte é escolhida uma vez. Enquanto ela não se decide, nenhuma busca sai:
   * pedir à API e ao instantâneo ao mesmo tempo mostraria o que chegasse antes.
   */
  const assetData = useAssetDetail(
    source === 'checking' ? null : selectedTag,
    source === 'demo' ? DEMO_FETCHERS : LIVE_FETCHERS,
  );

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-4 border-b border-mill-line px-5 py-3">
        <div className="grid size-8 place-items-center rounded-lg bg-mill-accent font-semibold">
          P
        </div>
        <div>
          <h1 className="text-sm font-semibold">Papermill-Twin</h1>
          <p className="text-[11px] tracking-wide text-mill-muted uppercase">
            {MP1.label} · tags fictícias
          </p>
        </div>
        <span className="ml-auto font-mono text-xs text-mill-muted">{SOURCE_LABEL[source]}</span>
        <DataSourcePill source={source} />
      </header>

      {source === 'demo' && (
        <p
          role="status"
          className="flex items-center justify-center gap-2 border-b border-mill-attention/25 bg-mill-attention/8 px-5 py-1.5 text-xs text-mill-attention"
        >
          <span aria-hidden="true">●</span>
          Dados de demonstração · API offline
          <span className="text-mill-attention/70">
            — instantâneo de 72 h gerado no build, não é leitura ao vivo
          </span>
        </p>
      )}

      <div className="flex min-h-0 flex-1">
        <nav className="flex w-60 shrink-0 flex-col gap-4 border-r border-mill-line p-4">
          <div>
            <p className="mb-2 text-[11px] font-semibold tracking-widest text-mill-muted uppercase">
              Ir para
            </p>
            <ul className="space-y-0.5">
              {SCENE_VIEWS.map((candidate) => (
                <li key={candidate.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setView(candidate);
                    }}
                    aria-current={candidate.id === view.id}
                    className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                      candidate.id === view.id
                        ? 'bg-mill-accent/15 text-mill-fg ring-1 ring-mill-accent/40'
                        : 'text-mill-muted hover:bg-white/5'
                    }`}
                  >
                    {candidate.label}
                    {candidate.hint && (
                      <small className="font-mono text-[11px] text-mill-muted">
                        {candidate.hint}
                      </small>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-2 text-[11px] font-semibold tracking-widest text-mill-muted uppercase">
              Cena
            </p>
            <div className="flex gap-2">
              <ToggleButton
                pressed={!doorsOpen}
                onClick={() => {
                  setDoorsOpen((open) => !open);
                }}
              >
                {doorsOpen ? 'Fechar portas' : 'Abrir portas'}
              </ToggleButton>
              <ToggleButton
                pressed={!playing}
                onClick={() => {
                  setPlaying((running) => !running);
                }}
              >
                {playing ? 'Pausar' : 'Animar'}
              </ToggleButton>
            </div>
          </div>
        </nav>

        <main className="relative min-w-0 flex-1">
          <Suspense fallback={<SceneLoading />}>
            <MachineScene view={view} state={sceneState} />
          </Suspense>

          {selected ? (
            <AssetPanel
              asset={selected}
              data={assetData}
              onClose={() => {
                select(null);
              }}
            />
          ) : (
            <p className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-md border border-mill-line bg-mill-panel/80 px-3 py-1.5 text-xs text-mill-muted backdrop-blur">
              Arraste para girar · role para zoom · clique num mancal
            </p>
          )}
        </main>
      </div>
    </div>
  );
}

function ToggleButton({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      className="flex-1 rounded-md border border-mill-line px-2 py-1.5 text-xs text-mill-fg transition-colors hover:bg-white/5"
    >
      {children}
    </button>
  );
}

function SceneLoading() {
  return (
    <div className="grid h-full place-items-center text-sm text-mill-muted">
      Carregando a cena 3D…
    </div>
  );
}
