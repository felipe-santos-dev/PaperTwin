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
- **Fase 2 — cena**: port do protótipo da parte seca para componentes R3F.
- **Fase 3 — fatia vertical**: clicar num mancal abre o painel com a vibração vinda da API.

## Referências de projeto

`reference/prototypes/` guarda os protótipos que definem o alvo visual e a ordem do
processo (pré-secagem → scanner 1 → Speed Sizer → pós-secagem → calandra → scanner
final → Pope).

Material interno da planta (fotos, mapa de rolos) **não é versionado** — use
`reference/private/`, que está no `.gitignore`.

## Pendências de fidelidade

Tudo que está marcado como provisório no código aponta para esta lista.

- Nº de pares de cilindros na pré-secagem (13 no modelo) e na pós-secagem (5).
- Divisão dos cilindros em grupos de acionamento. O modelo usa G1–G4 na
  pré-secagem e G5–G6 na pós; o único ponto fixo é o CS23 estar no G4, para a tag
  `MP1-SEC-G4-CS23-MLA` bater com o conceito de tela.
- Calandra: nº de nips e posição do rolo térmico.
- Diâmetros e posições reais, a partir do mapa de rolos.
- Caixa de entrada e formação ainda não têm ativos: o protótipo da parte úmida usa
  um referencial próprio, e amarrar os dois depende do mapa de rolos.
- Potência de acionamento de cada grupo, para enquadrar os mancais na ISO 20816-3.
  Enquanto não vem, todos usam **grupo 2 com apoio rígido** (1,4 / 2,8 / 4,5 mm/s).
  Com esses limites, os 7,8 mm/s do CS23 caem na **zona D** — o conceito de tela
  rotula a mesma leitura como zona C, e é o rótulo do conceito que está errado.
