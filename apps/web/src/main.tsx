import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

const container = document.getElementById('root');
if (!container) throw new Error('Elemento #root não encontrado em index.html');

/**
 * `#sistema` abre as amostras do sistema visual, para revisão contra o design.
 *
 * Só fora do build de produção: lá a condição vira `false` na compilação e o
 * import some do pacote.
 */
const SistemaScreen =
  import.meta.env.MODE !== 'production'
    ? lazy(() =>
        import('./screens/SistemaScreen').then((module) => ({ default: module.SistemaScreen })),
      )
    : null;
const showSystem = SistemaScreen !== null && window.location.hash === '#sistema';

createRoot(container).render(
  <StrictMode>
    {showSystem && SistemaScreen ? (
      <Suspense fallback={null}>
        <SistemaScreen />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
);
