# Gabarito da API TypeScript

Estes arquivos são a **referência de comportamento** para a reescrita do
back-end em Java. Cada um guarda uma entrada e a saída que a implementação
TypeScript produziu para ela. Os testes da `apps/api-java` leem os mesmos
arquivos, alimentam a mesma entrada e comparam.

Gerados por `npm run golden --workspace @mp1/api`
(`apps/api/src/scripts/generate-golden.ts`).

## O gabarito não é a especificação

Ele é o que a implementação atual faz — e uma implementação pode estar errada.
Se um caso revelar um erro na versão TypeScript, o certo é **corrigir os dois
lados e regravar o gabarito**, não ensinar o Java a errar igual. Já aconteceu
uma vez, e está registrado em `docs/progress.md`: o número da nota de manutenção
saía negativo para alarmes anteriores à época da simulação.

## Formato

Três decisões, todas pela mesma razão — o arquivo é lido por outra linguagem:

1. **Entrada e saída no mesmo arquivo.** Um gabarito que guardasse só a saída
   obrigaria a reconstruir a entrada dos dois lados, e aí o teste passaria a
   comparar duas reconstruções em vez de duas implementações.
2. **Nada de `Infinity`, `NaN` ou `undefined`.** O JSON não os tem e cada
   linguagem inventa o seu. O que falta é `null`.
3. **Instantes em milissegundos do epoch**, não em texto ISO. Fuso e formato de
   data são justamente onde duas plataformas divergem em silêncio.

Todo arquivo traz um campo `tolerance`. É `1e-9` relativo: as duas
implementações usam IEEE-754 de 64 bits, mas a ordem das operações pode diferir,
e exigir igualdade bit a bit transformaria qualquer refatoração numa falha.

## O que cada arquivo cobra

### `fopdt/step-responses.json`

Resposta ao degrau de três relações, mais `decayPerStep` e `delaySteps`.

O caso que importa é a relação **14 com `dtS: 10`**: τ = 4,5 s, passo de 10 s. É
o único em que o passo é maior que a constante de tempo, e é onde a
discretização por retentor de ordem zero se separa de uma aproximação de Euler.
Euler daria `1 − dt/τ = −1,22`, um fator negativo, e a resposta oscilaria de
sinal a cada passo; a exata dá `exp(−10/4,5) = 0,1084`. Se a implementação Java
usar Euler, este caso falha e os outros passam.

A relação 1 tem tempo morto de 75 s contra τ = 23 s — atraso puro, onde um laço
mal escrito perde um passo. A 4 tem a situação oposta.

### `fopdt/cd-spread.json`

O espalhamento lateral da relação 11 (diluição por zona → gramatura), com o
kernel e três zonas: a 70, no meio da folha, e as zonas 1 e 139, nas bordas. As
bordas **truncam** — o que vazaria para fora da folha some e não é
redistribuído.

### `historian/compression.json`

As duas etapas em sequência, para três tags com `excDev`/`compDev` diferentes e
três formatos de série (rampa, degrau, ruído):

- `afterException` é a saída do filtro de exceção, que decide o que é
  descartado na coleta;
- `archived` é a saída da porta oscilante, que decide o que vai para o arquivo;
- `stats` traz a razão de compressão.

Guardar o meio, e não só o fim, é o que faz este arquivo dizer **qual** das duas
etapas divergiu quando o total não bate.

### `historian/interpolation.json`

Leitura em instante arbitrário (`readAt`, com o tipo da leitura: exata,
interpolada ou extrapolada) e média ponderada no tempo.

A série é desigual de propósito: um trecho parado com um ponto só e um trecho
agitado com vários. É nela que a média dos pontos e a média no tempo dão
respostas diferentes — e só a segunda está certa, porque os pontos de um
historiador comprimido não são igualmente espaçados.

### `alarms/sequence.json`

Um cenário ISA-18.2 inteiro, varredura a varredura: dispara, piora, é
reconhecido, normaliza; depois engaveta e desengaveta; e a contagem de inundação
em cada passo.

Dois pontos que uma reimplementação erra com facilidade: o **pico guardado é o
pior valor desde o disparo**, não o último; e o **id é determinístico**,
`AL-<instante em segundos>-<tag>-<limite>`, porque é ele que impede dois cliques
simultâneos de gravarem dois reconhecimentos.

### `simulation/tags.json`

Vinte tags em três instantes para a semente padrão, e a prova de que dormir não
muda nada: rodar 0 → 3600 de uma vez tem de dar o mesmo que rodar 0 → 1500,
serializar o estado, restaurar e ir até 3600.

Esse último caso é o que vale para o Render Free, onde a API dorme sem tráfego —
e foi um teste assim que, na versão TypeScript, revelou que o estado da rede
precisava ser persistido e não podia ser recalculado de (semente, passo).

### `api/routes.json`

O corpo da resposta de cada rota para um estado fixo: banco em memória,
migrations, semente e uma retomada de 2 h até `2026-03-02T09:00:00Z`.

O instante é escolhido, e fica meses depois da época da simulação de propósito:
a semente grava 72 h de histórico de mancal terminando nele, e perto da época
esse histórico cairia antes dela.

`volatileFields` lista os campos que mudam com o relógio de quem gerou
(`uptimeS`, `generatedAt`). O teste Java os ignora em vez de compará-los.
