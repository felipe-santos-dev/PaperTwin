import { spawn, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Sobe a API Java para o Playwright, contra o Postgres embutido.
 *
 * O Playwright precisa de **um comando** que fique no ar até ele matar, e subir
 * a API Java são dois passos: compilar o módulo e rodar o `DevServer`, que vive
 * em `src/test` porque o Postgres embutido é dependência de teste. Isto
 * encadeia os dois e repassa o processo.
 *
 * O caminho do wrapper é resolvido em tempo de execução pela mesma razão de
 * `generate-demo.ts`: no Windows é `mvnw.cmd`, nos demais é `mvnw`, e o `cmd`
 * não procura executável no diretório de trabalho. O `JAVA_HOME` também é
 * derivado da JVM do `PATH` quando falta, porque o `mvnw.cmd` recusa sem ele.
 */

const MODULE = fileURLToPath(new URL('../../api-java', import.meta.url));
const WINDOWS = process.platform === 'win32';

const wrapper = resolve(MODULE, WINDOWS ? 'mvnw.cmd' : 'mvnw');

function javaHome() {
  if (process.env.JAVA_HOME) return process.env.JAVA_HOME;

  const probe = spawnSync('java', ['-XshowSettings:properties', '-version'], {
    encoding: 'utf8',
    shell: WINDOWS,
  });

  // `-XshowSettings` escreve em stderr, e não em stdout
  return /^\s*java\.home = (.+)$/m.exec(probe.stderr ?? '')?.[1]?.trim();
}

const home = javaHome();
const env = home ? { ...process.env, JAVA_HOME: home } : process.env;
const options = { cwd: MODULE, stdio: 'inherit', shell: WINDOWS, env };

const compiled = spawnSync(wrapper, ['-q', 'test-compile'], options);

if (compiled.status !== 0) {
  console.error('não foi possível compilar a API Java; o e2e precisa de um JDK 21.');
  process.exit(compiled.status ?? 1);
}

/**
 * O classpath vem do Maven, e não de um `exec:java`.
 *
 * O plugin `exec` não está no pom, e acrescentá-lo só para o e2e poria uma
 * dependência de build no caminho de produção. `build-classpath` é do plugin de
 * dependências, que já vem com o Maven.
 */
const classpathFile = resolve(MODULE, 'target', 'e2e-classpath.txt');

const classpath = spawnSync(
  wrapper,
  [
    '-q',
    'org.apache.maven.plugins:maven-dependency-plugin:3.8.1:build-classpath',
    `-Dmdep.outputFile=${classpathFile}`,
    '-DincludeScope=test',
  ],
  options,
);

if (classpath.status !== 0) {
  console.error('não foi possível montar o classpath de teste da API Java.');
  process.exit(classpath.status ?? 1);
}

const { readFileSync, writeFileSync } = await import('node:fs');
const separator = WINDOWS ? ';' : ':';

const entries = [
  resolve(MODULE, 'target', 'test-classes'),
  resolve(MODULE, 'target', 'classes'),
  readFileSync(classpathFile, 'utf8').trim(),
].join(separator);

/**
 * O classpath vai num arquivo de argumentos, e não na linha de comando.
 *
 * São ~10 kB de caminhos, e o `cmd` do Windows corta em 8191 caracteres: o
 * erro que sai é "Linha de comando muito longa", do shell, antes de a JVM
 * existir. O `java` lê `@arquivo` desde sempre justamente para isto.
 *
 * As barras invertidas são trocadas por barras: dentro de um arquivo de
 * argumentos a JVM trata a barra invertida como escape, e um caminho do
 * Windows viraria outro caminho.
 */
const argsFile = resolve(MODULE, 'target', 'e2e-java-args.txt');
writeFileSync(argsFile, `-cp "${entries.replaceAll('\\', '/')}"`, 'utf8');

const server = spawn(
  WINDOWS ? 'java.exe' : 'java',
  ['-Duser.timezone=UTC', `@${argsFile}`, 'dev.felipesantos.papertwin.DevServer'],
  { stdio: 'inherit', env },
);

// o Playwright mata este processo; repassar o sinal evita deixar a JVM órfã
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.kill(signal);
  });
}

server.on('exit', (code) => {
  process.exit(code ?? 0);
});
