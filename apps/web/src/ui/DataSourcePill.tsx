import type { DataSource } from './useDataSource';
import type { StreamState } from './useStream';

/**
 * De onde vêm os números que a tela mostra.
 *
 * É um selo separado do de severidade de propósito: a API fora do ar não pode
 * pintar a cor de máquina com problema no cabeçalho. Os estados são os do
 * sistema visual — AO VIVO com ponto cheio, DEMONSTRAÇÃO tracejado com ponto
 * vazado, SEM DADOS com traço. O vermelho do SEM DADOS diz "não há o que ler",
 * e o traço no lugar do ponto o separa de um alarme.
 *
 * ## AO VIVO é sobre a ligação, não só sobre a fonte
 *
 * A fonte ser a API não basta para o selo dizer AO VIVO. Enquanto o stream não
 * abre, ou depois de ele cair, os números na tela são o último retrato que
 * chegou — e "AO VIVO" sobre um relógio parado é a afirmação mais enganosa que
 * este painel conseguiria fazer. Então a ligação caída tem o seu próprio
 * estado: SEM SINAL, com o ponto vazado da demonstração, porque é a mesma
 * verdade ("isto não é agora") por outra causa. O `title` diz qual é a causa.
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

/**
 * A fonte é a API, mas o stream não está de pé.
 *
 * `connecting` é o instante entre abrir a tela e o primeiro evento, e dura
 * frações de segundo no caso normal — merece um rótulo próprio para não
 * aparecer como falha o que é só a abertura.
 */
const STYLES_NO_SIGNAL: Record<Exclude<StreamState, 'open'>, Style> = {
  off: {
    label: 'Ao vivo',
    title: 'Dados vindo da API',
    box: 'border-fg-3 text-fg',
    mark: 'size-[7px] rounded-full bg-current',
  },
  connecting: {
    label: 'Conectando',
    title: 'Abrindo o stream ao vivo da API',
    box: 'border-line-strong text-fg-3',
    mark: 'size-[7px] rounded-full border border-current',
  },
  down: {
    label: 'Sem sinal',
    title:
      'A API respondeu, mas o stream ao vivo caiu: os números são do último evento que chegou. ' +
      'O navegador tenta reconectar sozinho.',
    box: 'border-dashed border-alarm-3 text-alarm-3',
    mark: 'size-[7px] rounded-full border border-current',
  },
};

export function DataSourcePill({
  source,
  stream = 'off',
}: {
  readonly source: DataSource;
  /** Em que pé está o stream; só importa quando a fonte é a API. */
  readonly stream?: StreamState;
}) {
  const style = source === 'live' && stream !== 'open' ? STYLES_NO_SIGNAL[stream] : STYLES[source];

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
