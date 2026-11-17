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

## Telas no design novo

Porte das telas para `reference/design/` (8 telas em 1920×1080 e o sistema
visual; `fonte/*.dc.html` tem medidas, cores e textos). Só front: o que a API
não tem vira dado fixo atrás do `DataGateway`, com selo "ilustrativo". Fases,
com revisão ao fim de cada uma: (a) tokens, fontes, componentes e moldura;
(b) Turno, Bobinas, Notas; (c) Processo e Laboratório; (d) Mancais e Rondas;
(e) limpeza e verificação.

### Tabela de fontes aprovada, com os ajustes

- Capota da pré-secagem pelas TAGs do catálogo: `TIC-505` (insuflamento),
  `AIC-506` (ponto de orvalho) e `PIC-507` (linha de zero).
- Produção acumulada do Turno: integral de `XI-0001`, andando durante a bobina
  em curso — não a soma das bobinas fechadas.
- Refugo derivado: bobinas segregadas mais o papel ao pulper nas quebras
  (duração × `XI-0001`), com a definição no tooltip.
- Ranking de mancais: sempre os que estão em B, C ou D, mais os 10 de maior
  vibração; o resto atrás de "mostrar todos".
- Notas com as 4 situações da API; "retida" e "avaliação" de bobina só pelo
  cenário AKD fixo; rondas comparam campo × online na temperatura; o histórico
  de vibração mostra a janela que a API devolver (72 h no instantâneo).

### Fase (a) — tokens, fontes, componentes e moldura

**Dados.** O mancal que degrada passou a ser o CS23 do lado comando
(`MP1-SEC-G4-CS23-MLC`, `VI-5123B`), como no design: `seed.ts`,
`runtime/catchup.ts`, as tags cruas do registrador e a ordem da ronda. Os
testes que dependiam do lado acionamento foram ajustados — inclusive dois da
simulação que exigiam que o mancal começasse na zona A: a linha de base sai do
hash da tag e a do CS23 LC cai em B. Eles passam a exigir "começa em A ou B,
termina em D e passa por todas as zonas entre elas". Instantâneo de
demonstração regenerado. `TIC-508` virou `WIC-508` (tensão das telas), pelo
mesmo caminho do `WIC-1002`: linha da lista base e catálogo gerado de novo.

**Sistema visual.** Tokens do design no tema do Tailwind (`index.css`): base,
interação `action` (#4F8CFF), alarme 1/2/3, especificação dentro/no
limite/fora e zonas ISO A–D. Os tokens `mill-*` ficaram apontando para a
paleta nova, para as telas ainda não portadas não quebrarem; saem na fase (e).
Fontes: Inter e JetBrains Mono no lugar do IBM Plex.

A API tem quatro prioridades de alarme e o design, três: crítica e alta
entram juntas na 1 (`ui/priority.ts`).

**Componentes em `ui/`.** `Num`/`Tag`, `Panel` (com `Illustrative`,
`PriorityBadge`, `ModeChip`), `RangeBar`, `InstrumentRow`, `SectionBlock`,
`EventMarker`, `BearingBar`/`TemperatureBar` e, em `ui/chart`, `scale.ts` e
`Sparkline`. Tudo em SVG ou CSS próprio, sem biblioteca nova. `#sistema`
abre as amostras para comparar com `0-sistema-visual.png` — só nos builds de
desenvolvimento e de teste; o de produção não leva o pedaço.

**Moldura.** Navegação de 56 px com as teclas 1–8 (`#maquina` continua
valendo), barra de 48 px e a faixa de 64 px com as dez seções. As seções são
as áreas do catálogo — o design começa no preparo e trata o QCS como seção.
Cada seção conta as TAGs com alarme em pé e mostra cada uma na cor da sua
prioridade; medição de mancal entra na seção do cilindro (o `VI-5123B` na
pré-secagem). Clicar numa seção abre Processo com ela; a tela de Processo
passa a usar isso na fase (c). Laboratório tem só um aviso até a fase (c).

**Verificado.** Testes da web (123), da API e do `shared`; typecheck, lint,
build e e2e 8/8. Capturas em 1920×1080 e 1440×900 sem rolagem horizontal e
com o console limpo.

### Fase (b) — Turno, Bobinas e Notas

**Dados fixos atrás do portão.** `api/fixtures/` responde as rotas que a API
não tem, com o formato que uma rota real teria (`types.ts`): resultados de
laboratório, bobinas paradas pela qualidade, as sete TAGs do preparo que o
catálogo não tem (`AIC-102`, `JI-111`, `ZIC-112`, `FIC-107`, `FIC-108`,
`FIC-110`, `LIC-103`), a tendência delas e o mapa CD × MD de umidade. O
`DataGateway` estende `FixtureRoutes`; os dois portões (ao vivo e
demonstração) as montam sobre as **suas** bobinas e o **seu** instante de
leitura, então um ensaio sempre aponta para uma bobina que existe naquela
fonte. Tudo determinístico (ruído por hash, não por relógio). O cenário AKD:
a cola cai 38 min antes da penúltima bobina fechada, alarma em L, a
penúltima fica "em avaliação" e a última "retida" com Cobb₆₀ 28,9 e 29,4.
Retenção nunca fica depois da leitura.

**Turno.** Linha do tempo em SVG próprio com eventos (quebra, gramatura,
alarme, setpoint, bobina), velocidade `SIC-1104`, produção acumulada e a faixa
de bobinas, no eixo do turno. A produção é a **integral de `XI-0001`**
(trapézios entre as amostras arquivadas), então anda durante a bobina em
curso; meta = alvo de `XI-0001` × 8 h, ritmo da meta = alvo × tempo
decorrido, projeção = ritmo da última hora. Refugo derivado: (bobinas
segregadas + duração das quebras × `XI-0001` antes da quebra) / produção
bruta, com a definição no `title`. Meta de refugo (≤ 5 %) e faixa de
eficiência (91–95 %) são as do desenho, marcadas como meta. `SIC-1104` não tem
L/H no catálogo, então não há faixa desenhada — só o alvo. Os botões "24 h" e
"3 turnos" ficam desabilitados no instantâneo, que só tem o turno em curso.
Alarmes ativos: um por TAG, pela pior prioridade, com o fixo da cola marcado.
Passagem: retenções e cola (fixos, com selo), pontos da ronda com ruído ou
vazamento, notas abertas de prioridade 1–2 e as linhas de `handover` da API.
A faixa do processo continua só com alarme real — o da cola não entra na
contagem.

**Bobinas.** Uma faixa por bobina com o comprimento, os trechos em que
`AIC-902`, `AIC-903` ou `AIC-905` saíram da tolerância (tempo → posição na
bobina) e as quebras. Onde o historiador não cobre a bobina não há trecho
desenhado. Emendas só como contagem: a API não diz onde caíram. A bobina em
formação tem comprimento estimado por tempo × velocidade. Mapa CD × MD
fixo, escalado pela média e pelo 2σ CD reais da bobina. Perfil MD das três
propriedades a partir da tendência real.

**Notas.** Quadro com as quatro situações da API (planejada aparece como
"Programada"); prioridade pela cor da borda, origem, "PARADA". O detalhe traz
o sinal de origem: para mancal, a vibração da rota da Fase 3 sobre as zonas
ISO, na janela que a API devolve (72 h ao vivo), com a nota marcada e a
projeção de zona D da própria API; para TAG de processo, a tendência com a
faixa L–H. Sem "Abrir nota do achado": não há rota de criação.

**Também.** `ui/chart/series.ts` (pontos de tendência e interpolação),
`ui/tagScale.ts` (escala de qualquer TAG: catálogo, fixa ou laboratório),
`ui/useWidth.ts`. `tagValue` dá uma casa a valores abaixo de 10 em unidades
sem decimal (1,4 kg/t não vira "1").

**Verificado.** Testes da web (139), typecheck, lint, build e e2e 8/8.
Capturas em 1920×1080 e 1440×900 sem rolagem horizontal e com o console
limpo.

### Fase (c) — Processo e Laboratório

**Processo.** Uma seção por vez, escolhida na faixa (ou pela TAG que abriu a
tela; abrir uma tendência de outra tela acerta a seção junto). As variáveis
são as do catálogo para a área, sem as por cilindro; o preparo soma as sete
fixas, cada uma com selo. Agrupamento: o grupo de vapor quando o nome diz
`G1`…`G4` (a pré-secagem fica em Grupo 1–4 com pressão, ΔP e nível, mais
capota e telas), senão o grupo do catálogo. A capota usa `TIC-505`, `AIC-506`
e `PIC-507`, como pedido. Cada linha: barra de faixa, PV, SP da API, e a
última hora da tendência real. A API não informa o modo do controlador
(AUT/CAS): a coluna virou "Malha" e diz só se a TAG é malha. "Só fora da
faixa" filtra por alarme em pé ou PV fora de L/H. Mancal em alarme na seção
aparece no cabeçalho como link para Mancais (um por mancal, não por TAG).

**Tendência multi-TAG.** Até quatro TAGs, uma faixa por TAG com escala
própria, banda L–H, setpoint alterado em azul e alarme na cor da prioridade,
no mesmo eixo. Janelas 1 h/8 h/24 h/7 d; o eixo mostra o que a resposta cobre
(o instantâneo tem 4 h). TAG fixa vem da rota fixa e leva selo.

**Setpoint.** Rota real, motivo obrigatório. A categoria não existe na API:
entra no começo do motivo (`Equipamento: …`), que é o campo auditado. Malha
escrava de cascata e o instantâneo de demonstração dizem por que não aceitam
escrita. Histórico da seção = alterações das TAGs da seção.

**Efeito do refino** (só no preparo): `JIC-101` real em cima, Gurley e tração
MD do laboratório fixo embaixo, em faixas separadas, cada uma com a fonte.

**Laboratório.** Matriz das últimas 12 bobinas fechadas × 12 ensaios: ponto
na posição dentro da especificação, "no limite" nos 10 % das pontas, atrasado
quando o ensaio era daquela bobina e não saiu, não programado pela
frequência. Clicar na coluna abre a carta de controle: LSC/LIC = média ± 3σ
numa base que deixa de fora as 5 últimas bobinas (quando há bobinas
suficientes), Cpk sobre a mesma base. Fila: ensaios da última bobina passando
do prazo (35 min depois do fim), reteste da retida (prazo de 2 h, suposição)
e a próxima bobina com a troca prevista pela mediana real. Lab × QCS:
gramatura e umidade contra a média real da bobina, cinzas contra a média de
`AIC-904` na janela da bobina; banda do Δ = ¼ da faixa de especificação. Todo
painel do laboratório leva selo.

**Verificado.** Testes da web (145), typecheck, lint, build e e2e 8/8.
Capturas em 1920×1080 e 1440×900 sem rolagem horizontal e com o console
limpo.

### Fase (d) — Mancais e Rondas

**Mancais.** Os 98 mancais monitorados. Os 72 dos secadores vêm dos valores
de processo (`VI-51nn`, `TI-53nn`) com a classe ISO dos secadores; os outros
26, que não têm TAG no catálogo, vêm da rota do ativo (`/assets/:tag`), que
traz a última leitura e a classe ISO de cada um. Não existe rota que liste o
estado de todos — a tela faz uma busca por mancal sem instrumento no DCS.
Ordem por severidade = vibração / fronteira C→D, que compara classes ISO
diferentes. Sempre visíveis: zona B, C ou D e os dez de maior vibração; o
resto atrás de "mostrar todos". Na demonstração ao vivo, 51 dos 98 estão em B
(a linha de base sai do hash da tag), então a lista curta fica longa — é a
regra pedida, aplicada. Minigráfico e marca "início da janela" vêm da rota de
vibração, na janela que ela devolve (72 h), sem fingir 30 dias.

O mancal escolhido: vibração sobre as zonas ISO e temperatura embaixo, com a
projeção linear pela inclinação do `rul.ts` do `shared` (a mesma regressão e
o mesmo critério de significância do servidor). A temperatura passa pela mesma
função, com 80 °C no lugar da fronteira C→D. A projeção vai para a frente o
mesmo tanto que a janela tem para trás. Rondas (temperatura de campo) e notas
marcadas no tempo.

**Vista 3D.** A cena real, a mesma da tela Máquina, em tamanho reduzido e
carregada por `lazy` só quando o painel aparece (o carregamento inicial
continua sem three). A cena já aceitava `bearingZones`; a tela passa a zona
de cada mancal, então a pendência "cor dos mancais pela zona ISO" está
resolvida sem tocar no código da cena. Clicar na lista enquadra o mancal
(`viewForAsset`); clicar num mancal na cena escolhe na lista. Novo e2e
`e2e/mancais.spec.ts` cobre os dois sentidos; o da cena não mudou.

**Rondas.** A ronda escolhida com o roteiro (estado por ponto), um cartão por
ponto com campo × online na mesma escala, e o ponto em detalhe com a
divergência, a observação de campo e os botões "Abrir nota" (quando há nota
com aquela ronda entre as evidências), "Ver tendência da TAG" e "Abrir em
Mancais". A API assume que o pirômetro lê a carcaça 3 °C abaixo do sensor
(`FIELD_PYROMETER_OFFSET_C`); a tela usa o mesmo desvio como esperado e chama
de achado o que passar de ±2 °C em torno dele (suposição), além de ruído e
vazamento. Sem ponto "pendente": a API manda só os pontos registrados, não o
roteiro inteiro. Rondas do turno em curso; se ele ainda não tem nenhuma, as
mais recentes.

**Verificado.** Testes da web (152), typecheck, lint, build e e2e (8 da cena +
2 de Mancais). Capturas em 1920×1080 e 1440×900 sem rolagem horizontal e com
o console limpo.

### Fase (e) — limpeza

Os tokens `mill-*` e `series-*` saíram do tema; as classes que ainda os usavam
(tela Máquina, `AssetPanel`, `StatusPill`, `VibrationTrend`, `ResourceState`)
passaram para os tokens do design, sem cantos arredondados. A tela Máquina
ganhou o cabeçalho no estilo das outras. Removidos por falta de uso:
`ui/Table.tsx`, `ui/chart/Trend.tsx`, `ScreenTitle`/`StatRow`/`Block` do
`Shell`, `dayTime`/`span`/`duration` de `format.ts` (e os testes deles),
`readOnlySource` do portão e `stats` das contas de Bobinas. O `AssetPanel`
continua: é o painel do ativo na tela Máquina.

**Verificado.** Testes do `shared` (231), da API (404) e da web (148);
typecheck, lint, Prettier, build e e2e 10/10 (8 da cena, sem mudança, e 2 de
Mancais). three continua fora do carregamento inicial (chunk próprio,
baixado por Máquina ou pelo painel 3D de Mancais).

### Limpeza das referências antigas

Saíram de `reference/prototypes/`: `secagem-teste/` (o teste do Blender que o
`tools/scene-bake` substituiu, com os binários de saída), `papertwin-telas.html`
(o protótipo de telas que o design novo aposentou) e
`papermill-twin-monitoramento.png` (sem referência em lugar nenhum). As regras
do `.gitignore` do `secagem-teste` foram junto. Ficam `mp1-parte-seca-3d.html`
e `mp1-parte-umida.html`, citados como fonte das medidas em
`packages/shared/src/machine/`. As menções a eles mais acima neste arquivo são
histórico. No código não sobrou arquivo sem uso: todo módulo de `apps/` e
`packages/` é importado, e todo arquivo de `public/scene` é referenciado pela
cena.

## Próximo passo exato

O porte das telas para o design novo está completo. Ideia para depois, fora do pedido: a tela Máquina também pode pintar
os mancais pela zona ISO, como o painel de Mancais já faz.
Em aberto, de antes: cor dos mancais pela zona ISO, que depende de uma busca
no back-end.

# Feedback do engenheiro de processo — fases 0 a 7

Sete entregas tiradas da avaliação de um engenheiro de processo de papel. Uma
fase por vez, com revisão do Felipe ao fim de cada uma. Branch
`dev/feedback-processo`, tirada de `main` em 54587dd (o porte das telas, acima,
está fechado). Sem push na `main`, sem PR, sem deploy.

## Fase 0 — reconhecimento

Sem código. O que segue é o que eu li, o que medi e o que preciso que tu decidas
antes da Fase 1.

### Por fase: o que já está pronto e o que vou tocar

#### Fase 1 — ajuda por bloco e busca

**Pronto.** `ui/Panel.tsx` já é o bloco único das telas, com título, contexto e
canto direito (`aside`) — tem onde encaixar o "?" sem componente novo. A
navegação por tela já mora na âncora (`ui/screens.ts`, teclas 1–8,
`hashchange`), e `ui/useAssetUrl.ts` espelha o ativo em `?asset=`. O índice da
busca tem de onde sair sem fonte nova: `SCREENS` (telas), `PROCESS_CATALOG` (320
variáveis, com tag e nome), `monitoredAssets(MP1)` (98 mancais), `areaOfTag`
(`ui/sections.ts`) e as rotas de bobinas e notas do portão. `App.tsx` já tem os
cinco abridores que um resultado precisa chamar — `openTrend`, `openBearing`,
`openReel`, `openNote`, `openArea`.

**Vou tocar.** `ui/Panel.tsx`; `ui/help.ts` (novo, uma chave por bloco); os 20
pontos que montam `Panel` hoje — `BobinasScreen` (3), `LaboratorioScreen` (4),
`MancaisScreen` (1), `mancais/BearingDetail` (1), `mancais/Scene3DPanel` (1),
`NotasScreen` (1), `processo/RefiningEffect` (1), `processo/SetpointPanel` (1),
`processo/TrendStack` (1), `RondasScreen` (3) e `turno/Support` (3);
`ui/Shell.tsx` (o campo de busca na barra de 48 px); dois arquivos novos para a
busca (índice em memória e a lista de resultados); `App.tsx` (ligar o resultado
ao abridor certo); e os testes — `ui/components.test.tsx`, o teste novo do
índice e o teste que falha se existir `Panel` sem chave de ajuda.

**Achado que vira decisão.** Quatro blocos das telas **não** são `Panel`: a
lista de variáveis de `ProcessoScreen` (`<section>` escrita à mão), a linha do
tempo de `turno/Timeline.tsx`, o quadro de `NotasScreen` e as amostras de
`SistemaScreen` (esta só existe nos builds de desenvolvimento e de teste). O
teste "nenhum painel sem ajuda" só alcança o que passa por `Panel` — dúvida 2.

#### Fase 2 — Mancais mais leve

**Pronto.** O modelo da máquina tem tudo que o mapa 2D precisa, e em
`packages/shared/src/machine/`: posição em metros dos 153 ativos, seção com
ordem de processo, lado (`MLA`/`MLC`), `parentTag` do mancal para o corpo
girante e a classe ISO. `screens/mancais/derive.ts` já calcula a zona ISO de
cada um dos 98 mancais, e a tela já passa esse mapa para a cena. `viewForAsset`
já enquadra um ativo. `Scene3DPanel` já carrega a cena por `lazy()`.

**Vou tocar.** `screens/mancais/Scene3DPanel.tsx` (passa a ser o painel do mapa,
com o botão "ver em 3D"); um arquivo novo com o mapa em SVG;
`screens/MancaisScreen.tsx`; `scene/Atmosphere.tsx` e `scene/MachineScene.tsx`
(vapor desligado por padrão); `screens/SistemaScreen.tsx` (a opção, se ela ficar
ali — dúvida 5); `e2e/mancais.spec.ts` (os dois caminhos) e `e2e/scene.spec.ts`
(hoje o teste do pedaço do three só confere a tela de abertura; passa a cobrar
também que Mancais não baixe o three sem pedir).

**Achado.** Hoje Mancais baixa o pedaço do three e a cena inteira assim que a
lista aparece: medido, 236 ms para o `three-*.js` e 677 ms até o último
lightmap, 2,3 MB e ~200 MB de memória de GPU numa tela cujo conteúdo próprio
está pronto aos 276 ms. É o custo que a fase tira.

#### Fase 3 — variáveis de processo que faltam

**Pronto.** O catálogo tem **320 variáveis** — 68 TAGs próprias mais 252
expandidas dos 7 padrões por cilindro —, **55 malhas**, **24 relações** FOPDT e
**13 ensaios** de laboratório. O gerador lê o CSV
(`npm run generate -w @mp1/shared`) e o `catalog.generated.ts` nunca é escrito à
mão. O historiador tem orçamento explícito: 320 pontos, 300 MB, 7 dias, 1.521
linhas por ponto por dia, uma a cada ~57 s; a compressão medida na Fase 5 foi de
198–202 para 1 e sete dias couberam em ~17 MB (6 % do orçamento). O selo
"ilustrativo" e as sete TAGs fixas do preparo (`AIC-102`, `JI-111`, `ZIC-112`,
`FIC-107`, `FIC-108`, `FIC-110`, `LIC-103`) já existem em
`apps/web/src/api/fixtures/`.

**Distribuição de hoje por área:** mancais 216 · secagem 36 · pré-secagem 16 ·
QCS 10 · Speed Sizer 8 · pós-secagem 6 · preparo 5 · prensas 4 · calandra 4 ·
Pope 4 · utilidades 4 · geral 3 · caixa 3 · formação 1. A lista da fase pede
justamente onde o catálogo é magro: preparo, parte úmida, laboratório e
manutenção.

**Vou tocar.** `reference/research/catalogo-base.csv` e `relacoes-fopdt.csv`; os
dois geradores e os dois `*.generated.ts`; `process/types.ts` (o nível novo:
ligada / autônoma / ilustrativa); `simulation/process-engine.ts` e
`operating-point.ts` (autônomas e calculadas); `historian/points.ts` e
`retention.ts`; uma migration; `routes/process.ts`; `screens/ProcessoScreen.tsx`;
`api/fixtures/process.ts` (as fixas saem onde nascer TAG de verdade);
`process/lab.ts`, `screens/LaboratorioScreen.tsx` e `api/fixtures/lab.ts`.

**Dos 13 ensaios de hoje**, a lista do rolo jumbo já cobre gramatura, umidade,
espessura, aspereza, tração, rasgo, cinzas, alvura/brancura e Cobb. Faltam
**cor, dureza, rigidez, arrebentamento, Scott Bond, desprendimento de pó e
sujidade** — sete. A tela mostra 12 colunas (o 13º é a razão MD/CD, derivada).

#### Fase 4 — modo "e se"

**Pronto, e é mais do que eu esperava.** O motor já é separável: `EngineState`
(versionado) com verdade, setpoints, integrais e as linhas de atraso;
`processEngine(tick, { state })` retoma exatamente de um estado; `setSetpoint` /
`resetSetpoint` / `runTo` / `measured` / `truth` são a API inteira de que o "e
se" precisa. O grafo de relações já responde `relationsForInput`,
`relationsForOutput` e `drivenOutputs` (hoje 12 saídas dirigidas). O ajuste SIMC
das malhas já está lá, e a rota real de setpoint com motivo obrigatório também.

**Falta no motor, e é pouco:** duas opções novas — ruído desligado e malhas
abertas (manual). Nenhuma das duas mexe na física; são um ramo no passo.

**Vou tocar.** Mover
`simulation/{clock,fopdt,noise,operating-point,pi,cd-profile,process-engine}.ts`
para `packages/shared/src/simulation/`; os imports da API;
`packages/shared/package.json` (o subcaminho, ver abaixo); `routes/process.ts` e
`routes/process-route-schemas.ts` (a rota `POST` nova); um Web Worker novo na
web; `screens/processo/SetpointPanel.tsx` e um painel novo ao lado dele;
`scripts/generate-demo.ts` (gravar o estado do motor no instantâneo) e
`api/demo-gateway.ts`.

#### Fase 5 — replay de quebra de folha

**Pronto.** A entidade `WebBreak` já guarda os precursores com `leadTimeS`
contado para trás dentro da janela de 10 min (`PRECURSOR_WINDOW_S = 600`), e os
sinais são **lidos do arquivo**, não acumulados em memória. O `excDev` por tag —
a régua da fase — está no catálogo. O grafo de relações responde quem depende de
quem. O historiador entrega janelas por tag, e os eventos do período (alarmes,
alterações de setpoint, trocas de gramatura) já têm rota.

**Vou tocar.** Um módulo puro novo no `shared` (comparação com a linha de base e
ordenação por quem desviou primeiro); `operations/web-break.ts`;
`routes/operations.ts` (o `GET` do replay); as consultas do historiador e das
operações; `screens/turno/Timeline.tsx` e `screens/BobinasScreen.tsx` (a porta
de entrada); a tela do replay; e o mapa 2D da Fase 2, reaproveitado para marcar
a posição da quebra.

#### Fase 6 — ciclo fechado de manutenção

**Pronto.** `rul.ts` já faz a regressão e já tem o critério de significância que
a fase pede (inclinação contra o erro padrão dela mesma, duas vezes, com piso
absoluto e mínimo de três amostras) — é dele que sai o prazo até a fronteira
C→D. As zonas ISO, os alarmes, as rondas com leitura de campo e as evidências
por referência já existem. A auditoria das alterações de setpoint é o molde
pronto para a auditoria das sugestões.

**Vou tocar.** Um módulo puro novo no `shared` (a regra que vira sugestão);
`operations/maintenance.ts` (situação `sugerida` antes de `aberta`, origem
`tendência`, motivo obrigatório na dispensa); uma migration e o teste que lê a
migration e cobra que as enumerações do SQL e as do `@mp1/shared` sejam a mesma
lista; o repositório e as consultas de operações; `routes/operations.ts`;
`runtime/catchup.ts` (gerar na retomada, idempotente);
`screens/mancais/BearingDetail.tsx`, `screens/NotasScreen.tsx`, `ui/Shell.tsx`
(o contador) e `screens/turno/Support.tsx`; `db/seed.ts` e
`scripts/generate-demo.ts` (o CS23 lado comando já é o mancal que degrada).

#### Fase 7 — sensor virtual de qualidade

Custo estimado mais abaixo. Não implemento sem tua confirmação.

### O núcleo puro do simulador pode ir para `packages/shared`?

**Pode, e sem quebrar a API.** O que sustenta a resposta:

1. **Não há dependência para fora.** Fora os testes, os onze arquivos de
   `apps/api/src/simulation/` importam **só** `@mp1/shared` e uns aos outros.
   Zero `node:*`, zero `fastify`, zero banco, zero `process.env`.
2. **O `shared` já é consumido pelo navegador** e é publicado como código-fonte
   (`exports: "./src/index.ts"`, sem build), então não há passo de empacotamento
   novo para o Worker da Fase 4.
3. **A API muda só de import.** Os consumidores são dez arquivos
   (`routes/process.ts`, `routes/stream.ts`, `routes/alarms.ts`,
   `routes/health.ts`, `routes/assets.ts`,
   `runtime/{catchup,entities,recorder,service}.ts`, `db/seed.ts`,
   `scripts/generate-demo.ts`) e os testes.

**Três condições, e são elas que decidem como fazer:**

- **Sai por subcaminho, não pelo barril.** `packages/shared/src/index.ts` é
  `export *` de tudo, e é o que cada tela importa. O motor ali dentro corre o
  risco de entrar no pedaço inicial da web — e `relations.ts` e
  `machine/steam-groups.ts` fazem validação em tempo de carga, que é exatamente
  o tipo de efeito que o empacotador não descarta sozinho. Então:
  `@mp1/shared/simulation`, com entrada própria em `exports`, e o motor só no
  pedaço do Worker.
- **Vai um grupo, não tudo.** `clock`, `fopdt`, `noise`, `operating-point`,
  `pi`, `cd-profile` e `process-engine` são o que o "e se" precisa. `scenarios`,
  `bearings`, `alarm-engine` e `vibration` ficam na API — são puros também, mas
  não têm por que atravessar agora. Um nó a desatar se algum dia forem:
  `simulation/vibration.test.ts` importa `DEGRADING_TAG` de `db/seed.ts`, e
  `db/seed.ts` importa `simulation/vibration` — com `vibration` no `shared`, o
  teste faria o `shared` depender da API, e a constante teria de mudar de casa
  junto.
- **O modo de demonstração precisa do estado no instantâneo.** Hoje
  `generate-demo.ts` grava só respostas de rota; o estado do motor (~1.300
  números, ~25 kB) não vai junto. Sem ele, o navegador remontaria a rede no
  ponto de operação e daria outra trajetória — é o mesmo erro que a Fase 5
  registrou acima ("a rede tem estado"). Com ele, "idêntico nos dois" é
  alcançável de verdade.

### Medição de base

**Como foi medido.** Build de produção (`npm run build -w @mp1/web`) servido por
`vite preview`, aberto no navegador embutido do app — Chromium com **WebGPU** e
GPU de verdade —, janela emulada em 1920 × 1080 com `devicePixelRatio` 1,25,
cache quente e a API local no ar (fonte ao vivo, não o instantâneo). `?perf=1`
publica `window.__twinPerf`. Antes de cada medida, uma navegação para uma página
vazia, para o custo de desmontar a cena anterior não entrar na conta da próxima;
os tempos são contados do início da primeira requisição.

**É a primeira medição de fps que vale neste projeto.** As anteriores ficaram em
~1 Hz porque a aba do navegador embutido estava oculta, e aba oculta não recebe
quadro.

**Pedaços do build** (bruto · gzip):

| arquivo               |    bruto |   gzip |
| --------------------- | -------: | -----: |
| `three-*.js`          | 1.673 kB | 456 kB |
| `react-*.js`          |   222 kB |  69 kB |
| `index-*.js`          |   220 kB |  63 kB |
| `index-*.css`         |    39 kB |   8 kB |
| `MachineScene-*.js`   |    15 kB |   7 kB |
| `preload-helper-*.js` |     1 kB |   1 kB |

Fora do JavaScript: `public/scene/` com ~3,7 MB (`mp1.glb` 1,8 MB e 11 lightmaps
WebP) e `public/demo/` com ~4,0 MB em 912 arquivos, dos quais cada tela baixa só
o que usa.

**As duas telas, e uma tela 2D como referência:**

| medida                    |     Máquina |      Mancais | Processo (2D) |
| ------------------------- | ----------: | -----------: | ------------: |
| primeira pintura          |       68 ms |        68 ms |         80 ms |
| conteúdo próprio da tela  |           — |       276 ms |        203 ms |
| pedaço do `three` baixado |      161 ms |       236 ms |     não baixa |
| `mp1.glb`                 |      536 ms |       664 ms |             — |
| último lightmap           |      547 ms |       677 ms |             — |
| canvas no DOM             |      471 ms |       578 ms |             — |
| primeiro quadro medido    |    1.054 ms |     1.155 ms |             — |
| até o fps estabilizar     |      ~6,0 s |       ~6,3 s |             — |
| requisições               |          26 | 107 (85 API) |   44 (37 API) |
| bytes                     |    2.354 kB |     2.354 kB |         79 kB |
| canvas                    | 1989 × 1093 |    840 × 463 |             — |
| chamadas de desenho       |         300 |          128 |             — |
| triângulos                |     277.511 |      148.511 |             — |
| memória de GPU · total    |    383,4 MB |     201,1 MB |             0 |
| memória de GPU · texturas |    375,1 MB |     196,5 MB |             0 |
| fps estável               |          60 |           60 |             — |

**Três leituras destes números.**

1. **O fps estável é 60 nas duas, travado na sincronia vertical** — não há folga
   visível por cima. O que dói não é o regime: são os **primeiros ~6 segundos**,
   em que o fps fica entre 1 e 16 enquanto as 121 configurações de desenho do
   pipeline são compiladas. É isso que faz a tela parecer pesada.
2. **A memória de GPU é quase toda textura.** Os 11 lightmaps a 2048², sem
   compressão de GPU, dão 176 MB (4 bytes por pixel); o resto são os 16 alvos de
   renderização do pipeline com TRAA e bloom, que escalam com o tamanho do
   canvas — é por isso que Mancais, com canvas pequeno, fica em 201 MB e a tela
   cheia em 383 MB.
3. **Mancais paga a cena inteira para mostrar um painel de 840 × 463.** O
   conteúdo próprio da tela está pronto aos 276 ms; a cena custa mais 2,3 MB,
   ~200 MB de GPU e os ~6 s de engasgo. E as 85 requisições à API da tela (uma
   por mancal sem instrumento no catálogo) são um segundo assunto, que não é
   desta fase.

**Com e sem `Atmosphere.tsx`.** A 60 fps travados não dá para comparar, então a
cena foi empurrada para fora da sincronia aumentando a janela até o canvas ficar
em 4389 × 2443, e o vapor foi ligado e desligado em tempo de execução pelo
`visible` do grupo (sem tocar no código), três vezes alternadas:

| vapor     | fps (mediana de 8 amostras) | chamadas de desenho | triângulos |
| --------- | --------------------------: | ------------------: | ---------: |
| ligado    |                     32 · 32 |                 300 |    277.511 |
| desligado |                          33 |                 294 |    277.367 |

Um quadro de ~31 ms contra um de ~30 ms: **o vapor é da ordem de 3 % do custo do
quadro** — 6 sprites, 6 chamadas de desenho e 144 triângulos. Ele **não** é a
maior parte do custo; a maior parte é pixel, ou seja, resolução e
pós-processamento. Pela regra da Fase 2 ("se a medição mostrar que eles são a
maior parte do custo, remova; senão, deixe atrás de uma opção"), ele **fica**,
desligado por padrão, atrás de uma opção — e aí vem a dúvida 5, porque a tela
Sistema não existe no build de produção.

O método tem um limite que vale dizer: desligar pelo `visible` tira o custo de
desenhar, não o de existir (a memória dos sprites e a montagem do material
continuam). Como são 6 sprites, isso não muda a conclusão.

### Fase 7 — quanto custa

A fase depende de o laboratório estar no simulador, e ele está pela metade:
**três dos 13 ensaios já são saídas do motor** (`LAB-1206` tração MD por
`JIC-101`, `LAB-1206R` razão MD/CD por `XHIC-202`, `LAB-1212` curl por
`PDIC-702`), e todos os 13 já têm ponto de operação em `operating-point.ts`. O
que não existe é o **ensaio como evento**: hoje os resultados são dado fixo no
front (`api/fixtures/lab.ts`), sem entidade, sem tabela e sem fila de análise.

Para a tração MD, o caminho mínimo é:

1. **Resultado de laboratório como entidade** — tipo no `shared`, tabela,
   repositório, rota e geração por bobina com o atraso de análise. É o pedaço
   grande: ~1 a 1,5 dia, e é pré-requisito tanto da Fase 7 quanto de o
   Laboratório deixar de ser ilustrativo.
2. **O estimador** — regressão sobre as variáveis de processo da janela da
   bobina, com a faixa de incerteza saindo do erro padrão do próprio ajuste (o
   `rul.ts` já é o precedente de como escrever isso com honestidade), e correção
   por deslocamento a cada resultado novo do laboratório: ~0,5 dia.
3. **Rota e tela** — a estimativa entre duas análises, com a faixa, e o pulo
   quando o laboratório chega: ~0,5 dia.

**Total: ~2 a 2,5 dias**, dos quais mais da metade é o item 1, que vale por si.
Sem o item 1 a fase não existe; com ele feito, o sensor virtual é barato.

### Dúvidas que precisam da tua resposta

1. **Busca e URL.** "Usando a navegação por URL que já existe" — hoje só a tela
   (âncora) e o ativo da cena (`?asset=`) estão na URL; bobina, TAG, mancal,
   nota e seção são estado do React em `App.tsx`. Duas leituras: (a) o resultado
   chama os abridores que já existem (`openTrend`, `openBearing`, `openReel`,
   `openNote`, `openArea`) e a URL fica como está; (b) a seleção passa a morar
   na URL, e aí todo resultado vira link que se cola numa conversa. (b) é mais
   trabalho e mexe em todas as telas. Qual?
2. **Blocos que não são `Panel`.** Lista de variáveis do Processo, linha do
   tempo do Turno, quadro de Notas e amostras do Sistema. Levo os três primeiros
   para `Panel` (e aí o teste cobre tudo), ou eles ficam de fora da regra?
3. **O design de Mancais perde para a instrução.** `5-mancais.png` reserva o
   painel de baixo à direita para o 3D ("Área reservada para o modelo 3D"). A
   Fase 2 põe ali o mapa 2D e manda o 3D para um botão. Confirmo que a instrução
   vence o desenho?
4. **O mapa 2D não tem referência de design.** Vou desenhá-lo na língua do
   sistema: fundo de painel, sem cantos arredondados, cor pela zona ISO com os
   tokens que já existem, vista lateral na mesma convenção do corte de
   `tools/scene-bake/wet.py`. Serve?
5. **Onde fica a opção do vapor.** `SistemaScreen` só entra nos builds de
   desenvolvimento e de teste — uma opção ali não existiria em produção.
   Alternativas: pôr a opção nos controles da própria tela Máquina, ou passar a
   publicar a tela Sistema. Qual?
6. **Tamanho da Fase 3.** A lista pede algo como 90 a 100 TAGs novas contra as
   68 próprias de hoje. O orçamento do historiador aguenta (com ~440 pontos, os
   7 dias continuam cabendo: a compressão medida foi de ~200 para 1 e sete dias
   deram ~17 MB de 300), mas eu queria tua confirmação da ordem de grandeza
   antes de mexer no CSV e na migration.
7. **O que as "autônomas" gravam.** Uma TAG autônoma (alvo + ruído + deriva
   lenta) não tem física por trás. Ela entra no historiador como as outras, ou
   só é calculada na hora da leitura? Guardar custa orçamento; não guardar
   impede tendência de 7 dias.
8. **Estado do motor no instantâneo.** A Fase 4 em demonstração precisa de
   `demo/sim-state.json` (~25 kB) para o navegador dar a mesma série que a API.
   Confirmo?
9. **Número da nota sugerida.** A sugestão já nasce com número `NM-…`, ou só
   ganha número quando é confirmada? Nascer com número gasta sequência em
   sugestão dispensada; não nascer exige uma chave própria para a sugestão.
10. **Base da branch.** `dev/feedback-processo` saiu de 54587dd, que é a ponta
    de `main` (e de `origin/main`). Confirmo que é a base certa.

### Respostas do Felipe, e o que elas fixam

1. **Busca (a).** O resultado chama os abridores que já existem em `App.tsx`; a
   URL fica como está. Seleção na URL fica para depois, fora deste pedido.
2. **Três blocos viram `Panel`:** a lista de variáveis do Processo, a linha do
   tempo do Turno e o quadro de Notas. Aí o teste "nenhum painel sem ajuda"
   cobre tudo. `SistemaScreen` fica fora da regra.
3. **A instrução vence o desenho** em Mancais: mapa 2D no painel, 3D atrás do
   botão.
4. **O mapa 2D sai na língua do sistema**, e a captura vai para revisão **antes**
   de ligar a interação. Se não servir, o Felipe desenha e eu refaço.
5. **A opção do vapor fica nos controles da própria tela Máquina.** A tela
   Sistema continua fora do build de produção.
6. **Teto de 50 TAGs novas no historiador.** A tabela da Fase 3 leva uma coluna
   de prioridade — 1 entra, 2 entra como ilustrativa, 3 fica de fora — e
   prioriza o que é ligado ou calculado. O corte é na aprovação do Felipe.
7. **A autônoma não grava.** Ela é função pura de (semente, passo, canal),
   deriva lenta inclusive, igual ao ruído do motor, e é calculada na leitura:
   assim a tendência de 7 dias existe sem gastar arquivo. Se isso complicar as
   rotas de histórico, eu paro e aviso **antes** de gravar.
8. **`demo/sim-state.json` entra no instantâneo.**
9. **A sugestão de nota só ganha número `NM-…` quando é confirmada.** A chave
   própria dela é (mancal + início da tendência); sugestão dispensada não gasta
   sequência.
10. **Base da branch confirmada.**

### Correção de processo, a partir daqui

A regra 1 não foi seguida: eu criei a branch `dev/feedback-processo` e commitei
a Fase 0 nela (a6e1d40, que fica). Daqui para a frente, **nada de commit, nada
de branch, nada de worktree**: a edição é direta na pasta principal do projeto,
na branch ativa (`main`), e cada fase termina com a **lista de arquivos agrupada
por commit sugerido** — quem commita é o Felipe.

A duplicação que isso ameaçava criar — o mesmo texto commitado numa branch e
solto na pasta principal — acabou não existindo: a ferramenta recolheu o
worktree para a pasta principal e o conteúdo da Fase 0 ficou num commit só,
`4c19908`, com a pasta principal na branch `dev/feedback-processo`. É dessa
ponta que a Fase 1 parte.

## Fase 1 — ajuda por bloco e busca

Feita na pasta principal, na branch ativa (`dev/feedback-processo`), **sem
commit**: a entrega é a árvore de trabalho mais a lista por commit sugerido, no
fim desta seção.

### Ajuda

**O "?" mora no `Panel`, e a prop `help` é obrigatória no tipo.** Essa foi a
decisão que mais rendeu: não existe painel sem texto porque painel sem texto não
compila. O teste cobra o que o tipo não alcança — chave que não existe no
`help.ts`, texto que sobrou sem dono quando um painel saiu, e bloco desenhado à
mão com a borda e o fundo do painel, que por não passar pelo `Panel` escaparia
da regra inteira. Esse último teste lê o código-fonte, de propósito: o que se
quer provar é uma propriedade do repositório, não do que uma tela renderizou.

**Três linhas, sempre as mesmas três** (`apps/web/src/ui/help.ts`, 23 blocos): o
que o bloco mostra, como ler, o que dá para clicar. Quando não há clique nenhum,
a terceira linha diz isso em vez de ficar em branco — "Nada aqui é clicável: é
leitura" é informação, um campo vazio é dúvida. A redação completa está em
`docs/notas-para-readme.md` §15, gerada do próprio arquivo, para o Felipe
revisar.

O painel fecha com Esc e com clique fora, e o foco volta para o "?" — quem abriu
pelo teclado não fica perdido no meio da página. Não é modal: a ajuda é para ser
lida **olhando** para o bloco.

**Os três blocos soltos viraram `Panel`**, como combinado na resposta 2: a lista
de variáveis do Processo, a linha do tempo do Turno e o detalhe da nota em
Notas. Duas coisas que o `Panel` precisou ganhar para isso, e só:

- `heading`, porque o bloco principal de uma tela é o `h1` dela — a linha do
  tempo no Turno, a lista de variáveis no Processo, o número da nota em Notas. O
  e2e espera esse `h1` na tela de abertura;
- `style`, para o detalhe da nota manter a borda de cima na cor da prioridade,
  que é valor calculado e não classe.

**Correção da Fase 0.** Eu tinha anotado que o quadro de Notas era um bloco
solto; ele já era `Panel` desde a fase (b). O bloco solto daquela tela é o
**detalhe da nota**, e foi ele que migrou. Os outros dois estavam certos.

**Fora da regra, e dito aqui para não parecer esquecimento:** `SistemaScreen`
(que só existe nos builds de desenvolvimento e de teste, por decisão do Felipe)
e o painel do ativo da tela Máquina — aquele é um sobreposto na cena, não um
bloco da grade, e o e2e o encontra pelo papel de complementar.

### Busca

Campo fixo no alto da moldura, com `/` e `Ctrl+K`. A barra é ignorada quando se
está digitando num campo, pela mesma razão que as teclas 1–8 já eram: digitar
"/" no motivo de uma alteração de setpoint não pode saltar para outro lugar.

**Índice em memória, sem biblioteca nova.** São 433 itens de texto curto — 8
telas, 327 TAGs (as 320 do catálogo mais as 7 fixas do preparo) e 98 mancais —,
e varrer isso a cada tecla custa menos do que o navegador leva para desenhar a
lista. Bobinas e notas entram na primeira vez que alguém abre a busca: são duas
requisições que as telas já fazem, e quem nunca busca não paga por elas. Se elas
falharem, a busca continua valendo para o resto — meia busca é melhor que um
erro na moldura.

**A regra de casamento é simples de explicar**, que é o que importa quando
alguém reclama de um resultado: minúsculas e sem acento (quem digita
"pre-secagem" acha a pré-secagem), **todos** os pedaços da consulta têm de
aparecer em algum lugar do item ("vapor g4" devolve só o `PIC-514`), e quem casa
pelo começo da TAG vem antes de quem casa no meio de uma descrição.

**Escolher um resultado chama os abridores que já existem** (resposta 1a):
`openTrend`, `openBearing`, `openReel`, `openNote` e a troca de tela. A busca
não ganhou um jeito próprio de navegar, e a URL ficou como estava.

Um conserto que veio de carona: `openTrend` não achava a área das sete variáveis
fixas do preparo, porque elas não estão no catálogo — e sem área a tela de
Processo abria na seção errada. Agora a área vem da própria variável fixa. Isso
já valia para quem clicava no alarme da cola AKD na tela de Turno.

### Medido

- **Testes**: `shared` 231, API 407 (111 pulados por falta de `DATABASE_URL`),
  web **181** — eram 148, mais 33 novos: 8 da regra da ajuda, 12 do índice da
  busca, 9 do campo e 4 do "?" do painel.
- **e2e**: **13**, de 10 — três novos em `e2e/busca.spec.ts`, que é o único
  lugar onde a ligação inteira (moldura → busca → abridor → tela certa) é
  exercitada no aplicativo de verdade.
- **Build**: o pedaço da aplicação foi de 219,88 kB para **235,32 kB**
  (gzip 63,13 → 68,94) e o CSS de 38,99 para 40,05 kB. São os 23 textos de
  ajuda, o índice e o campo. **O pedaço do `three` não mudou** e continua fora
  do carregamento inicial.
- **Capturas** em 1920×1080 e 1440×900 das oito telas, mais o "?" aberto e a
  busca com resultados. A tela Máquina fica sem PNG: o canvas é WebGPU, a
  superfície é apresentada e some, e uma captura de fora espera para sempre por
  um quadro que ela nunca enxerga — é a mesma razão pela qual a cena tem o
  gancho `__grabNext` por dentro. Os dois exames que importam, rolagem e
  console, valeram para ela também.

### Dois achados das capturas, nenhum desta fase

1. **O campo de busca ficava espremido a nada em 1440×900.** A barra superior
   tem itens demais que não encolhem. Resolvido com um piso de 200 px no campo e
   a lista de resultados centralizada abaixo dele. Este era meu, e está
   consertado.
2. **Em 1440×900, o gráfico do "Efeito do refino" é cortado pela borda do
   painel** — sobra de 157 px. **Não é da Fase 1**: medi com o "?" escondido e a
   sobra é exatamente a mesma. A causa é o SVG ficar com os 560 px do valor de
   partida de `useWidth` em vez da largura medida do container, que ali é ~400.
   Em 1920 a coluna é larga o bastante para os 560 caberem, e por isso nunca
   apareceu. Não há rolagem horizontal em lugar nenhum (o `main` é
   `overflow-x-hidden`), então o que acontece é corte, não barra. Fica para o
   Felipe decidir se entra agora ou vira linha da Fase 2.

Laboratório e Mancais acusam 3 px de sobra em 1440×900 — arredondamento de
grade, invisível.

### Em aberto

- `npm run format:check` acusa dois arquivos: `PROMPT-VIDEO.md` e
  `PROMPT-VIDEO-30S.md`. São rascunhos locais, não versionados (estão no
  `.git/info/exclude`), e não os toquei. Ou entram no `.prettierignore`, ou
  passam pelo Prettier — é texto teu.
- `.claude/` entrou no `.prettierignore` e nos `ignores` do ESLint. Sem isso,
  as cópias inteiras do repositório que a ferramenta deixa em
  `.claude/worktrees/` eram lintadas junto, e o `npm run lint` acusava 12 erros
  de código que não é o desta árvore — inclusive de um ambiente virtual de
  Python.

### Arquivos, por commit sugerido

**1. Ajuda por bloco: o "?" no Panel e os textos**

```
apps/web/src/ui/help.ts            (novo)
apps/web/src/ui/Panel.tsx
apps/web/src/ui/help.test.ts       (novo)
apps/web/src/ui/components.test.tsx
apps/web/src/screens/BobinasScreen.tsx
apps/web/src/screens/LaboratorioScreen.tsx
apps/web/src/screens/MancaisScreen.tsx
apps/web/src/screens/RondasScreen.tsx
apps/web/src/screens/mancais/BearingDetail.tsx
apps/web/src/screens/mancais/Scene3DPanel.tsx
apps/web/src/screens/processo/RefiningEffect.tsx
apps/web/src/screens/processo/SetpointPanel.tsx
apps/web/src/screens/processo/TrendStack.tsx
apps/web/src/screens/turno/Support.tsx
```

**2. Os três blocos soltos viram Panel**

```
apps/web/src/screens/ProcessoScreen.tsx
apps/web/src/screens/turno/Timeline.tsx
apps/web/src/screens/NotasScreen.tsx
```

**3. Busca na moldura**

```
apps/web/src/ui/search.ts          (novo)
apps/web/src/ui/SearchBox.tsx      (novo)
apps/web/src/ui/search.test.ts     (novo)
apps/web/src/ui/SearchBox.test.tsx (novo)
apps/web/src/ui/Shell.tsx
apps/web/src/App.tsx
apps/web/e2e/busca.spec.ts         (novo)
```

**4. Lint e Prettier ignoram `.claude/`**

```
eslint.config.js
.prettierignore
```

**5. Documentação da fase**

```
docs/progress.md
docs/notas-para-readme.md
```

### Conserto: o gráfico cortado em 1440 × 900

**A causa não era a que eu tinha suposto.** O `useWidth` media certo — o
container do "Efeito do refino" tinha os 381 px corretos do seu lugar na grade.
O que não acontecia era a medição. O hook guardava o elemento num `useRef` e
media num `useLayoutEffect([])`, que roda uma vez, no mount; o container daquele
gráfico só nasce depois, dentro do `ResourceState`, quando a resposta da API
chega. No mount o `ref.current` é `null`, o efeito desiste — e nunca mais roda.
A largura fica no valor de partida do hook para sempre.

Agora o `useWidth` devolve uma **função de ref**. Quem avisa que o elemento
chegou é o React, no instante em que ele entra na árvore; o nó vira estado e o
efeito depende dele. Medir passa a acontecer sempre: tarde, cedo, ou de novo se
o elemento for trocado.

**A varredura dos outros sete.** Dos oito pontos que chamam `useWidth`, seis
anexam o `ref` no mesmo render em que o componente monta — os dados chegam por
prop — e por isso mediam certo desde sempre. Dois ficavam atrás de condição: o
do refino, dentro do `ResourceState`, e o da carta de controle do Laboratório,
atrás do `if` de "poucos resultados para uma carta". O do Laboratório só não
quebrava porque, na prática, os resultados já estão lá quando o painel monta —
sorte, não desenho. Com a função de ref, os dois deixam de depender disso.

Medido no "Efeito do refino" em 1440 × 900: o SVG foi de **560 para 381 px**,
exatamente a largura do container, dentro de um painel de 527.

**A rede embaixo é `e2e/largura.spec.ts`**, uma tela por teste: para cada `svg`
da página, compara a borda direita dele com a do `section` que o contém, com 1
px de folga para arredondamento de grade. É e2e e não Vitest porque o jsdom não
calcula layout — lá toda largura vale zero, e um teste de unidade passaria
sorrindo com o gráfico cortado. O recorte é 1440 × 900, a tela mais estreita que
o projeto promete: em 1920 os valores de partida cabem por acidente, que é
exatamente como isso passou despercebido até agora. Rodado contra o código de
antes, ele acusa os três SVGs do refino; depois do conserto, **7 de 7**.

**Verificado:** e2e **20** (eram 13), testes da web 181 sem mudança, typecheck,
lint, `format:check` e build. O pedaço da aplicação ficou em 235,40 kB, contra
235,32 — o hook não engorda nada.

**`.prettierignore`** ganhou `PROMPT-VIDEO.md` e `PROMPT-VIDEO-30S.md`: são
rascunhos do Felipe, e o Prettier não tem o que fazer com eles. Com isso o
`npm run format:check` fica limpo de ponta a ponta.

#### Arquivos, por commit sugerido

**6. O gráfico usa a largura medida**

```
apps/web/src/ui/useWidth.ts
apps/web/e2e/largura.spec.ts   (novo)
docs/progress.md
```

**7. Prettier não toca nos rascunhos**

```
.prettierignore
```

## Fase 2 — Mancais mais leve

### O mapa 2D

**Duas faixas, uma por lado.** Numa vista lateral o mancal do lado comando e o
do lado acionamento caem no mesmo ponto — são as duas pontas do mesmo rolo.
Empilhar os dois num ponto só esconderia metade dos 98 mancais, e separá-los por
um deslocamento vertical inventaria uma altura que não existe. Então a máquina é
desenhada duas vezes, uma faixa por lado, cada uma rotulada. É também como se
pensa o problema na fábrica: o lado comando é onde se anda, o lado acionamento é
onde estão os motores.

**O X é a posição real em metros; o Y é esticado.** A escala horizontal é a do
modelo, e é por isso que os secadores aparecem como duas fileiras de cilindros
encostados, como estão na máquina. O vertical é esticado de 1,5 a 4 vezes,
conforme a altura que o painel tem — sem isso a máquina (98 m por 7) vira um fio
de 30 px e as duas fileiras se sobrepõem. O desenho ocupa a altura disponível:
674 × 353 em 1920, 485 × 204 em 1440.

**A cor é a da barra de mancal:** cinza em A e B, âmbar em C, vermelho em D,
tracejado para quem não tem leitura. Não é semáforo de quatro cores de
propósito — A e B são "em ordem", e pintar de verde faria o olho procurar verde.

**Os rótulos de seção aparecem onde cabem.** Speed Sizer, calandra e Pope são um
corpo cada uma e o nome tem mais pixels que a seção; ali fica só o traço, que já
diz que começa outra coisa. Em 1440 "Pós-secagem" também vira traço.

**O clique é do mouse, não do teclado.** Cada ponto é um botão com rótulo
("Cilindro secador 23 · lado comando · zona D"), e a área de clique é maior que
o ponto — 3 px de alvo é exercício de pontaria — e menor que meio vão entre dois
cilindros, senão um alvo rouba o clique do vizinho. Os 98 pontos **não** entram
na ordem do Tab: 98 paradas a mais atrapalhariam muito mais do que ajudam, e a
lista ao lado já dá a mesma escolha pelo teclado, com nome e número à vista.

**`useSize`** entrou em `ui/useWidth.ts` ao lado do `useWidth`, com a mesma
mecânica da função de ref: o mapa precisa saber a altura para decidir o quanto
estica o eixo vertical.

### O 3D atrás do botão

O painel é o mesmo — "Máquina · mancais" — com o mapa por padrão e o botão
"ver em 3D" ao lado da legenda. O `lazy` do three só é exercido quando a cena
entra, então **abrir Mancais não baixa mais nada de 3D**. A tela de Máquina
continua com a cena em tela cheia; é lá que ela é o assunto.

Isso contraria o desenho (`reference/design/5-mancais.png` reserva aquele painel
ao 3D), e é a decisão que o Felipe tomou na resposta 3 da Fase 0.

### O vapor

Medido na Fase 0: **~3 % do custo do quadro** — 6 sprites, 6 chamadas de desenho
e 144 triângulos de 300 e 277.511. Não é a maior parte do custo (a maior parte é
pixel: resolução e pós-processamento), então, pela regra da fase, ele **fica** —
desligado por padrão, atrás de uma opção. A opção é o botão "Vapor" na própria
tela de Máquina, e não na tela Sistema, porque a Sistema não existe no build de
produção (resposta 5).

`steam` entrou no `SceneState` ao lado de `playing`. A captura do ambiente, que
escondia o vapor para ele não entrar no reflexo de todo metal, já tratava a
ausência dele — continua valendo.

### Antes e depois

**Bytes e requisições ao abrir Mancais** (navegador embutido, 1920 × 1080, cache
quente, API local no ar — a mesma medida da Fase 0):

| medida                   |     Fase 0 |                     agora |
| ------------------------ | ---------: | ------------------------: |
| requisições              |        107 |                        93 |
| bytes                    |   2.354 kB |                 **79 kB** |
| pedaço do `three`        | aos 236 ms |             não é baixado |
| `mp1.glb` + 11 lightmaps | aos 677 ms |          não são baixados |
| memória de GPU           |   201,1 MB |                     **0** |
| engasgo ao abrir         |     ~6,3 s | não há cena para compilar |

**Os dois caminhos, na mesma rodada** (Playwright, 1920 × 1080, cache frio,
WebGL2 por software — por isso os números de GPU não se comparam com os da
Fase 0, que são de GPU de verdade):

| medida              | mapa (padrão) |  mapa + "ver em 3D" |
| ------------------- | ------------: | ------------------: |
| requisições         |            92 |                 109 |
| bytes               |        262 kB |            4.005 kB |
| memória de GPU      |             0 |            263,7 MB |
| até a cena aparecer |             — | 6,7 s após o clique |

O custo não sumiu: **mudou de lugar**. Quem quer o 3D paga por ele no momento em
que pede; quem abriu Mancais para ver vibração não paga nada.

**O e2e confirma por outro caminho:** os três testes de Mancais que não tocam no
3D rodam em ~0,9 a 1,5 s cada; os dois que abrem a cena, em 9,6 s e 21,7 s. Na
Fase 1 os dois testes da tela custavam 19,5 s e 30,2 s, porque todos
carregavam a cena.

### Verificado

Testes da web **186** (eram 181; cinco novos do mapa), e2e **23** (eram 20;
Mancais foi de 2 para 5 testes, cobrindo os dois caminhos), typecheck, lint,
`format:check` e build. O pedaço da aplicação foi de 235,40 para **240,26 kB** —
os 4,9 kB do mapa. Capturas em 1920 × 1080 e 1440 × 900, sem rolagem horizontal.

### Arquivos, por commit sugerido

**8. Mapa 2D da máquina na tela de Mancais**

```
apps/web/src/screens/mancais/MachineMap2D.tsx       (novo)
apps/web/src/screens/mancais/MachineMap2D.test.tsx  (novo)
apps/web/src/screens/mancais/MachinePanel.tsx       (novo)
apps/web/src/screens/mancais/Scene3DPanel.tsx       (removido)
apps/web/src/screens/MancaisScreen.tsx
apps/web/src/ui/useWidth.ts
apps/web/src/ui/help.ts
apps/web/e2e/mancais.spec.ts
```

**9. Vapor desligado por padrão, com botão na tela Máquina**

```
apps/web/src/scene/sceneState.tsx
apps/web/src/scene/MachineScene.tsx
apps/web/src/screens/MaquinaScreen.tsx
```

**10. Documentação da fase**

```
docs/progress.md
```

Pare aqui. A Fase 3 começa quando o Felipe escrever "fase 3".
