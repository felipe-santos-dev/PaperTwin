import { useCallback, useEffect, useMemo, useState } from 'react';
import { processVariable } from '@mp1/shared';
import { changeableTags, type LoopMode, type WhatIfChange } from '@mp1/shared/simulation';

import type { DataGateway } from '../api/gateway';
import type { WhatIfResponse } from '../api/whatif';
import { ResourceState } from '../ui/ResourceState';
import { useResource } from '../ui/useResource';
import { Curvas } from './simulacao/Curvas';
import { Efeitos } from './simulacao/Efeitos';
import { arredonda, degrauDe, Entrada, PRESET_INICIAL, type Preset } from './simulacao/Entrada';
import { frase, ordenar } from './simulacao/frase';

/**
 * Simulação — o "e se" em tela cheia.
 *
 * Na Fase 4 isto era um painel no canto da tela de Processo, e o canto não
 * cabia o que a conta tem a dizer: três gráficos de 56 px e uma frase. Aqui a
 * entrada fica numa coluna estreita, os gráficos tomam o meio e os números
 * ficam à direita, com o caminho de causa e efeito embaixo.
 *
 * ## A tela nunca abre vazia
 *
 * Ao entrar, ela já roda o atalho da velocidade da máquina e mostra o
 * resultado. Uma tela de simulação em branco pede que a pessoa adivinhe o que
 * digitar antes de descobrir o que a tela faz; com um caso em pé, ela mexe no
 * controle deslizante e entende em dois segundos.
 *
 * ## Sem botão "simular"
 *
 * Toda mudança de malha, valor, modo ou horizonte dispara a conta sozinha,
 * depois de um intervalo curto desde a última alteração — arrastar o controle
 * deslizante não manda trinta pedidos. Enquanto a nova resposta não chega, a
 * anterior continua na tela: piscar para o vazio a cada tecla seria pior do que
 * mostrar um número com meio segundo de atraso.
 *
 * ## O que ela não faz
 *
 * Não escreve. "Aplicar no processo" leva a proposta para o painel de setpoint
 * da tela de Processo, já preenchida — e lá o motivo é obrigatório e a escrita
 * entra no registro auditado, como sempre foi.
 */

/** Quanto tempo sem mexer antes de recalcular. */
const ESPERA_MS = 320;

/** Pontos por série: mais do que a tela tem pixels não melhora o desenho. */
const PONTOS = 120;

export interface SimulacaoScreenProps {
  readonly gateway: DataGateway;
  /** A malha que a tela abre, quando se chega por "Simular esta malha". */
  readonly loop?: string | null;
  /** Leva a proposta para o painel de setpoint, em Processo. */
  readonly onApply: (change: WhatIfChange) => void;
}

export function SimulacaoScreen({ gateway, loop = null, onApply }: SimulacaoScreenProps) {
  const valores = useResource(
    useCallback((signal: AbortSignal) => gateway.processValues({}, signal), [gateway]),
  );

  return (
    <ResourceState resource={valores} label="os valores do processo">
      {(data) => (
        <Simulador
          key={loop ?? 'inicial'}
          gateway={gateway}
          loop={loop}
          onApply={onApply}
          values={new Map(data.values.map((item) => [item.tag, item.value]))}
        />
      )}
    </ResourceState>
  );
}

/** A proposta de abertura: a malha pedida, ou o atalho da velocidade. */
function aberturaDe(loop: string | null, values: ReadonlyMap<string, number>): WhatIfChange[] {
  const pedida = loop === null ? null : processVariable(loop);
  const base = loop === null ? undefined : values.get(loop);
  if (pedida && base !== undefined && changeableTags('auto').includes(loop ?? '')) {
    return [{ tag: pedida.tag, value: degrauDe(pedida, base) }];
  }

  const inicial = processVariable(PRESET_INICIAL.tag);
  const atual = values.get(PRESET_INICIAL.tag);
  if (inicial && atual !== undefined) {
    return [{ tag: PRESET_INICIAL.tag, value: arredonda(atual + PRESET_INICIAL.delta, inicial) }];
  }

  // sem a velocidade na resposta, a primeira malha que a fonte souber
  const primeira = changeableTags('auto').find((tag) => values.has(tag));
  const variable = primeira === undefined ? null : processVariable(primeira);
  const valor = primeira === undefined ? undefined : values.get(primeira);
  if (variable && valor !== undefined)
    return [{ tag: variable.tag, value: degrauDe(variable, valor) }];
  return [];
}

function Simulador({
  gateway,
  loop,
  values,
  onApply,
}: {
  readonly gateway: DataGateway;
  readonly loop: string | null;
  readonly values: ReadonlyMap<string, number>;
  readonly onApply: (change: WhatIfChange) => void;
}) {
  const [changes, setChanges] = useState<WhatIfChange[]>(() => aberturaDe(loop, values));
  const [mode, setMode] = useState<LoopMode>(loop === null ? PRESET_INICIAL.mode : 'auto');
  const [horizonS, setHorizonS] = useState(600);
  const [comparar, setComparar] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [previsao, setPrevisao] = useState<{
    readonly principal: WhatIfResponse;
    readonly comparado: WhatIfResponse | null;
    readonly modo: LoopMode;
  } | null>(null);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  /** Comparar só faz sentido onde a mudança existe nos dois modos. */
  const podeComparar = useMemo(() => {
    const auto = new Set(changeableTags('auto'));
    const manual = new Set(changeableTags('manual'));
    return changes.length > 0 && changes.every((c) => auto.has(c.tag) && manual.has(c.tag));
  }, [changes]);

  const comparando = comparar && podeComparar;

  /**
   * A conta sai sozinha, um instante depois da última mexida.
   *
   * O estado só muda dentro do `setTimeout`, e não no corpo do efeito: arrastar
   * o controle deslizante dispara este efeito a cada pixel, e marcar
   * "recalculando" a cada um deles seria uma renderização por pixel para uma
   * conta que nem começou.
   */
  useEffect(() => {
    if (changes.length === 0) return;

    const controller = new AbortController();

    const timer = setTimeout(() => {
      setAtualizando(true);
      const pedido = { changes, horizonS, points: PONTOS };
      const outro: LoopMode = mode === 'auto' ? 'manual' : 'auto';

      Promise.all([
        gateway.whatIf({ ...pedido, mode }, controller.signal),
        comparando
          ? gateway.whatIf({ ...pedido, mode: outro }, controller.signal)
          : Promise.resolve(null),
      ])
        .then(([principal, comparado]) => {
          if (controller.signal.aborted) return;
          setPrevisao({ principal, comparado, modo: mode });
          setErro(null);
        })
        .catch((problema: unknown) => {
          if (controller.signal.aborted) return;
          setErro(problema instanceof Error ? problema.message : 'A previsão falhou.');
        })
        .finally(() => {
          if (!controller.signal.aborted) setAtualizando(false);
        });
    }, ESPERA_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [gateway, changes, mode, horizonS, comparando]);

  const principal = previsao ? ordenar(previsao.principal.variables) : [];

  return (
    <div className="grid h-[calc(100vh-152px)] min-h-[680px] grid-cols-[252px_minmax(0,1fr)_420px] gap-4">
      <Entrada
        changes={changes}
        onChanges={(lista) => {
          setChanges(lista);
          setSelected(null);
        }}
        mode={mode}
        onMode={(novo) => {
          setMode(novo);
          // a malha pode não existir no outro modo: a cascata separa os papéis
          const aceitas = new Set(changeableTags(novo));
          setChanges((lista) => {
            const sobrou = lista.filter((item) => aceitas.has(item.tag));
            return sobrou.length > 0 ? sobrou : aberturaDe(null, values);
          });
        }}
        horizonS={horizonS}
        onHorizon={setHorizonS}
        values={values}
        onPreset={(preset: Preset) => {
          const base = values.get(preset.tag);
          const variable = processVariable(preset.tag);
          if (base === undefined || !variable) return;
          setMode(preset.mode);
          setChanges([{ tag: preset.tag, value: arredonda(base + preset.delta, variable) }]);
          setSelected(null);
        }}
        onApply={onApply}
      />

      <Curvas
        principal={principal}
        comparado={previsao?.comparado?.variables ?? null}
        modo={previsao?.modo ?? mode}
        stepS={previsao?.principal.stepS ?? 1}
        horizonS={previsao?.principal.horizonS ?? horizonS}
        frase={previsao ? frase(previsao.principal) : 'Calculando a primeira previsão…'}
        comparar={comparar}
        onComparar={setComparar}
        podeComparar={podeComparar}
        selected={selected}
        onSelect={setSelected}
        atualizando={atualizando}
        erro={erro}
      />

      <Efeitos variables={principal} selected={selected} onSelect={setSelected} />
    </div>
  );
}
