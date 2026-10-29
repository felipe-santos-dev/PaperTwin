import type { DataSource } from './useDataSource';

/**
 * De onde vêm os números que a tela mostra.
 *
 * É um selo separado do de severidade de propósito. Enquanto os dois eram o
 * mesmo, a API fora do ar pintava "Crítico" no cabeçalho — a cor da máquina
 * quebrada para dizer que o servidor não respondeu. Quem olhasse de longe leria
 * exatamente a coisa errada.
 *
 * Aqui nenhum estado empresta a cor do semáforo de vibração: ou a fonte está
 * viva, ou é um instantâneo, ou não há dado nenhum.
 */

interface Style {
  readonly label: string;
  readonly title: string;
  readonly className: string;
}

const STYLES: Record<DataSource, Style> = {
  checking: {
    label: 'Consultando',
    title: 'Procurando a API',
    className: 'bg-white/5 text-mill-muted ring-white/10',
  },
  live: {
    label: 'Ao vivo',
    title: 'Dados vindo da API',
    className: 'bg-mill-accent/15 text-mill-fg ring-mill-accent/40',
  },
  demo: {
    label: 'Demonstração',
    title: 'API fora do ar; mostrando o instantâneo gerado no build',
    className: 'bg-mill-attention/12 text-mill-attention ring-mill-attention/30',
  },
  offline: {
    label: 'Sem dados',
    title: 'Nem a API nem o instantâneo responderam',
    className: 'bg-white/5 text-mill-muted ring-white/10',
  },
};

export function DataSourcePill({ source }: { readonly source: DataSource }) {
  const style = STYLES[source];

  return (
    <span
      role="status"
      title={style.title}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${style.className}`}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {style.label}
    </span>
  );
}
