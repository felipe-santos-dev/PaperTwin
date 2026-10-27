import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import { assetByTag, MP1, type AssetTag } from '@mp1/shared';
import { fetchHealth } from './api/client';
import type { SceneState } from './scene/sceneState';
import { DEFAULT_VIEW, SCENE_VIEWS, type SceneView } from './scene/views';
import { AssetCard } from './ui/AssetCard';
import { StatusPill } from './ui/StatusPill';
import { useApiHealth } from './ui/useApiHealth';

/**
 * O three.js só é baixado quando a cena entra — é cerca de 1 MB que não pesa no
 * primeiro carregamento.
 */
const MachineScene = lazy(() => import('./scene/MachineScene'));

const API_LABEL = {
  checking: 'consultando a API…',
  up: 'API no ar',
  down: 'API fora do ar',
} as const;

export function App() {
  const api = useApiHealth(fetchHealth);

  const [view, setView] = useState<SceneView>(DEFAULT_VIEW);
  const [selectedTag, setSelectedTag] = useState<AssetTag | null>(null);
  const [hoveredTag, setHoveredTag] = useState<AssetTag | null>(null);
  const [playing, setPlaying] = useState(true);
  const [doorsOpen, setDoorsOpen] = useState(true);

  const select = useCallback((tag: AssetTag | null) => {
    setSelectedTag(tag);
  }, []);
  const hover = useCallback((tag: AssetTag | null) => {
    setHoveredTag(tag);
  }, []);

  const sceneState: SceneState = useMemo(
    () => ({ selectedTag, select, hoveredTag, hover, playing, doorsOpen }),
    [selectedTag, select, hoveredTag, hover, playing, doorsOpen],
  );

  const selected = selectedTag ? assetByTag(MP1, selectedTag) : null;

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
        <span className="ml-auto font-mono text-xs text-mill-muted">{API_LABEL[api]}</span>
        <StatusPill health={api === 'up' ? 'normal' : api === 'down' ? 'critical' : 'attention'} />
      </header>

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
            <AssetCard
              asset={selected}
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
