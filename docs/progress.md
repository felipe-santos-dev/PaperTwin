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
- [ ] **6** As 7 telas
- [ ] **7** Acabamento: Playwright, performance, acessibilidade, CI, checklist de deploy

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

## Cena 3D — migração para o pipeline do Blender

Troca do protótipo procedural em R3F pelo pipeline testado em
`reference/prototypes/secagem-teste/`: geometria gerada por script no Blender,
luz assada em lightmap, materiais TSL e WebGPU com queda para WebGL2. Escopo: a
máquina inteira, da caixa de entrada à enroladeira.

Fases, cada uma com revisão do Felipe: **(a)** exportador + gerador + corte
lateral · **(b)** bake e arquivos em `public/scene` · **(c)** cena nova no R3F
com mancais e portas · **(d)** testes, lint, typecheck e build verdes.

### Ambiente

O `bpy` só publica wheel `cp313` (`requires_python == 3.13.*`) e a máquina só
tinha Python 3.14. Resolvido sem trocar de abordagem, com o `uv` que já estava
instalado:

```
uv python install 3.13
uv venv --python 3.13 tools/scene-bake/.venv
uv pip install --python tools/scene-bake/.venv -r tools/scene-bake/requirements.txt
```

`tools/scene-bake/.venv/` está no `.gitignore`; o `requirements.txt` refaz o
ambiente (bpy 5.2.3, numpy, pillow).

**Armadilha do worktree:** o worktree não tinha os links de workspace em
`node_modules/@mp1`, então `tsc` resolvia `@mp1/shared` para o checkout
principal e não enxergava as constantes novas. `npm install` dentro do worktree
resolve.

### Comandos

```
npm run export:machine --workspace @mp1/shared     # modelo -> tools/scene-bake/machine.json
tools/scene-bake/.venv/Scripts/python tools/scene-bake/build.py secao     # corte lateral
tools/scene-bake/.venv/Scripts/python tools/scene-bake/build.py preview   # render de câmera
tools/scene-bake/.venv/Scripts/python tools/scene-bake/build.py bake      # assa e exporta
```

O `bake` aceita `LM` (lado do lightmap), `BSPP` (amostras) e `ZONES` (lista de
zonas, para reassar só uma) por variável de ambiente.

### Como está organizado

- `packages/shared/scripts/export-machine-model.ts` grava `machine.json`: o
  modelo inteiro, **todas** as constantes de `geometry.ts` (sem lista à mão: o
  que o módulo exporta como dado vai junto) e as zonas de bake.
- `tools/scene-bake/geom.py` — a matemática de telas, feltros e folha, sem
  Blender. Roda sozinha (`python geom.py`) e imprime folga e abraço.
- `tools/scene-bake/parts.py` — primitivas, paleta de materiais e as zonas.
- `tools/scene-bake/machine.py` — secagem, capota, estrutura, passarela,
  tubulação e a folha.
- `tools/scene-bake/stations.py` — parte úmida, scanners, Speed Sizer, calandra
  e Pope.
- `tools/scene-bake/building.py` — o prédio em dois níveis.

Nenhuma posição de ativo é escrita no Python. O nome do material é o contrato
com a página, que troca cada um por um material TSL.

### Zonas de bake

Onze, uma por lightmap, partindo o eixo X sem buraco nem sobreposição: duas na
parte úmida (`umida-formacao`, `umida-prensas`), uma por grupo de vapor
(`g1`…`g6`), `scanner-sizer`, `acabamento` (calandra + scanner final + Pope) e
`predio`. As fronteiras entre grupos caem no meio do caminho entre o último
cilindro de um e o primeiro do outro, então mover um grupo move a fronteira
junto. Telas e folha são cortadas nas fronteiras para não perder densidade.

### Decisões de geometria desta fase

1. **Percurso das telas.** Com raio 1,05 e passo 2,2 sobram **0,10 m** entre dois
   cilindros do mesmo nível: não cabe rolo no vão. O rolo de retorno sai do vão e
   vai para fora da fileira — 0,62 m acima da linha de centro no nível superior,
   o mesmo abaixo no inferior, a meio vão, raio 0,15 m. Dá **90° de abraço em
   todos os cilindros** com 4,7 cm de folga (o protótipo de teste conseguia 98°,
   com passo maior). Os rolos de entrada e de saída de cada grupo ficam na mesma
   altura dos de meio vão: mais alto, a tela desceria em cima do cilindro e o
   abraçaria mal (17°, que foi a primeira tentativa).
2. **Uma tela por fileira e por grupo de vapor**, não uma por secagem inteira —
   é a unidade em que a secagem é operada e também a unidade do lightmap.
3. **Sentido da serpentina.** `DRY_SECTION_WEB_Y_M` é medida validada e diz que
   a folha _sai do último cilindro superior_ da pré-secagem. Com 13 pares (26
   cilindros, número par), um percurso que comece em cima termina embaixo —
   então a pré-secagem é percorrida **começando pela fileira inferior**: entra em
   CS02 e sai de CS25, a 6,10 m, descendo para os 4,80 m do trecho horizontal. A
   pós-secagem começa em cima e sai embaixo, em direção à calandra.
4. **Mancais fora do bake.** A carcaça do mancal vira malha viva na cena, uma por
   ativo `bearing`, colorida pela zona da ISO 20816-3. No Blender ficam só o
   pedestal, a proteção, a junta de vapor, a mangueira e a caixa de junção.
5. **Portas da capota.** Desenhadas fechadas e numa linha de dobradiça única, a
   mesma nas duas capotas, para a cena abri-las no shader com um uniform de
   ângulo. O bake é com as portas fechadas e as lâmpadas de dentro acesas, então
   o interior aparece iluminado quando elas abrem, não preto.
6. **Prensa de sapata** entra só como forma, sem tag e sem linha nova na tabela
   `asset`: o rolo de cima do par de `PRESS_X_M` ganha a correia e o nip
   estendido, e a primeira prensa fica antes dela, também sem ativo.

### Medidas novas em `geometry.ts`

De 29 para 63, **todas `assumed`** e nenhuma existente alterada: telas (raio e
altura do rolo de retorno, folgas de desenho), parte úmida (caixa de entrada,
formador, primeira prensa, nip da sapata, plataformas em três níveis) e prédio
(térreo a −6,0 m, laje do piso de operação, vãos abertos, paredes, telhado,
claraboias, mezanino, escada, passarela).

### Prédio em níveis

A máquina fica num piso de operação elevado, que continua sendo o `Y = 0` de
todas as medidas. O térreo fica 6 m abaixo. Sob a secagem, a pós-secagem e a
Pope o piso é **aberto** até o térreo, com refugo, pilares e tubulação de vapor
e condensado; sob a parte úmida é fechado, com as plataformas de três níveis
acima. Pilares e vigas do mezanino, escada entre os níveis e guarda-corpo das
bordas entram na zona do prédio. No térreo só o que pertence à máquina —
preparo de massa fica fora. `views.ts` ganhou a vista `ground`, além da `pit`
que já existia.

### Fase (b) — bake e arquivos em public/scene

Corte lateral aprovado. As 11 zonas foram assadas a 2048² e 128 amostras em
CPU, com denoise por OIDN em todas.

`apps/web/public/scene/`: **3,87 MB** no total — `mp1.glb` com 1,74 MB e 11
WebP somando 2,13 MB. Bem abaixo dos 8–12 MB estimados, então a resolução
ficou como estava.

**Malhas e chamadas de desenho:** 188 malhas, 188 primitivas, 188 nós — uma
por `zona__material`, que é o alvo. O `join` + `separate` por material do
`build.py` já entrega assim; não há nada a unir depois.

Três coisas que a fase pediu:

1. **Material por zona**, em `publish.py`. O `gltfpack` funde malhas que
   compartilham material para baixar chamadas de desenho, e funde **entre
   zonas** — o que aplicaria o lightmap errado em metade da malha. Cada zona
   ganha a sua cópia do material (`g4__cil_ferro`, 188 no total), e aí a fusão
   só acontece dentro da zona. O nome do material segue sendo o contrato com a
   página, agora com a zona na frente.
2. **`-vpf` em vez da quantização inteira.** Com 14 bits o `gltfpack` errava 5%
   nas posições, porque o prédio tem 116 m. Posição em ponto flutuante não erra
   e ainda ficou menor que `-vp 16`. `-vt 16` mantém a precisão do UV para
   2048², e `-kn -km` preservam os nomes.
3. **Luz no térreo.** A primeira versão tinha uma luminária só para 116 m e
   deixava metade do nível de baixo em preto; com a escala do lightmap puxada
   pelo telhado, o porão caía em menos de 20 dos 255 níveis do WebP. Entraram
   duas fileiras de luminárias sob a laje, de 6 em 6 m, e o térreo foi assado
   de novo.

Custo do bake: ~2 h 10 no segundo passe. A zona `scanner-sizer` é a cara —
555 s antes das luminárias do térreo, 4974 s depois, porque é um vão alto e
aberto que enxerga muita fonte de luz. As zonas de secagem ficam em 150–210 s
cada e o `predio` em 83 s. Para reassar uma zona só:
`ZONES=scanner-sizer python tools/scene-bake/build.py bake`.

Uma folga conhecida: a escala do `predio` (S = 22,2) é puxada pelos próprios
corpos de luminária, que são emissivos e tiram o brilho do material TSL, não
do lightmap. Sobra faixa de bits sem uso. Dá para melhorar excluindo os texels
de `lampada` e `claraboia` do percentil, mas custa outro bake inteiro e o
porão já está legível.

### Fase (c) — a cena nova no R3F

`three` e `@types/three` de 0.180 para 0.187, `@react-three/postprocessing` e
`postprocessing` fora. `MachineScene` passou a montar um `WebGPURenderer`
dentro do `Canvas` do R3F (fábrica `gl` assíncrona, com `init()`), carregar
`public/scene/mp1.glb` e aplicar os materiais TSL por `zona__material`. O
pós-processamento é um `RenderPipeline` com TRAA e bloom só no alvo emissivo —
três alvos MRT, 24 bytes por pixel, dentro dos 32 que o WebGPU garante.

Saíram `apps/web/src/scene/machine/` (14 arquivos) e `scene/materials.ts`.
Entraram `scene/tsl/{noise,materials}.ts`, `scene/sceneData.ts`,
`scene/Bearings.tsx` e `scene/Atmosphere.tsx`.

#### Armadilhas que custaram caro

1. **O `gltfpack` poda atributo que material nenhum usa.** Os materiais do GLB
   não têm textura — quem aplica o lightmap é a página, em tempo de carga —,
   então o empacotamento levava embora **os dois conjuntos de UV**. O resultado
   era uma cena preta, com o lightmap amostrando um atributo inexistente. A
   solução está em `publish.py`: um PNG branco de 1 × 1 preso em
   `occlusionTexture` de cada material faz o UV contar como usado. O GLB subiu
   de 1,75 para 1,91 MB.
2. **O canal do lightmap mudava de zona para zona.** O Blender exporta duas
   camadas de UV nas zonas que têm curvas convertidas em malha, e a "LM" é a
   última — `TEXCOORD_1` ali, `TEXCOORD_0` nas outras. Limpar as camadas antes
   do desdobramento **muda o desdobramento**: foi testado e 185 das 194 malhas
   saíram com UV diferente, o que invalidaria os lightmaps já assados. Quem
   normaliza é o `publish.py`, que promove a última camada a `TEXCOORD_0`.
3. **`PMREMGenerator` tem de vir de `three/webgpu`.** O de `three` é o do
   caminho WebGL: monta `ShaderMaterial`, que o construtor de nós recusa, e a
   captura do ambiente falha calada. Sem ambiente, metal puro fica preto — ele
   não tem difusa para receber a luz assada. Foi a causa das "silhuetas pretas"
   na secagem. `CubeCamera`, `CubeRenderTarget` e `PMREMGenerator` vêm todos de
   `three/webgpu`, e a captura esconde névoa, vapor e fachos.
4. **A fábrica `gl` do `Canvas` tem de ser síncrona.** Devolvendo uma promessa,
   o R3F 9.8 não chega a configurar o canvas no caminho WebGL2 do teste. O
   renderizador é devolvido pronto, o `init()` corre por fora e uma bandeira
   diz ao pipeline quando pode desenhar.
5. **A vista geral estava fora do prédio**, enquadrando a parede externa, que
   não recebe luz assada.
6. **Janela minimizada engana.** Sem a janela visível o `ResizeObserver` não
   dispara, o R3F nunca mede o container e nada monta. Horas de diagnóstico
   pelo painel do navegador foram por esse ralo; a verificação que vale é o
   Playwright, que tem navegador próprio.
7. **Clique durante o redimensionamento.** Quando o painel do ativo fecha, o
   container alarga na hora, mas o R3F só regrava a largura do canvas depois de
   o React confirmar. Um clique nesse intervalo caía no mancal vizinho — o e2e
   pegou isso como falha intermitente (1 em 9). Medido: canvas com 564 px na
   leitura, 964 px no clique. Correção em dois pontos: o canvas acompanha o
   container por CSS, e os eventos de ponteiro leem o retângulo vivo
   (`livePointerEvents`). 15 de 15 na repetição.

#### Medido

Com `?perf=1`, `renderer.info` no navegador, backend **WebGPU**:

| vista       | chamadas de desenho | triângulos |
| ----------- | ------------------- | ---------- |
| Visão geral | 270                 | 280 499    |
| Pré-secagem | 153                 | 203 231    |

São 287 malhas na cena — 194 assadas (uma por `zona__material`), 86 mancais
vivos, 6 emissores de vapor e 1 malha de fachos.

**O fps ainda não foi medido como se deve**: a aba do navegador embutido fica
oculta e nela o `requestAnimationFrame` cai a cerca de 1 Hz.

Ferramentas de conferência, atrás de parâmetro de URL: `?perf=1` publica
`window.__twinPerf` e aceita captura de quadro; `?lm=1` troca os materiais por
branco liso só com o lightmap, para ver a luz assada pura.

#### Decidido pelo Felipe

- **`THREE.Clock`**: fica o three 0.187. O aviso — disparado de dentro do
  `@react-three/fiber` 9.8.2 — entrou na lista `IGNORED` do e2e com regex exata
  e a instrução de tirar quando o R3F parar de construir `Clock`.
- **`<aside>` aninhado** em `MaquinaScreen`: o externo virou `<div>`.

#### Em aberto

- **Cor dos mancais pela zona ISO.** A tabela de cores está em `Bearings.tsx` e
  a cena aceita o mapa `tag → zona` como entrada opcional, mas nenhuma tela
  busca hoje a vibração dos 86 mancais de uma vez, e criar essa busca mexeria
  no back-end. Sem o mapa todos ficam em cinza neutro.

### Direção visual de estúdio

A máquina inteira legível, sob luz branca, sem galpão. Previews do Cycles
aprovados antes do bake.

**O que saiu.** Paredes, telhado, treliças e claraboias. Em `geometry.ts` saíram
`BUILDING_ROOF_Y_M`, `SKYLIGHT_BANDS`, `SKYLIGHT_PITCH_M` e `SKYLIGHT_PANEL_M`
(63 → 59 medidas), e o contorno do piso cresceu para ~12 m além da máquina:
`BUILDING_X0_M = HEADBOX_X_M − 14`, `BUILDING_X1_M = POPE_X_M + 20`,
`BUILDING_Z_LA_M = −18`, `BUILDING_Z_LC_M = 19`. Nenhuma medida validada mudou.
Na página saíram os fachos de sol e a poeira; o vapor ficou, mais ralo
(alfa 0,12 × potência, 72 sprites).

**O que ficou ou entrou no prédio.** Piso de operação, térreo, pilares e vigas
do mezanino, escada, faixas de piso e um guarda-corpo em toda a borda do piso —
sem as paredes, a borda é uma queda de 6 m.

**Luz.** Mundo branco uniforme (1, 1, 1) mais uma direcional branca fraca do
lado comando. Luminárias a ~5000 K (`#fff8f2`). Dentro da capota, três linhas
de luminárias a cada dois passos (900 W nos lados, 600 W no meio). No térreo,
poucas e fortes: duas fileiras de 1400 W a cada 24 m, no lugar das 38 de antes.
Para a câmera, o mundo aparece como `#0D1015` (mistura por `LightPath`), então
o fundo do bake bate com o da página.

**Portas da capota.** As de cima são assadas abertas a 68°
(`DOOR_OPEN_DEG` em `machine.py`, exportado em `scene.json` como
`hoodDoorBakedDeg`). O shader gira pela diferença entre o ângulo pedido e o
assado, então "Fechar portas" leva a 0° e a porta fecha contra a capota.

**Página.** Fundo `#0D1015`, névoa de densidade 0,0012, bloom 0,12 só no alvo
emissivo, ambiente capturado da própria cena com fundo branco (intensidade
0,8). Exposição AgX mantida em **0,82**: medido nas capturas, o papel fica em
p95 ≈ 238 de 255, e menos de 1% satura — só a linha de luz do scanner. As poças
do piso ficaram raras e foscas (rugosidade 0,22, escurecem 28%): grandes e
espelhadas, refletiam o fundo escuro e o piso parecia camuflagem.

**Vistas.** Todas revistas. A geral enquadra da caixa de entrada à Pope; as de
estação recuaram e subiram para mostrar a seção inteira; a calandra passou a
ser vista de jusante e de cima, porque de frente a chapa do castelo esconde o
nip; a do porão saiu de cima da fileira central de pilares do mezanino, que
cortava a imagem ao meio.

**Verificado.** Capturas 1920 × 1080 de todas as vistas pelo Playwright, e2e
8/8, build de produção, typecheck, lint e os 228 testes do `shared`. O único
aviso no console é o `THREE.Clock` já aceito.

**Bake.** 2048², 128 amostras, OIDN. Total **3758 s (~63 min)**, contra ~2 h 10
antes.

| zona           | tempo |
| -------------- | ----- |
| umida-formacao | 297 s |
| umida-prensas  | 325 s |
| g1             | 200 s |
| g2             | 248 s |
| g3             | 296 s |
| g4             | 255 s |
| scanner-sizer  | 707 s |
| g5             | 322 s |
| g6             | 362 s |
| acabamento     | 552 s |
| predio         | 194 s |

O `scanner-sizer` caiu de 4974 s para 707 s com o fim das 38 luminárias do
térreo. `public/scene/` ficou com **3,49 MB**: `mp1.glb` 1,82 MB e 11 WebP com
1,67 MB; 190 materiais por zona.

Folga conhecida: nas zonas de secagem a escala do lightmap (S = 15–25) é
puxada pelo interior da capota, agora muito mais iluminado que o lado de fora
(ref 0,35–0,62). Sobra menos faixa de bits para o exterior; nas capturas não
aparece banda, mas é o primeiro lugar a olhar se aparecer.

### Lado comando livre e parte úmida refeita

Duas rodadas de revisão do Felipe, com previews e cortes aprovados antes do
bake.

**Secagem — lado comando.** A capota não tem mais nada no lado comando: saíram
portas e painéis dos dois níveis, batentes, molduras e a faixa intermediária.
Ficam o teto, a parede do lado acionamento e as extremidades; a de entrada da
pré-secagem tem uma fenda embaixo para o feltro da sapata e a folha. Saíram
também a passarela, a escada, os guarda-corpos e as colunas e vigas da frente.
Cada mancal do lado comando tem coluna própria até uma soleira junto ao piso,
no plano dos mancais; como os níveis são defasados meio passo, nenhuma coluna
fica na frente de mancal. O piso é aberto sob a secagem, então colunas do lado
acionamento e pilaretes sob a soleira descem até o térreo. O condensado sai
por um flexível curto até um tubo rígido que desce ao lado do pedestal e só se
afasta para o coletor abaixo de 1 m. A passarela, com escada, foi para o lado
acionamento, contínua da parte úmida ao fim da pré-secagem; a pós-secagem tem
a sua.

Com isso saiu o controle de portas: `doorsOpen` de `sceneState`, o botão
"Fechar portas" da tela Máquina, o giro das portas no shader e a dobradiça do
`scene.json`.

**Telas da secagem.** Os "losangos" entre grupos eram as telas de grupos
vizinhos se cruzando: a saída de um e a entrada do outro disputavam o mesmo
ponto, porque o vão entre grupos é de um passo só. Agora ficam lado a lado, a
0,5 m, e o retorno sobe e desce reto dentro da faixa do próprio grupo — cada
tela é um laço único pelos cilindros do seu grupo. Custo: o abraço no primeiro
e no último cilindro de cada grupo cai de 90° para 69°.

**Folha na pré-secagem.** Andava para trás a cada par (CS2 → CS1 → CS4 → CS3…).
Agora vai sempre para a frente, de CS2 a CS26, e sobe para a linha de
`DRY_SECTION_WEB_Y_M`, que não mudou. CS1 fica a montante do ponto em que a
folha entra e só leva a tela.

**Parte úmida.** Os rolos principais viraram ativos supostos, com dois mancais
cada: `MP1-FOR-RCB`, `MP1-FOR-RFS`, `MP1-FOR-RCO`, `MP1-PRE-RPU`,
`MP1-PRE-P1S`, `MP1-PRE-P1I`, mais o nip `MP1-PRE-NIP1` — 98 mancais no total.
O desenho do corte lateral mora em `tools/scene-bake/wet.py`, sem Blender, e
`python wet.py` é a conferência: nenhum laço cruza outro laço, a folha ou um
rolo que não é dele, nenhuma caixa de drenagem atravessa uma tela, e o jato da
caixa de entrada cai na cunha. As 12 telas da secagem entram na mesma
conferência. Resultado atual: 18 laços, 152 rolos e cilindros, 13 caixas,
nenhum cruzamento.

- Gap former: as telas se encontram sobre o rolo formador; a de cima chega
  subindo do rolo cabeceira, que por isso fica baixo e atrás, a (−14,0; 2,0).
  Vindo de cima ela só tocaria o formador depois do topo e daria a volta nele.
- Caixa de entrada inclinada 20,9°, embaixo da tela de cima, com o bocal
  entrando na cunha paralelo a ela. A pose é calculada por `wet.py` e gravada
  em `HEADBOX_X_M`, `HEADBOX_Y_M` e `HEADBOX_TILT_DEG`.
- A folha vai colada na face de baixo do feltro pick-up até o nip da 1ª
  prensa; o feltro de baixo da sapata a recebe logo na saída e a leva pelo nip
  da sapata até um rolo de transferência dentro da capota; dali pousa na face
  de montante do primeiro cilindro, entre ele e a tela. Vãos livres: 0,45 m
  (jato), 1,18 m (entre prensas) e 0,90 m (até o secador).
- Nos nips os rolos são desenhados 1,2 cm menores que no modelo, para feltro,
  folha e feltro caberem entre eles.
- Prensa de sapata: rolo de sapata de 1,25 m (`SHOE_ROLL_RADIUS_M`) com manta
  verde-azulada, cilindros de carga no cavalete e contra-rolo metálico. Os
  rótulos de `MP1-PRE-R1` e `R2` viraram "Contra-rolo da prensa de sapata" e
  "Rolo de sapata"; as tags não mudaram.
- Cores: tela cinza-azulada, feltro bege, folha clara. Drenagem dentro da
  largura da tela, encostada nela e apoiada no lado acionamento. Estrutura só
  nos dois lados; rolos-guia em balanço no lado comando. Caixas azuis viraram
  motores com base e luva no lado acionamento.

**Piso.** O concreto passou a três escalas de ruído e menos contraste; com o
ruído a 0,35/m as manchas tinham ~3 m e liam como textura esticada. As poças
saíram: no estúdio espelhavam o fundo escuro e, de longe, também liam como
manchas. O lightmap do prédio continua em 2048.

**Medidas.** 59 → 70, nenhuma validada alterada. Saíram as de formação
antigas e as três das plataformas de três níveis.

**Bake.** Todas as zonas — o export só inclui no GLB as zonas assadas na mesma
rodada. Total **2553 s (~43 min)**.

| zona           | tempo |
| -------------- | ----- |
| umida-formacao | 346 s |
| umida-prensas  | 274 s |
| g1             | 192 s |
| g2             | 190 s |
| g3             | 200 s |
| g4             | 177 s |
| scanner-sizer  | 364 s |
| g5             | 206 s |
| g6             | 226 s |
| acabamento     | 277 s |
| predio         | 101 s |

`public/scene/` com **3,59 MB**: `mp1.glb` 1,76 MB e 11 WebP com 1,83 MB.

**Verificado.** `python tools/scene-bake/wet.py` sem cruzamento; capturas
1920 × 1080 das 11 vistas; e2e 8/8; build de produção; lint; testes do
`shared` (231), da web (102) e da API. Dois testes da tela Processo falharam
uma vez com a CPU tomada pelo bake e passaram na repetição — a tela não foi
tocada.

### Scanners, Speed Sizer e Pope apoiados

- **Scanners:** duas cabeças, uma pendurada na viga de cima e outra apoiada na
  de baixo, alinhadas na vertical, com 3,5 cm de vão até a folha de cada lado;
  o feixe emissivo fica entre elas. As colunas do pórtico descem até o piso,
  com base. A "escada deitada" entre a calandra e o QCS era a metade de baixo
  do pórtico antigo, que terminava 1,4 m acima do piso.
- **Speed Sizer:** os montantes — a placa cinza do tubo vermelho — começavam a
  1,7 m do piso; agora descem até ele.
- **Pope:** a laje de base estava sobre o vão do refugo, flutuando. Saiu; as
  colunas descem até o térreo dentro do vão e terminam em base fora dele.
- **Jumbo:** face lisa, com tampa em leque (o polígono de muitos lados saía
  com recortes no lightmap), e carretel de aço saindo do centro, apoiado nos
  trilhos. O trilho passava na frente da face, na altura do eixo; agora fica
  logo abaixo do eixo e é mais baixo.

`REBAKE=zona,zona python build.py bake` reassa só as zonas pedidas e mantém o
lightmap das outras: elas são desdobradas de novo, e sem mudança de geometria o
UV sai igual. Desta vez: scanner-sizer 341 s, acabamento 266 s, prédio 103 s.
`public/scene/` com 3,64 MB. e2e 8/8, lint e os 102 testes da web verdes.

## Próximo passo exato

Revisão das capturas pelo Felipe. Em aberto, de antes: cor dos mancais pela
zona ISO, que depende de uma busca no back-end.
