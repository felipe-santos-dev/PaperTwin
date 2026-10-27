import { useEffect, useState } from 'react';
import { SECTION_IDS } from '@mp1/shared';
import { fetchHealth } from './api/client';
import { PreviewScene } from './scene/PreviewScene';
import { StatusPill } from './ui/StatusPill';

const SECTION_LABELS: Record<(typeof SECTION_IDS)[number], string> = {
  headbox: 'Caixa de entrada',
  forming: 'Formação',
  press: 'Prensas',
  'pre-dryer': 'Pré-secagem',
  'scanner-1': 'Scanner 1',
  'speed-sizer': 'Speed Sizer',
  'post-dryer': 'Pós-secagem',
  calender: 'Calandra',
  'scanner-2': 'Scanner final',
  'pope-reel': 'Enroladeira Pope',
};

type ApiState = 'checking' | 'up' | 'down';

function useApiHealth(): ApiState {
  const [state, setState] = useState<ApiState>('checking');

  useEffect(() => {
    const controller = new AbortController();
    fetchHealth(controller.signal)
      .then((health) => {
        setState(health.status === 'ok' ? 'up' : 'down');
      })
      .catch(() => {
        if (!controller.signal.aborted) setState('down');
      });
    return () => {
      controller.abort();
    };
  }, []);

  return state;
}

const API_LABEL: Record<ApiState, string> = {
  checking: 'consultando a API…',
  up: 'API no ar',
  down: 'API fora do ar',
};

export function App() {
  const api = useApiHealth();

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-4 border-b border-mill-line px-5 py-3">
        <div className="grid size-8 place-items-center rounded-lg bg-mill-accent font-semibold">
          P
        </div>
        <div>
          <h1 className="text-sm font-semibold">Papermill-Twin</h1>
          <p className="text-[11px] tracking-wide text-mill-muted uppercase">
            Máquina de papel · MP1
          </p>
        </div>
        <span className="ml-auto font-mono text-xs text-mill-muted">{API_LABEL[api]}</span>
        <StatusPill health={api === 'up' ? 'normal' : api === 'down' ? 'critical' : 'attention'} />
      </header>

      <div className="flex min-h-0 flex-1">
        <nav className="w-60 shrink-0 border-r border-mill-line p-4">
          <p className="mb-3 text-[11px] font-semibold tracking-widest text-mill-muted uppercase">
            Seções da máquina
          </p>
          <ul className="space-y-0.5">
            {SECTION_IDS.map((id) => (
              <li
                key={id}
                className="rounded-md px-2 py-1.5 text-sm text-mill-muted/90 hover:bg-white/5"
              >
                {SECTION_LABELS[id]}
              </li>
            ))}
          </ul>
        </nav>

        <main className="relative min-w-0 flex-1">
          <PreviewScene />
          <p className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-md border border-mill-line bg-mill-panel/80 px-3 py-1.5 text-xs text-mill-muted backdrop-blur">
            Fase 0 · esboço da parte seca. Arraste para girar, role para zoom.
          </p>
        </main>
      </div>
    </div>
  );
}
