/**
 * A gramática do marcador `nn` dos padrões por cilindro.
 *
 * No CSV, uma variável que existe uma vez por cilindro aparece numa linha só,
 * com `nn` no lugar do número: a tag `VI-51nnA` vale para os 36 cilindros.
 *
 * O marcador é reconhecido por posição, nunca por substring solta, e o motivo
 * está no próprio catálogo: **"scanner" contém "nn"**. Um `tag.includes('nn')`
 * classificaria `AIC-901` ("Umidade antes da colagem · scanner 1") como padrão
 * por cilindro, e um `name.replace('nn', '7')` escreveria "sca7er". Daí a tag
 * ser casada com uma âncora e o nome com `\b`.
 */

/** `VI-51nnA`, `TI-52nn` — o `nn` vem depois dos dígitos, com lado opcional. */
const TAG = /^([A-Z]+-\d+)nn([AB]?)$/;

/** O `nn` como palavra inteira, que é como ele aparece nos nomes. */
const NAME = /\bnn\b/;

/** Se a tag é de um padrão por cilindro. */
export function isPerCylinderTag(tag: string): boolean {
  return TAG.test(tag);
}

/** Se o nome tem o marcador. */
export function isPerCylinderName(name: string): boolean {
  return NAME.test(name);
}

/**
 * A tag do padrão aplicada a um cilindro: `VI-51nnA` + 7 → `VI-5107A`.
 *
 * Dois dígitos, para a ordem alfabética das tags bater com a numérica — a mesma
 * razão pela qual o modelo da máquina usa `MP1-SEC-G1-CS07`.
 */
export function expandCylinderTag(tagPattern: string, cylinder: number): string {
  const parsed = TAG.exec(tagPattern);
  if (!parsed?.[1]) {
    throw new Error(`Tag de padrão por cilindro fora do formato esperado: ${tagPattern}`);
  }
  return `${parsed[1]}${String(cylinder).padStart(2, '0')}${parsed[2] ?? ''}`;
}

/**
 * O nome do padrão aplicado a um cilindro.
 *
 * Aqui o número vai como se fala — "cilindro 7", não "cilindro 07" — igual ao
 * rótulo `Cilindro secador 7` do modelo da máquina.
 */
export function expandCylinderName(namePattern: string, cylinder: number): string {
  if (!NAME.test(namePattern)) {
    throw new Error(`Nome de padrão por cilindro sem o marcador nn: ${namePattern}`);
  }
  return namePattern.replace(NAME, String(cylinder));
}
