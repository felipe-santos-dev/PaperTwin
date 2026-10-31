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
- [ ] **4.5** `docs/notas-para-readme.md`
- [ ] **5** Motor de simulação e API
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
- `lab.ts` — os 12 ensaios da §12.2 da pesquisa B, escritos à mão (as células
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
12. **`reference/research/` e `papertwin-telas.html` entraram no repositório.**
    Eram arquivos não versionados no teu checkout. O conteúdo é byte a byte o
    mesmo; se o `git merge` na main reclamar de "untracked working tree files
    would be overwritten", apaga as cópias locais antes do merge — elas passam a
    vir do repositório.

## Próximo passo exato

Fase 4.5: `docs/notas-para-readme.md` — material bruto para o Felipe escrever o
README. Fatos, números, comandos e arquitetura: o que cada pacote contém, as
contas do historiador, o nº de testes por workspace, as migrations, a lista de
suposições e os comandos de desenvolvimento. Não é texto final (regra 6).
