# Progresso — PaperTwin (fases 4 a 7)

Memória de trabalho da execução autônoma. Fonte de verdade do código, nesta
ordem: `reference/research/LISTA-BASE.md` + os dois CSVs → `pesquisa-B` →
`pesquisa-A`. Visual: `reference/prototypes/papertwin-telas.html` (7 telas,
1920×1080) e `mp1-parte-seca-3d.html` (cena 3D final).

Branch: `dev/fases-4-7`. Nada de push na main, nada de PR, nada de deploy.

## Checklist

- [x] **4.0** Fontes da pesquisa versionadas em `reference/research/`
- [x] **4.1** Catálogo de variáveis de processo em `packages/shared/src/process`
- [x] **4.1b** `driveGroup` → `steamGroup` (modelo, banco, API, web) + migration 002
- [x] **4.2** Relações FOPDT + núcleo de simulação de 1ª ordem com tempo morto
- [x] **4.3** Grupos de vapor como dado de primeira classe
- [x] **4.4** Entidades de operação + historiador estilo PI
- [x] **4.5** `docs/notas-para-readme.md`
- [x] **5** Motor de simulação e API
- [x] **6** As 7 telas (6.1 a 6.6)
- [ ] **J0** Gabarito da API TypeScript em `reference/golden/`
- [ ] **J1–J5** `apps/api-java`: catálogo, núcleo, persistência, retomada, API
- [ ] **J6** Contrato com o front via `openapi.json`
- [ ] **J7** Dockerfile e ajuste para 512 MB
- [ ] **J8** Remover `apps/api`
- [ ] **7** Acabamento: Playwright, performance, acessibilidade, CI, checklist de deploy

## Mudança de rumo — back-end em Java

A partir de 31/10/2026 o back-end passa a ser **Java 21 + Spring Boot 3.x**, em
`apps/api-java`. O front continua React + TypeScript. A razão é de
posicionamento: o portfólio é de back-end Java/Spring, e este é o projeto
principal.

A API TypeScript **não** é apagada antes da hora: ela vira o gabarito. As saídas
dela para entradas fixas são gravadas em `reference/golden/` (fase J0) e a
implementação Java tem de reproduzi-las. Só quando todos esses testes passarem e
o front rodar contra a Java é que `apps/api` sai, num commit próprio.

## O que foi feito

### 4.0 — fontes no repositório

`reference/research/` passou a ser versionado: `LISTA-BASE.md`, `catalogo-base.csv`
(75 variáveis: 68 tags próprias + 7 padrões por cilindro), `relacoes-fopdt.csv`
(23 linhas / 15 relações), `pesquisa-A-varredura.md` e
`pesquisa-B-manual-processo.md`. Também entrou
`reference/prototypes/papertwin-telas.html`, o protótipo das 7 telas aprovadas,
e a versão final de `mp1-parte-seca-3d.html` (parte úmida + motores do lado
acionamento + navegação WASD).

### 4.1 — catálogo de processo

`packages/shared/src/process`:

- `types.ts` — `ProcessVariable`, `AlarmLimits` (4 níveis, `null` quando não há),
  `Compression` (`excDev`/`compDev`, o ponto de partida do histórico estilo PI),
  `PerCylinderPattern`.
- `per-cylinder.ts` — a gramática do marcador `nn`, casado por âncora e não por
  substring (o catálogo tem "sca**nn**er": `includes('nn')` classificaria
  `AIC-901` como padrão por cilindro).
- `catalog.generated.ts` — escrito pelo gerador a partir do CSV, nunca à mão.
- `catalog.ts` — expande os padrões por cilindro **sobre os cilindros que o
  modelo da máquina declara**, não sobre um 36 fixo, então catálogo e máquina
  não podem divergir.
- `scripts/catalog-csv.ts` + `scripts/generate-process-catalog.ts` —
  `npm run generate -w @mp1/shared`.

### 4.1b — `driveGroup` → `steamGroup`

A lista base mostrou que o agrupamento G1–G6 do modelo é de **vapor** (mesma
válvula, mesmo ΔP de sifões, mesmo tanque separador), não de acionamento.
Renomeado em `MachineAsset`, no modelo, nas queries, no schema da rota e no
painel da web. Migration `002_steam_group.sql` renomeia a coluna em vez de
editar a 001, porque a 001 já consta na `schema_migration` de quem subiu o
Postgres do docker-compose.

### 4.2 — relações FOPDT

- `relation-types.ts` — `FopdtRelation` (saída em **desvio** do ponto de
  operação, para poder somar) e `LabVariable`.
- `lab.ts` — os 13 ensaios da §12.2 da pesquisa B, escritos à mão (as células
  vêm em LaTeX); o teste lê a tabela da pesquisa e exige que as listas batam.
- `relations.generated.ts` / `relations.ts` — as 23 do CSV + a relação `5d`
  herdada da observação da nº 5 ("aplicar também a PIC-712"), com os
  coeficientes copiados em tempo de carga e fonte rebaixada para `assumed`.
- `apps/api/src/simulation/fopdt.ts` — discretização exata (ZOH,
  `a = exp(−dt/τ)`), não Euler: o catálogo tem τ de 4,5 s e um passo de 10 s
  faria o Euler divergir. Linha de atraso em anel para o tempo morto,
  superposição para as saídas com várias entradas (a gramatura tem quatro).
- `apps/api/src/simulation/cd-profile.ts` — kernel gaussiano do controle CD,
  normalizado **pelo pico** e não pela soma, porque o `kp` da pesquisa é a
  resposta medida na própria zona.

### 4.3 — grupos de vapor como dado de primeira classe

A divisão saiu de dentro de `mp1.ts` e virou `machine/steam-groups.ts`:
`DRYER_STEAM_GROUPS` exportado, `DRYER_CYLINDER_COUNT` derivado dos pares
(não um 36 escrito à mão) e `sectionOfCylinder`. O módulo não importa o modelo,
e por isso pode ser importado por ele.

Duas invariantes são verificadas **ao carregar**, não só em teste:

1. cobertura contígua de 1 a `DRYER_CYLINDER_COUNT`, sem furo e sem
   sobreposição — um cilindro sem grupo não teria tag, e duas faixas sobrepostas
   dariam tag duplicada;
2. grupo contido numa seção — um grupo é uma válvula de vapor, e a válvula fica
   na pré (`PIC-51x`) ou na pós (`PIC-71x`); uma faixa que atravessasse a
   fronteira não teria tag de pressão.

`process/steam-groups.ts` é o grupo resolvido: cilindros, tags dos cilindros e
dos mancais, e as variáveis de processo buscadas **no catálogo** em tempo de
carga — se uma linha sair do CSV, a importação falha em vez de a tela mostrar um
traço. Também confere, ao carregar, que a seção do ativo no modelo bate com a
seção declarada do grupo.

Proveniência em dois campos, com vocabulários diferentes: `division` (`assumed`,
vocabulário do modelo) e `tagMap` (`B`, vocabulário do catálogo). Num campo só,
o mapa de tags — que é medido — herdaria o `assumed` da divisão, que é chute.

G5 e G6 ficam com `condensateLevel: null` e uma nota: a pesquisa B dá tag de
nível só para os quatro tanques da pré-secagem (`LIC-531`…`534`) e nenhuma para
a pós, embora dê o ΔP dos sifões dos dois (`PDIC-721/722`). O tanque existe na
máquina; a medição não está no catálogo. Inventar `LIC-731` daria ao simulador
um número que ninguém mediu com a cara dos outros quatro.

### 4.4 — entidades de operação e historiador

Dividida em quatro subfases, cada uma com commit verde.

**4.4a — tipos.** `packages/shared/src/operations`, um módulo por entidade:
turno, bobina jumbo, quebra de folha, troca de gramatura, ronda, nota de
manutenção, alteração de setpoint, alarme. Cada módulo carrega a sua
proveniência, num **terceiro** vocabulário (`B` / `ISA-18.2` / `assumed`) —
separado do do modelo da máquina e do do catálogo, porque o alarme tira os
estados da LISTA-BASE e a taxa de inundação de uma norma que o catálogo nunca
cita.

**4.4b — um repositório, dois drivers.** Antes cada driver tinha a sua classe de
repositório, com os mesmos métodos escritos duas vezes. Com as entidades de
operação e o historiador passariam de trinta, e duas listas de trinta métodos
iguais divergem sem ninguém notar — os testes rodam sempre no PGlite. Agora o
que varia por driver são três operações (`executor.ts`) e o repositório é um só
(`sql-database.ts`). Sem mudança de comportamento.

**4.4c — esquema e repositório das entidades.** Migration 003, doze tabelas.
Listas são tabela filha (passagem, sinais, pontos, evidências), não array nem
jsonb: array depende de o driver serializar igual, jsonb perde a chave
estrangeira. As consultas das filhas usam marcadores montados `in ($1, $2, …)`
porque `= any($1)` sem anotação de tipo é exatamente o caso em que a inferência
do PGlite falha. As restrições repetem o que o tipo garante, e um teste lê a
migration e cobra que as enumerações do SQL e as de `@mp1/shared` sejam a mesma
lista.

**4.4d — historiador estilo PI.** Migration 004, três tabelas: ponto, bruto,
arquivo. O arquivo guarda `point_id` e não a tag — 320 pontos, ~12 bytes de tag
por linha na tabela e outros tantos no índice, num banco de 0,5 GB isso é um
quarto do espaço. O id é o índice da variável no catálogo, não uma sequência do
banco: com sequência, a ordem de semeadura decidiria os ids e o instantâneo do
modo de demonstração apontaria para os pontos errados.

A compressão é em dois estágios, em `packages/shared/src/historian`:

- **filtro de exceção** — "este valor é novidade?". Quando é, manda a amostra
  anterior junto, senão o degrau viraria rampa. No teto de tempo **não** manda,
  porque não há degrau para preservar.
- **porta oscilante** — "este trecho ainda cabe numa reta?". Reduz uma rampa de
  mil amostras a duas pontas.

Dois achados documentados, que os testes levantaram: o erro da reta que o
gráfico desenha chega a **2 · `compDev`**, não `compDev` (o corredor garante que
_existe_ uma reta boa, não que a corda entre dois arquivados seja ela); e a
porta fecha **uma amostra depois** da mudança, então o vértice de um canto é
arquivado um passo adiante de onde aconteceu.

A conta da retenção (`retention.ts`) é explícita: 320 pontos, ~88 B por linha
arquivada com índice, 300 MB de orçamento → 3.409.090 linhas → a 7 dias, 1.521
linhas por ponto por dia, ou uma a cada ~57 s. É orçamento, não previsão: a taxa
real sai de `historianUsage()` depois de a Fase 5 rodar um turno, e o botão de
ajuste é `ARCHIVE_RETENTION_DAYS`.

O bruto é um buffer de 15 minutos. Um PI de verdade não guarda bruto — o filtro
roda na coleta e o descarte não existe depois. A tabela existe para se poder
_ver_ o que o filtro jogou fora, e a 1 s os 320 pontos geram 19.200 linhas por
minuto: uma semana de bruto passaria de 100 GB.

A poda não roda em laço de fundo. O host gratuito dorme sem tráfego, e um laço
que depende do processo estar vivo não poda nada.

### 4.5 — notas para o README

`docs/notas-para-readme.md`: material bruto, não texto final (regra 6). Catorze
seções — arquitetura e direção das dependências, números medidos do modelo
(134 ativos, 86 mancais, 36 cilindros), do catálogo (320 variáveis, 55 malhas,
183 pendentes), das relações (24, tempo morto de 6 a 270 s, τ de 4,5 a 450 s),
do historiador e dos testes (417 passando, 97 pulados por falta de
`DATABASE_URL`); as decisões que valem no texto com a razão ao lado; as
migrations e os padrões do esquema; os comandos; o que o deploy assume; a lista
de suposições; e como refazer cada número a partir do código.

Dois números foram corrigidos ao medir: são **13** ensaios de laboratório (não 12) e **86** mancais (dois por corpo girante, não só os dos cilindros).

### 5 — motor de simulação e API

Sete commits. O que sustenta tudo são duas decisões tomadas na 5.1 e uma
correção que um teste forçou na 5.5.

**Ruído por posição, não por sequência.** Um gerador pseudoaleatório comum
guarda estado: o n-ésimo número depende de quantas vezes ele foi chamado. Como a
API dorme e precisa recalcular o intervalo que faltou, isso faria "recalcular"
diferir de "rodar contínuo". Aqui o ruído é função pura de (semente, passo,
canal). O ruído correlacionado é um FIR exponencial, e não um filtro de primeira
ordem, pelo mesmo motivo — o filtro teria estado.

**Grade de passos absoluta.** O passo `k` é sempre `SIM_EPOCH + k · 1 s`, então
rodar 100→200 e 200→300 dá o mesmo que 100→300. A varredura do historiador é
ancorada nessa grade (`tick % scanTicks`), e não no início da retomada: com o
intervalo contado do início, um trecho reexecutado entraria duas vezes no
arquivo, deslocado de um ou dois segundos, e o `on conflict do nothing` não
reconheceria a repetição.

**A rede tem estado, e eu estava tratando como se não tivesse.** O teste que
comparou "de uma vez" com "em pedaços" acusou diferença na nona casa decimal.
A causa era de desenho: as linhas de atraso guardam o que entrou nos últimos θ
segundos (270 s na relação mais lenta) e os integrais das malhas são a memória
delas, e cada retomada montava a rede no ponto de operação. Acordar no meio de
uma troca de gramatura perdia a transição inteira. Agora o estado é gravado em
`jsonb` (~1.300 números, ~25 KB) e "recalcular = rodar contínuo" vale de verdade
dentro do teto.

**Malhas ajustadas por SIMC** sobre os coeficientes que a pesquisa mediu —
`Kc = τ/(K(λ+θ))`, `Ti = min(τ, 4(λ+θ))`, `λ = θ`. A gramatura responde em
minutos porque tem 75 s de tempo morto; a espessura em segundos porque tem 6. O
sinal se resolve sozinho: ganho de processo negativo dá `Kc` negativo. O PI tem
trava de integral na saturação, que é o que separa um PI que funciona de um que
parece funcionar.

**Verdade e medida são separadas.** As relações leem a verdade (o processo
responde ao que a válvula fez); as malhas, o historiador e a tela leem a medida
(verdade + ruído). A MV é presa à faixa do catálogo porque a válvula tem fim de
curso; a medida **não** é, senão nenhum alarme de `H`/`HH` fora da faixa
dispararia.

**O ruído de instrumento sai do `excDev`**, metade dele como desvio. Fecha o
ciclo: o filtro de exceção foi dimensionado por tag justamente para separar
tremelique de sinal, então o simulador e o historiador concordam por construção.

**Teto da retomada: 4 h.** Ela roda dentro de uma requisição HTTP, porque não há
processo de fundo. 14.400 passos custam 3,5 s medidos; um dia custaria vinte
segundos e deixaria a primeira visita pendurada. A consequência é um buraco no
histórico quando ninguém abre a tela por horas — inerente ao desenho, e no
checklist de deploy.

**Compressão medida: 198 para 1.** Quatro horas dão 921.600 amostras alimentadas
e 4.649 linhas arquivadas. Sete dias de arquivo cabem em ~17 MB, 6 % dos 300
reservados — o orçamento sobra.

**Entidades derivadas do arquivo**, não acumuladas em memória: a gramatura média
de uma bobina é uma consulta ao historiador. Isso sai de graça em idempotência e
tira um estado inteiro do caminho. Os sinais dos 10 min anteriores a uma quebra
são lidos do arquivo — o cenário perturba uma malha e o processo responde.

**21 rotas**, com a retomada deduplicada e represada num serviço só, relógio
injetável (o instantâneo de demonstração precisa de instante fixo), e stream por
SSE mandando só o que mudou pela régua do `excDev`.

Dois outros achados corrigidos no caminho: a estimativa de vida útil usava
limiar fixo para decidir se a tendência era ruído e passou a comparar a
inclinação com o erro padrão dela mesma; e a lista de bobinas afetadas por uma
troca comparava passo com milissegundo — unidade errada numa comparação, que não
quebra nada e responde errado para sempre.

### 6.5 — a parte úmida, no modelo antes da cena

A cena 3D não podia ser portada direto: o protótipo desenha caixa de entrada,
formador e três prensas, e o `mp1.ts` tinha `headbox` e `forming` como seções
**vazias** e uma prensa inventada de um par só. Como a regra do projeto é que a
cena sai do modelo e uma tag só existe se existir no modelo, a 6.5 começou pelo
modelo.

No modelo (`geometry.ts` e `mp1.ts`):

- Caixa de entrada: um ativo, `MP1-CXE-CE`, sem mancal. Não gira nada nela.
  Entrou um `kind` novo, `headbox`, e a coluna `kind` do banco é texto livre,
  então não precisou de migration.
- Formador de duas telas: 10 rolos, `MP1-FOR-T1-R1` a `T2-R5`. Dois ganham nome
  de função — rolo de peito e rolo de transferência.
- Prensas: 3 nips, 6 rolos, `MP1-PRE-P1-RI`/`RS`/`NIP` e seguintes. Cada nip tem
  tag própria, porque uma nota ou um alarme são sempre de _uma_ prensa.
- O modelo foi de 134 para **179 ativos** (57 corpos, 114 mancais, 5 nips,
  2 scanners, 1 caixa de entrada) e a geometria de 29 para **36 medidas**.

Três decisões que ficam registradas:

1. **Correção no protótipo.** Lá os dois rolos de cada prensa ficam 10 cm
   afastados. Um nip é o ponto de contato: aqui eles encostam, e as duas alturas
   saem do nip e do raio. O X, o raio e a altura média do par são os do
   protótipo.
2. **Os 14 rolos guia de feltro e tela ficam fora do modelo de ativos.** Eles
   aparecem na cena, com geometria e proveniência, mas sem tag e sem mancal
   monitorado: giram puxados pelo feltro e nenhuma fonte os nomeia. Promovê-los
   encheria a tela de Mancais com 28 pontos que ninguém mede. Há teste cobrando
   a decisão.
3. **Quem tem motor sai do raio.** O protótipo põe cardã, redutor e motor em
   todo rolo de raio ≥ 0,38 m. Virou `DRIVEN_ROLL_MIN_RADIUS_M`, e o lado
   acionamento é gerado daí — acrescentar um par de cilindros no modelo
   acrescenta dois acionamentos na cena, sem lista escrita à mão.

Na cena: `Headbox`, `FormingSection`, `PressSection` reescrita, `WetEndStructure`
e `DriveSide`. Duas coisas valem nota:

- **Telas e feltros são a envoltória convexa dos rolos que abraçam.** Um tecido
  esticado em volta de vários rolos assume exatamente isso: corre reto entre dois
  e se enrola no contorno de cada um. Mover um rolo guia reacomoda o circuito
  inteiro sozinho, sem ninguém reescrever caminho nenhum.
- **O lado acionamento é malha instanciada**, com as fileiras decididas pela
  geometria: um rolo vai para a fileira seguinte quando a sua já tem vizinho a
  menos de 1 m. São ~700 peças em 16 chamadas de desenho.

Três ajustes de cena que a conferência contra o protótipo pediu:

- A parede do fundo foi de −16 para −24 m. Com os motores na cena, 6 m de
  corredor atrás deles não davam espaço para olhar a fileira de frente — a
  primeira tentativa de enquadramento ficou preta.
- O nevoeiro foi de 35–120 para 60–220 m, como no protótipo. A máquina agora tem
  ~96 m e a visão geral olha de 80: com o alcance antigo a metade seca sumia.
- A visão geral ficou a 16 m de altura, não aos 26 do protótipo. **O teto aqui
  está a 19 m e lá a 34** — é uma divergência conhecida contra o protótipo, e a
  câmera alta só não mostrava o telhado por fora porque o plano do teto tem uma
  face só. Depender disso seria depender de um descuido.

Conferido contra `mp1-parte-seca-3d.html` aberto lado a lado, nas quatro vistas:
visão geral, parte úmida, úmida → seca e lado acionamento. Os enquadramentos das
vistas novas são os do protótipo, com as exceções acima.

## Suposições para o Felipe revisar

1. **`CD_ZONE_COUNT = 140`** (`process/relations.ts`). O catálogo diz
   "vetor de 120–160 zonas" — uma faixa, não um número. O valor importa porque
   converte o σ de 45 mm do espalhamento lateral para zonas: 140 zonas em 8 m
   dão 57,1 mm cada, e o σ fica em ~0,79 zona (alcance ±2, 5 zonas afetadas).
2. **Relação `5d` (PIC-712 → AIC-903)** herdada da nº 5. Sem ela, mexer no vapor
   do G6 não mudaria a umidade final. Fonte `assumed`.
3. **Divisão G1–G6 e nº de pares de cilindros** (13 pré + 5 pós) continuam
   `assumed`, como já estava. O único ponto fixo é o CS23 no G4.
4. **Grupos de vapor** G1 CS1–6 · G2 CS7–12 · G3 CS13–18 · G4 CS19–26 ·
   G5 CS27–32 · G6 CS33–36, como a LISTA-BASE escreve.
5. **Quadro de turnos**: três turnos de 8 h a partir das 06:00, letras A, B, C.
   A pesquisa não dá a escala da MP1, e uma quarta letra exigiria a regra de
   rotação das equipes. Fuso fixo em −03:00 (sem horário de verão desde 2019),
   para a simulação não mudar com a versão dos dados de fuso.
6. **Prioridade das notas (1–4)**: a LISTA-BASE dá a escala, não o significado.
   Adotado: 1 parada imediata, 2 próxima parada programada, 3 parada de
   manutenção, 4 quando houver oportunidade.
7. **Situações da nota**: aberta / planejada / em execução / encerrada. A lista
   pede o campo e não enumera os valores.
8. **Escalas da ronda**: ruído normal/elevado/anormal e vazamento
   nenhum/gotejamento/jato. Mesma razão.
9. **Evidência da nota é referência, não arquivo.** O gêmeo não guarda foto nem
   anexo — não teria onde, nos 0,5 GB — e aponta para o que já existe: janela de
   tendência, alarme, ponto de ronda, medição.
10. **Alarme**: nomes das quatro prioridades (baixa/média/alta/crítica), banda
    morta de 1 % da faixa de operação e teto de um turno para o engavetamento.
    A ISA-18.2 exige que existam; os valores são nossos. As prioridades que a
    pesquisa nomeia em prosa (alagamento dos sifões, nip da calandra a 92 °C,
    falta de óleo no mancal) estão numa tabela de exceções com fonte `B`.
11. **Historiador**: teto de 1 h entre valores arquivados (o `CompMax` do PI usa
    8 h; com 8 h um turno estável teria um ponto só) e 10 min entre valores que
    passam o filtro de exceção. Retenção de 7 dias no arquivo e 15 min no bruto.
12. **Simulação**: passo de 1 s, varredura do historiador de 5 s, teto de
    retomada de 4 h, semente escrita (`20260101`). A grade de passos é ancorada
    em 2026-01-01.
13. **Atraso da MV** seguindo o próprio setpoint: τ de 6 s (válvula + malha
    escrava). **Ruído de processo** correlacionado com τ de 10 s.
14. **Temperatura de superfície do cilindro**: saturação do vapor do grupo menos
    8 °C. A aproximação `T = 100·(p_abs/101,325)^0,25` erra até ~1,5 % na faixa
    da secagem, e os 8 °C foram escolhidos para o G4 cair no alvo de 125 °C do
    catálogo.
15. **Bobina**: ~53 min pela geometria (núcleo de 600 mm, 3.000 mm de troca,
    102 µm). **A pesquisa diz "~45 min"** — os dois não cabem juntos, e o
    desempate adotado foi a geometria, porque sai de três valores especificados
    enquanto os 45 min são prosa aproximada na coluna de amostragem do
    laboratório. Com núcleo de 1,2 m os 45 min voltam a fechar; há teste dos
    dois casos.
16. **Cenários**: uma troca de gramatura por dia no turno B, três horas depois
    do começo, alternando 75 ↔ 80 g/m²; uma quebra de folha por dia, no turno
    que o dia escolher, durando 22 min, com a perturbação entrando 10 min antes;
    uma ronda por turno, duas horas depois do começo, durando 40 min, com seis
    pontos.
17. **Degradação do mancal**: 72 h de janela terminando _agora_, no CS23 MLA. É
    escolha de apresentação — o gêmeo precisa ter o que mostrar a quem abre a
    tela hoje — e está dita no código.
18. **Ronda**: o pirômetro de campo lê 3 °C abaixo do sensor do mancal.
19. **Limiar dos sinais de quebra**: três vezes o `excDev` da tag.
20. **`reference/research/` e `papertwin-telas.html` entraram no repositório.**
    Eram arquivos não versionados no teu checkout. O conteúdo é byte a byte o
    mesmo; se o `git merge` na main reclamar de "untracked working tree files
    would be overwritten", apaga as cópias locais antes do merge — elas passam a
    vir do repositório.

21. **Arranjo inteiro da parte úmida** (`WET_END_LAYOUT`): caixa de entrada,
    formador de duas telas e três prensas saíram do protótipo navegável, não de
    documento. A MP1 real pode ter mesa plana, outro nº de prensas e outra
    sequência de telas. Tudo marcado `assumed`.
22. **Rolos guia de feltro fora do modelo de ativos** (`FELT_ROLLS_NOT_ASSETS`).
    Se o mapa de rolos der tag a eles, entram — e a tela de Mancais cresce 28
    pontos.
23. **Corte de 0,38 m para acionamento próprio** (`DRIVEN_ROLLS`). É o corte do
    protótipo. A lista de acionamentos da MP1 é documento interno.
24. **Nips de prensa com os rolos encostados**, contra os 10 cm de folga do
    protótipo. Vale conferir a carga de nip real.

## Próximo passo exato

Fase 6: as 7 telas de `reference/prototypes/papertwin-telas.html` em `apps/web`,
com dados reais da API e o instantâneo do modo de demonstração regenerado.

Ordem planejada:

1. **6.1 — fundação**: cliente da API para as rotas novas, navegação por teclas
   1–7 como no protótipo, moldura das telas (cabeçalho, estados vazio, carregando
   e erro), e os gráficos. Sem biblioteca pesada se der; se usar, uma só.
2. **6.2 — Turno, Bobinas, Notas**: as três de tabela, que exercem o cliente e
   os estados.
3. **6.3 — Processo e Mancais**: as duas de gráfico, com tendência por `plot
values`, limites de alarme desenhados e escrita de setpoint.
4. **6.4 — Rondas**: campo ao lado do online.
5. **6.5 — Máquina**: a cena 3D portada de `mp1-parte-seca-3d.html` para R3F
   gerada do `mp1.ts` (parte úmida, seções, cilindros, motores do lado
   acionamento, papel), com clique em mancal abrindo o painel de vibração.
6. **6.6 — instantâneo de demonstração** regenerado cobrindo as rotas novas,
   com instante fixo (o relógio da aplicação já é injetável).

Fase 6 fechada. O instantâneo foi regenerado com o modelo novo: **954 arquivos,
911 kB, 179 ativos**, compressão 203:1.

### O que vem agora: J0 — gabarito da API TypeScript

Gravar em `reference/golden/` (JSON, versionado) as saídas da implementação
atual que a Java tem de reproduzir:

1. **FOPDT**: séries de degrau de 3 relações, incluindo a de τ = 4,5 s com
   dt = 10 s, e o espalhamento CD da ZIC-205[70].
2. **Historiador**: entrada bruta + saída depois do filtro de exceção + swinging
   door para 3 tags com `excDev`/`compDev` diferentes; interpolação e plot
   values.
3. **Alarmes**: a sequência ISA-18.2 de um cenário — ativo → reconhecido →
   normalizado, engavetamento, inundação.
4. **Simulação**: valores de ~20 tags para semente fixa em 3 intervalos,
   incluindo retomada depois de "dormir".
5. **Respostas de cada rota da API** para um estado fixo.

Commit: "gabarito da API TypeScript".
