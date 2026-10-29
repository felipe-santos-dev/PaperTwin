import type { AssetHealth } from '@mp1/shared';

interface Style {
  readonly label: string;
  readonly className: string;
}

const STYLES: Record<AssetHealth, Style> = {
  normal: {
    label: 'Normal',
    className: 'bg-mill-normal/12 text-mill-normal ring-mill-normal/30',
  },
  attention: {
    label: 'Atenção',
    className: 'bg-mill-attention/12 text-mill-attention ring-mill-attention/30',
  },
  critical: {
    label: 'Crítico',
    className: 'bg-mill-critical/12 text-mill-critical ring-mill-critical/35',
  },
};

/**
 * Ausência de leitura não é uma quarta severidade: é a falta de base para dizer
 * qualquer uma das três. Por isso tem o cinza do texto secundário, e não uma cor
 * do semáforo.
 */
const NO_DATA: Style = {
  label: 'Sem dados',
  className: 'bg-white/5 text-mill-muted ring-white/10',
};

export interface StatusPillProps {
  /** `null` quando não há leitura — mostra "Sem dados", nunca uma severidade. */
  readonly health: AssetHealth | null;
}

/** Selo de severidade de um ativo, derivado da zona da ISO 20816. */
export function StatusPill({ health }: StatusPillProps) {
  const style = health === null ? NO_DATA : STYLES[health];

  return (
    <span
      role="status"
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${style.className}`}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {style.label}
    </span>
  );
}
