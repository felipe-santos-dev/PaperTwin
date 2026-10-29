# API do Papermill-Twin.
#
# Build em dois estágios: o primeiro tem o monorepo inteiro e as ferramentas, o
# segundo leva só o bundle e as dependências de produção. O tsup embute o
# @mp1/shared no bundle, então a imagem final não precisa do workspace.

FROM node:24-alpine AS build
WORKDIR /repo

# As manifestos primeiro: assim a camada de dependências só é refeita quando
# elas mudam, e não a cada alteração de código.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/

# O npm 12 bloqueia install scripts; o allowScripts na raiz libera o esbuild,
# que precisa do postinstall para baixar o binário da plataforma.
RUN npm ci --workspace @mp1/api --include-workspace-root

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api

RUN npm run build --workspace @mp1/api

# ---

FROM node:24-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
# Escuta em todas as interfaces: num contêiner, 127.0.0.1 só aceitaria conexão
# de dentro dele mesmo, e o roteador do host nunca alcançaria a API.
ENV HOST=0.0.0.0
ENV PORT=3333

# Processo sem privilégio. A imagem do Node já traz o usuário `node`.
USER node

COPY --from=build --chown=node:node /repo/apps/api/dist ./dist
COPY --from=build --chown=node:node /repo/node_modules ./node_modules
COPY --from=build --chown=node:node /repo/apps/api/package.json ./package.json

EXPOSE 3333

# O start aplica as migrations e semeia antes de escutar, então o contêiner só
# passa a aceitar tráfego quando tem o que responder.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3333)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
