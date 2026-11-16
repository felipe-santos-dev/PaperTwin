import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';

import type { DataGateway } from '../api/gateway';
import {
  dynamicIndex,
  KIND_LABEL,
  search,
  staticIndex,
  type SearchItem,
  type SearchKind,
} from './search';
import type { ScreenId } from './screens';

/**
 * A busca da moldura: um campo só, que acha qualquer coisa e abre onde ela
 * mora.
 *
 * O caminho que ela encurta é real: achar o `PDIC-523` hoje é lembrar que ΔP de
 * sifão é pré-secagem, abrir Processo, escolher a seção e correr a lista. Aqui
 * são três teclas e um Enter.
 *
 * Escolher um resultado **abre a tela certa já com o item selecionado**, pelos
 * mesmos caminhos que as telas usam entre si — o alarme que abre a tendência, a
 * ronda que abre o mancal. A busca não ganhou um jeito próprio de navegar.
 */

export interface SearchBoxProps {
  /** `null` enquanto a fonte de dados não foi escolhida. */
  readonly gateway: DataGateway | null;
  readonly onScreen: (id: ScreenId) => void;
  readonly onTag: (tag: string) => void;
  readonly onBearing: (assetTag: string) => void;
  readonly onReel: (number: number) => void;
  readonly onNote: (number: string) => void;
}

export function SearchBox({ gateway, onScreen, onTag, onBearing, onReel, onNote }: SearchBoxProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [extra, setExtra] = useState<readonly SearchItem[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const loaded = useRef(false);

  /** O índice estático é o mesmo a sessão inteira: montar uma vez basta. */
  const base = useMemo(() => staticIndex(), []);
  const items = useMemo(() => [...base, ...extra], [base, extra]);
  const hits = useMemo(() => search(items, query), [items, query]);

  /**
   * Bobinas e notas entram na primeira vez que alguém abre a busca.
   *
   * São duas requisições que as telas já fazem, e quem nunca busca não paga por
   * elas. Se falharem, a busca continua valendo para telas, TAGs e mancais —
   * meia busca é melhor que um erro na moldura.
   */
  const loadDynamic = useCallback((): void => {
    if (loaded.current || !gateway) return;
    loaded.current = true;
    void (async () => {
      try {
        const [reels, notes] = await Promise.all([
          gateway.reels({ limit: 40 }),
          gateway.notes({ limit: 100 }),
        ]);
        setExtra(dynamicIndex(reels.reels, notes.notes));
      } catch {
        loaded.current = false;
      }
    })();
  }, [gateway]);

  /** `/` e `Ctrl+K` de qualquer lugar, menos de dentro de um campo de texto. */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target;
      const typing =
        target instanceof HTMLElement &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

      const slash = event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey;
      const palette = event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey);
      if (!slash && !palette) return;
      if (slash && typing) return;

      event.preventDefault();
      input.current?.focus();
      input.current?.select();
      loadDynamic();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [loadDynamic]);

  /** Clique fora fecha a lista, e o que foi digitado continua no campo. */
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent): void => {
      const target = event.target as Node | null;
      if (target && box.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  const choose = (item: SearchItem): void => {
    setOpen(false);
    setQuery('');
    input.current?.blur();

    switch (item.kind) {
      case 'tela':
        onScreen(item.id as ScreenId);
        return;
      case 'tag':
        onTag(item.id);
        return;
      case 'mancal':
        onBearing(item.id);
        return;
      case 'bobina':
        onReel(Number(item.id));
        return;
      case 'nota':
        onNote(item.id);
        return;
    }
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      if (open) setOpen(false);
      else setQuery('');
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (hits.length === 0) return;
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((current) => (current + step + hits.length) % hits.length);
      return;
    }
    if (event.key === 'Enter') {
      const item = hits[active];
      if (item) {
        event.preventDefault();
        choose(item);
      }
    }
  };

  const listId = 'busca-resultados';
  const showing = open && query.trim().length > 0;

  return (
    <div ref={box} className="relative flex min-w-0 flex-1 justify-center">
      {/* o piso de 200 px é o que impede a barra apertada de espremer o campo a nada */}
      <div className="flex min-w-[200px] max-w-[420px] flex-1 items-center gap-2 border border-line-strong bg-base px-2 focus-within:border-action">
        <span aria-hidden="true" className="text-[12px] text-fg-3">
          ⌕
        </span>
        <input
          ref={input}
          type="search"
          role="combobox"
          aria-expanded={showing}
          aria-controls={showing ? listId : undefined}
          aria-activedescendant={showing ? `${listId}-${String(active)}` : undefined}
          aria-autocomplete="list"
          aria-label="Buscar tela, TAG, mancal, bobina ou nota"
          placeholder="Buscar TAG, mancal, bobina, nota"
          value={query}
          onFocus={() => {
            loadDynamic();
            setOpen(true);
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          className="h-7 min-w-0 flex-1 bg-transparent text-[12px] text-fg placeholder:text-fg-3 focus:outline-none"
        />
        <kbd
          aria-hidden="true"
          className="hidden border border-line-strong px-1 font-mono text-[10px] text-fg-3 xl:block"
        >
          /
        </kbd>
      </div>

      {showing ? (
        <div
          id={listId}
          role="listbox"
          aria-label="Resultados da busca"
          className="absolute top-9 left-1/2 z-40 max-h-[420px] w-[520px] max-w-[calc(100vw-120px)] -translate-x-1/2 overflow-y-auto border border-line-strong bg-chrome py-1 shadow-[0_12px_32px_rgba(0,0,0,0.5)]"
        >
          {hits.length === 0 ? (
            <p className="px-3 py-2 text-[12px] text-fg-3">Nada com “{query}”.</p>
          ) : (
            hits.map((item, index) => (
              <Result
                key={`${item.kind}-${item.id}`}
                id={`${listId}-${String(index)}`}
                item={item}
                active={index === active}
                first={index === 0 || hits[index - 1]?.kind !== item.kind}
                onPick={() => {
                  choose(item);
                }}
                onHover={() => {
                  setActive(index);
                }}
              />
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function Result({
  id,
  item,
  active,
  first,
  onPick,
  onHover,
}: {
  readonly id: string;
  readonly item: SearchItem;
  readonly active: boolean;
  /** O primeiro do seu tipo leva o rótulo do grupo. */
  readonly first: boolean;
  readonly onPick: () => void;
  readonly onHover: () => void;
}) {
  return (
    <>
      {first ? (
        <div className="px-3 pt-2 pb-1 text-[10px] tracking-[0.06em] text-fg-3 uppercase">
          {KIND_LABEL[item.kind]}
        </div>
      ) : null}
      <div
        id={id}
        role="option"
        aria-selected={active}
        tabIndex={-1}
        onMouseDown={(event) => {
          // sem isto o campo perde o foco antes do clique chegar
          event.preventDefault();
        }}
        onMouseEnter={onHover}
        onClick={onPick}
        className={`grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 px-3 py-1.5 ${
          active ? 'bg-hover' : ''
        }`}
      >
        <span className="min-w-0 truncate text-[13px] text-fg">
          {isTagLike(item.kind) ? (
            <span className="mr-2 font-mono text-[12px] text-fg-2">{item.id}</span>
          ) : null}
          {item.label}
        </span>
        <span className="shrink-0 text-[11px] text-fg-3">{item.detail}</span>
      </div>
    </>
  );
}

function isTagLike(kind: SearchKind): boolean {
  return kind === 'tag' || kind === 'mancal';
}
