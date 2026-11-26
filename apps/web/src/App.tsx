import { useCallback, useMemo, useState } from 'react';
import type { WhatIfChange } from '@mp1/shared/simulation';

import { DEMO_GATEWAY } from './api/demo-gateway';
import { FIXED_VARIABLES } from './api/fixtures';
import { fetchDemoHealth } from './api/demo';
import { fetchHealth } from './api/client';
import { LIVE_GATEWAY, type DataGateway } from './api/gateway';
import { BobinasScreen } from './screens/BobinasScreen';
import { MancaisScreen } from './screens/MancaisScreen';
import { MaquinaScreen } from './screens/MaquinaScreen';
import { NotasScreen } from './screens/NotasScreen';
import { ProcessoScreen } from './screens/ProcessoScreen';
import { QuebraScreen } from './screens/QuebraScreen';
import { RondasScreen } from './screens/RondasScreen';
import { SimulacaoScreen } from './screens/SimulacaoScreen';
import { TurnoScreen } from './screens/TurnoScreen';
import { LaboratorioScreen } from './screens/LaboratorioScreen';
import { DataSourcePill } from './ui/DataSourcePill';
import { SearchBox } from './ui/SearchBox';
import { Shell } from './ui/Shell';
import { useScreen } from './ui/screens';
import { areaOfTag } from './ui/sections';
import { useAssetSelection } from './ui/useAssetUrl';
import { useDataSource, type DataSourceProbes } from './ui/useDataSource';
import { useFrame } from './ui/useFrame';
import { useStream } from './ui/useStream';

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

  /**
   * O stream só é assinado quando a fonte é a API.
   *
   * No instantâneo não há o que assinar — o arquivo é de um instante só, e o
   * selo diz DEMONSTRAÇÃO justamente por isso.
   */
  const live = useStream(source === 'live');

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
   * A travessia entre Simulação e Processo, nos dois sentidos.
   *
   * `simLoop` é a malha que a Simulação abre quando se chega por "Simular esta
   * malha"; `proposal` é o valor que volta de lá para o painel de setpoint, já
   * preenchido. As duas vivem aqui, e não em cada tela, pela mesma razão que a
   * TAG da tendência vive: atravessar é o que alguém faz quando investiga, e
   * quem atravessa não pode perder o que estava olhando.
   */
  const [simLoop, setSimLoop] = useState<string | null>(null);
  const [proposal, setProposal] = useState<WhatIfChange | null>(null);

  /** A quebra aberta no replay; `null` abre a mais recente. */
  const [webBreak, setWebBreak] = useState<string | null>(null);

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

  /**
   * Abre a tendência de uma tag na tela de Processo.
   *
   * As sete variáveis fixas do preparo não estão no catálogo, então `areaOfTag`
   * não acha a área delas — e sem área a tela abriria na seção errada. A área
   * vem da própria variável fixa, que a declara.
   */
  const openTrend = useCallback(
    (which: string) => {
      setTag(which);
      const fixed = FIXED_VARIABLES.find((variable) => variable.tag === which);
      setArea(areaOfTag(which) ?? fixed?.area ?? null);
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

  /** Abre o replay de uma quebra, vindo do Turno ou de Bobinas. */
  const openBreak = useCallback(
    (id: string) => {
      setWebBreak(id);
      go('quebra');
    },
    [go],
  );

  /** Abre a Simulação já com uma malha escolhida. */
  const openSimulacao = useCallback(
    (which: string) => {
      setSimLoop(which);
      go('simulacao');
    },
    [go],
  );

  /** Volta da Simulação para o painel de setpoint, com a proposta preenchida. */
  const openSetpoint = useCallback(
    (change: WhatIfChange) => {
      setProposal(change);
      setTag(change.tag);
      setArea(areaOfTag(change.tag) ?? null);
      go('processo');
    },
    [go],
  );

  const frame = useFrame(gateway, live);

  return (
    <Shell
      screen={screen}
      go={go}
      top={frame.top}
      badges={{ notas: frame.suggested }}
      sections={frame.sections}
      area={area}
      onArea={openArea}
      source={<DataSourcePill source={source} stream={live.state} />}
      search={
        <SearchBox
          gateway={gateway}
          onScreen={go}
          onTag={openTrend}
          onBearing={openBearing}
          onReel={openReel}
          onNote={openNote}
        />
      }
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
          area={area}
          note={note}
          setNote={setNote}
          openNote={openNote}
          simLoop={simLoop}
          proposal={proposal}
          openSimulacao={openSimulacao}
          openSetpoint={openSetpoint}
          webBreak={webBreak}
          openBreak={openBreak}
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
  readonly area: string | null;
  readonly note: string | null;
  readonly setNote: (value: string | null) => void;
  readonly openNote: (number: string) => void;
  readonly simLoop: string | null;
  readonly proposal: WhatIfChange | null;
  readonly openSimulacao: (tag: string) => void;
  readonly openSetpoint: (change: WhatIfChange) => void;
  readonly webBreak: string | null;
  readonly openBreak: (id: string) => void;
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
          onOpenBreak={props.openBreak}
        />
      );
    case 'bobinas':
      return (
        <BobinasScreen
          gateway={props.gateway}
          selected={props.reel}
          onSelect={props.setReel}
          onOpenBreak={props.openBreak}
        />
      );
    case 'processo':
      return (
        <ProcessoScreen
          gateway={props.gateway}
          area={props.area}
          tag={props.tag}
          onSelectTag={props.setTag}
          onOpenBearing={props.openBearing}
          proposal={props.proposal}
          onSimulate={props.openSimulacao}
        />
      );
    case 'laboratorio':
      return <LaboratorioScreen gateway={props.gateway} />;
    case 'mancais':
      return (
        <MancaisScreen
          gateway={props.gateway}
          assetTag={props.bearing}
          onSelect={props.setBearing}
          onOpenTag={props.openTrend}
          onOpenNote={props.openNote}
        />
      );
    case 'rondas':
      return (
        <RondasScreen
          gateway={props.gateway}
          onOpenBearing={props.openBearing}
          onOpenTrend={props.openTrend}
          onOpenNote={props.openNote}
        />
      );
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
    case 'simulacao':
      return (
        <SimulacaoScreen
          gateway={props.gateway}
          loop={props.simLoop}
          onApply={props.openSetpoint}
        />
      );
    case 'quebra':
      return (
        <QuebraScreen
          gateway={props.gateway}
          id={props.webBreak}
          onOpenNote={props.openNote}
          onOpenTag={props.openTrend}
        />
      );
  }
}
