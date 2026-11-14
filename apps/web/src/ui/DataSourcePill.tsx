import type { DataSource } from './useDataSource';

/**
 * De onde vêm os números que a tela mostra.
 *
 * É um selo separado do de severidade de propósito: a API fora do ar não pode
 * pintar a cor de máquina com problema no cabeçalho. Os três estados são os do
 * sistema visual — AO VIVO com ponto cheio, DEMONSTRAÇÃO tracejado com ponto
 * vazado, SEM DADOS com traço. O vermelho do SEM DADOS diz "não há o que ler",
 * e o traço no lugar do ponto o separa de um alarme.
 */

interface Style {
  readonly label: string;
  readonly title: string;
  readonly box: string;
  readonly mark: string;
}

const STYLES: Record<DataSource, Style> = {
  checking: {
    label: 'Consultando',
    title: 'Procurando a API',
    box: 'border-line-strong text-fg-3',
    mark: 'size-[7px] rounded-full border border-current',
  },
  live: {
    label: 'Ao vivo',
    title: 'Dados vindo da API',
    box: 'border-fg-3 text-fg',
    mark: 'size-[7px] rounded-full bg-current',
  },
  demo: {
    label: 'Demonstração',
    title: 'API fora do ar; mostrando o instantâneo gerado no build',
    box: 'border-dashed border-tick text-fg-2',
    mark: 'size-[7px] rounded-full border border-current',
  },
  offline: {
    label: 'Sem dados',
    title: 'Nem a API nem o instantâneo responderam',
    box: 'border-alarm-1 text-alarm-1',
    mark: 'h-px w-2 bg-current',
  },
};

export function DataSourcePill({ source }: { readonly source: DataSource }) {
  const style = STYLES[source];

  return (
    <span
      role="status"
      title={style.title}
      className={`inline-flex h-6 shrink-0 items-center gap-1.5 border px-2 text-[11px] tracking-[0.04em] uppercase ${style.box}`}
    >
      <span className={`shrink-0 ${style.mark}`} aria-hidden="true" />
      {style.label}
    </span>
  );
}
