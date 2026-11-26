# Revisão de 1142 px — o que estava errado e o que ficou decidido

Uma revisão da interface rodando no Chrome com a janela em 1142 px de largura
apontou dez erros de lógica e uma lista de atropelos de layout. Este documento
registra o que cada um era de verdade — quase nenhum era o que parecia — e as
decisões que ficaram, para elas não serem reabertas do zero daqui a três meses.

A ordem é a do pedido: primeiro a lógica, que vale em qualquer largura, depois o
layout.

---

## 1. "AO VIVO" com o relógio parado

**O que se via.** O selo do cabeçalho dizia AO VIVO, o relógio parava na hora da
carga e Gramatura e Velocidade congelavam. Nenhuma requisição nova saía.

**O que era.** Duas coisas, uma em cima da outra.

A primeira: **nenhuma tela assinava o stream.** A API serve `/stream` por SSE
desde a Fase 5 — dois segundos de intervalo, só as tags que mudaram, evento de
manutenção a cada quinze segundos — e não havia um `EventSource` em lugar nenhum
do `apps/web`. A moldura buscava `/process/values` uma vez, no `useFrame`, e
nada mais saía. O selo respondia "de onde vêm os números", que é outra pergunta,
e a resposta dele estava certa; mas quem olha um painel com AO VIVO escrito e um
relógio correndo não lê "a fonte é a API", lê "isto é agora".

A segunda, embaixo: **o stream nunca funcionaria no navegador.** O manipulador
escreve os cabeçalhos com `reply.raw.writeHead`, que vai direto ao socket e
ignora tudo o que os plugins puseram em `reply` — inclusive o
`access-control-allow-origin` do `@fastify/cors`. Com a API em `127.0.0.1:3333`
e a web em `localhost:4173` (ou no domínio do deploy), o navegador abriria a
conexão, receberia o primeiro evento e o descartaria por política de origem:
`onerror`, reconecta, `onerror`, em ciclo.

Esse segundo defeito não aparecia em lugar nenhum. O `curl` funciona — ele não
aplica política de origem. O log da API não registra nada, porque do lado dela
deu tudo certo. E o teste de rota injeta a requisição sem origem. Só o navegador
via, e nenhuma tela assinava o stream para ver.

**O que ficou.**

- `apps/api/src/routes/stream.ts` passa os cabeçalhos do Fastify adiante
  (`sseHeaders`), e há um teste que cobra isso.
- `apps/web/src/ui/useStream.ts` assina `/stream` enquanto a fonte for a API.
- `useFrame` lê o stream para o relógio, a gramatura e a velocidade; os valores
  da busca inicial valem até o primeiro evento chegar.
- O contador de alarmes **não** vem do stream: o quadro traz um número só
  (quantos pedem ação) e a barra mostra três, um por prioridade. Quando esse
  total muda, a moldura rebusca `/alarms`, que é a rota que sabe separar.

**A queda tem de aparecer.** Enquanto o `EventSource` reconecta, a tela não está
ao vivo, e dizer que está é o mesmo erro com outra causa. O selo ganhou o estado
SEM SINAL (ponto vazado, tracejado), e o relógio passa a mostrar o instante do
último evento que chegou. As duas coisas juntas respondem "quando foi isto" e
"ainda está chegando", que são perguntas diferentes.

---

## 2. Três buscas iguais na carga

**O que se via.** `/reels`, `/alarms?limit=200` e `/process/values` saíam três
vezes cada, fora do `StrictMode`.

**O que era.** Três pedidos legítimos, de lugares diferentes, pela mesma coisa,
no mesmo instante: a moldura precisa dos valores e dos alarmes porque a barra
superior aparece em todas as telas; a tela aberta precisa dos mesmos valores
para saber o instante da leitura; e as rotas de dado fixo (`fixtureRoutes`)
derivam as bobinas retidas das bobinas e o alarme da cola dos alarmes, então
pedem as duas listas de novo. Cada um está certo sozinho.

**O que ficou.** `apps/web/src/api/inflight.ts`: uma busca de cada URL por vez.
A segunda chamada da mesma URL enquanto a primeira está no ar recebe a mesma
promessa. Não é cache — a entrada sai do mapa quando a resposta chega, e o
pedido seguinte sai de verdade.

**Por que não no `useResource`,** que foi o que o pedido dizia: o hook recebe uma
função opaca — `(signal) => gateway.reels(…)` — e não tem como saber que duas
delas pedem a mesma URL. Daria para exigir uma chave em cada uma das ~40
chamadas, e bastaria uma errada para o problema voltar sem avisar. A URL **é** a
chave, e quem a conhece é a camada de busca. Represar ali cobre também os
pedidos que não vêm de hook nenhum — os de dentro das rotas de dado fixo, que
eram metade da duplicação.

**O `AbortSignal` precisou de cuidado.** A tentação é rodar o pedido represado
sem sinal, já que o `abort` de uma tela cancelaria a busca da outra. Mas a
sondagem da fonte de dados (`useDataSource`) desiste da API em quatro segundos
**abortando** o pedido: é o `abort` que faz a busca falhar, e é a falha que faz a
tela cair para o instantâneo. Sem sinal, nada falha, o prazo não existe, e uma
API dormindo deixa a tela em "Procurando a API…" para sempre. O pedido tem um
sinal próprio, abortado quando o último interessado desiste.

---

## 3. As curvas do Turno começando às 16:00

**O que se via.** Produção e Velocidade começavam às 16:00 num turno que começa
às 14:00, e já havia bobinas antes disso.

**O que era.** O teto de retomada da simulação é de quatro horas
(`MAX_CATCHUP_TICKS`), e isso está documentado desde a Fase 5: se ninguém abriu a
tela desde o início do turno, o arquivo não tem as primeiras horas dele. O turno
continua sendo de 14:00 às 22:00 — o que falta é arquivo, não produção. As
bobinas aparecem porque são entidades colhidas do plano do turno, que é
determinístico.

A parte que mentia não era a curva: era o **placar**. `production()` integrava de
14:00 até agora e chamava o resultado de "produção do turno", enquanto o ritmo da
meta cobrava as seis horas decorridas. A diferença não era atraso da máquina, era
buraco no arquivo — e o placar culpava o turno por ela.

**O que ficou.** `production()` devolve `coveredFrom` e `gapMs`, o acumulado
conta do primeiro instante arquivado, e o ritmo da meta cobra **o mesmo tempo**.
O placar diz, no cabeçalho, "sem arquivo nos primeiros N min". A meta do turno
continua sendo a das 8 h, porque essa não depende de arquivo nenhum.

---

## 4. Eficiência de tempo em 100,0 % com 22 min de quebra

**O que era.** O painel sempre disse "tempo produzindo / tempo calendário" no
`title`, e mostrava o `efficiencyPct` que a API grava no turno — que é produção
realizada sobre a nominal, presa em 100 por um `Math.min`. Duas grandezas, um
nome. Com a máquina em regime a razão de produção empata com a nominal, o teto
devolve exatamente 100,0 %, e a quebra não aparecia em lugar nenhum do placar —
que é justamente o que a eficiência **de tempo** existe para mostrar.

**O que ficou.** `timeEfficiencyPct(elapsedMin, breakMinutes)` em
`screens/turno/derive.ts`: tempo decorrido menos tempo de folha quebrada, sobre
o tempo decorrido. As quebras são as do turno e a duração de cada uma é a mesma
que a linha do tempo desenha. O `efficiencyPct` da API continua existindo e
continua sendo o que sempre foi; ele só não é mais mostrado com o nome de outra
coisa.

---

## 5. A receita somando 100,16 %

**O que se via.** `XI-161` + `XI-162` davam 100,16 %, e a marca de `XI-161`
ficava colada no fim da barra de faixa.

**O que era.** `XI-161` é `100 − XI-162` por definição, e era exatamente isso na
**verdade** do motor. Só que `publish()` soma ruído de instrumento a cada tag, e
as calculadas passavam por ele como as outras: cada uma levava o seu ruído
independente, e a soma das medidas não fechava. A marca colada no fim da barra
era o mesmo defeito pelo outro lado — `XI-161` passava do máximo de 100 do
catálogo.

**O que ficou.** A calculada não ganha ruído próprio: ela não tem instrumento, é
uma conta que o sistema de informação faz com as leituras que já chegaram. A
verdade dela sai das verdades das entradas e a **medida** sai das **medidas** das
entradas. O ruído continua lá, herdado de quem foi medido de fato, que é de onde
ele vem na planta real. Uma receita que não fecha em 100 % é erro de software,
não imprecisão de medição.

Há teste: `process-engine.test.ts` percorre sessenta passos com ruído ligado e
cobra a identidade e a faixa do catálogo.

---

## 6. A tolerância que não seguiu a gramatura

**O que se via.** Depois da troca de 75 para 80 g/m², a tolerância continuava
73,5–76,5.

**O que era.** O catálogo traz `AIC-902` com L/H em 73,5–76,5 e a nota
"tolerância de laboratório 73.5–76.5". Isso está certo para 75 g/m², que é o
alvo que o catálogo declara — e passa a estar errado no minuto seguinte a uma
troca. 73,5 e 76,5 são 75 menos e mais 2 %: **a fração é que é a regra**, e os
dois números do catálogo são ela avaliada no alvo de lá.

**O que ficou.** `gsmTolerance(gsm)` e `gradeInForceAt(trocas, instante, alvo)`
em `packages/shared/src/operations/grade-change.ts`. A tela de Bobinas mede cada
bobina contra a gramatura em vigor **no início dela** — a bobina que pega a
transição é justamente a que é rebaixada, e o trecho fora que a conta acha é a
evidência disso.

Umidade e espessura continuam com os L/H do catálogo: a umidade final não
depende da gramatura, e para a espessura o projeto não tem regra declarada que
dependa dela. Inventar uma seria pior que usar a do catálogo.

---

## 7. O CS23 com nota aberta **e** nota sugerida

**O que se via.** O CS23 tem a NM-205916 aberta (P2, sem parada) e mesmo assim
ganhava nota sugerida P1 com parada.

**O que era.** A consulta que cala a sugestão filtrava por
`origin = 'tendência'`. A NM-205916 tem origem `alarme`, e passava por baixo
dela. O comentário no SQL dizia "um alarme aberto **não** bloqueia", que é
verdade e é outra coisa: o que bloqueia é a **nota**, que é trabalho já aberto.

**O que ficou.** `ASSETS_WITH_OPEN_NOTE`: qualquer nota não encerrada do mesmo
mancal cala a sugestão. Quem vai ao CS23 com a chave na mão não vai duas vezes
porque uma nota saiu do alarme e a outra da tendência. Um alarme aberto continua
não bloqueando — a sugestão diz o que a tendência projeta, o alarme diz o que o
limite já cruzou, e as duas coisas aparecem juntas no mancal que degrada.

**A prioridade da nota aberta também estava incoerente,** e era a segunda metade
do mesmo problema. `notesFromAlarms` derivava prioridade e parada da prioridade
do alarme: `alta` virava P2 sem parada. Mas o pior valor do CS23 é 5,85 mm/s, que
passa da fronteira C→D de 4,5 — zona D. A sugestão usava a zona ISO e pedia P1
com parada; a nota usava o alarme e pedia P2 sem. Duas leituras do mesmo mancal,
com recomendações opostas.

Agora a nota de vibração usa a **mesma régua** da sugestão: zona C ou D exige
parada, zona D é P1, zona C é P2. A prioridade do alarme continua valendo quando
é mais severa — um alarme `crítica` abre P1 mesmo que a zona não peça. A
temperatura fica na régua do alarme, porque a norma classifica severidade por
velocidade de vibração e aplicar as fronteiras dela a graus Celsius seria
inventar uma classificação.

**Calar não é apagar.** Encerrada a nota, a sugestão volta na conta seguinte — a
razão de calar é "o trabalho já está na fila", e ela deixa de valer quando o
trabalho sai da fila. Há teste para os dois sentidos.

**Consequência que vale registrar:** o mancal em zona D passa a ser apontado pela
nota do alarme, não pela sugestão. Quem sobra para a sugestão é o mancal que
degrada **sem** cruzar limite de alarme — que é exatamente o caso em que prever
vale mais que reagir, e é o que a Fase 6 existe para fazer.

---

## 8. Números em formato inglês, e o zero negativo

**O que se via.** "limite HH (4.5), pior valor 5.85" numa tela em que todo o
resto usa vírgula; e "−0,00 %" na Simulação.

**O que eram.** Dois casos do mesmo princípio por caminhos diferentes.

O primeiro: o sintoma de uma nota é uma frase que o **servidor** escreve e grava,
e a tela só lê. `toFixed` e `String` a deixavam em formato inglês. A regra do
projeto é que todo número da interface passa pelo `format.ts`, mas o `format.ts`
é da web e a API não pode importá-lo. Então a vírgula decimal desceu para o
pacote compartilhado (`packages/shared/src/number.ts`, `ptNumber`), que é onde as
duas camadas se encontram, e `suggestionSymptom` passou a usar o mesmo.

O segundo: `Intl` guarda o sinal do zero, e quem monta sinal e valor em pedaços
separados — porque o sinal tem outra cor — tirava o sinal do número cru. Um delta
de −0,004 dava "−" e "0,00". O `format.ts` ganhou `signOf`, `signedNum`,
`signedInt` e `signedTagValue`, que arredondam **antes** de decidir o sinal, na
mesma casa em que o número vai aparecer.

---

## 9. O aviso de `THREE.Clock` depreciado

**Não é nosso, e não dá para trocar daqui.** Não há um `THREE.Clock` em
`apps/web`, em `packages` ou em `tools` — o `grep` não acha nenhum. Quem o cria é
o `@react-three/fiber` 9.8.2, em `dist/events-*.js`: `clock: new THREE.Clock()`,
no estado da raiz do `Canvas`. O aviso sai uma vez, quando o `Canvas` monta.

Trocar por `THREE.Timer` é mudança dentro da dependência. As saídas são subir o
`@react-three/fiber` para uma versão que já tenha feito a troca, ou conviver com
um aviso por carga. Subir o fiber mexe no que desenha a cena inteira, e não é
coisa para entrar junto de uma correção de layout — fica anotado, com a linha
exata, para ser decidido à parte.

---

## 10. Layout: as larguras garantidas passam a ser quatro

O projeto garantia 1920×1080 e 1440×900. Agora garante também **1280×720 e
1366×768**, e abaixo de 1280 uma faixa discreta no topo diz que a interface é
desenhada para 1280 px ou mais.

### A causa, quase sempre a mesma

Um filho de flex **não encolhe abaixo do conteúdo** sem `min-width: 0`. E
`truncate`, que é o que quase todo rótulo desta interface usa, não mexe em
`min-width` — ele só corta o que já couber na caixa. Então a caixa recusava
encolher, estourava, e o que estourava passava por cima do vizinho. Era isso em
quase toda tela: "Turno B · 14:00–22:00" atrás de Gramatura, o "64" do placar
55 px fora do painel, o selo PARADA debaixo da legenda.

O outro padrão: grades de largura mínima fixa. `INSTRUMENT_GRID` somava 734 px
com os espaçamentos, e a tabela de Processo em 1280 px tem 653 — faltavam 81, e
a grade não tinha de onde tirá-los, então as duas últimas colunas saíam cortadas.

### As decisões

**Dois pontos de corte, com nome de largura.** `piso` (1280 px) e `largo`
(1440 px), em `apps/web/src/index.css`. Nomes de largura e não de dispositivo —
`sm`/`md`/`lg` do Tailwind falam de telefone e tablet, que não é o caso de
nenhuma destas telas.

**Entre `piso` e `largo`, o que sai é consulta; o que fica é operação.** Na barra
superior saem o nome do operador, o dia ao lado do relógio, a barra de faixa da
velocidade e os rótulos "Alarmes"/"Alta"/"Média"/"Baixa". Ficam turno,
gramatura, velocidade, os três contadores, a fonte de dados e a hora. De `largo`
para cima as medidas são as do desenho, sem exceção.

**Cortar com reticências é resultado; cortar em silêncio é defeito.** "Pré-…" com
`title` diz que falta pedaço. "Pré-." não diz nada. Onde o texto precisa caber
inteiro, a largura foi arranjada para que ele caiba (a faixa de seções ganhou um
ponto de fonte a menos e meio ponto de respiro de cada lado); onde não dá, ele
ganha reticências e `title`.

**Nada rola na horizontal.** A tela de Notas era o caso difícil: cinco colunas de
kanban mais um painel de detalhe de 556 px pedem ~1300 px, e em 1280 há 1160.
Abaixo de `largo` os dois empilham — o quadro fica com a largura inteira (232 px
por coluna) e o detalhe vem embaixo, ao alcance da rolagem vertical que o `main`
já tem.

**Rótulo que não cabe em lugar nenhum não é empurrado para cima de outro.** Na
linha do tempo do Turno, `lanes` empurrava o evento sem linha livre para a linha
que terminava mais cedo — a que **menos** se sobrepõe, não uma que não se
sobreponha. Com quatro alarmes no mesmo minuto, quatro rótulos ilegíveis. Agora
ele devolve `null` e o marcador mostra só o símbolo: o traço continua marcando a
hora, o clique continua abrindo o detalhe, e o `title` continua dizendo o que é.
Um rótulo a menos é uma informação a menos; dois rótulos sobrepostos são duas.

**Eixo de tempo pela largura que o eixo tem.** O passo era função só da duração
da janela: numa janela de três horas, quinze minutos — doze rótulos, que cabem
nos 900 px de 1920 e viram uma mancha nos 420 px de 1280. Agora pede-se o menor
passo da lista de múltiplos legíveis que deixe 64 px por rótulo.

**Rótulo de ponta é deslocado pela própria posição.** Com `left` sozinho, o
último rótulo de um eixo começa na borda e cresce para fora — era o "80 km" em
cima da coluna "destino". Deslocando cada um por `−posição × largura dele`, o
primeiro fica alinhado à esquerda, o último à direita, e os do meio
proporcionalmente entre os dois.

### Como isso fica garantido

`apps/web/e2e/largura.spec.ts` roda as nove telas nas **quatro** larguras, com
três perguntas em cada uma (108 casos):

1. nenhum gráfico passa da borda do painel onde mora;
2. nada rola na horizontal;
3. nenhum texto de cabeçalho de painel, nem da barra superior, se sobrepõe a
   outro, passa da borda ou é cortado sem reticências.

A terceira mede o **retângulo visível** — o retângulo do elemento cruzado com o
de todo ancestral que corta. Sem isso o teste acusaria de vazamento justamente o
texto que está sendo cortado direito, porque os pedaços dentro de um `truncate`
mantêm o tamanho que pediriam; o navegador só não os pinta.

### As capturas

`npm run capturas --workspace @mp1/web` grava as nove telas em 1280 e em 1920 em
`docs/capturas/`. Fica fora do `test:e2e` do CI (`testIgnore` em
`playwright.config.ts`): uma rotina que grava 18 imagens por execução sem
ninguém para ver não é teste. A pasta está no `.gitignore` — é artefato de
revisão, refeito quando se quer olhar.
