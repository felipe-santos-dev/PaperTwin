# Checklist de deploy

**Nada aqui foi executado.** O projeto está preparado para subir e não subiu: a
imagem não foi construída, o banco não foi criado e o site não foi publicado.
Este documento é o passo a passo para quando for.

A ordem importa em três pontos, e eles estão marcados.

---

## O que vai para onde

| Peça  | Onde            | Plano | O que a restrição obriga                            |
| ----- | --------------- | ----- | --------------------------------------------------- |
| Banco | Neon            | Free  | ~0,5 GB — é o que desenha a retenção do historiador |
| API   | Render (Docker) | Free  | 512 MB de RAM; a instância dorme sem tráfego        |
| Web   | GitHub Pages    | —     | estático; abre no modo de demonstração sem a API    |

---

## 1. O banco, no Neon

1. Criar o projeto. **Confirmar a versão do Postgres**: o esquema é escrito para
   a **18**, que é a dos testes e a do `docker-compose`. Uma versão diferente
   não quebra nada de imediato, mas deixa de ser verdade que o que o CI testou é
   o que produção roda.
2. Guardar a URL de conexão. Ela vem no formato do `libpq`; a aplicação Java
   quer **JDBC**:

   ```
   postgres://usuario:senha@host/banco?sslmode=require
   jdbc:postgresql://host/banco?sslmode=require     ← é esta que vai no Render
   ```

   O usuário e a senha vão separados, em `DATABASE_USER` e `DATABASE_PASSWORD`.

3. **Rodar a migration à mão, uma vez.** Da máquina de quem está publicando:

   ```bash
   cd apps/api-java
   DATABASE_URL='jdbc:postgresql://host/banco?sslmode=require' \
   DATABASE_USER=... DATABASE_PASSWORD=... \
   ./mvnw -q flyway:migrate -Dflyway.url="$DATABASE_URL" \
       -Dflyway.user="$DATABASE_USER" -Dflyway.password="$DATABASE_PASSWORD"
   ```

   **Por que à mão**: `RUN_MIGRATIONS` é falso por padrão, e é para ficar. Num
   host que dorme, o boot acontece quando o primeiro visitante abre a tela — ou
   seja, numa hora que ninguém escolheu. Migration que roda sozinha nessa hora é
   migration que ninguém está olhando quando falha.

4. Conferir que as **19 tabelas** estão lá. `MigrationsTest` cobra a lista
   exata; aqui basta `\dt`.

---

## 2. A API, no Render

1. Serviço novo, tipo **Web Service**, a partir do repositório, com
   **Docker** como runtime e `apps/api-java/Dockerfile` como caminho do
   Dockerfile. **O contexto de build é a raiz do repositório** — o `pom.xml` lê
   os CSV da pesquisa de `reference/research`, que está fora do módulo.
2. Variáveis de ambiente:

   | Variável            | Valor                                       |
   | ------------------- | ------------------------------------------- |
   | `DATABASE_URL`      | a URL **JDBC** do passo 1                   |
   | `DATABASE_USER`     | o usuário do Neon                           |
   | `DATABASE_PASSWORD` | a senha do Neon                             |
   | `CORS_ORIGINS`      | a URL das Pages (ver o passo 3 — **ordem**) |
   | `RUN_MIGRATIONS`    | **não definir**; o padrão é `false`         |
   | `PORT`              | o Render define sozinho                     |

3. Subir e **ler o log do arranque**. Duas coisas:

   - `Started PaperTwinApplication in X seconds` — comparar com os **2,5 s**
     medidos no desktop. No Render Free será bem mais.
   - A primeira requisição dispara a retomada. A linha é:

     ```
     retomada: 4,00 h recuperadas em 13464 ms (7937 ms de colheita), heap 165 MB, ...
     ```

4. **Ajustar `RESUME_MAX_HOURS` se a retomada passar de ~15 s.** É o número que
   decide se a primeira tela do dia abre ou expira. O padrão é 4 horas, medido
   num desktop; o Render Free dá uma fração de vCPU e o Neon fica do outro lado
   da rede.

   A linha do log diz **onde** o tempo está, e as duas metades se ajustam de
   maneiras diferentes:

   - tempo **no motor** → baixar `RESUME_MAX_HOURS` resolve: menos passos, menos
     tempo;
   - tempo **na colheita** → baixar o teto ajuda pouco. Ela paga por turno e por
     bobina, e um turno fecha dez bobinas qualquer que seja a janela que o
     alcançou. O que ajudaria ali é outra coisa — colher fora da requisição, ou
     só para o turno corrente — e é decisão de produto.

   Consequência de baixar o teto: acima dele a retomada **reancora**, o
   relatório diz que reancorou, e o intervalo que não rodou fica como buraco no
   histórico. É dito e não escondido.

5. **Medir o RSS de verdade**, no painel do Render. O que foi medido até aqui é
   memória **comprometida** num desktop Windows — 220 MB em repouso —, e o RSS
   num container Linux é outro número. Se passar de ~400 MB em repouso, revisar
   `-XX:MaxRAMPercentage` no Dockerfile.

6. Conferir `/health`. Ele responde **sem rodar a retomada** — é uma leitura de
   uma linha indexada — e deve voltar em menos de um segundo mesmo com a
   instância fria:

   ```json
   { "status": "ok", "databaseUp": true, "simulation": { "behindS": 17 } }
   ```

   `simulation: null` significa que a simulação ainda não rodou nenhuma vez:
   normal antes da primeira tela, suspeito depois dela.

---

## 3. A web, no GitHub Pages

> **Ordem**: a URL das Pages precisa existir antes de `CORS_ORIGINS` no Render,
> e `VITE_API_URL` precisa da URL do Render. Publicar uma vez para descobrir as
> duas e depois voltar nos dois lugares é o caminho mais curto.

1. Em **Settings → Pages**, fonte **GitHub Actions**.
2. Em **Settings → Variables**, criar `VITE_API_URL` com a URL do Render.
3. Rodar o workflow `Pages`. Ele precisa de **Node e JDK**: o instantâneo do
   modo de demonstração é gerado pela própria API Java.
4. Voltar ao Render e pôr a URL das Pages em `CORS_ORIGINS`. Sem isso o
   navegador bloqueia a resposta antes de ela chegar ao JavaScript, e a tela cai
   para o modo de demonstração **com a API no ar**.

---

## 4. Conferir o conjunto

- [ ] Abrir o site. A faixa deve dizer **"Dados vindo da API"**. Se disser
      "Dados de demonstração", ou a API está dormindo (esperar e recarregar) ou
      o `CORS_ORIGINS` está errado — o console do navegador separa os dois
      casos.
- [ ] As sete telas, com as teclas 1 a 7.
- [ ] Mexer num setpoint na tela de Processo e conferir que a escrita aparece
      na lista de alterações. É a única escrita que a API aceita, e ela entra no
      estado gravado: o processo deve se mover no passo seguinte.
- [ ] Deixar a instância dormir (o Render derruba depois de ~15 min sem
      tráfego) e abrir de novo. A primeira tela deve demorar e **abrir** — é a
      retomada. Se expirar, voltar ao passo 2.4.
- [ ] Desligar a API e recarregar: o site deve abrir no modo de demonstração,
      com a faixa dizendo isso.

---

## O que este deploy não tem, e por quê

- **Sem autenticação.** A API é de leitura pública e a única escrita mexe num
  processo simulado. Pôr uma tela de login daria a impressão de que há algo a
  proteger.
- **Sem processo de fundo.** A simulação é determinística a partir de (semente,
  tempo) e recalcula o intervalo que faltou quando alguém abre a tela. Um laço
  rodando 24 h num host que dorme não simula nada — e manteria a instância
  acordada, que é o oposto do que o plano Free paga.
- **Sem histórico contínuo.** Se ninguém abrir a tela por um dia, não houve quem
  rodasse a simulação daquele dia, e o teto da retomada corta o resto. Quem
  quiser histórico contínuo precisa de alguém batendo na API de tempos em
  tempos — um cron externo de 5 em 5 minutos resolve, e muda o custo do plano.
- **Sem AppCDS.** Medido (2,49 s → 1,83 s, 26 % a menos) e deixado comentado no
  Dockerfile: 0,65 s são 5 % do tempo até a primeira tela, que a retomada
  domina, em troca de 42 MB na imagem.
