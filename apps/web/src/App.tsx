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
import { LaboratorioScreen } from './screens/LaboratorioScreen';
import { DataSourcePill } from './ui/DataSourcePill';
import { Shell } from './ui/Shell';
import { useScreen } from './ui/screens';
import { useAssetSelection } from './ui/useAssetUrl';
import { useDataSource, type DataSourceProbes } from './ui/useDataSource';
import { useFrame } from './ui/useFrame';

/** Estáveis entre renders, para os hooks não refazerem a busca à toa. */
const PROBES: DataSourceProbes = { probeApi: fetchHealth, probeDemo: fetchDemoHealth };

/**
 * A aplicação: oito telas sobre uma fonte de dados escolhida uma vez.
 *
 * ## A seleção entre telas é estado da aplicação, não de cada tela
 *
 * Quando a tela de Notas manda abrir a tendência de `VI-5123A`, quem muda de
 * tela e carrega a tag é aqui. Se cada tela guardasse a sua própria seleção,
 * atravessar de uma para outra perderia o contexto — e atravessar é justamente o
 * que alguém faz quando investiga: do alarme para o mancal, do mancal para a
 * nota, da nota para a tendência.
 *
 * ## A moldura é sempre a mesma
 *
 * Turno, gramatura, velocidade, alarmes por prioridade e a faixa com as dez
 * seções ficam no alto de todas as telas. Clicar numa seção abre ela em
 * Processo, de qualquer tela.
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
  const [area, setArea] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

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

  /** Abre uma nota na tela de Notas. */
  const openNote = useCallback(
    (which: string) => {
      setNote(which);
      go('notas');
    },
    [go],
  );

  /** Abre uma seção da faixa na tela de Processo. */
  const openArea = useCallback(
    (which: string) => {
      setArea(which);
      go('processo');
    },
    [go],
  );

  const frame = useFrame(gateway);

  return (
    <Shell
      screen={screen}
      go={go}
      top={frame.top}
      sections={frame.sections}
      area={area}
      onArea={openArea}
      source={<DataSourcePill source={source} />}
      banner={
        /**
         * Só o aviso que pede ação fica numa faixa: a API voltou e dá para
         * trocar o instantâneo pelo ao vivo. Que os dados são de demonstração,
         * o selo da barra superior já diz.
         */
        source === 'demo' && apiRecovered ? (
          <p
            role="status"
            className="flex items-center justify-center gap-3 border-b border-line px-4 py-1 text-[12px] text-fg-2"
          >
            <span>API disponível · carregar dados ao vivo</span>
            <button
              type="button"
              onClick={useLive}
              className="h-6 border border-action px-2.5 text-[12px] text-action hover:border-action-hover hover:text-action-hover"
            >
              Carregar ao vivo
            </button>
          </p>
        ) : undefined
      }
    >
      {gateway === null ? (
        <p role="status" className="py-6 text-sm text-fg-2">
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
          note={note}
          setNote={setNote}
          openNote={openNote}
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
  readonly note: string | null;
  readonly setNote: (value: string | null) => void;
  readonly openNote: (number: string) => void;
}

function Screen(props: ScreenProps) {
  switch (props.screen) {
    case 'turno':
      return (
        <TurnoScreen
          gateway={props.gateway}
          onSelectReel={props.openReel}
          onOpenTag={props.openTrend}
          onOpenNote={props.openNote}
        />
      );
    case 'bobinas':
      return (
        <BobinasScreen gateway={props.gateway} selected={props.reel} onSelect={props.setReel} />
      );
    case 'processo':
      return <ProcessoScreen gateway={props.gateway} tag={props.tag} onSelectTag={props.setTag} />;
    case 'laboratorio':
      return <LaboratorioScreen />;
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
          selected={props.note}
          onSelect={props.setNote}
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
