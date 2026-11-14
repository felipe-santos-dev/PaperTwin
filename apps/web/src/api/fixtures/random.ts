/**
 * Ruído determinístico para os dados fixos.
 *
 * O mesmo ensaio da mesma bobina tem de dar o mesmo número em todo render e em
 * toda máquina — um dado fixo que muda a cada recarga pareceria leitura ao
 * vivo. A semente sai do texto (TAG, número da bobina), não do relógio.
 */

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Um número em [0, 1) fixo para a chave. */
export function unit(key: string): number {
  let x = hash(key) || 1;
  // xorshift32: espalha os bits do hash antes de virar fração
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return (x >>> 0) / 4294967296;
}

/** Um número em [-1, 1) fixo para a chave, com mais peso perto do zero. */
export function centered(key: string): number {
  return unit(`${key}:a`) + unit(`${key}:b`) - 1;
}
