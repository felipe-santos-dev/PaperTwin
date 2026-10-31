import { lazy, Suspense, useCallback, useMemo, useState } from 'react';

import { assetByTag, MP1, type AssetTag } from '@mp1/shared';

import type { DataGateway } from '../api/gateway';
import { DEFAULT_VIEW, SCENE_VIEWS, viewForAsset, type SceneView } from '../scene/views';
import type { SceneState } from '../scene/sceneState';
import { AssetPanel } from '../ui/AssetPanel';
import { ScreenTitle } from '../ui/Shell';
import { useAssetDetail, type AssetFetchers } from '../ui/useAssetDetail';

/**
 * Máquina — a cena 3D navegável.
 *
 * É a tela a que se volta: as outras seis respondem perguntas, esta mostra onde
 * as coisas estão. Clicar num mancal abre o painel de vibração dele, que é o
 * caminho curto entre "vi algo estranho na máquina" e "o que esse mancal está
 * fazendo".
 *
 * O three.js entra por `lazy`: é cerca de 1 MB, e quem abre a tela de Turno não
 * deve pagar por ele. O código da cena vem da Fase 2, gerado do modelo
 * declarativo em `mp1.ts` — nenhuma geometria é escrita à mão aqui.
 */

const MachineScene = lazy(() => import('../scene/MachineScene'));

export interface MaquinaScreenProps {
  readonly gateway: DataGateway;
  /** O ativo aberto, quando outra tela pediu. */
  readonly assetTag: string | null;
  readonly onSelect: (assetTag: string | null) => void;
}

export function MaquinaScreen({ gateway, assetTag, onSelect }: MaquinaScreenProps) {
  const selected = assetTag ? assetByTag(MP1, assetTag) : null;

  const [view, setView] = useState<SceneView>(() =>
    selected ? viewForAsset(selected) : DEFAULT_VIEW,
  );
  const [hoveredTag, setHoveredTag] = useState<AssetTag | null>(null);
  const [playing, setPlaying] = useState(true);
  const [doorsOpen, setDoorsOpen] = useState(true);

  const select = useCallback(
    (tag: AssetTag | null) => {
      onSelect(tag);
      const asset = tag ? assetByTag(MP1, tag) : null;
      if (asset) setView(viewForAsset(asset));
    },
    [onSelect],
  );

  const hover = useCallback((tag: AssetTag | null) => {
    setHoveredTag(tag);
  }, []);

  const sceneState: SceneState = useMemo(
    () => ({ selectedTag: assetTag, select, hoveredTag, hover, playing, doorsOpen }),
    [assetTag, select, hoveredTag, hover, playing, doorsOpen],
  );

  /**
   * As buscas vêm do portão, estáveis entre renders.
   *
   * O painel é o da Fase 3, com a tendência de 72 h e a estimativa de vida útil
   * restante já calculadas pelo servidor. Reescrevê-lo daria um segundo painel
   * do mesmo mancal — e dois painéis do mesmo mancal discordam na terceira casa
   * e depois na primeira.
   */
  const fetchers: AssetFetchers = useMemo(
    () => ({
      fetchAsset: (tag, signal) => gateway.asset(tag, signal),
      fetchVibration: (tag, _query, signal) => gateway.vibration(tag, undefined, signal),
    }),
    [gateway],
  );

  const assetData = useAssetDetail(assetTag, fetchers);

  return (
    <>
      <ScreenTitle
        eyebrow="Cena navegável · gerada do modelo declarativo"
        title="MP1"
        aside={`· ${String(MP1.sections.length)} seções`}
        actions={
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => {
                setDoorsOpen((open) => !open);
              }}
              aria-pressed={!doorsOpen}
              className="min-h-11 rounded border border-mill-line px-3 py-1.5 text-sm text-mill-fg transition-colors hover:bg-white/5"
            >
              {doorsOpen ? 'Fechar portas' : 'Abrir portas'}
            </button>
            <button
              type="button"
              onClick={() => {
                setPlaying((running) => !running);
              }}
              aria-pressed={!playing}
              className="min-h-11 rounded border border-mill-line px-3 py-1.5 text-sm text-mill-fg transition-colors hover:bg-white/5"
            >
              {playing ? 'Pausar' : 'Animar'}
            </button>
          </div>
        }
      />

      <div className="flex min-h-0 flex-1 gap-4 max-lg:flex-col">
        <nav
          aria-label="Ir para"
          className="flex shrink-0 flex-col gap-0.5 text-sm max-lg:flex-row max-lg:flex-wrap"
        >
          {SCENE_VIEWS.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              onClick={() => {
                setView(candidate);
              }}
              aria-current={candidate.id === view.id}
              className={`flex min-h-11 items-center justify-between gap-3 rounded px-2.5 py-1.5 text-left transition-colors ${
                candidate.id === view.id
                  ? 'bg-white/6 text-mill-fg'
                  : 'text-mill-muted hover:text-mill-fg'
              }`}
            >
              {candidate.label}
              {candidate.hint && (
                <small className="font-mono text-[11px] text-mill-dim">{candidate.hint}</small>
              )}
            </button>
          ))}
        </nav>

        <div className="relative min-h-80 min-w-0 flex-1 overflow-hidden rounded border border-mill-line">
          <Suspense fallback={<SceneLoading />}>
            <MachineScene view={view} state={sceneState} />
          </Suspense>

          {!selected && (
            <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded border border-mill-line bg-mill-panel/85 px-3 py-1.5 text-xs text-mill-muted backdrop-blur">
              Arraste para girar · role para zoom · clique num mancal
            </p>
          )}
        </div>

        {selected && (
          <aside className="w-96 shrink-0 overflow-auto border-l border-mill-line pl-4 max-lg:w-full max-lg:border-l-0 max-lg:pl-0">
            <AssetPanel
              asset={selected}
              data={assetData}
              onClose={() => {
                onSelect(null);
              }}
            />
          </aside>
        )}
      </div>
    </>
  );
}

function SceneLoading() {
  return (
    <div role="status" className="grid h-full place-items-center text-sm text-mill-muted">
      Carregando a cena 3D…
    </div>
  );
}
