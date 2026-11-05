import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import openapiTS, { astToString } from 'openapi-typescript';

/**
 * Gera os tipos do front a partir do contrato da API Java.
 *
 *     npm run generate:api-types --workspace @mp1/shared
 *     npm run generate:api-types --workspace @mp1/shared -- --check
 *
 * ## Por que gerar
 *
 * Antes desta etapa, as formas das respostas eram escritas à mão em
 * `packages/shared` e o back-end tinha de concordar com elas. Isso funcionava
 * enquanto os dois lados eram TypeScript e importavam o mesmo arquivo — o
 * compilador cobrava. Com o back-end em Java, nada cobra: uma rota pode mudar
 * de forma e o front continua compilando, para quebrar na primeira requisição
 * de quem estiver olhando a tela.
 *
 * O `openapi.json` é a fonte, e ele sai da aplicação que de fato responde. Com
 * os tipos gerados dele, uma mudança de rota aparece onde dói menos: no
 * `tsc`.
 *
 * ## `--check`
 *
 * No CI o arquivo é **conferido**, não regravado: se o contrato mudou e os
 * tipos não foram gerados de novo, a conferência falha com o diff. Regravar em
 * CI esconderia exatamente o que ela existe para mostrar.
 */

const CONTRACT = new URL('../../../apps/api-java/openapi.json', import.meta.url);
const OUT = new URL('../src/api/generated.ts', import.meta.url);

const HEADER = `/**
 * GERADO — não edite à mão.
 *
 * Saída de \`packages/shared/scripts/generate-api-types.ts\`, que lê
 * \`apps/api-java/openapi.json\`. Para mudar um tipo, mude a rota no Java,
 * regrave o contrato e rode:
 *
 *     npm run generate:api-types --workspace @mp1/shared
 *
 * O contrato é conferido no Java (\`OpenApiContractTest\`) e estes tipos são
 * conferidos no CI, de modo que os dois lados nunca se afastam em silêncio.
 */
`;

const generate = async (): Promise<string> => {
  const ast = await openapiTS(CONTRACT, {
    // `Date` não ajuda aqui: os instantes atravessam como texto ISO e é como
    // texto que o front os compara e os passa de volta. Converter na borda
    // daria dois formatos para a mesma coisa.
    alphabetize: true,
  });

  return `${HEADER}\n${astToString(ast)}`;
};

const generated = await generate();
const outPath = fileURLToPath(OUT);

if (process.argv.includes('--check')) {
  const current = await readFile(outPath, 'utf8').catch(() => '');

  if (current.replaceAll('\r\n', '\n') !== generated.replaceAll('\r\n', '\n')) {
    console.error(
      'Os tipos gerados estão diferentes de apps/api-java/openapi.json.\n' +
        'Rode `npm run generate:api-types --workspace @mp1/shared` e confira o diff.',
    );
    process.exit(1);
  }

  console.log('tipos da API conferidos: iguais ao contrato');
} else {
  await writeFile(outPath, generated, 'utf8');
  console.log(`tipos da API gerados em ${outPath}`);
}
