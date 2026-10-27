# mp1-twin

Gêmeo digital da máquina de papel **MP1**: uma cena 3D navegável da máquina, gerada a
partir de um modelo declarativo, onde cada ativo é clicável e abre o seu estado de
vibração classificado pela **ISO 20816**.

## Estrutura

Monorepo com npm workspaces:

| Pacote            | O que é                                                            |
| ----------------- | ------------------------------------------------------------------ |
| `apps/web`        | React 19 + Vite + TypeScript + React Three Fiber/drei + Tailwind 4 |
| `apps/api`        | Fastify + TypeScript + postgres.js                                 |
| `packages/shared` | Tipos e regras de domínio usados pelos dois lados                  |

## Começando

```bash
npm install
npm run dev
```

Sobe a API em `http://127.0.0.1:3333` e a web em `http://127.0.0.1:5173`.
Copie `.env.example` para `.env` para mudar portas ou apontar um banco.

| Script              | O que faz                         |
| ------------------- | --------------------------------- |
| `npm run dev`       | API e web juntas, em watch        |
| `npm test`          | Vitest nos três pacotes           |
| `npm run lint`      | ESLint no monorepo                |
| `npm run typecheck` | `tsc` em cada pacote              |
| `npm run build`     | Build de produção da web e da API |

## Dados

Postgres puro, **sem dependência do TimescaleDB**:

- **Dev e testes**: PGlite embutido, sem Docker.
- **Prod e demo**: Postgres gerenciado, via `DATABASE_URL`.
- Camada de repositório em `apps/api` com **uma interface e duas implementações**,
  para trocar de driver sem tocar nas rotas. São duas porque o `postgres.js` não
  conecta no PGlite — e expor o PGlite via socket só para manter um driver único
  acrescentaria um processo a mais sem ganho. A mesma suíte roda contra as duas,
  com a de Postgres pulada quando não há `DATABASE_URL`, o que garante que o SQL
  é o mesmo dos dois lados.

  ```
  apps/api/src/db/
    repository.ts            interfaces AssetRepository e VibrationRepository
    pglite-repository.ts     dev e testes
    postgres-repository.ts   prod e demo
    migrations/              SQL versionado, roda nas duas
  ```

- Migrations SQL versionadas.
- `vibration_reading(asset_tag, ts, rms_mm_s, temp_c, envelope_ge)`, PK `(asset_tag, ts)`,
  índice BRIN em `ts`, agregação com `date_bin()`.
- A tabela `asset` é semeada a partir de `packages/shared/src/machine/mp1.ts` — o modelo
  é a fonte da verdade das tags.

O `docker-compose.yml` sobe um Postgres local com TimescaleDB, mas é **opcional**: o
schema não usa nada que seja exclusivo da extensão.

```bash
npm run db:up
```

## Fases

- **Fase 0 — fundação** ✅ monorepo, ferramental, `GET /health`, esboço da cena.
- **Fase 1 — modelo da máquina** ✅ `packages/shared/src/machine/`, o modelo
  declarativo (seções → ativos com tag, tipo, posição e raio) do qual a cena é gerada.
- **Fase 2 — cena** ✅ a parte seca em componentes R3F gerados do modelo, com o
  three.js carregado sob demanda.
- **Fase 3 — fatia vertical**: clicar num mancal abre o painel com a vibração vinda da API.

## A cena

`apps/web/src/scene/` monta a máquina a partir de `MP1.sections` — nenhuma posição
é escrita nos componentes. Mudar o nº de pares de cilindros no modelo muda a cena, e
uma tag que não existe no modelo não pode aparecer na tela.

Os mancais são clicáveis: o clique abre o que o modelo sabe do ativo, incluindo os
limites da ISO 20816-3 e o aviso quando a posição ainda é suposição. A vibração
medida entra na Fase 3.

### Carregamento

O three.js é a maior dependência do projeto, e a cena é importada dinamicamente
para ele não pesar na primeira tela:

| Pedaço                  | Tamanho      | Quando desce    |
| ----------------------- | ------------ | --------------- |
| `index` + `react` + css | ~78 kB gzip  | sempre          |
| `three`                 | ~265 kB gzip | ao abrir a cena |
| `MachineScene`          | ~8 kB gzip   | ao abrir a cena |

O `manualChunks` em `vite.config.ts` tem duas regras que parecem supérfluas e não
são: sem elas o Rollup acomoda o `react-dom` e o helper de import dinâmico do Vite
dentro do pedaço do three, a entrada passa a depender dele estaticamente, e o
`index.html` ganha um `modulepreload` de 1 MB que anula o carregamento sob demanda.

## Referências de projeto

`reference/prototypes/` guarda os protótipos que definem o alvo visual e a ordem do
processo.

## As tags são fictícias

**Nenhuma tag deste repositório corresponde a um ativo real de uma planta.** O
padrão `MP1-SEC-G4-CS23-MLA` imita a forma de uma tag de planta, mas os números,
o agrupamento e a numeração dos cilindros foram inventados para o modelo. O mesmo
vale para as leituras de vibração: são geradas, não medidas.

Material interno de verdade — fotos da planta e o mapa de rolos — **não é
versionado**. Use `reference/private/`, que está no `.gitignore`.

## Proveniência: o que é medido e o que é chute

Parte da máquina foi conferida contra a real; parte é suposição tirada do
protótipo. Misturar as duas faz uma suposição virar fato com o tempo, então cada
medida e cada arranjo carregam a sua origem em
[`machine/provenance.ts`](packages/shared/src/machine/provenance.ts), e um teste
garante que nenhuma escapa da marcação.

Duas coisas distintas carregam origem:

- **medidas** (`MEASUREMENTS`): onde o ativo está, qual o raio, qual o passo.
- **existência** (`MachineAsset.source`): se o ativo existe com aquela tag e
  naquele ponto do processo.

São separadas porque um ativo pode ter existência confirmada e posição suposta —
é o caso do scanner 1, que o Felipe confirmou estar na entrada do Speed Sizer,
mas cuja distância até a pré-secagem ainda vem do protótipo.

### Confirmado (6 de 29 medidas)

| Medida                          | Valor  |
| ------------------------------- | ------ |
| Raio dos cilindros secadores    | 1,05 m |
| Passo entre cilindros           | 2,2 m  |
| Altura da fileira superior      | 6,1 m  |
| Altura da fileira inferior      | 3,0 m  |
| Altura do papel entre pré e pós | 4,8 m  |
| Raio dos rolos do Speed Sizer   | 1,15 m |

Mais a **ordem das seções**: pré-secagem → scanner 1 → Speed Sizer →
pós-secagem → calandra → scanner final → Pope.

### Suposto (27 itens)

O que mais pesa, em ordem de impacto:

1. **Nº de pares de cilindros** — 13 na pré-secagem e 5 na pós, como no protótipo.
2. **Grupos de acionamento G1–G6** — inventados. O único ponto fixo é o CS23 estar
   no G4, porque a tag `MP1-SEC-G4-CS23-MLA` aparece no conceito de tela.
3. **Calandra** — um nip só, com o rolo térmico em cima.
4. **Todas as posições em X** — as distâncias entre seções vêm do protótipo.
5. **Largura da folha** (8 m), plano dos mancais, raios de prensa, calandra e Pope.
6. **Dois mancais por corpo girante** — vale para os secadores; para os demais
   rolos, falta confirmar.
7. **Classe ISO 20816-3 dos mancais** — todos usam **grupo 2 com apoio rígido**
   (1,4 / 2,8 / 4,5 mm/s) enquanto a potência de acionamento de cada grupo não vem.
   Com esses limites, os 7,8 mm/s do CS23 caem na **zona D**.

A lista completa sai do próprio código:

```ts
import { assumptions } from '@mp1/shared';
assumptions(); // 27 itens, cada um com rótulo e o que falta para confirmar
```

### Fora de escopo

Caixa de entrada e formação estão declaradas como seções mas sem ativos. O
protótipo da parte úmida usa um referencial próprio, e amarrar os dois eixos
depende do mapa de rolos.
