# A API do PaperTwin num host de 512 MB.
#
# O contexto de build é a RAIZ DO REPOSITÓRIO, e não este diretório:
#
#     docker build -f apps/api-java/Dockerfile -t papertwin-api .
#
# É o que o `pom.xml` exige. Ele lê os CSV da pesquisa de
# `${project.basedir}/../../reference/research`, porque a fonte deles é o
# repositório e não o módulo — então a imagem precisa do mesmo arranjo de
# diretórios, e um contexto limitado a `apps/api-java` não teria o que copiar.
#
# Duas etapas: a primeira compila com o JDK, a segunda roda com o JRE. A imagem
# final não leva compilador, nem o repositório Maven, nem o código-fonte — o que
# não está nela não precisa ser baixado a cada deploy nem pode ser explorado em
# produção.

# --------------------------------------------------------------- compilação ----

FROM eclipse-temurin:21.0.5_11-jdk-noble AS build

WORKDIR /build/apps/api-java

# O wrapper e o pom entram primeiro, sozinhos.
#
# É o que faz o cache de camadas valer: enquanto o pom não mudar, a camada de
# dependências é reaproveitada, e um deploy que só mexeu em código Java não
# baixa o Spring de novo.
COPY apps/api-java/.mvn/ .mvn/
COPY apps/api-java/mvnw apps/api-java/pom.xml ./
RUN ./mvnw -B -q dependency:go-offline

# Os CSV da pesquisa vão para onde o pom os espera, duas pastas acima.
COPY reference/research/ /build/reference/research/
COPY apps/api-java/src/ src/

# Sem testes: eles rodam no CI, com Postgres embutido, e repeti-los aqui
# dobraria o tempo de deploy para conferir o que já foi conferido.
RUN ./mvnw -B -q -DskipTests package

# ------------------------------------------------------------------ execução ----

FROM eclipse-temurin:21.0.5_11-jre-noble

# Usuário sem privilégios. A aplicação não escreve em disco — o estado está no
# Postgres — então nem o diretório de trabalho precisa ser dela.
RUN useradd --system --no-create-home --shell /usr/sbin/nologin papertwin

WORKDIR /app
COPY --from=build /build/apps/api-java/target/papertwin-api-*.jar app.jar

USER papertwin
EXPOSE 8080

# As opções de memória ficam aqui, e não no entrypoint, para quem opera poder
# trocá-las sem reconstruir a imagem.
#
# -XX:MaxRAMPercentage=70   O container tem 512 MB. 70 % deixa ~150 MB para o
#                           metaspace, as pilhas e o próprio JRE, que não saem
#                           do heap. Sem isto a JVM usaria 25 % — 128 MB — e uma
#                           retomada de 4 h bateria no teto: o pico medido num
#                           desktop foi de 165 MB de heap.
# -XX:+UseSerialGC          Uma fração de vCPU não tem onde rodar as threads do
#                           G1. O serial tem pausas maiores e consome menos, e
#                           num host que atende uma tela por vez a pausa não
#                           aparece.
# -Xss512k                  As pilhas de 1 MB (o padrão) multiplicadas pelas
#                           threads do Tomcat são dezenas de MB fora do heap.
# -XX:+ExitOnOutOfMemoryError  Morrer é melhor que ficar vivo e inútil: o host
#                           reinicia, e a retomada reconstrói o que faltou.
ENV JAVA_OPTS="-XX:MaxRAMPercentage=70 -XX:+UseSerialGC -Xss512k -XX:+ExitOnOutOfMemoryError"

# A migration NÃO roda no boot.
#
# Num host que dorme, o boot acontece quando o primeiro visitante abre a tela —
# ou seja, numa hora que ninguém escolheu. Ela é rodada uma vez, à mão, pelo
# checklist de deploy. Este `false` é o mesmo padrão do `application.yaml`, e
# está repetido aqui porque quem lê um Dockerfile não lê o yaml.
ENV RUN_MIGRATIONS=false

# ------------------------------------------------------------------ AppCDS ----
#
# MEDIDO, e deixado pronto para ligar — não ligado.
#
# O arquivo de classes compartilhadas corta o tempo de subir o contexto do
# Spring de **2,49 s para 1,83 s** (média de quatro execuções cada, JDK 25 num
# desktop, sem banco): 26 % a menos, ~0,65 s.
#
# Por que não está ligado por padrão: o ganho é real mas pequeno diante do custo
# que domina este serviço, que é a retomada — 13,5 s para uma janela de 4 h com
# a JVM fria. São 5 % do tempo até a primeira tela, em troca de 42 MB a mais na
# imagem e de uma execução de treino na build. Num host que dorme e acorda a
# cada visita, pode valer; é decisão de quem opera, e está aqui com o número
# para ela ser tomada com ele.
#
# Para ligar, trocar a etapa de execução por:
#
#     FROM eclipse-temurin:21.0.5_11-jre-noble
#     WORKDIR /app
#     COPY --from=build /build/apps/api-java/target/papertwin-api-*.jar app.jar
#     # o jar precisa ser extraído: classes dentro de um jar aninhado não entram
#     # no arquivo compartilhado
#     RUN java -Djarmode=tools -jar app.jar extract --destination /app/extracted \
#      && rm app.jar \
#      && cd /app/extracted \
#      && java -Dspring.context.exit=onRefresh -XX:ArchiveClassesAtExit=app.jsa \
#              -jar papertwin-api-*.jar
#     ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -XX:SharedArchiveFile=/app/extracted/app.jsa -jar /app/extracted/papertwin-api-0.0.1-SNAPSHOT.jar"]
#
# O `spring.context.exit=onRefresh` é o que torna a execução de treino possível
# numa build: o contexto sobe inteiro — inclusive o Tomcat — e então sai
# limpo, que é quando a JVM grava o arquivo. Sem ele não há como treinar sem um
# banco de verdade.

# `sh -c` para o shell expandir $JAVA_OPTS; sem ele a variável iria como um
# argumento só e a JVM recusaria. O `exec` deixa a JVM como PID 1, que é o que
# faz o SIGTERM do host chegar nela em vez de morrer no shell.
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar"]
