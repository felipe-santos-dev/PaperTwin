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

## Fase 3 — a tabela, para aprovação

Nada de código ainda. Esta seção é a tabela que a fase pede: cada item da lista
do engenheiro, cruzado com `catalogo-base.csv`, com a proposta e a coluna de
prioridade da resposta 6.

**Como ler as colunas.**

- **Hoje** — a TAG que já existe no catálogo, "fixa" para as sete do preparo que
  hoje são dado fixo no front, ou **falta**.
- **Nível** — o que a fase define, com uma distinção a mais que o orçamento
  obrigou:
  - **ligada** — tem relação FOPDT com outra TAG. Coeficientes novos entram
    `assumed`.
  - **calculada · arquivada** — sai de um balanço e vai para o historiador.
  - **calculada · na leitura** — sai de uma conta sobre TAGs que já estão
    arquivadas, no mesmo instante. **Não ocupa arquivo**: a série de 7 dias é
    reconstruída da série de quem ela depende.
  - **autônoma** — alvo + ruído + deriva lenta, função pura de (semente, passo,
    canal), como o ruído do motor. **Não ocupa arquivo** (resposta 7).
  - **ilustrativa** — dado fixo no front, com o selo. É o que prioridade 2
    quer dizer.
- **Prio** — 1 entra no simulador · 2 entra como ilustrativa · 3 fica de fora.

**Faixas, alvos e coeficientes de toda TAG nova entram `assumed`, confiança
baixa**, tirados de literatura pública de papel para imprimir e escrever. Nenhum
número vem de planta.

### Preparo de massa · 1xx

| Item pedido                       | Hoje             | TAG nova | Faixa     | Alvo | Un.   | Nível                      | Prio |
| --------------------------------- | ---------------- | -------- | --------- | ---- | ----- | -------------------------- | ---- |
| Freeness / grau Schopper          | fixa AIC-102     | —        | 20–36     | 28   | °SR   | **ligada** a JIC-101       | 1    |
| Potência de refinação             | JIC-101          | —        | —         | —    | —     | pronta                     | —    |
| Carga do refinador                | fixa JI-111      | —        | 1500–2400 | 1950 | kW    | autônoma                   | 1    |
| Posição dos discos                | fixa ZIC-112     | —        | 0,2–0,6   | 0,4  | mm    | autônoma (MV do refino)    | 1    |
| Cola AKD                          | fixa FIC-107     | —        | 0–2,4     | 1,4  | kg/t  | **ligada** a LAB-1211      | 1    |
| Amido de massa                    | fixa FIC-108     | —        | 4–12      | 8    | kg/t  | autônoma                   | 1    |
| Branqueador OBA                   | fixa FIC-110     | —        | 0–6       | 3    | kg/t  | ilustrativa (segue fixa)   | 2    |
| PCC e polímero de retenção        | FIC-106, FIC-109 | —        | —         | —    | —     | prontas                    | —    |
| Nível do tanque de mistura        | fixa LIC-103     | —        | 0–100     | 62   | %     | autônoma                   | 1    |
| Nível da tina da máquina          | falta            | LIC-131  | 30–85     | 60   | %     | autônoma                   | 1    |
| Nível do silo de água branca      | falta            | LIC-132  | 30–85     | 55   | %     | ilustrativa                | 2    |
| Consistência da tina da máquina   | falta            | AIC-133  | 2,6–3,8   | 3,2  | %     | ilustrativa                | 2    |
| Consistência da massa grossa      | AIC-104          | —        | —         | —    | —     | pronta                     | —    |
| Consistência da água branca       | AIC-306          | —        | —         | —    | —     | pronta                     | —    |
| Pressão de entrada do desaerador  | falta            | PI-141   | 30–70     | 50   | kPa a | autônoma                   | 1    |
| Pressão de saída do desaerador    | falta            | PI-142   | 20–45     | 33   | kPa a | autônoma                   | 1    |
| Torque do depurador primário      | falta            | JI-151   | 20–80     | 45   | %     | autônoma                   | 1    |
| ΔP do depurador primário          | falta            | PDI-152  | 40–120    | 70   | kPa   | ilustrativa                | 2    |
| Morfologia · comprimento de fibra | falta            | QI-121   | 0,8–2,4   | 1,55 | mm    | ilustrativa                | 2    |
| Viscosidade da celulose           | falta            | QI-122   | 600–900   | 750  | cm³/g | ilustrativa                | 2    |
| Alvura da celulose                | falta            | QI-123   | 86–92     | 89   | % ISO | ilustrativa                | 2    |
| Eficiência do filtro a disco      | falta            | XI-171   | 92–99,5   | 97   | %     | ilustrativa                | 2    |
| Percentual de refugo              | falta            | XI-0003  | 0–12      | 4,5  | %     | **calculada · arquivada**  | 1    |
| Fibra nova na receita             | falta            | XI-161   | 60–100    | 82   | %     | **calculada · na leitura** | 1    |
| Massa recuperada na receita       | falta            | XI-162   | 0–40      | 18   | %     | **calculada · na leitura** | 1    |

### Caixa de entrada e formação · 2xx e 3xx

| Item pedido                      | Hoje                 | TAG nova | Faixa     | Alvo | Un.  | Nível                      | Prio |
| -------------------------------- | -------------------- | -------- | --------- | ---- | ---- | -------------------------- | ---- |
| Consistência na caixa de entrada | falta                | AIC-203  | 0,6–1,2   | 0,9  | %    | **calculada · arquivada**  | 1    |
| Abertura do lábio                | falta                | ZIC-204  | 8–16      | 11,5 | mm   | autônoma                   | 1    |
| Posição dos atuadores CD         | ZIC-205              | —        | —         | —    | —    | pronta                     | —    |
| Orientação de fibras             | XHIC-202 + LAB-1206R | —        | —         | —    | —    | coberta                    | —    |
| Tensão da tela formadora         | falta                | WIC-301  | 4–9       | 6,5  | kN/m | autônoma                   | 1    |
| Vácuo do rolo de sucção          | falta                | PI-302   | −60 a −20 | −45  | kPa  | autônoma                   | 1    |
| Vácuo das caixas de vácuo        | falta                | PI-303   | −45 a −12 | −28  | kPa  | autônoma                   | 1    |
| Vazão das calhas e caixas        | falta                | FI-304   | 200–900   | 520  | m³/h | **calculada · na leitura** | 1    |
| Teor seco na saída do formador   | falta                | AI-305   | 15–23     | 19   | %    | **calculada · arquivada**  | 1    |
| Draw formador → prensa           | falta                | SDIC-307 | 0,5–2,5   | 1,4  | %    | ilustrativa                | 2    |

### Prensas · 4xx

| Item pedido                       | Hoje     | TAG nova | Faixa     | Alvo | Un.  | Nível               | Prio |
| --------------------------------- | -------- | -------- | --------- | ---- | ---- | ------------------- | ---- |
| Carga do nip da sapata            | WIC-401  | —        | —         | —    | —    | pronta              | —    |
| Carga do nip da 1ª prensa         | falta    | WIC-405  | 200–600   | 420  | kN/m | **ligada** a AI-407 | 1    |
| Tensão do feltro                  | falta    | WIC-402  | 3–7       | 5    | kN/m | autônoma            | 1    |
| Vácuo do rolo de sucção da prensa | falta    | PI-404   | −70 a −30 | −55  | kPa  | autônoma            | 1    |
| Teor seco na saída da prensa      | AI-407   | —        | —         | —    | —    | pronta              | —    |
| Caixa de vapor da prensa          | PIC-403  | —        | —         | —    | —    | pronta              | —    |
| Draw prensa → secagem             | SDIC-406 | —        | —         | —    | —    | pronta              | —    |

### Secagem · 5xx e 7xx

| Item pedido                       | Hoje                               | TAG nova                                | Faixa   | Alvo  | Un. | Nível                      | Prio |
| --------------------------------- | ---------------------------------- | --------------------------------------- | ------- | ----- | --- | -------------------------- | ---- |
| Pressão de vapor por grupo        | PIC-511…514, 711, 712              | —                                       | —       | —     | —   | prontas                    | —    |
| Temperatura de vapor por grupo    | falta                              | TI-541…544 (pré) · TI-741, TI-742 (pós) | 100–150 | varia | °C  | **calculada · na leitura** | 1    |
| Temperatura dos cilindros         | TI-52nn                            | —                                       | —       | —     | —   | pronta                     | —    |
| Consumo de vapor                  | falta                              | FI-551                                  | 20–60   | 38    | t/h | **calculada · na leitura** | 1    |
| Geração de condensado             | falta                              | FI-552                                  | 18–57   | 36    | t/h | **calculada · na leitura** | 1    |
| ΔP dos sifões e nível dos tanques | PDIC-52x, LIC-53x, PDIC-72x        | —                                       | —       | —     | —   | prontas                    | —    |
| Teor seco na saída da pré-secagem | falta                              | AI-528                                  | 55–75   | 66    | %   | **calculada · arquivada**  | 1    |
| Velocidade dos grupos (draw)      | SDIC-703                           | SDIC-527                                | 0–1,2   | 0,4   | %   | ilustrativa                | 2    |
| Capota e telas                    | TIC-505, AIC-506, PIC-507, WIC-508 | —                                       | —       | —     | —   | prontas                    | —    |

### Speed Sizer · 6xx

| Item pedido              | Hoje      | TAG nova | Faixa  | Alvo | Un.  | Nível       | Prio |
| ------------------------ | --------- | -------- | ------ | ---- | ---- | ----------- | ---- |
| Aplicação de amido       | XI-606A/B | —        | —      | —    | —    | pronta      | —    |
| Pressão do nip           | WIC-605   | —        | —      | —    | —    | pronta      | —    |
| Outros químicos do sizer | falta     | FIC-607  | 0–1,2  | 0,4  | kg/t | ilustrativa | 2    |
| Desgaste dos rolos       | falta     | XI-608   | 0–2000 | —    | h    | ilustrativa | 2    |

### Calandra e enroladeira · 8xx e 10xx

| Item pedido                           | Hoje                      | TAG nova | Faixa      | Alvo | Un.      | Nível                      | Prio |
| ------------------------------------- | ------------------------- | -------- | ---------- | ---- | -------- | -------------------------- | ---- |
| Pressão da calandra                   | WIC-801                   | —        | —          | —    | —        | pronta                     | —    |
| Abaulamento do rolo                   | falta                     | ZIC-805  | −100 a 100 | 0    | %        | autônoma                   | 1    |
| Perfis de umidade/espessura/gramatura | AI-912, AI-913, AI-915    | —        | —          | —    | —        | prontos (2σ CD)            | —    |
| Porosidade online                     | LAB-1205 (só laboratório) | AI-908   | 8–40       | 20   | s/100 mL | ilustrativa                | 2    |
| Eletricidade estática                 | falta                     | EI-806   | 0–60       | 12   | kV/m     | ilustrativa                | 2    |
| Perdas por mantas e refugo            | falta                     | XI-1005  | 0–4        | 1,2  | %        | **calculada · na leitura** | 1    |

### Rolo jumbo · laboratório, LAB-12xx

Os treze ensaios de hoje cobrem gramatura, umidade, espessura, aspereza, tração,
rasgo, cinzas, alvura, opacidade, Cobb e curl. Nenhum ensaio ocupa arquivo do
historiador: resultado de laboratório é por bobina, não é série.

| Ensaio pedido        | Hoje  | TAG nova | Faixa     | Alvo | Un.    | Nível       | Prio |
| -------------------- | ----- | -------- | --------- | ---- | ------ | ----------- | ---- |
| Cor (L\*a\*b\*)      | falta | LAB-1213 | 92–96 L\* | 94   | adim.  | ilustrativa | 2    |
| Dureza               | falta | LAB-1214 | 120–260   | 190  | N      | ilustrativa | 2    |
| Rigidez (Taber)      | falta | LAB-1215 | 0,8–2,2   | 1,4  | mN·m   | ilustrativa | 2    |
| Arrebentamento       | falta | LAB-1216 | 180–320   | 240  | kPa    | ilustrativa | 2    |
| Scott Bond           | falta | LAB-1217 | 120–280   | 190  | J/m²   | ilustrativa | 2    |
| Desprendimento de pó | falta | LAB-1218 | 0–5       | 1,8  | adim.  | ilustrativa | 2    |
| Sujidade             | falta | LAB-1219 | 0–8       | 2    | mm²/m² | ilustrativa | 2    |

### Manutenção · 11xx

| Item pedido                         | Hoje                      | TAG nova | Faixa | Alvo | Un. | Nível               | Prio |
| ----------------------------------- | ------------------------- | -------- | ----- | ---- | --- | ------------------- | ---- |
| Vibração e temperatura de mancal    | VI-51nn, VE-51nn, TI-53nn | —        | —     | —    | —   | prontas (72 dos 98) | —    |
| Os 26 mancais fora dos secadores    | rota do ativo             | —        | —     | —    | —   | —                   | 3    |
| Nível de óleo da unidade hidráulica | falta                     | LI-1108  | 40–90 | 70   | %   | autônoma            | 1    |
| Temperatura do óleo hidráulico      | falta                     | TI-1109  | 25–65 | 45   | °C  | autônoma            | 1    |
| Vazão de óleo por mancal            | FIC-1105                  | —        | —     | —    | —   | pronta              | —    |
| Rotina de inspeção                  | entidade Ronda            | —        | —     | —    | —   | coberta             | —    |

### O que isso custa

| Nível                      |  TAGs | Ocupa arquivo |
| -------------------------- | ----: | ------------- |
| ligada (relação nova)      |     3 | sim           |
| calculada · arquivada      |     4 | sim           |
| calculada · na leitura     |    12 | não           |
| autônoma                   |    17 | não           |
| ilustrativa (prioridade 2) |    21 | não           |
| **no historiador**         | **7** | **teto: 50**  |

São **7 TAGs novas no historiador** contra o teto de 50 — e isso não é proposta
frouxa, é consequência da resposta 7. A autônoma não grava porque é função pura
do passo; a **calculada · na leitura** não grava porque é conta sobre quem já
grava — temperatura de vapor sai da pressão do grupo, consumo e condensado saem
da evaporação, a receita sai do refugo. Guardar qualquer uma delas seria guardar
duas vezes o mesmo número.

**Em números de catálogo:** 320 → **356 variáveis** (36 novas, nenhuma por
cilindro), das quais **6 são promoções** das sete fixas de hoje (AIC-102,
FIC-107, FIC-108, JI-111, ZIC-112 e LIC-103 saem do dado fixo e passam a ser
simuladas; a FIC-110 continua fixa). O laboratório vai de 13 para **20 ensaios**
e as fixas do front, de 7 para **14** (saem as 6 promovidas, entram 13 novas). Pontos do historiador: 320 → **327**, com
o orçamento de 7 dias folgado (a compressão medida foi de ~200 para 1, e sete
dias deram 17 MB dos 300 reservados).

### As três relações FOPDT novas

Coeficientes `assumed`, na forma das 24 que já existem:

| #   | Entrada | Saída    | Ganho               | Tempo morto | τ     | Por quê                                                         |
| --- | ------- | -------- | ------------------- | ----------- | ----- | --------------------------------------------------------------- |
| 16  | JIC-101 | AIC-102  | +0,18 °SR por kWh/t | 270 s       | 450 s | mais energia fecha a fibra; mesmo atraso da relação 9 (tanques) |
| 17  | FIC-107 | LAB-1211 | −6 g/m² por kg/t    | 420 s       | 900 s | a cola AKD cura devagar — é o cenário que hoje é fixo           |
| 18  | WIC-405 | AI-407   | +0,004 % por kN/m   | 30 s        | 12 s  | mesma família da relação 6, com ganho menor                     |

A 17 tem uma consequência boa: o cenário da cola AKD, que hoje é teatro fixo no
front (a cola cai, a bobina é retida), passaria a acontecer no simulador.

### Uma consequência de desenho, para decidir junto

A resposta 7 pediu que a autônoma não grave e seja calculada na leitura, e
mandou avisar se isso complicasse as rotas de histórico. **Complica um ponto
só**, e tem solução limpa:

- **O valor de agora e os alarmes** não mudam: o motor calcula a autônoma a cada
  passo, como já faz com o ruído, e quem lê o instante lê dela.
- **A tendência** (`/process/tags/:tag/trend`) hoje lê o arquivo. Para uma TAG
  que não grava, a rota passa a reconstruir a série avaliando a mesma função
  pura nos instantes da janela. Dá o mesmo resultado — é função de (semente,
  passo, canal), não depende de quando se pergunta — e custa uma conta por ponto
  desenhado.

É uma ramificação na rota de tendência e no portão de demonstração, não um
mecanismo novo. Só quero isso dito antes, e não depois.

### O que eu já cortei

**Prioridade 2 é o meu corte**: 21 itens que entram como dado fixo porque não
têm física no simulador para sustentá-los — 13 TAGs de processo novas (as três
da celulose, porosidade online, desgaste de rolo, estática, ΔP do depurador,
consistência da tina, nível do silo, eficiência do filtro, os dois draws e os
químicos do sizer), os 7 ensaios novos de laboratório e a FIC-110, que já era
fixa e continua.

**Prioridade 3 tem um item só**, e vale explicar: dar TAG de catálogo aos 26
mancais que não são de cilindro secador custaria 52 TAGs — mais que tudo o resto
desta fase junto — para entregar uniformidade, não informação. Eles já têm
leitura pela rota do ativo, que é de onde a tela de Mancais os lê hoje.

### Fase 3 — feita

A tabela acima foi aprovada com quatro ajustes, e os quatro entraram.

#### 1. Um número só

O corpo da tabela e o resumo divergiam na contagem porque contam coisas
diferentes. Fica assim, e é esta a conta que vale:

| onde                      | antes |  depois | diferença |
| ------------------------- | ----: | ------: | --------- |
| catálogo de processo      |   320 | **356** | +36       |
| **pontos do historiador** |   320 | **321** | **+1**    |
| ensaios de laboratório    |    13 |      20 | +7        |
| TAGs fixas no front       |     7 |       1 | −6        |
| relações FOPDT            |    24 |      27 | +3        |

O catálogo cresceu 36 e o **historiador cresceu um ponto**. Não é erro de
conta: entraram 7 TAGs que gravam (3 ligadas e 4 calculadas) e saíram 6 que
gravavam sem precisar — as autônomas que já existiam (viscosidade do amido,
temperatura da capa do rolo macio, pressão do ar de instrumentação, amido do
lado inferior, diâmetro da bobina) e a largura útil, que é constante.

Dos 36 novos: 61 ligadas, 260 calculadas, 13 calculadas na leitura e 22
autônomas é a composição do catálogo inteiro; das novas, 3 são ligadas, 4
calculadas arquivadas, 12 calculadas na leitura e 17 autônomas.

#### 2. A temperatura do vapor sai da pressão do grupo

A faixa 100–150 °C não cobria o G1, que opera de −30 a +60 kPa rel e satura por
volta dos 92 °C. Cada `TI-54x` e `TI-74x` agora tem a faixa derivada da faixa de
pressão do **seu** grupo, pela mesma aproximação de saturação que a superfície
do cilindro usa:

| TAG    | grupo | pressão (kPa rel) | faixa (°C) | alvo |
| ------ | ----- | ----------------- | ---------- | ---- |
| TI-541 | G1    | −30 a 60          | 92–112     | 104  |
| TI-542 | G2    | 80 a 250          | 116–137    | 126  |
| TI-543 | G3    | 120 a 320         | 122–143    | 133  |
| TI-544 | G4    | 120 a 350         | 122–145    | 134  |
| TI-741 | G5    | 40 a 250          | 109–137    | 122  |
| TI-742 | G6    | 40 a 250          | 109–137    | 124  |

No instantâneo, a `TI-541` lê 103,6 °C — a saturação dos 15 kPa do G1.

#### 3. A autônoma não alarma sozinha

A deriva é calculada para caber **dentro de L–H**, com quatro desvios de ruído
reservados de folga, e a medida da autônoma é presa à faixa no fim. É a única
exceção à regra de que a medida não se prende, e ela existe exatamente por
isto: uma variável sem física por trás não pode acender um alarme que ninguém
sabe explicar.

A deriva em si é duas ondas de períodos incomensuráveis (~4 h e ~11 h) com fase
tirada do canal da tag — função pura de (semente, passo, canal), como o ruído.
Sem estado: recalcular um trecho dá o que rodar contínuo deu, que é a regra que
sustenta a retomada e, agora, a reconstrução da tendência.

#### 4. A cola AKD acontece no simulador

O cenário que termina na bobina retida era encenado no front: a curva da cola
era escrita à mão, o alarme era um objeto montado em TypeScript e o Cobb era um
número fixo. Agora:

- `FIC-107` é **malha do catálogo**, com L em 0,9 kg/t;
- o cenário `akdDipOf` derruba o setpoint para 0,6 kg/t duas horas e meia depois
  do início do turno B, e a malha **fica lá** até o turno virar — é assim que
  esse problema se comporta quando ninguém percebe;
- o alarme de L sobe pelo motor de alarmes, como o de qualquer outra TAG;
- a relação 17 (`FIC-107 → LAB-1211`) leva o Cobb de 25 para perto de 30 g/m²,
  acima dos 28 da especificação;
- a retenção da bobina, que continua sendo dado fixo porque não existe rota de
  laboratório, passou a se ancorar no **instante do alarme real**. Sem alarme,
  não há bobina retida — antes havia sempre, porque o front inventava o
  instante da queda.

No instantâneo: `FIC-107` em **0,597 kg/t com alarme de L ativo**, e a tendência
mostra a queda às 16:30 com a marca do limite.

#### O mecanismo novo: calculada na leitura

Foi o que permitiu 36 TAGs novas com um ponto a mais de arquivo. Uma
`calculada-na-leitura` é conta sobre TAGs que já gravam, no mesmo instante —
temperatura de vapor a partir da pressão, consumo e condensado a partir da
evaporação, receita a partir do refugo. Guardá-la seria guardar duas vezes o
mesmo número.

As fórmulas moram em `packages/shared/src/process/derived.ts`, cada uma com as
entradas **declaradas**. A declaração não é documentação: é o que deixa a rota
de tendência reconstruir a série de quem não grava, resolvendo a cadeia até
chegar em quem tem arquivo (ou em quem é autônoma, que se recalcula sozinha).
Uma fórmula que lesse uma tag fora de `inputs` daria série errada no gráfico e
certa no instante — o pior dos dois mundos.

Quase toda fórmula é linear em torno do ponto de operação, com coeficiente
`assumed`, pela mesma razão das relações FOPDT: é o que se pode sustentar.
As exceções são as que têm fórmula exata — a saturação do vapor e a receita,
que fecha em 100.

#### Três correções que eu fiz na minha própria tabela

1. **`FI-551`/`FI-552` viraram `FI-1110`/`FI-1111`.** Consumo e condensado são
   da máquina inteira; um número 5xx os poria na pré-secagem, contra a regra de
   numeração por área da LISTA-BASE.
2. **`AI-528` virou "teor seco após o G2".** "Saída da pré-secagem" com alvo
   66 % estava errado: ali a folha já está perto de 95 %, que é a `AIC-901` por
   outro nome. Depois do G2 é onde 66 % faz sentido, e é um ponto que a tela não
   tinha.
3. **As três TAGs de 2σ CD continuam arquivadas.** Eu as tinha marcado como
   autônomas; elas alimentam a média de 2σ **de uma bobina**, que é colhida do
   arquivo. Uma medida que alimenta entidade colhida do arquivo precisa ter
   arquivo. Viraram calculadas, com uma fórmula que piora o perfil quando a MD
   sai do alvo.

#### Medido

- **Compressão 201:1**, contra 202:1 antes — praticamente a mesma, com 36
  variáveis a mais no catálogo.
- **Sete dias de arquivo: 17,0 MB dos 300 reservados (5,7 %)**, a partir de
  85,9 linhas por ponto por dia medidas no instantâneo.
- Testes: `shared` **233**, API **407** (111 pulados sem `DATABASE_URL`), web
  **186**, e2e **23**. Typecheck, lint, `format:check` e build.
- O pedaço da aplicação foi de 240,26 para **258,93 kB** — o catálogo maior.
- Capturas em 1920 × 1080 e 1440 × 900 de Processo, Laboratório e Turno, sem
  rolagem horizontal.

**Uma observação sobre as capturas:** elas foram tiradas no modo de
demonstração, com a API local bloqueada de propósito. O processo da API que
estava no ar é de um build anterior à Fase 3 e não conhece as TAGs novas — nele
as linhas aparecem sem valor. O instantâneo é gerado pelo código desta fase e
mostra o estado certo. Quem subir a API de novo vê o mesmo.

#### Alarmes novos que aparecem no instantâneo

Dois, e os dois durante a troca de gramatura: `XI-0003` (refugo) cruza o H de
8 % e `AI-912` (2σ CD de gramatura) cruza o HH. É consequência das fórmulas —
quando a máquina está fora do alvo, o refugo sobe e o perfil piora —, os dois
normalizam quando a troca estabiliza, e me parece mais certo do que errado. Se
tu achares que é ruído, o lugar de mexer é o coeficiente das duas fórmulas em
`derived.ts`.

#### Arquivos, por commit sugerido

**11. Nível no catálogo, 36 TAGs novas e três relações**

```
reference/research/catalogo-base.csv
reference/research/relacoes-fopdt.csv
packages/shared/src/process/types.ts
packages/shared/src/process/catalog.generated.ts
packages/shared/src/process/relations.generated.ts
packages/shared/scripts/catalog-csv.ts
packages/shared/scripts/generate-process-catalog.ts
packages/shared/src/process/relations.test.ts
```

**12. O que grava e o que se recalcula**

```
packages/shared/src/process/derived.ts        (novo)
packages/shared/src/process/index.ts
packages/shared/src/historian/points.ts
packages/shared/src/historian/compression.test.ts
apps/api/src/simulation/autonomous.ts         (novo)
apps/api/src/simulation/process-engine.ts
apps/api/src/simulation/process-engine.test.ts
apps/api/src/simulation/operating-point.ts
apps/api/src/runtime/reconstruct.ts           (novo)
apps/api/src/routes/process.ts
apps/api/src/routes/process.test.ts
```

**13. A cola AKD no simulador, e o dado fixo que ela substitui**

```
apps/api/src/simulation/scenarios.ts
apps/api/src/runtime/catchup.ts
apps/web/src/api/fixtures/process.ts
apps/web/src/api/fixtures/scenario.ts
apps/web/src/api/fixtures/index.ts
apps/web/src/api/fixtures/fixtures.test.ts
apps/web/src/api/gateway.ts
apps/web/src/screens/TurnoScreen.tsx
apps/web/src/screens/screens.test.tsx
apps/web/src/ui/search.test.ts
```

**14. Os sete ensaios que faltavam na matriz**

```
packages/shared/src/process/lab.ts
packages/shared/src/process/relation-types.ts
apps/web/src/api/fixtures/lab.ts
```

**15. Limpeza: o painel 3D antigo**

```
apps/web/src/screens/mancais/Scene3DPanel.tsx   (removido)
```

O `Scene3DPanel.tsx` tinha saído na Fase 2 — o `MachinePanel` o substituiu —,
mas sobreviveu ao commit e voltou a quebrar o typecheck, porque referencia a
chave de ajuda antiga e um `SceneState` sem o vapor. Ninguém o importa.

**16. Documentação da fase**

```
docs/progress.md
```

## Fase 4 — modo "e se"

### O núcleo saiu da API

A Fase 0 disse que dava, e deu. Foram para `packages/shared/src/simulation/`:
`clock`, `fopdt`, `noise`, `operating-point`, `pi`, `cd-profile`,
`process-engine` e `autonomous`. Ficaram na API `scenarios`, `bearings`,
`alarm-engine` e `vibration` — são puros também, mas não têm por que atravessar
agora.

**Por subcaminho, não pelo barril.** `@mp1/shared/simulation` é uma entrada
própria no `exports` do pacote. O barril é importado por todas as telas; o
motor ali dentro entraria no pedaço inicial da web. Com o subcaminho, ele fica
no pedaço de quem pediu — e o build confirma: o **worker tem 74,6 kB** e o
pedaço da aplicação não cresceu por causa do motor.

Dentro do pacote os imports viraram relativos. Importar `@mp1/shared` de dentro
de `@mp1/shared` funcionaria pelo link do npm, e seria o primeiro passo para um
ciclo que ninguém enxerga.

Os testes foram junto: o `shared` passou de 233 para **337** e a API, de 407
para 323. A soma não mudou — é o mesmo teste, do lado de quem agora tem o
código.

### Duas opções novas no motor, e uma função

- `noise: false` — a previsão não treme. Com ruído, a diferença entre as duas
  curvas teria um pedaço que não é da mudança.
- `loops: 'manual'` — malha aberta: ninguém persegue setpoint, e aparece a
  resposta pura do processo.
- `force(tag, value)` — o degrau de malha aberta, que põe a válvula onde se
  mandou. Só aceita malha de campo: medição e PV de cascata são resultado, não
  comando.

### O cálculo

Duas trajetórias do **mesmo** estado — uma sem a mudança, uma com ela —, e a
diferença entre as curvas é a mudança e nada mais. Por variável alcançada:
variação final, **desvio de pico**, tempo morto, tempo até 63 %, instante em
que cruza cada limite, e se a válvula saturou.

O pico não estava na lista da fase, e entrou porque sem ele a tela mentia: em
automático a malha devolve a variável ao setpoint, o desvio final fica em zero
e a frase dizia "cai 0,00 %" sobre uma perturbação de 1,1 g/m². Agora ela diz
o que aconteceu: _"Gramatura · scanner final cai 1,12 g/m² no pico em 1,8 min e
a malha traz de volta"_.

**Quem a mudança alcança sai do grafo de relações**, andando da entrada para a
saída e depois pelas calculadas que leem essas saídas — o mesmo grafo que o
motor usa para integrar, para a lista não poder discordar do que se move.

**Três coisas que ele não faz**, e são o ponto: não grava (nenhuma amostra, nenhum
alarme), não toca no processo (os dois motores saem de uma cópia do estado) e
não treme.

### Onde roda

**Com API:** `POST /process/what-if`, validada por esquema, com teto de
horizonte de 30 min e no máximo quatro mudanças por pedido. O teto está no
esquema e no núcleo: cada segundo de previsão são dois passos de motor, e um
pedido de oito horas pararia a API para todo mundo.

**Sem API:** o estado do motor viaja no instantâneo
(`demo/sim-state.json`, **23,6 kB**) e a conta roda num **Web Worker** com o
mesmo `runWhatIf`. É a primeira coisa que o modo de demonstração **calcula** em
vez de servir de arquivo — e por isso `whatIf` não é `null` no portão de
demonstração, como a escrita de setpoint é: prever não muda nada, então não há
o que fingir.

O worker existe por duas razões: meia hora de previsão são 3.600 passos duas
vezes, que na thread da interface travariam justamente a tela em que a pessoa
acabou de clicar; e é ele que mantém o motor fora do pedaço inicial.

### A tela

Dentro de Processo, abaixo do painel de setpoint. Escolhe-se a malha, propõe-se
o valor, e a previsão aparece: a frase gerada dos números, e uma curva por
variável — cinza o que aconteceria sem mexer, azul a proposta, tracejado
vertical no tempo morto, marca vermelha onde cruza um limite, banda L–H ao
fundo.

Os três atalhos da fase estão lá: **vapor do grupo principal**, **velocidade da
máquina** e **carga da prensa**. O do vapor abre em manual de propósito — a
`PIC-514` é escrava de cascata, e em automático quem manda nela é a umidade.

Aplicar continua sendo o painel de cima, com motivo obrigatório e auditoria.
Esta tela não escreve nada.

### O que os testes seguram

- **Degrau reproduz o CSV.** Quatro relações, em malha aberta: ganho, tempo
  morto e τ têm de bater com a linha do `relacoes-fopdt.csv`, com o nome da
  relação na mensagem quando não batem.
- **A cópia não vaza.** O estado passado continua igual depois da previsão, e o
  motor de onde ele saiu continua no mesmo passo, com o mesmo valor.
- **A rota não acrescenta nada.** O teste roda o núcleo direto com o estado que
  a rota usaria e exige resposta idêntica. É isto que garante que o navegador e
  a API dão a mesma série: não há duas implementações: há uma, e o que poderia
  divergir é o que cada lado faz em volta.
- **O instantâneo serve de partida.** O teste lê o `sim-state.json` que o
  gerador escreveu e roda o núcleo sobre ele — exatamente o que o worker faz.
- **No navegador, de verdade.** Um e2e bloqueia a API, simula pela tela e exige
  que o `sim-state.json` e o pedaço do worker tenham sido baixados. Outro exige
  que esse pedaço **não** entre no carregamento inicial.
- **A escrava de cascata é recusada** na previsão como é na escrita.

### Medido

- Testes: `shared` **337**, API **323** (111 pulados sem `DATABASE_URL`), web
  **186**. Typecheck, lint, `format:check` e build.
- e2e: **26 testes**, 24 passando, 1 pulado e 1 falhando — os dois últimos por
  causa do ambiente, não do código (veja abaixo).
- Build: pedaço da aplicação **268,5 kB** (era 258,9 — os 9,6 kB do painel) e o
  **worker em 74,6 kB**, baixado só quando alguém simula. O pedaço do `three`
  não mudou.

### Dois problemas do ambiente, não do código

1. **A API na porta 3333 tem 69 h de uptime** e é de um build anterior a esta
   fase: ela não tem a rota `/process/what-if` (404). O e2e do caminho com API
   se **pula** dizendo isso, em vez de falhar sem explicar — no CI a API sobe do
   zero e o teste roda de verdade. Tentei reiniciar o processo e o ambiente
   recusou, com razão: não é um processo meu.
2. **Um e2e da Fase 3 falha pelo mesmo motivo**: `scene.spec.ts`, "o painel do
   mancal mostra a vibração vinda da API", espera mais de dez colunas de
   vibração e a API em pé só tem **três** — o arquivo dela encolheu nesses dias
   de processo ocioso. Reiniciar a API resolve as duas coisas.

### Arquivos, por commit sugerido

**17. O núcleo puro sai da API**

```
packages/shared/src/simulation/        (movido de apps/api/src/simulation)
packages/shared/src/simulation/index.ts (novo)
packages/shared/package.json
apps/api/src/**                         (imports)
```

**18. O motor aprende a não tremer e a abrir a malha**

```
packages/shared/src/simulation/process-engine.ts
```

**19. O cálculo do "e se"**

```
packages/shared/src/simulation/what-if.ts        (novo)
packages/shared/src/simulation/what-if.test.ts   (novo)
```

**20. A rota, e o estado no instantâneo**

```
apps/api/src/routes/process.ts
apps/api/src/routes/process-route-schemas.ts
apps/api/src/routes/process.test.ts
apps/api/src/scripts/generate-demo.ts
apps/web/public/demo/sim-state.json
```

**21. O mesmo núcleo no navegador**

```
apps/web/src/api/whatif-worker.ts   (novo)
apps/web/src/api/whatif.ts          (novo)
apps/web/src/api/process.ts
apps/web/src/api/gateway.ts
apps/web/src/api/demo-gateway.ts
```

**22. Simular antes de aplicar**

```
apps/web/src/screens/processo/WhatIfPanel.tsx   (novo)
apps/web/src/screens/ProcessoScreen.tsx
apps/web/src/screens/screens.test.tsx
apps/web/src/ui/help.ts
apps/web/e2e/e-se.spec.ts                       (novo)
```

**23. Documentação da fase**

```
docs/progress.md
```

## Fase 4b — a Simulação ganha tela, e a Tendência volta a desenhar

### Tecla 9, e a Máquina continua na 8

A Simulação entrou **depois** da Máquina na lista das telas. A ordem do caminho
do papel pediria outro lugar, mas mover a Máquina para encaixá-la quebraria uma
tecla que já está na cabeça de quem usa o gêmeo — e tecla decorada vale mais do
que lista perfeita. A busca acha a tela nova sem nada a mais: o índice sai de
`SCREENS`.

### A tela nunca abre vazia

Ao entrar, ela já roda o atalho da velocidade da máquina e mostra o resultado.
Uma tela de simulação em branco pede que a pessoa adivinhe o que digitar antes
de descobrir o que a tela faz; com um caso em pé, ela arrasta o controle e
entende em dois segundos.

**O botão "Simular" não existe mais.** Não havia o que confirmar: mudar o valor
**é** o pedido. Toda alteração de malha, valor, modo ou horizonte recalcula
sozinha, 320 ms depois da última mexida — arrastar o controle deslizante não
manda trinta pedidos —, e a resposta anterior fica na tela até a nova chegar.
Piscar para o vazio a cada tecla seria pior do que um número com meio segundo
de atraso.

### Três colunas

**Esquerda, a entrada.** Até quatro malhas, agrupadas por seção no seletor, cada
uma com o valor de agora, o novo valor e um controle deslizante que vai de ponta
a ponta da faixa da válvula. Modo, horizonte, os três atalhos e, no pé,
"Aplicar no processo".

A lista de malhas **muda com o modo**, e isso é da física, não da tela: em
automático escreve-se setpoint, e a escrava de cascata não tem o seu; em manual
força-se a válvula, e a PV de cascata não é válvula, é medida. A regra saiu para
`changeableTags`, no mesmo núcleo que recusaria o pedido — um teste percorre as
duas listas e exige que o motor aceite cada tag que elas oferecem.

**Centro, as curvas.** Uma faixa por variável alcançada, eixo de tempo comum, a
frase gerada dos números em destaque no alto. Cada faixa tem escala vertical
própria — gramatura em g/m² e pressão em kPa não dividem eixo —, mas o tempo é o
mesmo de cima a baixo, e é isso que deixa ler a cadeia: a velocidade sobe, a
gramatura começa a cair vinte segundos depois, a umidade atrás dela.

A ordem é a mexida primeiro e depois o maior desvio, medido na banda L–H de cada
uma. A mexida no topo porque é a entrada: a pilha se lê de cima para baixo como
a cadeia se lê.

**"Comparar modos"** desenha automático (cheia) e manual (tracejada) no mesmo
gráfico. O espaço entre as duas é exatamente o que o controle faz — a parte do
desvio que a malha come. É a coisa mais difícil de explicar com palavras e a
mais fácil de ver num gráfico. O alternador fica desligado quando a malha só
existe num dos modos, com o motivo no título.

**Direita, os números.** Variação final, pico, tempo morto, 63 %, limite cruzado
e saturação, por variável. Clicar numa linha destaca o gráfico dela e abre, no
pé, o **caminho de causa e efeito**: da malha mexida até ela, passo a passo.

O caminho sai do grafo de relações do simulador — o mesmo que o motor integra —
e não de um texto à parte, que envelheceria no dia em que uma relação entrasse
no CSV. Um teste exige que cada seta do caminho seja uma linha do
`relacoes-fopdt.csv` ou uma fórmula declarada.

### O tempo morto estava mentindo em automático

Ele saía de "2 % da variação final", e em automático a variação final de uma
controlada é quase zero: a malha devolve a variável ao setpoint. Dois por cento
de quase zero é o primeiro ponto em que o ruído numérico aparece — ou seja,
tempo morto de um passo para tudo, e a tabela inteira dizendo 5 s.

Agora, quando o fim é muito menor que o pico, a régua é o pico. É a mesma
distinção que a frase já fazia desde a Fase 4 ("cai 1,12 no pico e a malha traz
de volta"), aplicada também aos tempos.

### Aplicar continua sendo um lugar só

"Aplicar no processo" **não escreve**: leva a proposta para o painel de setpoint
de Processo, já preenchida, onde o motivo é obrigatório e a escrita entra no
registro auditado. No caminho de volta, o painel de setpoint ganhou o link
"Simular esta malha", que abre a Simulação com ela. O painel "Simular antes de
aplicar" saiu de Processo.

Um e2e faz a ida e a volta inteira: a malha que sai do painel de setpoint chega
à Simulação, e o valor proposto lá volta preenchido no campo de novo SP.

### A Tendência: quatro coisas erradas, e nenhuma era a mesma

**1. O painel não tinha altura.** A coluna da direita tem painéis de altura fixa
e a tendência ficava com o que sobrasse. Com o painel do "e se" embaixo, a
sobra era **zero**: o bloco aparecia só com o cabeçalho, e o gráfico não existia
— em nenhuma TAG, não só na PIC-201. Agora ela cresce quando há espaço, para de
encolher em 300 px e, se a soma não couber, quem rola é a coluna. Medido:
308 px de faixa em 1920×1080 e 300 px em 1440×900.

**2. As TAGs estavam no corpo.** Comiam uma linha inteira da área que é o
painel. Foram para o cabeçalho, ao lado de 1 h / 8 h / 24 h / 7 d. Para isso o
`Panel` aprendeu a encolher e quebrar o seu `aside` em vez de deixar vazar.

**3. As autônomas e as calculadas na leitura não tinham série no instantâneo.**
O gerador do modo de demonstração só gravava a tendência de quem **arquiva**, e
a Fase 3 criou duas famílias que não ocupam linha de historiador — a rota as
resolve por reconstrução, o instantâneo as pulava. Eram 35 TAGs do catálogo que
abriam vazias sem API, que é como quase todo mundo vê o projeto. Agora o
instantâneo traz as 356.

O custo disso foi menor do que parecia porque a reconstrução passou a arredondar
em quatro casas, as mesmas da rota de valores: `224.99683033140063` não é mais
verdadeiro que `224,9968`, e as treze casas extras só engordavam o JSON. O
instantâneo foi de 4,9 MB para 5,0 MB com 35 séries a mais.

No caminho apareceu um buraco de verdade: `GET /process/tags/XI-0002/trend`
respondia **500**. A largura da folha não grava, não passeia e não tem fórmula —
ela vale 8 m ontem, hoje e na semana que vem —, e a reconstrução não tinha caso
para constante. Agora tem: uma reta.

**4. A coluna SP mostrava "–" em toda malha.** Era falta de dado na API, não de
leitura na tela: as duas rotas de valor mandavam `setpoint: null` fixo, sem
perguntar ao motor. O motor sabe — inclusive o que a cascata escreve na escrava,
que não tem setpoint próprio mas **tem** um setpoint em vigor, e mostrar "–" ali
dizia que a malha estava solta. O relatório da retomada passou a trazer o mapa e
as rotas a usá-lo: 57 das 356 TAGs agora têm SP.

Um e2e abre a Tendência com uma arquivada (`FIC-105`), uma autônoma (`JI-111`) e
uma calculada na leitura (`XI-161`) e exige linha com mais de um ponto e faixa
com altura nas três; outro exige as TAGs e o "+ TAG" dentro do cabeçalho; outro
cobra número na coluna SP.

### Medido

- Testes: `shared` **344**, web **194**, API **323** (111 pulados sem `DATABASE_URL`). Typecheck, lint,
  `format:check` e build.
- e2e: **32** testes, todos passando — inclusive os da cena 3D e o da vibração,
  que a Fase 4 entregou falhando por causa da API velha na porta 3333.
- Build: pedaço da aplicação **283,0 kB** (era 268,5 — a tela nova), worker em
  **74,9 kB** e o `three` inalterado. O motor continua fora do carregamento
  inicial: um e2e cobra isso, e o que entrou no pedaço da aplicação foi a tabela
  das cascatas, não o motor.
- Sem rolagem horizontal em 1920×1080 nem em 1440×900, nas duas telas.

### Arquivos, por commit sugerido

**24. O setpoint em vigor sai do motor e chega na tela**

```
packages/shared/src/simulation/process-engine.ts
apps/api/src/runtime/catchup.ts
apps/api/src/routes/process.ts
```

**25. Tendência de toda TAG no instantâneo**

```
apps/api/src/runtime/reconstruct.ts
apps/api/src/scripts/generate-demo.ts
```

O instantâneo em si não entra no commit: `apps/web/public/demo/` está no
`.gitignore` e sai de `npm run demo:data`, que precisa ser rodado de novo depois
deste commit.

**26. Caminho de causa e efeito, e as malhas de cada modo**

```
packages/shared/src/simulation/what-if.ts
packages/shared/src/simulation/what-if.test.ts
```

**27. A tela de Simulação**

```
apps/web/src/screens/SimulacaoScreen.tsx        (novo)
apps/web/src/screens/simulacao/Entrada.tsx      (novo)
apps/web/src/screens/simulacao/Curvas.tsx       (novo)
apps/web/src/screens/simulacao/Efeitos.tsx      (novo)
apps/web/src/screens/simulacao/frase.ts         (novo)
apps/web/src/ui/screens.ts
apps/web/src/ui/screens.test.ts
apps/web/src/ui/search.test.ts
apps/web/src/ui/Shell.tsx
apps/web/src/ui/help.ts
apps/web/src/App.tsx
```

**28. Processo: o painel do "e se" sai, o link entra**

```
apps/web/src/screens/processo/WhatIfPanel.tsx   (removido)
apps/web/src/screens/processo/SetpointPanel.tsx
apps/web/src/screens/ProcessoScreen.tsx
```

**29. A Tendência volta a desenhar**

```
apps/web/src/screens/processo/TrendStack.tsx
apps/web/src/ui/Panel.tsx
```

**30. Testes**

```
apps/web/src/screens/screens.test.tsx
apps/web/e2e/e-se.spec.ts
apps/web/e2e/tendencia.spec.ts                  (novo)
```

**31. Documentação da fase**

```
docs/progress.md
```

### Depois do commit: a linha do cabeçalho da Tendência

Em 1440 o cabeçalho quebrava em duas linhas, e duas linhas devolviam ao gráfico
metade do que a mudança tinha lhe dado. Medido: a linha pedia **493 px** e tinha
**402**.

Os botões de janela encolheram (`h-6`, `px-1.5`, 11 px) e foram de 177 px para
**123**. Faltavam ainda ~43 px, então o que não cabe virou **"+N"**, um botão que
abre a lista das TAGs escondidas — cada uma com o seu × , porque o gráfico delas
continua desenhado embaixo e o cabeçalho não pode mentir sobre o que está na
tela.

**A conta é medida, não escolhida.** Um "mostre duas e esconda o resto" esconderia
TAG à toa em 1920 e ainda estouraria em 1440, porque o tamanho do chip depende do
nome da TAG — `JI-111` e `PDIC-521` não medem o mesmo. Uma régua invisível desenha
todas as peças no tamanho natural, e a linha mostra quantas couberem.

A régua existe para a medida não depender do que está na tela: medir as peças
visíveis faria o resultado mudar o layout, que mudaria o resultado — esconder uma
TAG sobraria espaço, que traria a TAG de volta, que faltaria espaço.

Para a caixa das TAGs saber quanto espaço tem, o `aside` do `Panel` passou a ser
`flex-1`: uma caixa do tamanho do conteúdo responderia o tamanho do conteúdo, e a
conta andaria em círculo.

Medido depois: cabeçalho de **26 px** nas duas larguras — três TAGs na linha em
1920, duas mais "+1" em 1440.

Testes novos: cabeçalho numa linha só em 1920 e em 1440; o "+N" abre a lista e a
soma (na linha + na lista) bate com o número de gráficos; e em 1920 não sobra
"+N" nenhum.

**32. O cabeçalho da Tendência numa linha só**

```
apps/web/src/screens/processo/TrendStack.tsx
apps/web/src/ui/Panel.tsx
apps/web/e2e/tendencia.spec.ts
docs/progress.md
```

## Fase 5 — replay de quebra de folha

### A pergunta, e o que dá para responder dela

"Por que a folha quebrou" é a pergunta mais cara da operação, e um gêmeo não
tem como respondê-la: a causa pode estar fora do catálogo — um rolo sujo, uma
emenda mal feita, uma faca de ponta. O que ele tem como responder é **o que se
mexeu primeiro**, com a régua à vista.

A tela diz "primeiro desvio", e não "causa", em todo lugar onde poderia dizer
as duas coisas. A diferença parece sutil e não é: a primeira convida a olhar, a
segunda encerra o assunto.

### A régua: duas, e vale a maior

O desvio é medido contra a **hora anterior à janela**, não contra o alvo do
catálogo — uma máquina que já estava rodando acima do alvo não está desviando,
está onde estava. E o que conta como desvio sai da maior entre duas réguas:

- o `excDev` do catálogo, que é a banda em que o instrumento tremelica;
- o desvio-padrão da própria hora anterior, que é o quanto aquela tag andava
  naquele turno.

Só o `excDev` faria de toda tag agitada uma precursora de tudo. Só a dispersão
da base deixaria uma tag parada demais disparar com um décimo de ruído. A maior
das duas não mente nos dois casos. Sai do normal quem anda **três réguas** — o
mesmo limiar que a colheita de precursores já usava.

Um teste prova que a régua faz diferença: o mesmo passo de 5 `excDev` é desvio
numa base parada e é ruído numa base agitada.

### Origem e consequência

Numa rede de relações quase tudo se mexe quando qualquer coisa se mexe. A lista
ordenada por tempo não basta: a gramatura desviar depois da velocidade é a
velocidade **chegando** na gramatura, não um segundo problema.

Então uma tag que desvia depois de outra da qual ela depende no grafo é marcada
como consequência e sai da disputa pela origem. O grafo é andado para trás
(`upstreamOf`, novo em `process/graph.ts`) — o motor anda para a frente quando
integra, a investigação anda para trás.

O que sobra é uma afirmação pequena e verdadeira: _esta foi a primeira que se
mexeu, e nada do que ela depende tinha se mexido antes_.

Na quebra do instantâneo isso dá exatamente o que se espera: a carga da prensa
cai 51,8 kN/m (25,9× a régua), e 33 s depois a umidade antes da colagem sobe e
a sequidade na saída da prensa cai — as duas marcadas como consequência da
carga, porque é ela que as move no CSV de relações.

### Dez tags, declaradas

A investigação não olha o catálogo inteiro: trezentas séries por quebra é
consulta demais para uma tela, e a maioria não tem relação com a folha
arrebentar. São dez — as quatro malhas que os cenários de quebra perturbam, a
umidade nos três pontos em que é medida, a gramatura, o estiramento entre
seções e a velocidade.

A lista é **fixa e declarada**, e isso é o ponto: ela não pode depender de qual
malha o cenário perturbou, senão o diagnóstico estaria olhando a resposta antes
de fazer a conta. Três testes seguram a lista: todas no catálogo, todas pontos
do historiador (o replay lê do arquivo) e todas com banda de exceção.

### Uma conta, dois chamadores

A colheita de precursores da retomada e a tela de replay passam pela **mesma**
`diagnoseBreak`. Antes havia duas réguas parecidas, uma em cada lado — e duas
réguas parecidas discordam no dia em que importam. Um teste de rota exige que a
ordem dos desvios da resposta seja idêntica à dos precursores gravados na
entidade.

A colheita também parou de receber a malha perturbada como argumento. Ela
recebia, e usava para montar a lista de tags observadas; agora lê as dez e
decide sozinha.

### A rota

`GET /web-breaks/:id/replay`, numa resposta só: a ordem dos desvios, as séries
da janela e os eventos do período (alarmes, alterações de setpoint, trocas de
gramatura). Quem investiga uma parada quer as três coisas ao mesmo tempo, e três
idas ao servidor seriam três esperas.

Ela **não escreve nada** e não inventa nada: é a conta que a retomada já fez,
refeita sobre as séries para a tela poder desenhá-las.

### A tela, e por que ela não está na barra

Porque não se abre "o replay": abre-se o replay **de uma** quebra. Os dois
caminhos até ela são os dois lugares em que uma quebra aparece — a linha do
tempo do Turno, onde o cartão do evento ganhou "Ver o replay", e a lista de
Bobinas, que ganhou os atalhos das quebras do período.

Ela continua tendo URL própria (`#quebra`, que abre a mais recente) e continua
na busca — que é o caminho de teclado para uma tela sem tecla. A barra lateral
segue com nove.

**Esta é uma decisão que vale a tua revisão.** A alternativa era uma décima
entrada na barra, que levaria a um "escolha uma quebra" que o Turno e Bobinas já
fazem melhor. Se preferires a entrada na barra, é uma linha em `screens.ts`.

**Centro:** a janela de −10 min a 0, com cursor e reprodução em 1×, 4× e 16×. A
curva é desenhada **até o cursor** e não além: no instante em que a carga da
prensa cai, a umidade ainda não sabe o que vai acontecer. É o que a reprodução
acrescenta a um gráfico parado — a ordem, vista acontecer.

Três faixas, as três primeiras a desviar, dividindo a altura do painel; clicar
numa variável da lista troca o gráfico pela dela. Ao fundo de cada uma, a faixa
do normal (a média da hora anterior, mais ou menos três réguas) e o tracejado
vermelho onde ela saiu.

**Direita:** a lista na ordem em que saíram do normal, com as consequências
recuadas e o nome de quem as puxou. As que ainda não desviaram no instante do
cursor ficam apagadas — é o que liga a lista à reprodução. Embaixo, as que não
se mexeram, cada uma abrindo a tendência.

**Embaixo:** o mapa 2D da Fase 2, com a seção da quebra em vermelho, o padrão e
as notas abertas da seção. O mapa é o mesmo componente: duas vistas laterais
diferentes na mesma aplicação fariam quem opera reaprender a geometria a cada
tela.

**O padrão** conta coincidências e para aí: "2 das 4 quebras anteriores em
Prensas também começaram por WIC-401". Ele não prevê a próxima, e a comparação
usa a mesma regra de origem sobre os precursores já gravados — sem reler o
arquivo de cada quebra passada.

### O instantâneo não tinha quebra nenhuma

Este foi o achado incômodo da fase. O cenário dá **uma quebra por dia de
operação**, no turno que o ruído por posição escolher, e no dia do instantâneo
ela cai no turno A — enquanto o instantâneo retrata o turno B. Pior: a retomada
tem teto de 4 h, então uma API que acabou de subir também não tem quebra
nenhuma. A tela principal da fase abriria vazia para quase todo mundo.

A correção está na geração do instantâneo: ela roda uma **segunda janela**,
curta, em volta da quebra mais recente anterior ao instante retratado — os 10
min de precursores, a parada e cinco minutos de folga. O arquivo fica com dois
períodos e um buraco entre eles, que é exatamente o que acontece num gêmeo que
ninguém olha o tempo todo, e o que a tendência já sabia desenhar.

A ordem importa e custou uma tentativa: a janela da quebra roda **antes** da
principal. Rodá-la depois fazia um alarme fechar antes de ter sido aberto, e a
restrição da tabela — com razão — recusava.

Custo: +31 kB no instantâneo e um turno a mais na lista.

### O que os testes seguram

- **Perturbação conhecida tem de aparecer em primeiro lugar.** Num teste de
  integração com banco, cenário e retomada de verdade: o turno C de 15/06 tem
  quebra, o cenário perturbou a `WIC-401` dez minutos antes, e ninguém contou
  isso ao diagnóstico — ele lê as séries do arquivo e decide. O mesmo caso roda
  no núcleo para as quatro malhas que os cenários perturbam.
- **Quebra sem perturbação não inventa culpado.** Com todas as tags paradas
  dentro da régua, a resposta é "ninguém se mexeu" — e a tela diz isso em vez de
  eleger o menos inocente. É o teste que impede o primeiro de virar um gerador
  de culpados.
- **Cada seta do caminho existe no grafo**, e a consequência só é consequência
  quando desvia **depois** de quem a move: o teste espelho, com a ordem
  invertida, exige que ela volte a ser origem.
- **A ordem da rota bate com os precursores da entidade.**
- **No navegador:** a URL abre a mais recente; a lista está em ordem de
  antecedência decrescente (lido do texto da tela); reproduzir anda com o cursor
  e pausar para; o mapa marca a seção; de Bobinas se chega ao replay; e a busca
  acha a tela sem tecla.

### Medido

- Testes: `shared` **359**, API **331** (111 pulados sem `DATABASE_URL`), web **202**. Typecheck, lint,
  `format:check` e build.
- e2e: **41** testes.
- Build: pedaço da aplicação **300,4 kB** (era 284,9 — a tela nova), worker e
  `three` inalterados.
- Sem rolagem horizontal em 1920×1080 nem em 1440×900.

### Arquivos, por commit sugerido

**33. O grafo andado para trás**

```
packages/shared/src/process/graph.ts        (novo)
packages/shared/src/process/index.ts
```

**34. O diagnóstico da quebra**

```
packages/shared/src/operations/break-replay.ts        (novo)
packages/shared/src/operations/break-replay.test.ts   (novo)
packages/shared/src/operations/index.ts
```

**35. A rota do replay, e uma régua só na colheita**

```
apps/api/src/runtime/break-replay.ts        (novo)
apps/api/src/runtime/break-replay.test.ts   (novo)
apps/api/src/runtime/entities.ts
apps/api/src/routes/operations.ts
apps/api/src/routes/process-route-schemas.ts
apps/api/src/routes/process-schemas.ts
apps/api/src/routes/process.test.ts
apps/api/src/routes/api.test.ts
apps/api/src/db/operations-queries.ts
apps/api/src/db/operations-store.ts
apps/api/src/db/operations-repository.ts
apps/api/src/db/sql-database.ts
```

**36. Uma quebra no instantâneo**

```
apps/api/src/scripts/generate-demo.ts
```

O instantâneo em si não entra no commit: `apps/web/public/demo/` está no
`.gitignore` e sai de `npm run demo:data`.

**37. A tela do replay**

```
apps/web/src/screens/QuebraScreen.tsx        (novo)
apps/web/src/screens/quebra/Linha.tsx        (novo)
apps/web/src/screens/quebra/Variaveis.tsx    (novo)
apps/web/src/screens/quebra/Local.tsx        (novo)
apps/web/src/screens/quebra/frase.ts         (novo)
apps/web/src/api/process.ts
apps/web/src/api/gateway.ts
apps/web/src/api/demo-gateway.ts
apps/web/src/ui/screens.ts
apps/web/src/ui/Shell.tsx
apps/web/src/ui/search.ts
apps/web/src/ui/help.ts
apps/web/src/App.tsx
```

**38. As portas de entrada, e o mapa marcado**

```
apps/web/src/screens/TurnoScreen.tsx
apps/web/src/screens/turno/Timeline.tsx
apps/web/src/screens/BobinasScreen.tsx
apps/web/src/screens/mancais/MachineMap2D.tsx
```

**39. Testes**

```
apps/web/src/screens/screens.test.tsx
apps/web/src/ui/screens.test.ts
apps/web/src/ui/search.test.ts
apps/web/e2e/quebra.spec.ts                  (novo)
apps/web/e2e/largura.spec.ts
```

**40. Documentação da fase**

```
docs/progress.md
```

Pare aqui. A Fase 6 começa quando o Felipe escrever "fase 6".

## Fase 6 — ciclo fechado de manutenção

### O que fecha o ciclo

O gêmeo já sabia duas coisas separadas: a tendência de vibração de cada mancal
(`rul.ts`, com o critério de significância que a Fase 3 escreveu) e o que é uma
nota de manutenção. Esta fase é a ponte — a regra que, olhando a tendência,
escreve a nota que alguém escreveria à mão, e a deixa esperando um sim ou um
não.

Do sinal até a nota, sem ninguém digitar. O que **não** é automático é a
decisão: confirmar, editar e confirmar, ou dispensar com motivo.

### A sugestão não cabia dentro da nota

O pedido dizia "situação nova na entidade de nota, antes de aberta". A resposta
9 do Felipe, da Fase 0, dizia que a sugestão **só ganha número quando é
confirmada**, com chave própria (mancal + início da tendência), porque sugestão
dispensada não pode gastar sequência.

As duas coisas não cabem na mesma tabela: a chave primária da nota **é** o
número, e `note_evidence` referencia esse número. Uma nota sem número seria uma
linha sem chave.

Então a sugestão virou entidade própria, com a chave que o Felipe fixou. Ela
nasce `sugerida` e morre `confirmada` (virou nota) ou `dispensada` (com motivo).
A nota que sai da confirmação tem origem `tendência` e `originRef` apontando
para a sugestão — o caminho de volta existe, e a restrição que já cobrava
referência de toda origem que não é a operação continua valendo sem mudança.

**Esta é a decisão que vale a tua revisão.** A alternativa seria uma nota com
número desde o nascimento e a situação `sugerida`, o que é mais simples de
escrever e gasta sequência em toda sugestão dispensada — que é o caso comum.

A linha dispensada **fica**, com quem dispensou e por quê: é ela a auditoria,
como a alteração de setpoint é a auditoria da escrita. A diferença é que lá cada
escrita é um evento novo, e aqui cada episódio de degradação é uma linha com uma
decisão.

### De qual série a regra lê, e por que não do arquivo

Da série de vibração dos mancais (`vibration_reading`), **não** do arquivo do
historiador. A diferença não é de gosto, e levou um tempo para aparecer:

O cenário de degradação é ancorado para **terminar agora** — escolha de
apresentação da Fase 3, para quem abre a tela hoje ter o que ver. Cada retomada
grava no historiador valores de mancal consistentes com o seu próprio instante
final, então a série arquivada ganha um **dente a cada retomada**: no passo logo
depois de um corte, o valor volta a ser o de um ponto anterior da degradação.
Uma regressão de três dias sobre essa série leria os dentes em vez da tendência.

A série de vibração é escrita uma vez, não é reescrita, e é a mesma que a tela
de Mancais desenha e que `/assets/:tag/vibration` devolve. A sugestão e o
gráfico ao lado dela contam a mesma história — que é o requisito que decide,
porque os dois aparecem juntos na tela.

### O que mantém 71 mancais fora da fila

Não é o critério de significância: é o **horizonte**.

Duas vezes o erro padrão da inclinação é a convenção de sempre, e sozinha ela
erra por excesso num universo de 72 mancais — cerca de 5 % de falsos por
varredura dá três notas inventadas, e uma fila de trabalho com três notas
inventadas é pior que nenhuma.

O que corta de verdade é exigir que a projeção **cruze o limite dentro de trinta
dias**. Com ruído de 0,02 mm/s numa série de 72 h, a inclinação que levaria um
mancal saudável de 1,4 a 4,5 mm/s em trinta dias é dezenas de vezes maior do que
o ruído produz. Um teste de integração cobra exatamente isso: no instantâneo, o
mancal que degrada ganha sugestão e **os outros 71 não ganham nada**.

Duas projeções entram na disputa — a vibração contra a fronteira C→D e a
temperatura contra o limite do catálogo — e vale a que cruza primeiro. A
temperatura passa pela mesma régua: `temperatureLife` entrega a série ao mesmo
`estimateRemainingLife`, com o limite no lugar da fronteira, em vez de uma
segunda regressão escrita à mão que divergiria da primeira na primeira mudança
de regra.

### A régua da temperatura estava escrita em dois lugares

A tela de Mancais marcava 80 °C de atenção e 90 °C de alarme, escritos à mão em
`derive.ts`. O catálogo diz **85 e 95** — é onde o alarme dispara de verdade. A
barra marcava um número e o alarme tocava em outro, na mesma tela.

Agora os limites saem do catálogo (`BEARING_TEMP_LIMITS`, dos limites `H` e `HH`
da tag `TI-53nn`), e um teste cobra que os 72 mancais tenham os mesmos: no dia em
que um tiver limite próprio, a constante deixa de servir e o teste avisa antes
de a tela mentir.

A correção revelou outro defeito pequeno: com o limite de alarme em 95 e o topo
do eixo em 100, o rótulo `95` caía em cima do `°C` do eixo de temperatura. A
unidade subiu para o vão de 16 px que já existia entre os dois gráficos.

### O alarme não cala a sugestão

Uma sugestão em pé por mancal, e nenhuma enquanto houver **nota de tendência
aberta** para ele: o trabalho já está na fila da manutenção, e sugerir de novo
seria duplicar a ordem de serviço.

Um alarme aberto, não. A sugestão diz o que a tendência projeta; o alarme diz o
que o limite já cruzou. São coisas diferentes, e a própria lista de evidências
do pedido pede o "alarme associado" dentro da sugestão — as duas aparecem juntas
no mancal que degrada, que é o que o instantâneo mostra.

### Por que isto é idempotente

A gravação **substitui** as sugestões em pé: apaga e insere, numa transação. A
sugestão em pé é projeção do arquivo, e o que vale é sempre a última conta. As
decididas não são tocadas — o `do nothing` do `insert` impede que uma conta nova
apague o motivo que alguém escreveu.

Com isso, retomar em quatro pedaços deixa o mesmo banco que retomar de uma vez,
campo por campo, inclusive o id, que sai da chave. Um teste compara as duas
execuções inteiras com uma exceção declarada: o **rótulo** da evidência da
ronda, que carrega a leitura de campo lida do arquivo. A retomada fatiada tem
pontos de borda a mais — o que o teste da própria retomada já documenta — e o
valor muda no primeiro decimal. Tudo o mais é idêntico, porque sai da série de
vibração, que nenhuma retomada reescreve.

### Confirmar: travar, gravar a nota, marcar

Nessa ordem, e as três numa transação. `note_number` aponta para
`maintenance_note`, então marcar antes de gravar a nota violaria a chave
estrangeira; e gravar a nota antes de conferir que a sugestão ainda está em pé
deixaria uma nota órfã quando o segundo clique perdesse a corrida. O `select …
for update` confere e segura a linha até o fim — a mesma ideia de
`ACKNOWLEDGE_ALARM`, que também não deixa dois cliques gravarem duas decisões.

O número da nota sai do **mancal e do início da tendência**, e não do instante
do clique: confirmar é uma decisão sobre um episódio de degradação, e derivar o
número dele mantém a propriedade que o resto do gêmeo tem — reexecutar não cria
um segundo registro do mesmo fato.

### O teste das enumerações mudou de lugar

Já existia um teste que lia o texto de `003_operations.sql` e cobrava que as
listas do SQL e as do `@mp1/shared` fossem iguais. Ele parou de responder a
pergunta no dia em que `006` fez `alter table … add constraint
note_origin_valid` com a origem `tendência`: o arquivo de 003 continua dizendo
três valores, e o banco passou a aceitar quatro. Um teste sobre o texto diria que
o código divergiu do banco quando o que divergiu foi o arquivo que ele lia.

O teste novo pergunta ao **esquema**, depois das migrations, lendo
`pg_get_constraintdef`. Ele cobre catorze restrições, e tem um dente a mais:
nenhuma restrição de lista pode existir no banco sem estar mapeada nele. Uma
coluna nova com `check (x in (…))` e sem lista no `shared` falha, e falha no
lugar certo.

### As telas

**Mancais.** O cartão da nota sugerida, entre o detalhe do mancal e o mapa: a
nota como ela vai nascer — o sintoma gerado dos números, a prioridade, se exige
parada, as evidências — e três saídas. O rodapé diz de quantas janelas a reta
saiu e lembra que um defeito que acelera chega antes dela.

Com o cartão, a coluna da direita passa a **rolar sozinha** em vez de espremer o
mapa 2D: três painéis numa coluna que cabia em dois, e a escolha é a mesma da
tela de Processo — a coluna rola, a moldura fica parada.

**Notas.** Uma quinta coluna, antes de "Aberta", com borda tracejada: é onde a
sugestão está, antes de alguém abrir qualquer coisa. O cartão não decide —
"Decidir no mancal" leva para a tendência que a propôs, que é o que alguém
precisa ver antes de dizer sim.

**Moldura.** O contador na navegação, na entrada de Notas. Ele fica lá, e não na
tela de Notas, porque quem está no Processo também precisa saber que a
manutenção tem uma decisão parada — é isso que faz o ciclo fechar.

**Turno.** A sugestão entra na passagem de turno como pendência, antes das notas
já abertas: uma decisão parada é pendência de quem assume; nota aberta já é
trabalho da manutenção.

A prioridade sai do prazo (3 dias → P1, 10 → P2, 20 → P3, o resto P4) e a
exigência de parada sai da zona: em C ou D a intervenção é troca de mancal, e
trocar o mancal de um cilindro secador pede máquina parada. As duas regras são
suposição nossa, e estão ditas no código como tal.

### O que os testes seguram

- **Uma tendência de verdade vira uma nota, e só uma.** Teste de integração com
  banco, semeadura e retomada: o mancal que degrada ganha sugestão, os outros 71
  não, e a retomada seguinte não cria uma segunda.
- **Ruído sem tendência não gera nada**, e a mesma série com um horizonte maior
  gera — é o horizonte que decide, e o teste mostra isso.
- **Retomada em pedaços dá o mesmo que de uma vez**, campo por campo.
- **Dispensar cala, e calar tem limite.** A sugestão dispensada não volta na
  retomada seguinte; volta quando a medição piora além do degrau, ou quando quem
  cruza o limite passa a ser a outra medição.
- **Confirmar vira nota aberta de origem tendência**, com a edição valendo, e o
  mancal sai da fila de sugestões enquanto a nota estiver aberta. O segundo
  clique leva 409 nas duas decisões; dispensar sem motivo leva 400.
- **As enumerações do SQL e as do `shared` são a mesma lista**, lidas do esquema.
- **No navegador:** o cartão aparece no mancal que degrada sem número e sem
  promessa de falha; o contador aparece na moldura em qualquer tela; a coluna
  das sugeridas leva ao mancal; a passagem de turno lista a decisão parada; e o
  instantâneo diz que não aceita decisão em vez de fingir que aceitou.

### Medido

- Testes: `shared` **380**, API **350** (111 pulados sem `DATABASE_URL`), web
  **207**. Typecheck, lint e `format:check` limpos.
- e2e: **47** testes, 5 novos.
- Build: pedaço da aplicação **312,1 kB** (era 300,4), worker e `three`
  inalterados.
- Instantâneo: 992 arquivos, 2.870 kB, com uma sugestão — a do CS23 lado
  comando, P1, com as três evidências.
- Sem rolagem horizontal em 1920×1080 nem em 1440×900.

**Uma observação honesta sobre o instantâneo:** no instante retratado o CS23 já
está em zona D, então a projeção **já passou** a fronteira e a sugestão nasce P1
com prazo zero. A mesma regra, três dias antes, daria um prazo em dias e uma
prioridade menor — o caminho preditivo existe e é o mesmo código, mas o
instantâneo mostra o caso em que a tendência chegou ao fim. Mudar isso pediria
mover a janela de degradação, que é escolha de apresentação da Fase 3 e sustenta
o alarme e a nota que as outras telas mostram.

### Arquivos, por commit sugerido

**41. A regra que vira sugestão**

```
packages/shared/src/operations/note-suggestion.ts        (novo)
packages/shared/src/operations/note-suggestion.test.ts   (novo)
packages/shared/src/operations/maintenance.ts
packages/shared/src/operations/index.ts
packages/shared/src/process/bearing-tags.ts
packages/shared/src/process/bearing-tags.test.ts
```

**42. A sugestão no banco, na retomada e na API**

```
apps/api/src/db/migrations/006_note_suggestion.sql   (novo)
apps/api/src/db/schema-enums.test.ts                 (novo)
apps/api/src/runtime/suggestions.ts                  (novo)
apps/api/src/runtime/suggestions.test.ts             (novo)
apps/api/src/runtime/catchup.ts
apps/api/src/db/operations-queries.ts
apps/api/src/db/operations-store.ts
apps/api/src/db/operations-repository.ts
apps/api/src/db/sql-database.ts
apps/api/src/db/queries.ts
apps/api/src/db/repository.ts
apps/api/src/db/operations.test.ts
apps/api/src/routes/operations.ts
apps/api/src/routes/process-route-schemas.ts
apps/api/src/routes/process-schemas.ts
apps/api/src/routes/api.test.ts
apps/api/src/scripts/generate-demo.ts
```

O instantâneo em si não entra: `apps/web/public/demo/` está no `.gitignore` e
sai de `npm run demo:data`.

**43. O cartão no mancal, e a temperatura pelo catálogo**

```
apps/web/src/screens/mancais/Sugestao.tsx    (novo)
apps/web/src/screens/mancais/BearingDetail.tsx
apps/web/src/screens/mancais/derive.ts
apps/web/src/screens/MancaisScreen.tsx
apps/web/src/api/process.ts
apps/web/src/api/gateway.ts
apps/web/src/api/demo-gateway.ts
apps/web/src/ui/help.ts
apps/web/src/App.tsx
```

**44. O contador, a coluna e a pendência**

```
apps/web/src/ui/Shell.tsx
apps/web/src/ui/useFrame.ts
apps/web/src/screens/NotasScreen.tsx
apps/web/src/screens/TurnoScreen.tsx
apps/web/src/screens/turno/Support.tsx
apps/web/src/screens/screens.test.tsx
apps/web/e2e/manutencao.spec.ts              (novo)
apps/web/e2e/mancais.spec.ts
```

**45. Documentação da fase**

```
docs/progress.md
```

Pare aqui. A Fase 7 é a que depende da tua confirmação — o custo estimado está
na seção "Fase 7 — quanto custa", mais acima.

## Conserto: o CI quebrado por um teste que lia artefato gerado

### O que quebrou, e por quê

`process.test.ts` lia `apps/web/public/demo/sim-state.json` para provar que o
estado do motor serve de ponto de partida ao modo de demonstração. A pasta está
no `.gitignore` — ela é **gerada** por `npm run demo:data` — e no CI os testes
rodam **antes** do build que a geraria. Na minha máquina o arquivo estava lá de
uma geração anterior, e por isso o teste passava aqui e falhava lá.

É o tipo de erro que só aparece em máquina limpa, e a lição é a regra que o
Felipe escreveu: teste não depende de artefato gerado.

### O que ele passou a fazer

O estado agora é montado **no próprio teste**, pelo mesmo caminho do gerador: a
retomada roda, grava, e `findSimState` devolve o mesmo objeto que
`generate-demo` serializa. O teste passa esse objeto por `JSON.parse(
JSON.stringify(...))` na mão.

Nada se perde na troca. O que o arquivo acrescentava era exatamente a ida e
volta pelo JSON — e é isso que o teste faz agora, com uma asserção a mais que o
arquivo não dava: o estado tem de voltar **igual**. Um `Map`, um `Set` ou um
`Infinity` que entrasse no estado do motor quebraria o modo de demonstração em
silêncio, e agora quebra aqui.

Verificado do jeito que importa: com `sim-state.json` escondido, as três suítes
passam inteiras (350 / 207 / 380).

**Nenhum outro teste lia a pasta gerada.** Os que leem arquivo leem
**fonte versionada** — as migrations (`003`, `004`), os catálogos gerados e o
CSV da pesquisa —, que é outra coisa: ali o arquivo é a verdade que o teste
confere. Os testes de ponta a ponta também não leem: o `webServer` do Playwright
roda `build:test`, que começa por `demo:data`.

### O gerador agora falha alto

`generate-demo.ts` gravava o estado dentro de um `if (simState?.state)`. Sem
estado, ele terminava **em silêncio** e publicava um instantâneo sem
`sim-state.json` — o "e se" do modo de demonstração partiria da rede em regime,
que é um lugar que não é onde a máquina está. Agora é erro.

### O Pages já gerava o instantâneo — e agora está dito

O passo de build do Pages chama `npm run build --workspace @mp1/web`, e o script
da web é `npm run demo:data && vite build`. O instantâneo é gerado na
publicação, não commitado.

Estava certo e **implícito**: quem trocasse aquele passo por um `vite build`
direto publicaria o site sem o modo de demonstração, que é como quase todo mundo
o vê. O comentário no workflow agora diz isso.

### As actions que pediam Node 20

O runner avisa — e um dia recusa — toda action que ainda roda em Node 20. Subiram
as quatro que avisavam, para a major que roda em Node 24:

| action                          | antes | agora |
| ------------------------------- | ----- | ----- |
| `actions/upload-artifact`       | v4    | v7    |
| `actions/configure-pages`       | v5    | v6    |
| `actions/upload-pages-artifact` | v4    | v5    |
| `actions/deploy-pages`          | v4    | v5    |

`checkout@v5` e `setup-node@v5` **ficaram onde estão**: as duas já rodam em Node
24, e subir major sem necessidade é pedir uma mudança de comportamento de
graça. As entradas que o projeto usa de `upload-artifact` (`name`, `path`,
`retention-days`, `if-no-files-found`) existem iguais na v7, e a v5 do
`upload-pages-artifact` é composta sobre a v7 do `upload-artifact` — ou seja, a
cadeia inteira do Pages passa a rodar em 24.

### Arquivos, por commit sugerido

**46. O CI: teste sem artefato gerado, e as actions em Node 24**

```
apps/api/src/routes/process.test.ts
apps/api/src/scripts/generate-demo.ts
.github/workflows/ci.yml
.github/workflows/pages.yml
docs/progress.md
```

## O segundo mancal: o caso que separa prever de reagir

### Por que ele existe

Na entrega da Fase 6 ficou dito que o instantâneo mostrava só metade do que a
fase sabe fazer: o CS23 do lado comando chega ao fim da curva **agora**, então a
nota sugerida dele nasce com prazo zero e prioridade 1 — a mesma coisa que o
alarme já dizia. O caminho preditivo existia no código e não aparecia na tela.

Agora o cenário tem **dois** mancais em pontos diferentes da própria curva:

|                        | CS23 lado comando       | CS36 lado comando            |
| ---------------------- | ----------------------- | ---------------------------- |
| vibração agora         | 5,72 mm/s, zona D       | 2,49 mm/s, zona B            |
| alarme                 | `VI-5123B` H (vibração) | `VE-5136B` H (envelope)      |
| nota aberta por alarme | sim                     | não                          |
| nota sugerida          | P1, parada, "já passou" | P3, sem parada, "em 13 dias" |

O segundo é o caso que a manutenção preditiva existe para pegar: pela medida
que a norma usa para julgar severidade ele está **normal**, ninguém abriu nota
nenhuma, e a única coisa que sabe que ele está indo embora é a reta de três
dias.

### O envelope viu primeiro, e isso não foi programado

O que já passou do limite nele é o **envelope de aceleração**, não a velocidade.
Isso não foi arranjado para a tela: é o modelo de mancal da Fase 3 funcionando
como foi escrito — o envelope tem expoente menor que a velocidade, justamente
porque pega impacto de rolamento semanas antes de o RMS sair da faixa. É por
isso que se mede envelope.

O alarme que acompanha a sugestão dele é o do envelope, e o teste olha **qual**
alarme é, em vez de exigir que não haja nenhum. Como a prioridade do alarme de
envelope é média, ele não abre nota automática — o mancal fica mesmo só com a
sugestão.

### Uma declaração só para os dois

As janelas de degradação saíram de `catchup.ts` e viraram `DEGRADATION_PLANS`
em `simulation/bearings.ts`, com `degradationScenariosAt(now)` ao lado. A
semeadura da série e a retomada passaram a ler a **mesma** declaração: antes, a
janela era montada em dois lugares (o `simulateVibration` inventava a sua a
partir do recorte pedido), e com dois mancais isso daria duas histórias do
mesmo mancal.

`simulateVibration` deixou de inventar cenário: ele agora recebe as janelas. É o
que permite a do segundo mancal **começar antes e terminar depois** do recorte
que está sendo gravado — 26 dias de janela para 72 h de série.

### Os números do segundo, e por que estes

Catorze dias percorridos e doze pela frente. Com a progressão `^2,2` do modelo,
isso põe o mancal em 2,49 mm/s — acima do ruído dos saudáveis (~1,9) e abaixo do
limite de alarme de vibração (2,8) — e dá uma inclinação de 0,15 mm/s por dia,
que a reta de 72 h projeta cruzar a fronteira C→D em **13 dias**: um prazo que
cabe numa parada de manutenção, que é exatamente o que a prioridade 3 quer
dizer.

Um teste segura a parte que importa dessa escolha: se um dia ele passar de 2,8
no instante de referência, o alarme de vibração toca e o caso preditivo some do
gêmeo.

### Medido

- Testes: `shared` **380**, API **352** (111 pulados), web **207**.
- e2e: **48** testes — um novo, que escolhe o segundo mancal e exige prazo em
  dias e ausência de "PARADA" no cartão.
- Instantâneo: 2.871 kB, com **duas** sugestões; o contador da moldura mostra 2.
- Sem rolagem horizontal em 1920×1080 nem em 1440×900.

### Arquivos, por commit sugerido

**47. O segundo mancal, no meio da curva**

```
apps/api/src/simulation/bearings.ts
apps/api/src/simulation/vibration.ts
apps/api/src/db/seed.ts
apps/api/src/runtime/catchup.ts
apps/api/src/runtime/catchup.test.ts
apps/api/src/runtime/suggestions.test.ts
apps/api/src/simulation/bearings.test.ts
apps/api/src/simulation/vibration.test.ts
apps/web/e2e/manutencao.spec.ts
docs/progress.md
```

## Fase 7 — sensor virtual de qualidade

### O buraco que ela preenche

O laboratório mede a tração MD numa amostra por bobina, e o laudo demora. Entre
um resultado e o próximo — quarenta e cinco minutos de bobina mais vinte e cinco
de bancada — a pergunta "o papel que está saindo agora está dentro?" não tinha
resposta no gêmeo.

Duas coisas tiveram de existir para ela ter: o **ensaio como evento**, com os
dois instantes que o definem, e a **estimativa** que preenche o intervalo entre
eles.

### O ensaio virou entidade

Até aqui o laboratório era dado fixo no front: dezenove ensaios plausíveis com o
selo de ilustrativo. Um deles — a tração MD, `LAB-1206` — passou a ser evento:
tabela, chave derivada (`LR-<bobina>-<tag>`), colheita na retomada e rota.

Os dois instantes são o ponto. `sampledAt` é quando a amostra foi cortada (o fim
da bobina) e `reportedAt` é quando o laudo ficou pronto, 25 min depois. Sem os
dois gravados, o sensor virtual não teria como saber onde está o buraco que ele
preenche — nem a tela teria como mostrar o laudo chegando.

**De onde sai o valor:** da _verdade_ do motor no instante da amostra, mais a
repetibilidade da bancada. Três escolhas, cada uma com razão:

- **Um instante, não uma janela.** O corpo de prova é um pedaço de papel
  cortado quando a bobina fecha; ele não é a média de 45 min de produção. É
  também o que faz a colheita dar o mesmo resultado reexecutada em pedaços — o
  instante da amostra é o mesmo nos dois caminhos.
- **A verdade, não a medida.** O ruído do `snapshot()` é do instrumento de
  campo; o laboratório tem o ruído dele, que é outro.
- **Com repetibilidade própria** (0,08 kN/m, ~1,5 % do alvo): dois corpos de
  prova da mesma bobina não dão o mesmo número, e é essa diferença que o sensor
  virtual nunca vai prever.

### A regressão não servia, e o motivo é do processo

A ideia óbvia era ajustar tração contra as variáveis de processo dos últimos
laudos. Ela não serve aqui: **a energia de refino é malha**, fica no setpoint, e
uma variável que não varia não sustenta regressão nenhuma. O ajuste daria uma
inclinação inventada em cima de ruído.

O que existe é melhor. O ganho da relação 9 (`JIC-101 → LAB-1206`, 0,0425 kN/m
por kWh/t) foi **medido num teste de degrau** e está declarado no CSV de
relações — a mesma fonte que o motor integra. O sensor usa esse ganho em regime:

```
estimativa = ponto de operação + Σ kp × (entrada − ponto de operação dela) + viés
```

O modelo é montado **do grafo**, não escrito à mão: `softSensorModel(tag)` lê as
relações que terminam no ensaio. Um ensaio sem relação declarada não tem modelo,
e a rota devolve 404 — sem teste de degrau não há ganho, e sem ganho não há
estimativa, que é diferente de estimar o alvo.

### E o laboratório corrige o que o modelo não sabe

Um modelo de regime erra por motivos conhecidos: a planta tem dinâmica (270 s de
tempo morto e τ de 450 s na relação 9), o ensaio tem repetibilidade, e a folha
tem o que ninguém mediu. A correção vem do próprio laboratório:

- o **viés** é a média dos resíduos (laudo − modelo) dos últimos oito laudos;
- a **faixa** é duas vezes o desvio padrão amostral desses resíduos.

Com menos de três laudos **não há faixa**, e a tela diz isso em vez de inventar
uma incerteza. O desvio é amostral (divide por n − 1) de propósito: com três
laudos a faixa fica 22 % maior que a do populacional, e ela fica maior justamente
quando há menos medida para sustentá-la.

O resíduo é contra o modelo **daquela bobina**, com a entrada lida no instante
da amostra — não contra o alvo. Se fosse contra o alvo, o viés passaria a
corrigir o que o modelo já explicava, e um turno inteiro de refino alto viraria
"erro do sensor".

### O pulo quando o laudo chega

Cada ponto da série é estimado com os laudos que **já tinham chegado até ele**.
É isso que faz a curva ter um degrau no instante em que um laudo entra. Desenhar
a série inteira com o viés final apagaria exatamente a coisa que a tela existe
para mostrar — e ainda faria o passado parecer mais certo do que foi.

O degrau é o sensor sendo corrigido, não um defeito do desenho, e o teste cobra
que ele tenha **o tamanho da mudança de viés, nem mais nem menos**.

### A série não é desenhada nas colunas do arquivo

Primeira versão: um ponto por coluna do historiador. Deu **quatro pontos em
quatro horas** — e está certo, porque uma malha em regime produz quatro colunas:
o filtro de exceção não arquiva o que não mudou.

Mas o degrau do viés não acontece quando a entrada muda; ele acontece quando um
laudo chega, num instante em que o arquivo não tem coluna nenhuma. Então a série
é desenhada numa **grade fixa**, segurando o último valor arquivado de cada
entrada — que é exatamente o que o historiador promete: enquanto não há coluna
nova, o valor não saiu da banda de exceção.

### Um ensaio deixou de ser ilustrativo, e a tela diz qual

A matriz de Bobinas × ensaios passou a mostrar os laudos de verdade na coluna da
tração MD, com o selo trocado: `LAB-1206 medido` ao lado do `ilustrativo` dos
outros dezoito. Duas versões do mesmo ensaio na mesma tela seriam a pior forma
de meia-verdade.

A tela também **abre** nesse ensaio. Antes ela abria no ensaio da bobina retida,
que é o que alguém viria olhar; a retenção sai de dado ilustrativo, e deixar o
dado fixo decidir o que a tela mostra na frente do único ensaio medido seria pôr
a demonstração à frente da medida. Quando o Cobb₆₀ também for medido, a retida
volta a ganhar a vez.

No lugar da carta de controle, quando o ensaio escolhido é a tração MD, entra o
painel do sensor: a faixa da especificação ao fundo, a linha da estimativa com a
área de incerteza, os laudos como pontos no instante da amostra e o tracejado
vertical em que cada um ficou pronto.

### O que os testes seguram

- **O modelo é o ganho medido**, e um ensaio sem relação não tem modelo.
- **Sem laudo não há viés nem faixa**; com dois há viés e ainda não há faixa;
  com três a faixa aparece e sai do espalhamento dos resíduos.
- **Só os últimos oito laudos contam** — quatro laudos de outro patamar saem da
  conta.
- **O resíduo é contra o modelo daquela bobina:** a bobina que rodou com 10
  kWh/t a mais e veio com 0,425 kN/m a mais tem resíduo **zero**.
- **O salto é a diferença de viés**, e a faixa abre quando os laudos passam a
  discordar entre si.
- **A estimativa acerta o laudo dentro da faixa que ela declara** — num teste de
  integração com banco, semeadura e retomada. Se não caísse, a faixa estaria
  mentindo sobre a incerteza, que é pior do que não ter estimativa.
- **Um laudo que ainda não ficou pronto não entra na conta**, e mesmo assim há
  estimativa: é para esse buraco que ela existe.
- **No navegador:** o Laboratório abre no sensor, com número, faixa e veredito
  contra a especificação; a matriz diz qual coluna é medida e qual é
  ilustrativa; escolher outro ensaio troca o sensor pela carta de controle.

### Medido

- Testes: `shared` **393**, API **363** (111 pulados sem `DATABASE_URL`), web
  **210**. Typecheck, lint e `format:check` limpos.
- e2e: **51** testes, 3 novos.
- Build: pedaço da aplicação **317,5 kB** (era 312,1), worker e `three`
  inalterados.
- Instantâneo: 994 arquivos, 2.889 kB, com 5 laudos e a série do sensor.
- Sem rolagem horizontal em 1920×1080 nem em 1440×900.

**O que esta fase não fez:** os outros dezoito ensaios continuam ilustrativos.
Dar evento a todos é repetir o que está aqui dezoito vezes — barato de copiar e
caro de inventar, porque só três têm relação declarada na pesquisa. Os outros
quinze precisariam de um teste de degrau que ninguém fez, e um ganho inventado
daria um sensor que parece funcionar.

### Arquivos, por commit sugerido

**48. O ensaio como entidade, e a regra do sensor**

```
packages/shared/src/operations/lab-result.ts        (novo)
packages/shared/src/quality/soft-sensor.ts          (novo)
packages/shared/src/quality/soft-sensor.test.ts     (novo)
packages/shared/src/operations/index.ts
packages/shared/src/index.ts
```

**49. O laudo no banco e na colheita**

```
apps/api/src/db/migrations/007_lab_result.sql   (novo)
apps/api/src/runtime/lab.ts                     (novo)
apps/api/src/runtime/entities.ts
apps/api/src/runtime/catchup.ts
apps/api/src/db/operations-queries.ts
apps/api/src/db/operations-store.ts
apps/api/src/db/operations-repository.ts
apps/api/src/db/sql-database.ts
```

**50. A rota do sensor virtual**

```
apps/api/src/runtime/soft-sensor.ts        (novo)
apps/api/src/runtime/soft-sensor.test.ts   (novo)
apps/api/src/routes/process.ts
apps/api/src/routes/operations.ts
apps/api/src/routes/process-route-schemas.ts
apps/api/src/routes/process-schemas.ts
apps/api/src/routes/api.test.ts
apps/api/src/scripts/generate-demo.ts
```

**51. O painel no Laboratório**

```
apps/web/src/screens/laboratorio/SensorVirtual.tsx   (novo)
apps/web/src/screens/LaboratorioScreen.tsx
apps/web/src/api/process.ts
apps/web/src/api/gateway.ts
apps/web/src/api/demo-gateway.ts
apps/web/src/ui/help.ts
apps/web/src/screens/screens.test.tsx
apps/web/e2e/qualidade.spec.ts                       (novo)
```

**52. Documentação da fase**

```
docs/progress.md
```

As sete fases estão feitas. O fechamento que o pedido original prevê —
regenerar o instantâneo, rodar a suíte inteira e comparar com a base da Fase 0,
atualizar `docs/notas-para-readme.md` e deixar o checklist de deploy — começa
quando o Felipe disser.

## Fechamento das sete fases

### Conserto que veio antes: o teste da busca no CI

O `busca.spec.ts` quebrava no CI em `getByText('PIC-514').first()`. A causa não
era a janela do CI — o teste troca a janela para 1920 por conta própria, e a
falha acontece nas duas larguras. Eram **duas** coisas:

1. **A correção nunca tinha sido commitada.** Ela saiu junto com o ajuste do
   cabeçalho da Tendência, ficou na árvore de trabalho e não entrou em nenhuma
   lista por commit sugerido — o CI rodava a versão antiga.
2. **O cabeçalho tem uma régua invisível** com uma cópia de cada chip, para
   medir o que cabe na linha. Ela vem antes no DOM, então `.first()` pega a
   cópia escondida e `toBeVisible()` falha. A régua já era `aria-hidden` e
   `inert` desde o ajuste do cabeçalho — e isso **não** resolve sozinho:
   `getByText` não olha a árvore de acessibilidade. O que resolve é procurar o
   chip **por papel** (`getByRole('button', { name: 'Tirar PIC-514 …' })`), que
   respeita o `aria-hidden`.

O teste agora prova as duas coisas: o **gráfico** da TAG (que é o que a busca
promete) e o **chip** dela, na linha ou atrás do "+N". Roda em duas larguras —
1920 e 1280 × 720, que é o padrão do `Desktop Chrome` do Playwright, onde cabe
um chip só. Medido: a TAG escolhida entra no começo da lista, então ela fica
sempre na linha; o caminho do "+N" está lá por garantia, e o comentário diz
isso em vez de fingir que ele é exercitado.

De quebra, o `tendencia.spec.ts` deixou de ser instável. O preparo dele tira
TAGs uma a uma, e cada remoção faz a régua medir de novo e o cabeçalho inteiro
se redesenhar — o botão que o Playwright tinha resolvido sumia no meio da
checagem de estabilidade, e o teste ficava preso em "element was detached,
retrying" até os 90 s acabarem. O clique de **preparo** passou a ser despachado,
com a volta esperando o chip sumir: o arquivo caiu de um timeout de 90 s para
15 s no total.

### O instantâneo

Regerado com tudo que entrou: **994 arquivos, 2.889 kB**. Ele leva agora o
estado do motor (para o "e se" rodar no navegador), o replay de cada quebra, as
duas notas sugeridas, os cinco laudos de laboratório e a série do sensor
virtual.

### Medição, contra a base da Fase 0

**Como foi medido.** O mesmo método da base: build de produção servido por
`vite preview`, aberto no navegador embutido, janela de 1920 × 1080 com
`devicePixelRatio` 1,25, cache quente, **API local no ar** (fonte ao vivo, não o
instantâneo), `?perf=1` publicando `window.__twinPerf`, e uma navegação
completa antes de cada medida.

**Uma diferença de condição, e ela importa:** desta vez o navegador embutido
entregou **WebGL2**, não WebGPU como na base. Geometria, chamadas de desenho e
fps são comparáveis; o custo de quadro não é, e por isso os tempos de cena
abaixo são leitura de regressão, não de ganho.

| medida                    | base (Fase 0) |       agora | o que mudou                             |
| ------------------------- | ------------: | ----------: | --------------------------------------- |
| **Máquina** · pintura     |         68 ms |      104 ms | backend diferente                       |
| `three` baixado           |        161 ms |       98 ms | —                                       |
| `mp1.glb`                 |        536 ms |      636 ms | —                                       |
| último lightmap           |        547 ms |      647 ms | —                                       |
| canvas                    |   1989 × 1093 |       igual | —                                       |
| fps estável               |            60 |          60 | travado na sincronia nos dois           |
| chamadas de desenho       |           300 |         294 | vapor desligado por padrão              |
| triângulos                |       277.511 |     277.367 | idem                                    |
| requisições               |            26 |          28 | —                                       |
| **Mancais** · baixa three |   sim, 2,3 MB |     **não** | mapa 2D por padrão (Fase 2)             |
| bytes                     |      2.354 kB |  **681 kB** | −71 %                                   |
| memória de GPU            |      201,1 MB |       **0** | não há canvas até pedir o 3D            |
| requisições               |  107 (85 API) | 95 (87 API) | a cena saiu; `/note-suggestions` entrou |
| **Processo** · pintura    |         80 ms |       80 ms | —                                       |
| requisições               |   44 (37 API) | 48 (40 API) | —                                       |

**Pedaços do build** (bruto):

| arquivo              | base (Fase 0) |      agora |
| -------------------- | ------------: | ---------: |
| `three-*.js`         |      1.673 kB |   1.673 kB |
| `index-*.js`         |        220 kB | **317 kB** |
| `index-*.css`        |         39 kB |      42 kB |
| `whatif-worker-*.js` |             — |      75 kB |

Os 97 kB a mais do pedaço da aplicação são seis telas novas ou refeitas
(Simulação, replay de quebra, mapa 2D, cartão da nota sugerida, coluna das
sugeridas, sensor virtual) e o cliente das rotas que elas usam. O `three` não
se mexeu, e o Worker do "e se" é pedaço separado — ele só é baixado quando
alguém simula sem API.

**Testes:** de 417 passando em 23 arquivos para **966 em 53**, mais **52** de
ponta a ponta (eram só os da cena).

**O que a medição não cobre:** não repeti a comparação com e sem vapor (a
decisão da Fase 2 não mudou), nem medi memória de GPU na tela Máquina — o
navegador embutido não expôs WebGPU nesta sessão, e o número da base veio de
lá.

### Checklist de deploy

Nada abaixo foi executado. A ordem importa: **Neon antes do Render**, porque o
Render aplica as migrations ao subir.

#### Antes

- [ ] Rodar a suíte inteira e o e2e na ponta que vai subir (966 + 52).
- [ ] `npm run build` limpo, e conferir que `apps/api/dist/migrations/` saiu com
      **sete** arquivos `.sql`. O `copy-migrations.mjs` falha se a pasta vier
      vazia, mas não confere a contagem — e um `dist` velho em cache faria a API
      subir com esquema antigo.
- [ ] Ler o resumo das migrations novas abaixo e decidir sobre o item do
      `vibration_reading` (é o único que apaga dado).

#### Neon — por causa da 006 e da 007

As duas são **aditivas**: criam tabela nova e não apagam nada. Mesmo assim:

- [ ] **Backup antes.** No Neon, o jeito barato é criar uma _branch_ do banco de
      produção (cópia instantânea, só paga o que divergir). Se algo der errado,
      a branch tem o esquema anterior com os dados.
- [ ] **Conferir em que branch a `DATABASE_URL` do Render aponta.** Se houver
      mais de uma branch (produção e desenvolvimento), a migration roda **só**
      na que a API usa; a outra fica para trás e quebra quando alguém apontar
      para ela.
- [ ] **A 006 toca uma tabela que já tem dados.** Ela faz
      `alter table maintenance_note drop constraint note_origin_valid` e recria
      com quatro valores em vez de três. A lista nova é um superconjunto da
      antiga, então a validação passa; o `alter` pega um lock exclusivo por
      alguns milissegundos numa tabela com dezenas de linhas. Não há o que
      preparar — isto é para saber o que esperar se o log mostrar o lock.
- [ ] **A 007 cria `lab_result` com chave estrangeira para `jumbo_reel`.** Ela
      nasce vazia; os laudos aparecem conforme a retomada fecha bobinas novas.
      Não há histórico para trás, e não deve haver: o laudo é um evento, e os
      eventos de antes do deploy não aconteceram no gêmeo.
- [ ] **Espaço:** as duas tabelas novas somam poucas dezenas de kB. Quem come os
      0,5 GB continua sendo o `historian_archive`, e a poda dele não mudou.
- [ ] **Se o banco estiver suspenso** (autosuspend do Neon), o primeiro acesso
      acorda o compute e a migration espera por isso. O boot do Render pode
      levar alguns segundos a mais nessa primeira vez.

#### Render

- [ ] **Não há passo de migration separado.** `server.ts` chama `db.migrate()`
      antes de `listen`: o deploy aplica a 006 e a 007 e só então começa a
      atender. Se a migration falhar, o processo morre no boot e o Render marca
      o deploy como falho — que é o comportamento certo.
- [ ] **Conferir no log do deploy** as duas linhas de migration aplicada
      (`006_note_suggestion`, `007_lab_result`). Elas ficam registradas em
      `schema_migration`; um segundo deploy não as aplica de novo.
- [ ] **Uma instância por vez.** Se o Render subir a nova antes de derrubar a
      antiga, duas migrações concorrentes podem colidir no `add constraint` da
      006 e derrubar o boot novo. Não confirmei qual é o comportamento do plano
      em uso — se ele for de sobreposição, suspender o serviço durante o deploy
      resolve, e a correção definitiva é um lock de aviso em volta do laço de
      migrations.
- [ ] **O segundo mancal não aparece sozinho.** A semeadura roda a cada boot,
      mas ela **pula** a série de vibração se `vibration_reading` já tiver
      linhas — e tem, desde o primeiro deploy. Sem fazer nada, produção continua
      com um mancal degradando (o CS23) e sem o CS36. Para ter os dois:
      `truncate table vibration_reading;` no Neon **antes** do deploy, e a
      semeadura do próximo boot gera a série dos dois, ancorada no instante do
      boot. É o único passo que apaga dado — e o que ele apaga é série simulada,
      que se regenera.
- [ ] **Depois de subir**, conferir nesta ordem:
      `GET /health` (driver `postgres`), `GET /note-suggestions` (deve listar as
      sugestões em pé), `GET /lab-results` (vazio logo após o deploy, com laudos
      depois da primeira bobina fechada) e
      `GET /process/quality/LAB-1206` (200 com `points`; a faixa só aparece com
      três laudos).
- [ ] **Rollback:** não há migration de volta. Voltar o código para uma versão
      anterior é seguro — ela ignora as tabelas novas —, mas voltar o **banco**
      exige a branch do Neon criada no primeiro item.

#### Pages

- [ ] O build do Pages gera o instantâneo (`npm run build -w @mp1/web` é
      `demo:data && vite build`): nada a fazer, mas é o que não pode ser
      "otimizado" para um `vite build` direto.
- [ ] Conferir `VITE_API_URL` nas variáveis do repositório. Sem ela, a web cai
      no padrão e o modo de demonstração continua funcionando — o que esconde o
      erro.

### Arquivos, por commit sugerido

**53. O teste da busca, por papel e nas duas larguras**

```
apps/web/e2e/busca.spec.ts
apps/web/e2e/tendencia.spec.ts
```

O `busca.spec.ts` leva a correção que tinha ficado para trás na árvore de
trabalho, mais a conferência do chip por papel e a segunda largura. O
`tendencia.spec.ts` entra junto porque a instabilidade dele tem a mesma causa:
o cabeçalho se redesenha a cada TAG tirada.

**54. Fechamento das sete fases**

```
docs/progress.md
docs/notas-para-readme.md
```

As notas para o README ganharam a seção 16 — o que mudou na tela da Fase 2 à
Fase 7 — e tiveram quatro números corrigidos: a tabela de migrations (que
parava na 004), a contagem de testes, o nome do arquivo do checklist e, o mais
importante, a afirmação de que as migrations ficavam atrás de um
`RUN_MIGRATIONS`. Essa variável não existe no código: elas rodam no boot,
sempre.

---

As sete fases estão fechadas.

---

## Revisão de 1142 px (fechamento)

Uma revisão da interface rodando a 1142 px apontou dez erros de lógica e uma
lista de atropelos de layout. O relato completo — o que cada defeito era de
verdade e as decisões que ficaram — está em `docs/revisao-1280.md`.

**53. A lógica**

```
apps/api/src/routes/stream.ts                       (CORS no SSE + sseHeaders)
apps/api/src/routes/stream.test.ts                  (novo)
apps/api/src/runtime/entities.ts                    (sintoma em pt-BR, zona ISO)
apps/api/src/db/operations-queries.ts               (nota aberta de qualquer origem)
apps/api/src/db/operations-store.ts
apps/api/src/db/operations-repository.ts
apps/api/src/db/sql-database.ts
apps/api/src/runtime/suggestions.ts
packages/shared/src/number.ts                       (novo)
packages/shared/src/index.ts
packages/shared/src/operations/note-suggestion.ts
packages/shared/src/operations/grade-change.ts      (gsmTolerance, gradeInForceAt)
packages/shared/src/simulation/process-engine.ts    (calculada sem ruído próprio)
apps/web/src/api/inflight.ts                        (novo)
apps/web/src/api/client.ts
apps/web/src/api/process.ts
apps/web/src/ui/useStream.ts                        (novo)
apps/web/src/ui/useFrame.ts
apps/web/src/ui/DataSourcePill.tsx
apps/web/src/ui/format.ts                           (signOf e os signed*)
apps/web/src/App.tsx
apps/web/src/screens/turno/derive.ts                (coveredFrom, timeEfficiencyPct)
apps/web/src/screens/turno/Support.tsx
apps/web/src/screens/TurnoScreen.tsx
apps/web/src/screens/BobinasScreen.tsx              (tolerância pela gramatura)
apps/web/src/screens/rondas/derive.ts
apps/web/src/screens/simulacao/Curvas.tsx
apps/web/src/screens/simulacao/Efeitos.tsx
```

**54. A moldura e os componentes de `ui/`**

```
apps/web/src/index.css                              (--breakpoint-piso, --breakpoint-largo)
apps/web/src/ui/Shell.tsx                           (barra superior + faixa abaixo de 1280)
apps/web/src/ui/Panel.tsx                           (o aside encolhe; o título não)
apps/web/src/ui/SectionBlock.tsx                    (uma TAG e "+N")
apps/web/src/ui/InstrumentRow.tsx                   (grade estreita até `largo`)
```

**55. As telas**

```
apps/web/src/screens/ProcessoScreen.tsx
apps/web/src/screens/processo/TrendStack.tsx        (passo do eixo pela largura)
apps/web/src/screens/LaboratorioScreen.tsx
apps/web/src/screens/BobinasScreen.tsx
apps/web/src/screens/MancaisScreen.tsx
apps/web/src/screens/mancais/Sugestao.tsx
apps/web/src/screens/NotasScreen.tsx                (kanban empilha abaixo de `largo`)
apps/web/src/screens/RondasScreen.tsx
apps/web/src/screens/turno/Timeline.tsx             (lanes devolve null)
```

**56. Os testes**

```
apps/web/e2e/largura.spec.ts                        (4 larguras × 9 telas × 3 perguntas)
apps/web/e2e/capturas.spec.ts                       (novo)
apps/web/playwright.config.ts
apps/web/playwright.capturas.config.ts              (novo)
apps/web/package.json
apps/api/src/runtime/suggestions.test.ts
apps/api/src/runtime/entities.test.ts
apps/web/src/ui/format.test.ts
apps/web/src/ui/components.test.tsx
apps/web/src/api/client.test.ts
apps/web/src/screens/derive.test.ts
packages/shared/src/simulation/process-engine.test.ts
packages/shared/src/operations/grade-change.test.ts (novo)
.gitignore
```

**57. Documentação**

```
docs/revisao-1280.md                                (novo)
docs/progress.md
README.md
```

Fica em aberto, para ser decidido à parte: o aviso de `THREE.Clock` depreciado
vem do `@react-three/fiber` 9.8.2 (`dist/events-*.js`, `clock: new THREE.Clock()`),
não do nosso código. Trocar por `THREE.Timer` é subir a dependência que desenha
a cena inteira.

## Layout novo e simulador repaginado — Fase 0 (levantamento)

O levantamento inteiro está em [docs/fase-0-levantamento.md](fase-0-levantamento.md).
Aqui ficam as conclusões e as decisões que travam a Fase 1.

### O que o levantamento achou

1. **O protótipo está copiado** em `reference/design/papertwin-layout-v2.html`,
   sem alteração: 1.175 linhas, arquivo único, com `simulate()` e quatro tabelas
   (16 entradas, 12 saídas, 23 relações FOPDT, 2 malhas, 8 cenários). Ele é
   **fiel ao repositório onde o repositório tem número** — as 22 relações
   compartilhadas batem dígito a dígito com `relacoes-fopdt.csv`, e as 3 bandas
   de especificação que o catálogo tem (`AIC-902` 73,5/76,5, `AIC-903` 4,3/5,3,
   `AIC-905` 98/106) batem exatas.
2. **Não há motor para portar.** O "e se" já é TypeScript puro em
   `packages/shared/src/simulation/` — FOPDT, PI com SIMC e anti-windup, rede
   com seis cascatas, dt = 1 s — e já roda no navegador sem API, num Web Worker
   (`apps/web/src/api/whatif-worker.ts`) sobre o estado gravado em
   `demo/sim-state.json`. Faltam cinco coisas pequenas: horizonte de 60 min (o
   teto é 30), gravação a cada 5 s, degrau **agendado** (hoje tudo entra em
   t = 0), modo objetivo e o fixar-B.
3. **O modo de demonstração já é completo.** Um arquivo por rota, gerado no
   build por `apps/api/src/scripts/generate-demo.ts`, incluindo a tendência de
   toda TAG do catálogo e o estado do motor. Conferi rota por rota: não falta
   arquivo para nenhuma tela. Os únicos buracos são de escrita (setpoint e
   reconhecimento de alarme), e são intencionais.
4. **O "Carregando…" não é falta de dado.** Sai de três pontos de código:
   `enabled: false` devolvendo `phase: loading` para sempre em
   `ui/useResource.ts`; o `if (controller.signal.aborted) return` que não
   escreve nem dado nem erro quando a busca volta depois do desmonte; e a
   corrida em `api/inflight.ts` (`coalesce`), em que o abortar de um interessado
   mata o pedido dos outros — de onde sai, literalmente, o
   "signal is aborted without reason".
5. **Nenhuma TAG falta; 13 números faltam.** As 28 TAGs do protótipo existem (25
   no catálogo, 3 em `process/lab.ts`, 2 são setpoints de malha). O que o
   repositório não tem são 4 bases de entrada, 3 faixas de entrada e 6 bandas de
   especificação de saída — e três dessas bases o protótipo não marca como
   estimadas, o que a regra 5 proíbe.

Medido: **27** lugares com rolagem própria dentro de telas (`overflow-y-auto` /
`overflow-auto`), que é a lista de trabalho da Fase 1 e o alvo do e2e de rolagem
aninhada. E **9** seções no protótipo contra **10** áreas no catálogo: o
protótipo funde `caixa`+`formação` e `qcs`+`pope`, e inventa `lab` e `acion`.

### As decisões, tomadas em 27/11/2026

| # | decisão |
|---|---|
| 5.1 | 27 relações; a zonada `ZIC-205` fica só no motor, a tela não mostra perfil CD |
| 5.2 | catálogo nas seis entradas; nenhuma faixa estimada |
| 5.3 | catálogo, saída por saída: `AIC-904` 19–23, `AI-907` `L` = 89, `AI-407` base 51, `LAB-1206R` base do `lab.ts`; para `AIC-901`, `AI-407`, `LAB-1206` e `LAB-1212` a banda é `fonte` só se a pesquisa B trouxer o número, senão `assumed` |
| 5.4 | SIMC, a sintonia que já está em `pi.ts` |
| 5.5 | seis cascatas |
| 5.6 | coluna `kind` no CSV |
| 5.7 | quebra contextual dentro da casca nova |
| 5.9 | só `AIC-104` como perturbação |
| §2 | fundir `caixa`+`formação` e `qcs`+`pope` só no mapa do Simulador |

A relação `AIC-901 → AIC-903` (K = 0,35, θ = 25 s, τ = 30 s, `estimado`) está
confirmada como necessária: nenhuma das 26 do CSV liga as duas, e sem ela o vapor
do G4 não chega à umidade final.

**O que 5.5 arrasta para a Fase 7.** Com seis cascatas, `PIC-514` e `WIC-801`
viram MV de cascata e ficam travados em automático — e são as entradas dos
cenários 5 e 6. Então cada cenário passa a carregar o próprio modo de malha; os
cenários 5 e 6 abrem em manual, com a linha "em automático a cascata seguraria a
umidade / a espessura"; e entram dois cenários novos em automático, SP de
`AIC-901` e SP de `AIC-905`. **Total: 10 cenários.**

### Arquivos, por commit sugerido

**1. O protótipo como referência**

```
reference/design/papertwin-layout-v2.html           (novo, cópia sem alteração)
```

**2. O levantamento**

```
docs/fase-0-levantamento.md                         (novo)
docs/progress.md
```

Nenhum código de tela foi escrito e nenhum arquivo do app foi tocado: typecheck,
lint, testes, build, e2e e capturas não têm o que exercer nesta fase.
