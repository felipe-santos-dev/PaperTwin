import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Gera o instantâneo do modo de demonstração chamando a API Java.
 *
 *     npm run demo:data --workspace @mp1/web
 *
 * ## Por que um script de Node chama o Maven
 *
 * O instantâneo é gerado pela própria API — é o ponto todo dele: em vez de
 * reimplementar a agregação, a aplicação sobe contra um Postgres embutido e as
 * respostas que ela devolve viram arquivos. Quem faz isso é
 * `DemoSnapshotTest`, no módulo Java.
 *
 * O `build` da web precisa dos arquivos antes do `vite build`, e o `build` da
 * web é um script npm. Este arquivo é a ponte, e existe por uma razão só:
 * **o nome do wrapper do Maven muda de sistema**. No Windows é `mvnw.cmd`, nos
 * demais é `./mvnw`, e um script npm com um deles escrito dentro quebra no
 * outro. Aqui a escolha é feita em tempo de execução.
 */

const MODULE = fileURLToPath(new URL('../../../apps/api-java', import.meta.url));

/** Um arquivo que só existe se o instantâneo já foi gerado por inteiro. */
const SENTINELA = fileURLToPath(
  new URL('../../../apps/web/public/demo/health.json', import.meta.url),
);

/*
 * Gerar o instantâneo leva alguns minutos: sobe um contexto do Spring, um
 * Postgres embutido, roda a retomada e grava novecentos e poucos arquivos. O
 * `build` da web chama isto, e refazer tudo a cada build local torna o ciclo
 * insuportável — e o `vite preview` do e2e estoura o prazo esperando.
 *
 * Então: se o instantâneo já está lá, não refaz. Em CI ele nunca está, porque
 * a pasta é ignorada pelo git e o checkout é limpo — que é exatamente onde
 * refazer importa. Quem quiser refazer localmente passa `--force`.
 */
if (!process.argv.includes('--force') && existsSync(SENTINELA)) {
  console.log(
    'instantâneo do modo de demonstração já existe; use --force para refazer ' + `(${SENTINELA})`,
  );
  process.exit(0);
}

/*
 * O caminho vai absoluto, e não relativo ao `cwd`.
 *
 * Com `shell: true` no Windows, o `cmd` não procura o executável no diretório
 * de trabalho — só no `PATH` —, e `mvnw.cmd` sozinho dá "não é reconhecido
 * como um comando interno ou externo".
 */
const wrapper = resolve(MODULE, process.platform === 'win32' ? 'mvnw.cmd' : 'mvnw');

/**
 * O `JAVA_HOME` que o wrapper do Maven exige, mesmo quando o ambiente não o tem.
 *
 * O `mvnw.cmd` do Windows **recusa** a rodar sem `JAVA_HOME`; o `mvnw` de shell
 * aceita um `java` no `PATH`. Quem tem só o `PATH` configurado — o caso comum
 * de quem instalou o JDK por um gerenciador de pacotes — veria o build da web
 * falhar num erro de Maven que não diz o que fazer.
 *
 * Isto não adivinha nada: pergunta à própria JVM do `PATH` onde ela mora, que
 * é exatamente a que o Maven usaria. Se não houver `java` nenhum, devolve
 * indefinido e o erro que sai é o do wrapper, que é o certo.
 */
function javaHome(): string | undefined {
  if (process.env.JAVA_HOME) return process.env.JAVA_HOME;

  const probe = spawnSync('java', ['-XshowSettings:properties', '-version'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });

  // `-XshowSettings` escreve em stderr, e não em stdout
  const home = /^\s*java\.home = (.+)$/m.exec(probe.stderr ?? '')?.[1];
  return home?.trim();
}

const home = javaHome();

const result = spawnSync(
  wrapper,
  [
    '-q',
    'test',
    '-Dtest=DemoSnapshotTest',
    '-Ddemo.write=true',
    // sem isto o surefire falha por não achar os outros testes do filtro
    '-DfailIfNoTests=false',
  ],
  {
    cwd: MODULE,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: home ? { ...process.env, JAVA_HOME: home } : process.env,
  },
);

if (result.error) {
  console.error(
    `não foi possível rodar o ${wrapper} em ${MODULE}: ${result.error.message}\n` +
      'O instantâneo do modo de demonstração é gerado pela API Java, então o build da web ' +
      'precisa de um JDK 21 e do wrapper do Maven.',
  );
  process.exit(1);
}

process.exit(result.status ?? 1);
