# Fase 0 — levantamento para o layout novo e o simulador repaginado

Levantamento por leitura do código, sem rodar o app (esta cópia do repositório
não tem `node_modules` instalado). Onde a conclusão precisaria de execução para
ser confirmada, está dito.

## Resumo em cinco linhas

1. O protótipo está copiado em `reference/design/papertwin-layout-v2.html`, sem
   alteração. Ele é **fiel ao repositório onde o repositório tem número**: as 23
   relações FOPDT batem dígito a dígito com o CSV, e as 3 bandas de
   especificação que o catálogo tem batem exatas. Onde o repositório não tem
   número, ele inventou — e é essa a lista de decisões.
2. O motor do "e se" **já é TypeScript** em `packages/shared/src/simulation/` e
   **já roda no navegador**, num Web Worker, sem API. Não há nada para portar.
3. O modo de demonstração **já existe e é completo**: um portão próprio, um
   arquivo por rota e o estado do motor dentro do instantâneo.
4. O "Carregando…" do Pages não vem de "depende da API". Vem de dois pontos
   concretos em `useResource.ts` e `inflight.ts`, apontados abaixo.
5. **Nenhuma TAG do protótipo falta** — 28 de 28 existem, entre o catálogo e
   `lab.ts`. O que falta são **13 números**: 4 bases de entrada, 3 faixas de
   entrada e 6 bandas de especificação de saída que o repositório não tem.

---

## 1. Protótipo — copiado

`C:\Users\clari\Downloads\papertwin-layout.html` → `reference/design/papertwin-layout-v2.html`,
sem alteração. 125.055 bytes, 1.175 linhas, arquivo único: `<style>` no topo, dez
`<section class="page">`, e o JS no fim. Teclas 1–9 por `location.hash`.

O motor do "e se" do protótipo é `simulate(moves, auto, H)` (linha 934), em cima
de quatro tabelas declaradas no próprio arquivo:

| tabela  | linha | o que é                                                                         | tamanho |
| ------- | ----- | ------------------------------------------------------------------------------- | ------- |
| `VARS`  | 675   | entradas, com `kind` (`sp`/`mv`/`dist`), base, mín., máx., passo, seção e `est` | 16      |
| `OUT`   | 693   | saídas, com base, `lo`/`hi` de especificação, seção e `fin` (propriedade final) | 12      |
| `REL`   | 707   | relações FOPDT: entrada, saída, K, θ, τ, observação, origem                     | 23      |
| `LOOPS` | 731   | as duas malhas, com λ; `Kc` e `Ti` calculados na carga                          | 2       |
| `SCEN`  | 1134  | os oito cenários prontos                                                        | 8       |

O que já existia de referência visual, e que **não** é este protótipo:
`reference/design/*.png` (8 telas) e `reference/design/fonte/*.dc.html`.

## 2. Tabela bloco → componente

Duas tabelas: o inventário do repositório (quem desenha o quê hoje, de onde sai
cada número) e, depois, bloco por bloco do protótipo.

### As telas

São **10** telas, não 9 (`apps/web/src/ui/screens.ts`). As nove do prompt são
exatamente as nove com tecla 1–9, na mesma ordem; a décima, `quebra` (replay de
quebra), é contextual: `key: null`, `rail: false`, e só se chega nela por um
evento do Turno ou de Bobinas. O layout novo não a menciona — precisa de decisão
(item 5.7).

| nº  | tela     | arquivo                         | subcomponentes próprios                                                                                     |
| --- | -------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1   | Turno    | `screens/TurnoScreen.tsx`       | `turno/Timeline.tsx`, `turno/Support.tsx`, `turno/derive.ts`                                                |
| 2   | Processo | `screens/ProcessoScreen.tsx`    | `processo/TrendStack.tsx`, `processo/SetpointPanel.tsx`, `processo/RefiningEffect.tsx`                      |
| 3   | Lab.     | `screens/LaboratorioScreen.tsx` | `laboratorio/SensorVirtual.tsx`, `laboratorio/derive.ts`                                                    |
| 4   | Bobinas  | `screens/BobinasScreen.tsx`     | `bobinas/derive.ts`, `api/fixtures/cdmap.ts`                                                                |
| 5   | Mancais  | `screens/MancaisScreen.tsx`     | `mancais/BearingDetail.tsx`, `mancais/MachineMap2D.tsx`, `mancais/MachinePanel.tsx`, `mancais/Sugestao.tsx` |
| 6   | Rondas   | `screens/RondasScreen.tsx`      | `rondas/derive.ts`                                                                                          |
| 7   | Notas    | `screens/NotasScreen.tsx`       | `notas/SignalChart.tsx`                                                                                     |
| 8   | Máquina  | `screens/MaquinaScreen.tsx`     | `scene/MachineScene.tsx`, `scene/Bearings.tsx`, `scene/Atmosphere.tsx`, `scene/views.ts`                    |
| 9   | Simul.   | `screens/SimulacaoScreen.tsx`   | `simulacao/Entrada.tsx`, `simulacao/Curvas.tsx`, `simulacao/Efeitos.tsx`, `simulacao/frase.ts`              |
| —   | Quebra   | `screens/QuebraScreen.tsx`      | `quebra/Linha.tsx`, `quebra/Local.tsx`, `quebra/Variaveis.tsx`, `quebra/frase.ts`                           |

**O mapa 2D dos mancais já existe** (`mancais/MachineMap2D.tsx`, com teste), e a
frase gerada do Simulador também (`simulacao/frase.ts`). A Fase 4 e a Fase 6 vão
adaptar, não criar do zero.

### Os componentes compartilhados que o prompt pede

| pedido              | existe hoje                                                          | o que falta                                                                                                                     |
| ------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `Panel`             | `ui/Panel.tsx`                                                       | tirar o `Illustrative` (linha 211) de dentro dele                                                                               |
| `SectionTitle`      | não                                                                  | novo; hoje o título mora dentro de `Panel`                                                                                      |
| `PageIndex`         | não                                                                  | novo (índice da página, some abaixo de 1500 px)                                                                                 |
| `Seg` (segmentados) | não; há botões soltos em cada tela                                   | novo, recolhendo os existentes                                                                                                  |
| `Chip`              | parcial: `ui/SectionBlock.tsx` é o chip de seção com ponto de alarme | generalizar                                                                                                                     |
| `RangeBar`          | `ui/RangeBar.tsx`                                                    | já faz faixa · PV · SP                                                                                                          |
| `Sparkline`         | `ui/chart/Sparkline.tsx` + `chart/scale.ts`, `chart/series.ts`       | já serve                                                                                                                        |
| `Lanes`             | não                                                                  | **novo, e é o maior item da Fase 1**: faixas empilhadas, banda de especificação, linha de base tracejada, série B âmbar, cursor |
| `Tooltip`           | não                                                                  | novo; hoje cada gráfico resolve o seu `title`/hover                                                                             |

Outros que já existem e entram na casca nova: `ui/Shell.tsx` (topo + trilha
lateral + faixa das seções), `ui/SearchBox.tsx`, `ui/DataSourcePill.tsx` (o selo
DEMONSTRAÇÃO), `ui/StatusPill.tsx`, `ui/ResourceState.tsx`, `ui/InstrumentRow.tsx`,
`ui/BearingBar.tsx`, `ui/VibrationTrend.tsx`, `ui/AssetPanel.tsx`,
`ui/EventMarker.tsx`, `ui/Num.tsx`, `ui/format.ts`, `ui/useWidth.ts`.

### De onde sai cada número

Três fontes, e só uma é escolhida por sessão (`ui/useDataSource.ts`):

| fonte                           | quem serve      | onde                                                                                                                                                   |
| ------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **API**                         | `LIVE_GATEWAY`  | `api/gateway.ts` → `api/process.ts`, `api/client.ts`                                                                                                   |
| **instantâneo de demonstração** | `DEMO_GATEWAY`  | `api/demo-gateway.ts` → arquivos em `public/demo/` (gerados no build, não commitados)                                                                  |
| **fixo**                        | `fixtureRoutes` | `api/fixtures/` — `process.ts` (as 7 variáveis fixas do preparo), `lab.ts` (19 ensaios ilustrativos), `cdmap.ts` (mapa CD), `scenario.ts`, `random.ts` |

Os dois portões implementam a **mesma** interface `DataGateway`, e as telas só
conhecem a interface. O instantâneo devolve `null` em escrita de setpoint e em
reconhecimento de alarme — de propósito.

### A rolagem aninhada, medida

**27** lugares com `overflow-y-auto` / `overflow-auto` em `.tsx` de tela.
Os 20 primeiros: `BobinasScreen:314`, `LaboratorioScreen:301,752`,
`MancaisScreen:151,248`, `MaquinaScreen:154`, `NotasScreen:167,196,417`,
`processo/SetpointPanel:81`, `processo/TrendStack:451`, `ProcessoScreen:288,416`,
`quebra/Linha:109`, `quebra/Local:38`, `quebra/Variaveis:45`,
`RondasScreen:177,419`, `simulacao/Curvas:114`, `simulacao/Efeitos:80`.
É a lista de trabalho da Fase 1, e o alvo do e2e que o prompt pede.

### Bloco por bloco do protótipo

`A` = área principal, `S` = seção de baixo. Na coluna do dado: **API** sai do
portão, **fixo** sai de `api/fixtures/`, **calculado** sai do motor ou de um
`derive.ts`, **não existe** precisa de dado novo.

#### 1 Turno

| protótipo                                               | vira                                                          | dado                                          |
| ------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------- |
| A · faixa de indicadores (`#t-agora`)                   | novo `Seg`/faixa; hoje são cartões em `TurnoScreen`           | API `/shifts/:id` + `turno/derive.ts`         |
| A · Linha do tempo, faixas separadas (`drawTimeline`)   | **`Lanes`** substituindo `turno/Timeline.tsx`                 | API (velocidade, produção, bobinas, eventos)  |
| A · Precisa de atenção (`#atn`)                         | `turno/Support.tsx`, fundindo alarmes + pendências numa lista | API `/alarms` + pendências do turno           |
| S · Últimos turnos (`drawTurnComp`)                     | novo bloco                                                    | API `/shifts?limit=4`                         |
| S · Registro de eventos (`drawEvents`, chips de filtro) | novo bloco                                                    | API (alarme, bobina, ronda, setpoint, quebra) |

#### 2 Processo

| protótipo                                          | vira                                                                              | dado                                               |
| -------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------- |
| A · chips de seção (`#secs`, ponto de alarme)      | `ui/SectionBlock.tsx` vira `Chip`; a faixa de 10 seções do topo sai               | `ui/sections.ts` + API `/alarms`                   |
| A · tabela de 4 colunas (`procRows`)               | `ProcessoScreen` + `ui/RangeBar.tsx` + `Sparkline`                                | API `/process/values` e `/process/tags/:tag/trend` |
| A · detalhe fixo, abas Tendência / Efeito na folha | `processo/TrendStack.tsx` + `processo/RefiningEffect.tsx`, com `position: sticky` | API + fixo (efeito na folha)                       |
| S · Malhas de controle (`drawLoops`)               | novo bloco; o modo e a saturação saem do motor                                    | **calculado** (`process-engine.ts`, 6 cascatas)    |
| S · Setpoints alterados no turno                   | `processo/SetpointPanel.tsx`                                                      | API `/setpoint-changes`                            |

#### 3 Lab.

| protótipo                                          | vira                            | dado                                                |
| -------------------------------------------------- | ------------------------------- | --------------------------------------------------- |
| A · lista de jumbos com 6 marcadores (`drawLab`)   | `LaboratorioScreen`             | API `/lab-results` + fixo (19 ensaios ilustrativos) |
| A · carta de controle grande (`drawCtrl`, LIC/LSC) | novo gráfico; hoje é menor      | API + **não existe**: LIC/LSC por propriedade       |
| A · sensor virtual de tração                       | `laboratorio/SensorVirtual.tsx` | API `/process/quality/LAB-1206`                     |
| A · ensaios na fila                                | `LaboratorioScreen`             | fixo                                                |
| S · Laboratório × QCS online (`drawLabMore`)       | novo bloco                      | API (laudo) × API (scanner)                         |
| S · Histórico de laudos                            | novo bloco                      | API `/lab-results`                                  |

#### 4 Bobinas

| protótipo                                              | vira                    | dado                    |
| ------------------------------------------------------ | ----------------------- | ----------------------- |
| A · Gantt das bobinas, trecho fora em rosa (`drawBob`) | `BobinasScreen`         | API `/reels`            |
| S · mapa de umidade CD × MD (`drawHeat`)               | `api/fixtures/cdmap.ts` | **fixo**                |
| S · perfil MD com banda (`drawPerfil`)                 | **`Lanes`**             | API `/reels/:n`         |
| S · Rastreabilidade + destino do dia (`drawDest`)      | novo bloco              | API (eventos da janela) |

#### 5 Mancais

| protótipo                                            | vira                                                  | dado                                    |
| ---------------------------------------------------- | ----------------------------------------------------- | --------------------------------------- |
| A · lista por severidade                             | `MancaisScreen` + `ui/BearingBar.tsx`                 | API `/assets` + `iso20816.ts`           |
| A · detalhe fixo: 3 números, zonas A/B·C·D, projeção | `mancais/BearingDetail.tsx` + `ui/VibrationTrend.tsx` | API `/assets/:tag/vibration` + `rul.ts` |
| S · Mapa 2D, 36 cilindros (`drawMMap`)               | **`mancais/MachineMap2D.tsx` já existe**              | API + `machine/mp1.ts`                  |
| S · Vibração × temperatura (`drawMScat`)             | novo bloco                                            | API                                     |

#### 6 Rondas

| protótipo                                            | vira                                | dado                              |
| ---------------------------------------------------- | ----------------------------------- | --------------------------------- |
| A · passos + cartões campo × online                  | `RondasScreen` + `rondas/derive.ts` | API `/rounds/:id`                 |
| S · halteres campo × online (`drawRDumb`, −3 ± 2 °C) | novo bloco                          | API; a faixa −3 ± 2 °C é **fixo** |
| S · Rondas do turno                                  | novo bloco                          | API `/rounds`                     |

#### 7 Notas

| protótipo                                           | vira                    | dado                               |
| --------------------------------------------------- | ----------------------- | ---------------------------------- |
| A · quadro de 5 colunas, sugerida tracejada (`#kb`) | `NotasScreen`           | API `/notes` + `/note-suggestions` |
| A · detalhe com sinal de origem                     | `notas/SignalChart.tsx` | API                                |
| S · Indicadores do mês (`drawNotasInd`)             | novo bloco              | API `/notes` agregado              |

#### 8 Máquina

| protótipo                                         | vira                                                   | dado                           |
| ------------------------------------------------- | ------------------------------------------------------ | ------------------------------ |
| A · 3D em tela cheia, seletor no canto            | `MaquinaScreen` + `scene/` — tirar os painéis por cima | `scene/scene.json`, `mp1.glb`  |
| S · Estado por seção, 10 cartões (`drawSecStrip`) | novo bloco                                             | API `/process/values` por área |

#### 9 Simulador

| protótipo                                                | vira                                            | dado                                             |
| -------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------ |
| A · barra de reprodução (`togglePlay`, `tick`, `#scrub`) | **novo**                                        | —                                                |
| A · Mudanças do cenário (`renderMoves`, `renderPicker`)  | `simulacao/Entrada.tsx` reescrito               | catálogo (`VARS` → `process/catalog.ts`)         |
| A · Mapa de propagação (`renderMap`, `secState`)         | **novo**; a frase vem de `simulacao/frase.ts`   | **calculado** (`what-if.ts` + `causePaths`)      |
| A · Papel na enroladeira (`renderSpec`)                  | `simulacao/Efeitos.tsx` reescrito               | **calculado**; produção pela conta da LISTA-BASE |
| S · Resposta no tempo (`renderLanes`)                    | **`Lanes`** substituindo `simulacao/Curvas.tsx` | **calculado**                                    |
| S · Causa e efeito (`renderGraph`, tabela de relações)   | **novo**                                        | `relations.generated.ts` (origem por relação)    |
| S · Modo objetivo (`renderObj`)                          | **novo**                                        | **calculado** (Δu = Δy/K sobre `causePaths`)     |
| S · Cenários prontos (`SCEN`, `renderScen`)              | **novo**                                        | fixo, 8 cartões                                  |

#### A casca

| protótipo                                                          | vira                                                | dado                           |
| ------------------------------------------------------------------ | --------------------------------------------------- | ------------------------------ |
| topo numa linha, contador único de alarmes, selo com "ao vivo ›"   | `ui/Shell.tsx` (`TopBar`) + `ui/DataSourcePill.tsx` | API `/alarms`, `useDataSource` |
| `rail` com Máquina e Simul. destacados                             | `ui/Shell.tsx` (`NavRail`)                          | —                              |
| cabeçalho de tela: `h1`, linha de contexto, índice (`#s-…`), ações | novos `SectionTitle` + `PageIndex`                  | —                              |
| `showTip`/`hideTip`                                                | novo `Tooltip`                                      | —                              |
| `lanes()` (linha 606)                                              | **`Lanes`** — é a implementação de referência       | —                              |

### As seções: 9 no protótipo, 10 no repositório

| protótipo                                              | área do catálogo                                                           |
| ------------------------------------------------------ | -------------------------------------------------------------------------- |
| `preparo` Preparo e refino                             | `preparo`                                                                  |
| `form` Caixa e formação                                | **`caixa` + `formação` fundidas**                                          |
| `prensas` Prensas                                      | `prensas`                                                                  |
| `pre` Pré-secagem                                      | `pré-secagem`                                                              |
| `ss` Speed Sizer                                       | `speed sizer`                                                              |
| `pos` Pós-secagem                                      | `pós-secagem`                                                              |
| `cal` Calandra                                         | `calandra`                                                                 |
| `qcs` QCS · enroladeira                                | **`qcs` + `pope` fundidas**                                                |
| `lab` Laboratório                                      | **nenhuma** — as TAGs `LAB-*` vivem em `process/lab.ts`, sem coluna `area` |
| `acion` Acionamentos (a faixa que atravessa a máquina) | **nenhuma** — `SIC-1104` é `area = geral`, `grupo = acionamentos`          |

Sobram do catálogo, sem caixa no mapa: `mancais`, `secagem`, `utilidades`,
`geral`. Decidir se a fusão de `caixa`+`formação` e de `qcs`+`pope` vale só no
mapa do Simulador ou também nos chips do Processo.

## 3. O motor do "e se" — já está pronto, e já roda no navegador

**Não há nada para portar.** O motor nunca foi Java.

| peça     | arquivo                                   | o que é                                                                                      |
| -------- | ----------------------------------------- | -------------------------------------------------------------------------------------------- |
| FOPDT    | `packages/shared/src/simulation/fopdt.ts` | `x += (K·u(t−θ) − x)/τ`, com linha de atraso                                                 |
| PI       | `.../simulation/pi.ts`                    | sintonia SIMC + anti-windup, já com o `if` que não integra na saturação                      |
| rede     | `.../simulation/process-engine.ts`        | integra as relações, 6 cascatas, dt = 1 s                                                    |
| o "e se" | `.../simulation/what-if.ts`               | roda o motor **duas vezes** (com e sem a mudança) sobre uma cópia do estado, ruído desligado |
| relógio  | `.../simulation/clock.ts`                 | `TICK_MS = 1000`                                                                             |

E no navegador:

- `apps/web/src/api/whatif-worker.ts` — um Web Worker que chama o **mesmo**
  `runWhatIf` do servidor;
- `apps/web/src/api/whatif.ts` — busca `demo/sim-state.json`, cria o worker por
  chamada e o encerra no fim;
- `apps/api/src/scripts/generate-demo.ts` (fim do arquivo) — grava
  `sim-state.json` no instantâneo, e **falha o build** se a retomada não deixou
  estado do motor gravado. São ~1.300 números.

### Caminho proposto

**Estender o motor que existe; não escrever outro.** Prós: uma implementação só,
os testes do pacote continuam valendo como referência de números, e o worker já
está no lugar. Contra: o motor foi desenhado para "prever a partir do estado de
agora", e a tela nova pede "reproduzir um cenário no tempo" — são usos diferentes
do mesmo cálculo, e falta isto:

| o que a Fase 5 pede                                     | o que o código faz hoje                                                         | tamanho                                      |
| ------------------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------- |
| horizonte de 60 min                                     | `WHAT_IF_MAX_HORIZON_S = 1800` (30 min)                                         | trivial                                      |
| gravação a cada 5 s                                     | `WHAT_IF_MAX_POINTS = 240` (7,5 s em 30 min; a 5 s em 60 min seriam 720 pontos) | trivial                                      |
| mudança **agendada** em 0/1/2/5/10 min                  | `apply()` aplica tudo em t = 0                                                  | **novo**: degrau com instante                |
| entradas do tipo `dist` (perturbação, ninguém controla) | `changeableTags()` só devolve `controlledVariables()`                           | **decisão** (5.6)                            |
| modo objetivo (Δu = Δy/K, colaterais, ordenação)        | não existe; `causePaths()` já dá o grafo                                        | **novo**, mas em cima do grafo que já existe |
| fixar B / comparar A/B                                  | não existe                                                                      | **novo**, só na tela                         |
| produção t/h                                            | não achei a conta em `process/derived.ts`                                       | **novo**, e é conta, não relação             |

Medir o tempo de uma simulação de 60 min (alvo < 30 ms) só dá com as dependências
instaladas.

## 4. Por que o Pages fica em "Carregando…"

**Não é "depende da API".** O modo de demonstração está completo: o instantâneo
tem `health.json`, `assets.json`, uma série por ativo medido, as 12 listas, o
detalhe de cada turno / bobina / quebra / ronda / nota, o catálogo e a tendência
de **toda** TAG, o sensor virtual e o estado do motor. O workflow
`.github/workflows/pages.yml` roda `npm run demo:data && vite build`, e o passo
tem até um comentário avisando para não trocar por um `vite build` direto.

A frase "Carregando …" sai de um lugar só: `ui/ResourceState.tsx:36`, quando
`resource.phase === 'loading'`. E há três caminhos para ficar nesse estado para
sempre:

**(a) `useResource.ts`, fim do arquivo — `enabled: false` devolve `phase: 'loading'`
sem nunca sair dele.** Hoje nenhuma tela passa `enabled`, então não está ativo —
mas é uma armadilha pronta para a Fase 2.

**(b) `useResource.ts`, dentro do `.then` e do `.catch` — `if (controller.signal.aborted) return;`.**
Quando a busca termina depois do efeito ser desmontado, **nada** é escrito: nem
dado, nem erro. Se o efeito seguinte também não escrever (caso c), a tela fica em
"Carregando…" sem erro e sem botão de tentar de novo. Em `StrictMode`
(`main.tsx`) o efeito monta, desmonta e monta de novo, o que exercita esse
caminho a cada abertura de tela.

**(c) `api/inflight.ts`, `coalesce()` — a corrida entre o abortar de um e o
juntar-se de outro.** Os interessados numa mesma chave compartilham **um**
`AbortController`. Quando o primeiro desiste, `waiters` cai a zero e
`entry.controller.abort(signal.reason)` mata o pedido; o segundo interessado, que
já se juntou à **mesma** promessa, recebe a rejeição com o sinal **dele** não
abortado — e aí `useResource` cai no `.catch` e mostra a mensagem crua. É daí que
sai o **"signal is aborted without reason"**: `signal.reason` é `undefined` quando
ninguém passa motivo, e `MESSAGE(cause)` repassa o `message` do `DOMException` do
`fetch` sem traduzir. Pior: `if (signal.aborted) return entry.promise` devolve a
promessa **sem incrementar `waiters`**, então um interessado pode receber um
pedido que a conta já considera sem dono.

O "Failed to fetch" vem do mesmo `MESSAGE(cause)`: `api/client.ts` e `api/demo.ts`
traduzem o **status HTTP** (`ApiError`), mas não a falha de rede, que chega como
`TypeError: Failed to fetch`.

Isto é leitura de código, não medição no site. Confirmar de verdade pede um build
de produção servido sem API — que é justamente o e2e da Fase 2.

### O que falta, por rota — nada

Conferi rota por rota: tudo o que a `DataGateway` expõe tem arquivo no
instantâneo. Os dois buracos reais são de **escrita**, e são intencionais:
`writeSetpoint` e `acknowledgeAlarm` voltam nulos. A Fase 2 tem de dizer isso na
tela em português, não deixar o botão sem resposta.

### Rota inicial

`ui/screens.ts`: `DEFAULT_SCREEN = 'turno'`, sem olhar a fonte de dados. A Fase 2
pede `#maquina` sem API e `#turno` com API — a decisão passa a depender de
`useDataSource`, que hoje `screens.ts` não conhece.

## 5. O que é suposição e precisa da sua decisão

### 5.1 A relação estimada AIC-901 → AIC-903 — **confirmada como necessária**

`reference/research/relacoes-fopdt.csv` tem 26 relações, e **nenhuma** liga
AIC-901 a AIC-903. A relação 4 é `PIC-514 → AIC-901`. Sem a nova, mexer no vapor
do G4 chega à umidade antes da colagem e para ali. O prompt está certo, e
K = 0,35 / θ = 25 s / τ = 30 s entra com origem `estimado`.

As outras 22 relações do protótipo **batem dígito a dígito com o CSV** — K, θ, τ
e observação. O protótipo deixou de fora quatro do CSV, e as quatro por motivo
que se defende:

| do CSV, fora do protótipo      | por quê                                                  |
| ------------------------------ | -------------------------------------------------------- |
| 11 · `ZIC-205[k] → AIC-902[k]` | zonada; o motor já a exclui da rede MD (`mdRelations()`) |
| 16 · `JIC-101 → AIC-102`       | a saída `AIC-102` (°SR) não está no `OUT` do protótipo   |
| 17 · `FIC-107 → LAB-1211`      | θ = 420 s, τ = 900 s: não cabe num horizonte de 60 min   |
| 18 · `WIC-405 → AI-407`        | mesma família da 6, ganho menor                          |

**Decisão:** a tela nova mostra "N relações · M com fonte" tirado do modelo. Com
a 11, a 16, a 17 e a 18 dentro são 27 relações (26 + 1 estimada); com o recorte
do protótipo são 23. Recomendo **carregar as 27** e deixar o filtro de cenário
esconder as que não participam — é o que a regra "nada pode depender da
quantidade de relações" pede.

### 5.2 Seis entradas em que o protótipo não bate com o catálogo

De 16 entradas do protótipo, **12 batem com o catálogo** em base, mínimo e
máximo. Estas sete não:

| TAG                        | catálogo (fonte B)        | protótipo                 | o que difere                                          |
| -------------------------- | ------------------------- | ------------------------- | ----------------------------------------------------- |
| WIC-401                    | 600 – 1100, alvo **900**  | 700 – 1300, base **1000** | base e faixa (`est:1`)                                |
| PIC-604A                   | 0,8 – 3,0, alvo **1,6**   | 1 – 3, base **2,0**       | base e faixa (`est:1`)                                |
| PDIC-702                   | −80 – 80, alvo **15**     | 0 – 60, base **20**       | base e faixa (`est:1`)                                |
| **PIC-711**                | 40 – 250, alvo **120**    | 40 – 250, base **130**    | **só a base** — e o protótipo não marca como estimada |
| **AIC-601**                | 7 – **13**, alvo 9,5      | 7 – **12**, base 9,5      | só o máximo                                           |
| **WIC-801**                | 40 – **220**, alvo 110    | 40 – **160**, base 110    | só o máximo                                           |
| `AIC-902-SP`, `AIC-903-SP` | não são linha de catálogo | base 75 / 4,8             | setpoints, derivados de AIC-902 e AIC-903 — correto   |

As três primeiras são as que o prompt já declarava como estimadas. As três
seguintes (PIC-711, AIC-601, WIC-801) o prompt **não** menciona, e o protótipo
não marca: entram como estimadas caladas, que é o que a regra 5 proíbe.

Minha recomendação, nas seis: **usar o catálogo**. Todas têm fonte B, e assim
nenhuma faixa estimada é criada. O preço é pequeno — o cenário 6 pede
`WIC-801 = 140`, que cabe nos dois; e `PDIC-702 = 40` do cenário 8 também.
Conferi os oito cenários: **as oito TAGs existem e os onze valores caem dentro
da faixa do catálogo**.

### 5.3 As TAGs — nenhuma falta. As bandas de especificação, seis faltam

**28 de 28 TAGs do protótipo existem.** As 25 de processo estão em
`catalogo-base.csv`; `LAB-1206`, `LAB-1206R` e `LAB-1212` estão em
`packages/shared/src/process/lab.ts`; e os dois `-SP` são setpoints de malha, não
linha de catálogo.

O buraco é outro: o protótipo precisa de **banda de especificação numérica**
(`lo`/`hi`) por saída, e o repositório só tem para três. Onde tem, o protótipo
acertou exato:

| saída                       | catálogo `L` / `H`                              | protótipo `lo` / `hi`       |                                        |
| --------------------------- | ----------------------------------------------- | --------------------------- | -------------------------------------- |
| AIC-902 gramatura           | 73,5 / 76,5                                     | 73,5 / 76,5                 | **igual**                              |
| AIC-903 umidade final       | 4,3 / 5,3                                       | 4,3 / 5,3                   | **igual** (e a LISTA-BASE confirma)    |
| AIC-905 espessura           | 98 / 106                                        | 98 / 106                    | **igual**                              |
| AIC-306 água branca         | — (min/max 0,12 / 0,35)                         | 0,12 / 0,35                 | reusou min/max                         |
| AIC-904 cinzas              | 19 / 23                                         | **20 / 22**                 | mais estreita                          |
| AI-907 opacidade            | `L` = 89, sem `H`                               | **90 / 95**                 | inventou o `H`                         |
| XI-606A pickup              | — (min/max 1,5 / 2,2)                           | **1,5 / 2,1**               | mexeu no alto                          |
| AIC-901 umidade pré-colagem | — (min/max 3,5 / 7,5)                           | **4,6 / 5,8**               | inventou                               |
| AI-407 teor seco            | — (min/max 48 / 54)                             | **47 / 53**                 | inventou, e a base é 50 contra alvo 51 |
| LAB-1206 tração MD          | `lab.ts`: "5,2 MD / 2,4 CD" (alvo, sem limites) | **4,8 / 5,8**               | inventou                               |
| LAB-1206R razão MD/CD       | `lab.ts`: "≈ 2,17"                              | base **2,4**, **2,0 / 2,8** | **a base também difere**               |
| LAB-1212 curl               | `lab.ts`: "−10 a +10"                           | **−5 / +5**                 | metade                                 |

**Decisão, por grupo:** nas três primeiras não há o que decidir — já são fonte B.
Em `AIC-306` e `XI-606A`, usar min/max do catálogo. Nas seis que faltam
(`AIC-904`, `AI-907`, `AIC-901`, `AI-407`, `LAB-1206`, `LAB-1212`) e na base de
`LAB-1206R`, ou se preenche a coluna `L`/`H` do catálogo com fonte declarada, ou
entram como `estimado` na tela. Recomendo o primeiro: a banda de especificação é
dado de processo, e o lugar dela é o catálogo, não a tela.

Nota: a conta de produção **tem fonte**. A LISTA-BASE diz "45 t/h (8 m ×
1.250 m/min × 75 g/m²)", e é exatamente o `8*v*gram*60/1e6` do protótipo.

### 5.4 As malhas: a sintonia do prompt não é a do código

O prompt pede `Kc = τ/(K·(λ+θ))`, `Ti = τ`, com λ = 90 s (gramatura) e λ = 45 s
(umidade final). O código (`pi.ts`, `simcTuning`) usa o mesmo `Kc`, mas
`Ti = min(τ, 4·(λ+θ))`, e **não tem λ fixo**: quando ninguém passa λ, usa `λ = θ`.
Decidir: fixar λ = 90/45 como o prompt diz (e mudar a resposta das duas malhas em
todas as telas que já usam o motor), ou manter o SIMC e deixar os números saírem
da relação.

### 5.5 Duas malhas ou seis

O prompt descreve **duas** malhas (gramatura e umidade final). O motor tem
**seis** cascatas: `AIC-901/PIC-514`, `AIC-902/FIC-105`, `AIC-903/PIC-711`,
`AIC-904/FIC-106`, `AIC-905/WIC-801`, `AIC-306/FIC-109`. Decidir: a tela nova
mostra as seis — e aí o cenário 5, vapor do G4, encontra a malha de AIC-901 em
automático — ou só as duas.

### 5.6 `dist` (perturbação) não é um tipo que o catálogo tenha

O catálogo tem a coluna `controlada` (sim/não), não `kind`. O prompt trata
`AIC-104` (consistência da massa grossa) como perturbação no cenário 3, mas no
catálogo ela é `controlada = sim`. Decidir de onde sai o `kind`: coluna nova no
CSV, ou uma lista na tela.

### 5.7 A décima tela

`quebra` (replay de quebra) não aparece no layout novo. Decidir: entra como seção
de baixo de alguma tela, continua contextual com a casca nova, ou sai.

### 5.8 O outro prompt

`prompt-simulador-de-variaveis.md` (147 variáveis, 226 relações) **não existe
neste repositório**, e o catálogo atual tem 111 variáveis e 26 relações. A regra 7
não se aplica — nada está sendo substituído.

---

### 5.9 `dist` no protótipo: só uma

De 16 entradas, só `AIC-104` é `kind:'dist'`. Todas as outras 14 são `mv` e as
duas `-SP` são `sp`. Então o grupo "Perturbações" do seletor da Fase 6 abriria
com **um** item. Decidir quais outras entram: candidatas naturais são as que
ninguém move de propósito no turno — consistência, temperatura da água, receita
de fibra —, mas nenhuma delas tem hoje marca de perturbação no catálogo (5.6).

---

## Decisões tomadas — 27/11/2026

A Fase 0 está fechada. O que foi decidido, para a Fase 1 em diante não precisar
reabrir nada:

| #   | decisão                                                                                                          |
| --- | ---------------------------------------------------------------------------------------------------------------- |
| 5.1 | **27 relações.** A zonada `ZIC-205[k] → AIC-902[k]` fica só no motor: a tela não mostra perfil CD.               |
| 5.2 | **Catálogo** nas seis entradas (WIC-401, PIC-604A, PDIC-702, PIC-711, AIC-601, WIC-801). Nenhuma faixa estimada. |
| 5.3 | **Catálogo**, com cuidado por saída (ver abaixo).                                                                |
| 5.4 | **SIMC** — a sintonia que já está em `pi.ts`. Sem λ fixo de 90/45.                                               |
| 5.5 | **Seis cascatas** (ver as consequências abaixo).                                                                 |
| 5.6 | **Coluna `kind` no CSV** (`sp` / `mv` / `dist`).                                                                 |
| 5.7 | **Quebra contextual** dentro da casca nova.                                                                      |
| 5.9 | **Só `AIC-104`** como perturbação. Não inventar perturbação sem relação.                                         |
| §2  | Fundir `caixa`+`formação` e `qcs`+`pope` **só no mapa do Simulador**, não nos chips do Processo.                 |

### 5.3, saída por saída

| saída                               | o que usar                                                              | origem                                        |
| ----------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------- |
| AIC-902, AIC-903, AIC-905           | `L`/`H` do catálogo (73,5/76,5 · 4,3/5,3 · 98/106)                      | `fonte` (B)                                   |
| AIC-904                             | `L`/`H` do catálogo: **19–23** — não os 20–22 do protótipo              | `fonte` (B)                                   |
| AI-907                              | a banda que o catálogo tem: **`L` = 89** — não o 90/95 do protótipo     | `fonte` (B)                                   |
| AIC-306, XI-606A                    | min/max do catálogo                                                     | `fonte` (B)                                   |
| AI-407                              | base = **alvo 51** do catálogo, não os 50 do protótipo                  | `fonte` (B)                                   |
| AIC-901, AI-407, LAB-1206, LAB-1212 | banda: **`fonte` só se a pesquisa B trouxer o número; senão `assumed`** | a conferir em `pesquisa-B-manual-processo.md` |
| LAB-1206R                           | base do `lab.ts` (≈ 2,17), não os 2,4 do protótipo                      | `fonte` (B)                                   |

### 5.5, as consequências

Com seis cascatas, `PIC-514` e `WIC-801` passam a ser **MV de cascata** e ficam
travados em automático — e são justamente as entradas dos cenários 5 e 6.
Portanto:

- **cada cenário carrega o próprio modo de malha**, e não herda o que estava na
  tela;
- os cenários **5 (economizar vapor no G4)** e **6 (mais carga na calandra)**
  abrem **em manual**, com a linha "em automático a cascata seguraria a
  umidade / a espessura";
- entram **dois cenários novos, em automático**: setpoint de `AIC-901` (umidade
  antes da colagem) e setpoint de `AIC-905` (espessura);
- **total: 10 cenários**, não 8.

## O que falta para a Fase 0 fechar

Nada. As nove decisões estão tomadas e registradas acima. A Fase 1 pode começar.

Dois pontos herdados, que a Fase 1 carrega:

1. **O que a Fase 5 vai precisar fazer no dado**, por causa de 5.3 e 5.6: uma
   coluna `kind` no `relacoes-fopdt.csv` ou no `catalogo-base.csv`, as bandas de
   `AIC-901`, `AI-407`, `LAB-1206` e `LAB-1212` conferidas contra
   `pesquisa-B-manual-processo.md` (e marcadas `assumed` se não estiverem lá), e
   os dois cenários novos em automático.
2. **A fase mexeu em três arquivos** e em nenhum do app:
   `reference/design/papertwin-layout-v2.html` (o protótipo copiado),
   `docs/fase-0-levantamento.md` e `docs/progress.md`.
