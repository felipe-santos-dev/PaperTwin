# Notas para o README — material bruto

Fatos, números, comandos e arquitetura, para o Felipe escrever o README e o
documento de decisões. **Não é texto final**: é matéria-prima, com a razão de
cada escolha ao lado do número, para o texto poder ser escrito sem reabrir o
código.

Estado: fases 4.0 a 4.4 concluídas. Os números abaixo foram **medidos** no
repositório na branch `dev/fases-4-7`, não estimados — o script que os produz
está descrito na seção "Como refazer estes números".

---

## 1. O que o projeto é, em uma frase e em três

**Uma frase.** Gêmeo digital de uma máquina de papel: cena 3D navegável da MP1
sobre um modelo declarativo, com simulação de processo determinística,
historiador estilo PI e monitoramento de vibração pela ISO 20816-3.

**Três.** O modelo da máquina é código: tags, seções, posições e classes de
norma saem de um arquivo TypeScript, e dele são gerados a cena 3D e a tabela do
banco — uma tag só existe se existir no modelo. O processo é simulado a partir
de relações causa-efeito de primeira ordem com tempo morto, tiradas de uma
pesquisa sobre operação de máquina de papel, e cada número carrega de onde veio.
Em cima disso há o que uma planta de verdade tem e um gráfico de tendência não
mostra: turno, bobina jumbo, quebra de folha, ronda, nota de manutenção,
auditoria de setpoint e alarme ISA-18.2.

---

## 2. Arquitetura

### Monorepo

| Pacote            | Papel                                            | Código | Teste |
| ----------------- | ------------------------------------------------ | -----: | ----: |
| `packages/shared` | Modelo, catálogo, entidades, historiador, normas |  5.530 | 2.085 |
| `apps/api`        | Fastify, repositório, migrations, simulação      |  4.194 | 2.162 |
| `apps/web`        | React + R3F, cena 3D, painéis                    |  3.574 |   684 |

(linhas de `.ts`/`.tsx` em `src/`, teste contado à parte)

### Dependências diretas de produção

- **`packages/shared`**: nenhuma. É o que permite a web importar o modelo da
  máquina sem arrastar nada do servidor para o bundle.
- **`apps/api`**: `fastify`, `@fastify/cors`, `@fastify/swagger`,
  `@fastify/swagger-ui`, `postgres` (postgres.js), `@electric-sql/pglite`, `zod`.
- **`apps/web`**: `react`, `react-dom`, `three`, `@react-three/fiber`,
  `@react-three/drei`, `@react-three/postprocessing`, `postprocessing`.

### A direção das dependências

```
          packages/shared  (modelo, catálogo, entidades, normas)
            ▲                           ▲
            │                           │
        apps/api  ──── HTTP / SSE ───► apps/web
     (Fastify, Postgres)            (React, R3F)
```

`shared` não importa nada dos dois lados. Dentro dele, a direção é
`process → machine` e nunca o contrário: o catálogo de variáveis pergunta ao
modelo da máquina quantos cilindros existem, e o modelo não sabe que o catálogo
existe. Foi essa regra que obrigou a dividir os grupos de vapor em dois módulos
(§5.3).

### Um repositório, dois drivers

O que varia entre o PGlite (desenvolvimento, teste, geração do instantâneo de
demonstração) e o postgres.js (produção) são **três operações**, em
`apps/api/src/db/executor.ts`: consulta com parâmetros, SQL solto para as
migrations, transação. Em cima delas há um repositório só.

A razão vale no README: a suíte de banco roda contra os dois drivers, mas no
dia a dia só o PGlite roda (o Postgres fica pulado sem `DATABASE_URL`). Com duas
classes de repositório, um erro escrito só do lado do Postgres não apareceria em
teste nenhum — apareceria em produção. Hoje são ~40 métodos; duas listas de 40
métodos iguais divergem.

---

## 3. Números do modelo da máquina

| O quê                                       | Quanto |
| ------------------------------------------- | -----: |
| Seções do processo                          |     10 |
| Ativos no modelo                            |    134 |
| — mancais                                   |     86 |
| — cilindros secadores                       |     36 |
| — rolos                                     |      6 |
| — nips                                      |      3 |
| — scanners                                  |      2 |
| — tambor da enroladeira                     |      1 |
| Ativos com medição (ISO)                    |     86 |
| Largura útil da folha                       |    8 m |
| Medidas/arranjos registrados como suposição |     27 |

Ordem do processo, confirmada em campo: caixa de entrada → formação → prensas →
pré-secagem → **scanner 1** → **Speed Sizer** → pós-secagem → calandra →
**scanner final (QCS)** → enroladeira Pope.

Padrão de tag: `MP1-<SEÇÃO>-[<GRUPO>-]<ATIVO>[-M<LADO>]`. Exemplo:
`MP1-SEC-G4-CS23-MLA` — mancal do lado acionamento do cilindro secador 23, no
grupo de vapor 4 da secagem.

---

## 4. Números do processo

### Catálogo de variáveis

| O quê                                   | Quanto |
| --------------------------------------- | -----: |
| Variáveis no catálogo                   |    320 |
| — tags próprias (uma linha cada no CSV) |     68 |
| — expandidas de padrão por cilindro     |    252 |
| Malhas de controle (têm setpoint)       |     55 |
| Áreas do processo                       |     14 |
| Pendentes de conferência na MP1         |    183 |
| Ensaios de laboratório (lista própria)  |     13 |

As 252 vêm de 7 padrões por cilindro (vibração LA/LC, envelope LA/LC,
temperatura de mancal LA/LC, temperatura de superfície) vezes os 36 cilindros.
**A expansão é feita sobre os cilindros que o modelo declara**, não sobre um 36
escrito à mão: se o nº de pares mudar, o catálogo acompanha e as duas listas de
tags não podem divergir.

Os 183 pendentes são `fonte = assumed` **ou** `confiança = baixa`. As duas
perguntas são diferentes e as duas importam: uma variável de fonte `B` com
confiança baixa é pendência tanto quanto uma inventada.

### Relações causa-efeito

| O quê                       |      Quanto |
| --------------------------- | ----------: |
| Relações                    |          24 |
| — lidas do CSV              |          23 |
| — herdadas de observação    |           1 |
| — zona a zona (controle CD) |           1 |
| Saídas distintas            |          12 |
| Tempo morto                 |   6 a 270 s |
| Constante de tempo τ        | 4,5 a 450 s |

A relação herdada é a `5d` (`PIC-712 → AIC-903`): a pesquisa mede o degrau na
`PIC-711` e deixa na observação "aplicar também a PIC-712". Sem herdar
explicitamente, mexer no vapor do G6 não mudaria a umidade final. Fonte
rebaixada para `assumed`, porque o degrau não foi medido ali.

### Controle CD

140 zonas em 8 m de folha → **57,1 mm por zona**. Com o σ de 45 mm do
espalhamento lateral, o alcance é ±2 zonas e o efeito cobre 5. O nº de zonas é
suposição: o catálogo diz "vetor de 120–160 zonas", uma faixa e não um número.

### Grupos de vapor

| Grupo | Seção       | Cilindros | Pressão   | ΔP sifões  | Nível do tanque |
| ----- | ----------- | --------- | --------- | ---------- | --------------- |
| G1    | pré-secagem | 1–6       | `PIC-511` | `PDIC-521` | `LIC-531`       |
| G2    | pré-secagem | 7–12      | `PIC-512` | `PDIC-522` | `LIC-532`       |
| G3    | pré-secagem | 13–18     | `PIC-513` | `PDIC-523` | `LIC-533`       |
| G4    | pré-secagem | 19–26     | `PIC-514` | `PDIC-524` | `LIC-534`       |
| G5    | pós-secagem | 27–32     | `PIC-711` | `PDIC-721` | — (`null`)      |
| G6    | pós-secagem | 33–36     | `PIC-712` | `PDIC-722` | — (`null`)      |

G5 e G6 ficam sem tag de nível de propósito. A pesquisa dá os quatro tanques da
pré-secagem e nenhum da pós, embora dê o ΔP dos sifões dos dois. **O tanque
existe na máquina; a medição não está no catálogo.** Inventar `LIC-731` daria ao
simulador um número que ninguém mediu, com a mesma cara dos outros quatro.

---

## 5. Decisões que valem no texto

### 5.1 Proveniência: três vocabulários, não um

| Onde                       | Vocabulário                     | Pergunta que responde                |
| -------------------------- | ------------------------------- | ------------------------------------ |
| `machine/provenance.ts`    | `validated` / `assumed`         | A medida foi conferida contra a MP1? |
| `process/types.ts`         | `B` / `ISO 20816-3` / `assumed` | Em qual documento o número foi lido? |
| `operations/provenance.ts` | `B` / `ISA-18.2` / `assumed`    | De onde veio o campo da entidade?    |

Um valor da pesquisa B **não** é um valor conferido na máquina, e juntar os dois
num campo só faria a distinção desaparecer com o tempo. O terceiro vocabulário
existe porque o alarme tira os estados da lista base e a taxa de inundação de
uma norma que o catálogo de variáveis nunca cita — lá a norma que aparece é a
ISO 20816-3, de vibração.

O mesmo princípio dentro de uma entidade: o grupo de vapor carrega **duas**
proveniências, `division` (`assumed`) e `tagMap` (`B`). Num campo só, o mapa de
tags — que a pesquisa mediu — herdaria o chute da divisão.

### 5.2 Discretização exata, não Euler

O integrador de primeira ordem usa a solução fechada com entrada constante entre
amostras: `a = exp(−dt/τ)` e `y ← a·y + (1−a)·kp·u`. É **exato** nos instantes
de amostragem e estável para qualquer passo, porque `a` fica sempre em (0, 1).

O Euler (`y ← y + (dt/τ)(kp·u − y)`) divergiria com `dt > 2τ`, e o catálogo tem
τ de 4,5 s na calandra: um passo de 10 s já explodiria. Não é preciosismo
acadêmico — é o passo de simulação que o host gratuito permite.

### 5.3 Invariantes verificadas na carga, não só em teste

Os grupos de vapor cobram duas coisas ao importar o módulo:

1. **cobertura contígua** de 1 ao último cilindro, sem furo e sem sobreposição —
   um cilindro sem grupo não teria tag nenhuma, já que a tag é montada a partir
   do grupo, e duas faixas sobrepostas dariam tags iguais;
2. **grupo contido numa seção** — um grupo é uma válvula de vapor, e a válvula
   fica na pré (`PIC-51x`) ou na pós (`PIC-71x`).

São erros de edição do modelo, não de entrada do usuário, e um modelo incoerente
não deve chegar a subir um servidor.

### 5.4 Kernel do controle CD normalizado pelo pico

O `kp` da relação 11 é a resposta **medida na própria zona**. Normalizar o
kernel gaussiano pela soma espalharia esses −0,8 g/m² entre a zona e as
vizinhas, e a zona corrigida responderia menos do que a pesquisa mediu. Com pico
1, a zona recebe `kp` cheio e as vizinhas a fração — e o efeito total sobre a
folha é maior que `kp`, que é o que acontece de verdade.

### 5.5 Nulo é informação

Um padrão que se repete e vale uma frase no README: o projeto distingue "não
sei" de "é zero".

- Bobina na Pope: peso, comprimento e médias são `null`, não 0 — a tela precisa
  saber que o dado ainda não existe.
- Tanque de condensado do G5/G6: `null` com nota, não uma tag inventada.
- Temperatura de campo da ronda: `null` quando não mediram; uma ronda sem
  medição não contradiz nem confirma o instrumento.
- Selo de fonte de dados: "Sem dados" em cinza não é uma quarta severidade.

### 5.6 O que a ronda é, e por que ela existe num gêmeo digital

Um mancal com 2,1 mm/s no sistema e ruído anormal na ronda é um caso diferente
de um mancal com 2,1 mm/s e ronda limpa, **e a diferença não está em nenhuma
tag**. A ronda é onde o gêmeo admite que o instrumento não cobre tudo.

O valor online é **guardado** junto com o de campo, não recalculado na hora de
mostrar: o historiador devolveria o mesmo número, já que a simulação é
determinística, mas o par "o que o campo dizia / o que a tela dizia" é um
registro daquele instante — se a regra de agregação mudar, o registro não pode
mudar com ela.

### 5.7 Auditoria é append-only

A alteração de setpoint grava com `on conflict do nothing`. Reenviar a mesma
alteração não reescreve o registro, porque um histórico de auditoria que aceita
ser editado não é auditoria. O valor anterior é lido pelo servidor, não enviado
por quem escreve — quem escreve não tem como saber se alguém mexeu entre a
leitura da tela e o clique.

A faixa aceita é a `min`–`max` do catálogo, que é a **faixa de operação normal**
e não a faixa física da malha. Um gêmeo que aceita 400 kPa no grupo principal,
onde o catálogo para em 350, deixa de simular a MP1.

### 5.8 Evidência de nota é referência, não arquivo

O gêmeo não guarda foto nem anexo — não teria onde, nos 0,5 GB do banco
gratuito — e um anexo que não abre seria pior que nenhum. A evidência aponta
para o que o gêmeo já tem: uma janela de tendência, um alarme, um ponto de
ronda, uma medição. Clicar leva ao registro, que é o que alguém faria com a foto
de todo jeito.

---

## 6. Historiador estilo PI

### Os números

| O quê                                     |     Valor |
| ----------------------------------------- | --------: |
| Pontos arquivados                         |       320 |
| Custo estimado por linha do arquivo       |     ~88 B |
| Orçamento reservado ao arquivo            |    300 MB |
| Linhas que cabem no orçamento             | 3.409.090 |
| Retenção do arquivo                       |    7 dias |
| Linhas por ponto por dia que isso permite |     1.521 |
| Intervalo médio equivalente               |     ~57 s |
| Teto de tempo entre valores arquivados    |       1 h |
| Teto de tempo no filtro de exceção        |    10 min |
| Retenção do bruto                         |    15 min |
| Linhas de bruto por minuto (1 s × 320)    |    19.200 |

### A cadeia

```
  simulação ──► filtro de exceção ──► porta oscilante ──► arquivo
  1 amostra/s     "é novidade?"      "cabe numa reta?"
                  compara com o      compara com a reta
                  último enviado     desde o arquivado
```

Os dois estágios respondem perguntas diferentes, e é por isso que são dois. Um
filtro de exceção sozinho não comprime rampa nenhuma: num sinal que sobe
devagar, toda amostra é novidade. Uma porta oscilante sozinha gasta
processamento comparando retas para um sinal parado.

### Dois detalhes que costumam estar errados

**O degrau.** Quando o valor é novidade, o filtro manda a amostra **anterior**
junto com a nova. Um sinal em 100 por dez minutos que salta para 140 em um
segundo: sem a anterior, o arquivo teria o 100 de dez minutos atrás e o 140 de
agora, e a interpolação desenharia uma subida de dez minutos que não aconteceu.
No teto de tempo o filtro **não** manda a anterior — ali não houve degrau para
preservar.

**O que `compDev` garante.** O corredor garante que _existe_ uma reta dentro
dele que passa a menos de `compDev` de cada amostra descartada. A reta que o
gráfico desenha é outra — a corda entre dois valores arquivados — e as duas
podem divergir: **o erro da corda chega a 2 · `compDev`**. Pela mesma razão, a
porta fecha uma amostra depois da mudança, então o vértice de um canto é
arquivado um passo adiante de onde aconteceu. Os dois são propriedades do
algoritmo, não deste código, e estão cobertas por teste.

### Por que o arquivo guarda `point_id` e não a tag

São 320 pontos. A tag em texto custa ~12 bytes por linha na tabela e outros
tantos na entrada do índice, e o arquivo é a maior tabela do banco — num banco
de 0,5 GB isso é cerca de **um quarto do espaço disponível**. É a mesma razão
pela qual o PI tem PointID.

O id é o índice da variável no catálogo, **não uma sequência do banco**: com
sequência, a ordem de semeadura decidiria os ids, e o instantâneo do modo de
demonstração — gerado numa máquina, servido de outra — apontaria para os pontos
errados.

As colunas de bruto e arquivo são declaradas `ts, value, point_id, reason`. Na
ordem natural de leitura, o alinhamento de 8 bytes do `timestamptz` depois de um
`smallint` custaria 6 bytes de enchimento por linha: 13 % da maior tabela do
banco, sem guardar nada. Há teste cobrando a ordem, porque uma arrumação
bem-intencionada do SQL a desfaria sem ninguém notar.

### Por que o bruto é um buffer de minutos

**Um PI de verdade não guarda valor bruto.** O filtro de exceção roda na coleta,
junto do processo, e o que ele descarta não existe em lugar nenhum depois. A
tabela existe aqui para que se possa _ver_ o que o filtro jogou fora — é
material de demonstração, não de operação. A 1 s, os 320 pontos geram 19.200
linhas por minuto: uma semana de bruto sozinha passaria de 100 GB.

### O orçamento é orçamento, não previsão

A taxa real de arquivamento depende do ruído da simulação contra o `compDev` de
cada tag, e só se sabe medindo — `historianUsage()` devolve as linhas por
tabela. Se a taxa medida ficar acima de uma linha a cada ~57 s por ponto, o
botão é `ARCHIVE_RETENTION_DAYS`, **e não o `compDev`**, que vem da lista base.

### A poda não roda em laço de fundo

O host gratuito dorme sem tráfego, e um laço que depende do processo estar vivo
não poda nada. Quem chama `pruneHistorian()` é o arranque e a gravação — quando
o banco está sendo mexido de todo jeito.

---

## 7. Alarmes (ISA-18.2)

| O quê                 | Valor                                 |
| --------------------- | ------------------------------------- |
| Estados               | ativo / reconhecido / normalizado     |
| Prioridades           | baixa / média / alta / crítica        |
| Inundação (ISA-18.2)  | > 10 alarmes em 10 min                |
| Banda morta           | 1 % da faixa de operação, só na volta |
| Teto do engavetamento | um turno (8 h)                        |

**O engavetamento é campo, não quarto estado.** Um alarme pode ser engavetado
enquanto está ativo, e quando a gaveta vence tem de voltar ao estado em que
estava. Com o engavetamento como estado, esse estado anterior se perderia e o
alarme voltaria pedindo reconhecimento de algo já reconhecido.

**A banda morta só atua na volta.** O alarme dispara no limite exato e normaliza
1 % depois dele, para dentro da faixa. Simétrica, ela atrasaria o disparo — e um
alarme que chega tarde é pior que um alarme que insiste.

**Um alarme normalizado e não reconhecido continua na lista.** Ele aconteceu,
voltou sozinho e ninguém ficou sabendo — que é justamente o caso que a ISA-18.2
quer que apareça. Essa regra está escrita duas vezes, em SQL (para a lista vir
filtrada do banco) e em TypeScript (para a tela decidir sem ir ao banco), com um
teste comparando as duas.

---

## 8. Banco de dados

### Migrations

| Arquivo               | O que faz                                               |
| --------------------- | ------------------------------------------------------- |
| `001_initial.sql`     | `asset`, `vibration_reading` (+ BRIN por tempo)         |
| `002_steam_group.sql` | `asset.drive_group` → `asset.steam_group`               |
| `003_operations.sql`  | 12 tabelas das 8 entidades de operação                  |
| `004_historian.sql`   | `historian_point`, `historian_raw`, `historian_archive` |

Postgres puro: nada depende do TimescaleDB, para o mesmo SQL rodar no PGlite
embutido e num Postgres gerenciado.

A 002 **renomeia** em vez de corrigir a 001, porque a 001 já consta na
`schema_migration` de quem subiu o Postgres do docker-compose — uma edição lá
não rodaria de novo, e a coluna sumiria para esse banco.

### Padrões do esquema

- **Listas são tabela filha**, não `text[]` nem `jsonb`. Em array dependeriam de
  o driver serializar igual nos dois lados; em `jsonb` perderiam a chave
  estrangeira — um ponto de ronda aponta para um ativo, e isso é integridade que
  o banco sabe cobrar.
- **As consultas das filhas usam marcadores montados** (`in ($1, $2, …)`), e não
  um parâmetro de array: `= any($1)` sem anotação de tipo é exatamente o caso em
  que a inferência do PGlite falha. Nenhum dado entra na string — o que varia no
  texto é só o número de `$n`.
- **O que o tipo garante, a restrição repete.** As regras de consistência existem
  em TypeScript para a interface avisar antes de enviar, e no banco para ele não
  aceitar o que passar por fora delas. Os valores das enumerações ficam
  duplicados nos `check`, e um teste lê a migration e cobra que as duas listas
  sejam a mesma.
- **Nenhuma lista é aberta**: teto padrão de 100 linhas, teto absoluto de 1.000.
  O absoluto existe porque o limite vem da rota, e uma rota com `?limit=100000` é
  a mesma rota sem teto.
- **BRIN por tempo** nas séries. A chave primária começa pelo ativo/ponto e
  atende a consulta por janela de um deles; a varredura "o que aconteceu às
  14h07 em toda a máquina" é outra, e o BRIN cabe porque a tabela é escrita em
  ordem de tempo — cada faixa de páginas guarda só o mínimo e o máximo.

---

## 9. Testes

| Workspace         | Arquivos | Passando | Pulados |
| ----------------- | -------: | -------: | ------: |
| `packages/shared` |       10 |      203 |       0 |
| `apps/api`        |        7 |      168 |      97 |
| `apps/web`        |        6 |       46 |       0 |
| **Total**         |   **23** |  **417** |  **97** |

Mais `apps/web/e2e/scene.spec.ts`, de ponta a ponta no Playwright.

Os 97 pulados são a mesma suíte de banco rodando contra um **Postgres de
verdade**: ela só executa com `DATABASE_URL` definido, e fica pulada em vez de
falhar — o teste não pode exigir um banco que a máquina não tem. Rodar com
Postgres apaga as tabelas do banco apontado; é para banco de teste.

### Testes que valem menção no README

- **A mesma suíte contra dois drivers.** É o que garante que o SQL é mesmo o
  mesmo.
- **O catálogo contra o CSV.** O teste lê `catalogo-base.csv` e exige que o
  gerado bata, linha por linha. Um número editado no TypeScript quebra o teste.
- **A lista de laboratório contra a pesquisa.** O teste lê a coluna de TAG da
  §12.2 da pesquisa B e exige que as duas listas coincidam.
- **As enumerações do SQL contra as do TypeScript.** O teste lê a migration e
  compara com as constantes.
- **A ordem das colunas do historiador.** O teste lê a migration e cobra
  `ts, value, point_id`, porque a razão da ordem é alinhamento e não estética.
- **Cobertura da proveniência.** O teste compara os exports de `geometry.ts` com
  o registro de proveniência: uma constante nova sem origem quebra o teste, em
  vez de passar despercebida. Também cobra o número (29), porque os dois testes
  anteriores continuariam passando de mãos vazias se metade do arquivo
  desaparecesse.
- **Reconstrução dentro de 2 · `compDev`.** Sobre um sinal com ruído e
  curvatura, ponto a ponto.
- **Rollback por inteiro.** `replaceAssets` apaga antes de inserir; sem
  transação, uma lista com um ativo inválido no meio deixaria o banco com menos
  ativos do que tinha.

---

## 10. Comandos

```bash
npm install                     # instala o monorepo (npm workspaces)
npm run dev                     # API e web juntas
npm run dev:api                 # só a API
npm run dev:web                 # só a web
npm test                        # vitest em todos os workspaces
npm run typecheck               # tsc em todos
npm run lint                    # eslint
npm run format:check            # prettier, só verificação
npm run build                   # build de todos
npm run db:up                   # Postgres do docker-compose
npm run db:down
npm run generate -w @mp1/shared # regenera catálogo e relações a partir dos CSVs
```

Rodar a suíte de banco contra um Postgres de verdade:

```bash
DATABASE_URL=postgres://... npm test --workspace @mp1/api
```

---

## 11. Deploy — o que o desenho assume

Nada aqui foi executado; o passo a passo fica em `docs/deploy-checklist.md`.

| Serviço      | Plano | O que a restrição obrigou                          |
| ------------ | ----- | -------------------------------------------------- |
| Render       | Free  | 512 MB de RAM; dorme sem tráfego                   |
| Neon         | Free  | ~0,5 GB; é o que desenha a retenção do historiador |
| GitHub Pages | —     | front estático, com modo de demonstração           |

- **A API dorme.** A web sonda a API com prazo de 4 s e cai para o instantâneo
  de demonstração se ela não responder. Para quem chama, uma API que demora
  demais é indistinguível de uma que não responde.
- **A troca de volta não é automática.** Quando a API acorda, a faixa _oferece_
  carregar dados ao vivo e só o clique troca a fonte. Números mudando debaixo de
  quem está lendo é pior do que números velhos e rotulados.
- **A simulação não depende de processo rodando 24 h.** Ela é determinística a
  partir de (semente, tempo), e recalcula o intervalo que faltou quando a API
  acorda. Um laço de fundo num host que dorme não simula nada.
- **Migrations não rodam sozinhas no boot em produção**: ficam atrás de
  `RUN_MIGRATIONS`, falso por padrão.
- **O instantâneo de demonstração é a API de verdade.** No build, a própria API
  sobe contra o PGlite e as respostas dela viram arquivos em `public/demo`,
  espelhando as rotas. Uma reimplementação da agregação em TypeScript divergiria
  na primeira mudança de regra.

---

## 12. Suposições, para a seção de pendências

Tudo abaixo está marcado no código e repetido em `docs/progress.md`.

**Geometria e arranjo da máquina** (27 itens em `machine/provenance.ts`, de onde
sai a lista do README automaticamente):

- nº de pares de cilindros: 13 na pré-secagem, 5 na pós;
- divisão G1–G6 e os seus limites — o único ponto fixo é o CS23 estar no G4,
  porque a tag `MP1-SEC-G4-CS23-MLA` aparece no conceito de tela;
- calandra com um nip, rolo térmico em cima;
- todas as posições em X, tiradas do protótipo;
- dois mancais por corpo girante.

**Processo:**

- 140 zonas de controle CD (o catálogo dá a faixa 120–160);
- relação `5d` (`PIC-712 → AIC-903`), herdada de uma observação;
- vapor dos grupos G2 e G3, temperatura de mancal, envelope e temperatura de
  superfície — marcados `assumed` já no CSV.

**Operação:**

- quadro de turnos: três de 8 h a partir das 06:00, letras A, B, C; fuso fixo
  em −03:00;
- significado dos quatro níveis de prioridade de nota;
- as quatro situações da nota;
- escalas de ruído e vazamento da ronda, três níveis cada;
- nomes das quatro prioridades de alarme, banda morta de 1 % e teto de um turno
  para o engavetamento.

**Historiador:**

- teto de 1 h entre valores arquivados (o `CompMax` do PI usa 8 h; com 8 h um
  turno estável teria um ponto só no arquivo);
- teto de 10 min no filtro de exceção;
- retenção de 7 dias no arquivo e 15 min no bruto;
- custo de ~88 bytes por linha arquivada, de onde sai o orçamento.

---

## 13. Como refazer estes números

Os números das seções 3, 4, 6 e 9 saem do próprio código, e não de contagem à
mão:

- **modelo, catálogo, relações, grupos, historiador**: importar de `@mp1/shared`
  e imprimir — `allAssets(MP1).length`, `PROCESS_CATALOG.length`,
  `PROCESS_RELATIONS.length`, `STEAM_GROUPS`, `HISTORIAN_POINT_COUNT`,
  `ARCHIVE_ROW_BUDGET`, `ARCHIVE_ROWS_PER_POINT_PER_DAY`, `assumptions().length`;
- **linhas de código**: `.ts`/`.tsx` em `src/`, teste contado à parte;
- **testes**: a saída de `npm test`.

Se algum número do README divergir do código, o código está certo.

---

## 14. Avisos que o README precisa ter

- **As tags são fictícias.** Seguem o padrão ISA-5.1 e a numeração por área, mas
  nenhuma corresponde a um instrumento real de uma planta.
- **As leituras são simuladas.** Nenhum dado aqui vem de uma máquina de verdade.
- **O mapa de rolos e as fotos da planta não entram no repositório.** É material
  interno; `reference/private/` está no `.gitignore`.
- **O que está conferido em campo é pouco e está marcado.** Diâmetro e passo dos
  cilindros, alturas das fileiras, a linha do papel entre as secagens, os rolos
  do Speed Sizer e a ordem das seções. Todo o resto é protótipo.
