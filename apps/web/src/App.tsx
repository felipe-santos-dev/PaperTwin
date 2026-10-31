import { useCallback, useMemo, useState } from 'react';

import { DEMO_GATEWAY } from './api/demo-gateway';
import { fetchDemoHealth } from './api/demo';
import { fetchHealth } from './api/client';
import { LIVE_GATEWAY, type DataGateway } from './api/gateway';
import { BobinasScreen } from './screens/BobinasScreen';
import { MancaisScreen } from './screens/MancaisScreen';
import { MaquinaScreen } from './screens/MaquinaScreen';
import { NotasScreen } from './screens/NotasScreen';
import { ProcessoScreen } from './screens/ProcessoScreen';
import { RondasScreen } from './screens/RondasScreen';
import { TurnoScreen } from './screens/TurnoScreen';
import { DataSourcePill } from './ui/DataSourcePill';
import { Shell } from './ui/Shell';
import { dayTime, int, tagValue } from './ui/format';
import { useScreen } from './ui/screens';
import { useAssetSelection } from './ui/useAssetUrl';
import { useDataSource, type DataSourceProbes } from './ui/useDataSource';
import { useResource } from './ui/useResource';

/** Estáveis entre renders, para os hooks não refazerem a busca à toa. */
const PROBES: DataSourceProbes = { probeApi: fetchHealth, probeDemo: fetchDemoHealth };

/**
 * A aplicação: sete telas sobre uma fonte de dados escolhida uma vez.
 *
 * ## A seleção entre telas é estado da aplicação, não de cada tela
 *
 * Quando a tela de Notas manda abrir a tendência de `VI-5123A`, quem muda de
 * tela e carrega a tag é aqui. Se cada tela guardasse a sua própria seleção,
 * atravessar de uma para outra perderia o contexto — e atravessar é justamente o
 * que alguém faz quando investiga: do alarme para o mancal, do mancal para a
 * nota, da nota para a tendência.
 *
 * ## O cabeçalho é sempre o mesmo
 *
 * Velocidade, gramatura, bobina em formação e vapor do grupo principal ficam no
 * alto de todas as sete telas. São os quatro números que dizem se a máquina está
 * produzindo, e tirá-los de uma tela faria quem está nela ter de voltar para
 * saber.
 */
export function App() {
  const { source, apiRecovered, useLive } = useDataSource(PROBES);
  const { screen, go } = useScreen();

  const gateway: DataGateway | null = useMemo(() => {
    if (source === 'checking') return null;
    return source === 'demo' ? DEMO_GATEWAY : LIVE_GATEWAY;
  }, [source]);

  const [reel, setReel] = useState<number | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [bearing, setBearing] = useState<string | null>(null);

  /**
   * O ativo da cena continua espelhado em `?asset=`.
   *
   * É a feature da Fase 3 que transforma "olha esse mancal" num link em vez de
   * um roteiro de cliques, e ela não deveria desaparecer porque o aplicativo
   * ganhou telas. Abrir com `?asset=` leva direto à tela de Máquina com a câmera
   * enquadrada.
   */
  const { selectedTag: asset, select: setAsset, initialTag } = useAssetSelection();

  const [opened, setOpened] = useState(false);
  if (!opened && initialTag !== null) {
    setOpened(true);
    go('maquina');
  }

  /** Abre a tendência de uma tag na tela de Processo. */
  const openTrend = useCallback(
    (which: string) => {
      setTag(which);
      go('processo');
    },
    [go],
  );

  /** Abre um mancal na tela de Mancais. */
  const openBearing = useCallback(
    (which: string) => {
      setBearing(which);
      go('mancais');
    },
    [go],
  );

  const openReel = useCallback(
    (which: number) => {
      setReel(which);
      go('bobinas');
    },
    [go],
  );

  const headline = useHeadline(gateway);

  return (
    <Shell
      screen={screen}
      go={go}
      headline={headline.values}
      stamp={headline.stamp}
      source={<DataSourcePill source={source} />}
      banner={
        source === 'demo' ? (
          apiRecovered ? (
            <p
              role="status"
              className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-mill-line bg-white/4 px-5 py-1.5 text-xs"
            >
              <span>API disponível · carregar dados ao vivo</span>
              <button
                type="button"
                onClick={useLive}
                className="min-h-11 rounded border border-mill-line px-2.5 py-0.5 font-medium transition-colors hover:bg-white/8"
              >
                Carregar ao vivo
              </button>
            </p>
          ) : (
            <p
              role="status"
              className="flex flex-wrap items-center justify-center gap-x-2 border-b border-mill-attention/25 bg-mill-attention/8 px-5 py-1.5 text-xs text-mill-attention"
            >
              Dados de demonstração · API fora do ar
              <span className="text-mill-attention/70">
                — instantâneo gerado no build, não é leitura ao vivo
              </span>
            </p>
          )
        ) : undefined
      }
    >
      {gateway === null ? (
        <p role="status" className="py-6 text-sm text-mill-muted">
          Procurando a API…
        </p>
      ) : (
        <Screen
          screen={screen}
          gateway={gateway}
          reel={reel}
          tag={tag}
          bearing={bearing}
          asset={asset}
          setReel={setReel}
          setTag={setTag}
          setBearing={setBearing}
          setAsset={setAsset}
          openTrend={openTrend}
          openBearing={openBearing}
          openReel={openReel}
        />
      )}
    </Shell>
  );
}

interface ScreenProps {
  readonly screen: ReturnType<typeof useScreen>['screen'];
  readonly gateway: DataGateway;
  readonly reel: number | null;
  readonly tag: string | null;
  readonly bearing: string | null;
  readonly asset: string | null;
  readonly setReel: (value: number | null) => void;
  readonly setTag: (value: string | null) => void;
  readonly setBearing: (value: string | null) => void;
  readonly setAsset: (value: string | null) => void;
  readonly openTrend: (tag: string) => void;
  readonly openBearing: (assetTag: string) => void;
  readonly openReel: (number: number) => void;
}

function Screen(props: ScreenProps) {
  switch (props.screen) {
    case 'turno':
      return <TurnoScreen gateway={props.gateway} onSelectReel={props.openReel} />;
    case 'bobinas':
      return (
        <BobinasScreen gateway={props.gateway} selected={props.reel} onSelect={props.setReel} />
      );
    case 'processo':
      return <ProcessoScreen gateway={props.gateway} tag={props.tag} onSelectTag={props.setTag} />;
    case 'mancais':
      return (
        <MancaisScreen
          gateway={props.gateway}
          assetTag={props.bearing}
          onSelect={props.setBearing}
        />
      );
    case 'rondas':
      return <RondasScreen gateway={props.gateway} onOpenBearing={props.openBearing} />;
    case 'notas':
      return (
        <NotasScreen
          gateway={props.gateway}
          onOpenTrend={props.openTrend}
          onOpenBearing={props.openBearing}
        />
      );
    case 'maquina':
      return (
        <MaquinaScreen gateway={props.gateway} assetTag={props.asset} onSelect={props.setAsset} />
      );
  }
}

/**
 * Os quatro números do cabeçalho.
 *
 * Uma busca só, da área `geral` mais as duas tags de vapor e de bobina — e não
 * quatro buscas, porque o cabeçalho aparece em todas as telas e quatro
 * requisições por troca de tela seriam quatro esperas num host que dorme.
 */
function useHeadline(gateway: DataGateway | null): {
  values: { label: string; value: string; tone?: 'attention' | 'critical' }[];
  stamp: string;
} {
  const values = useResource(
    useCallback(
      (signal) => {
        if (!gateway) return Promise.reject(new Error('fonte não escolhida'));
        return gateway.processValues({}, signal);
      },
      [gateway],
    ),
    { enabled: gateway !== null },
  );

  const byTag = new Map(values.data?.values.map((item) => [item.tag, item]) ?? []);

  const read = (tag: string): string => {
    const found = byTag.get(tag);
    return found ? `${tagValue(found.value, found.unit)} ${found.unit}` : '—';
  };

  const diameter = byTag.get('ZI-1004');

  return {
    values: [
      { label: 'Velocidade', value: read('SIC-1104') },
      { label: 'Gramatura', value: read('AIC-902') },
      {
        label: 'Bobina em formação',
        value: diameter ? `Ø ${int(diameter.value)} mm` : '—',
      },
      { label: 'Vapor G4', value: read('PIC-514') },
    ],
    stamp: dayTime(values.data?.ts ?? null),
  };
}
