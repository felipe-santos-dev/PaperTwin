import { derivedVariable } from './derived';
import { relationsForOutput } from './relations';

/**
 * Quem está **antes** de uma tag no caminho do papel.
 *
 * O grafo de relações responde, para cada saída, de que entradas ela depende —
 * e as fórmulas das calculadas dizem o mesmo das contas. Andar para trás nos
 * dois é o que permite dizer, diante de duas tags que se mexeram, qual das duas
 * pode ter mexido a outra.
 *
 * Existe aqui, e não no `shared/simulation`, porque quem pergunta é a operação:
 * o replay de quebra precisa separar origem de consequência, e não deveria
 * importar o motor do simulador para isso. O motor anda para a frente
 * (`causePaths`), a investigação anda para trás.
 *
 * O resultado é transitivo e não inclui a própria tag: `upstreamOf('AIC-902')`
 * traz a vazão de massa, a consistência e a velocidade, e tudo que move essas
 * três.
 */
export function upstreamOf(tag: string): Set<string> {
  const antes = new Set<string>();
  const fila = [tag];

  while (fila.length > 0) {
    const atual = fila.shift();
    if (atual === undefined) break;

    const entradas = [
      ...relationsForOutput(atual).map((relation) => relation.input),
      ...(derivedVariable(atual)?.inputs ?? []),
    ];

    for (const entrada of entradas) {
      if (entrada === tag || antes.has(entrada)) continue;
      antes.add(entrada);
      fila.push(entrada);
    }
  }

  return antes;
}

/** Se `tag` depende de `outra`, direta ou indiretamente. */
export function dependsOn(tag: string, outra: string): boolean {
  return upstreamOf(tag).has(outra);
}
