import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RGBAFormat,
  RepeatWrapping,
} from 'three';

/**
 * Textura de ruído tileável, gerada em memória.
 *
 * Quatro canais com frequências diferentes, para um material pedir o grão que
 * lhe serve sem baixar imagem nenhuma:
 *
 * - **R** — grão fino: poeira e variação de rugosidade
 * - **G** — grão médio: sujeira e manchas de tinta
 * - **B** — manchas grandes: poças, áreas lavadas
 * - **A** — estrias verticais: escorrimento e riscos circunferenciais
 *
 * 256² é o bastante: tudo que a usa amostra em escala de mundo, e o mipmap
 * resolve a distância. Gerar custa poucos milissegundos e evita uma requisição.
 */

const SIZE = 256;

/** Grade de valores pseudoaleatórios, determinística a partir da semente. */
function lattice(frequency: number, seed: number): Float32Array {
  const grid = new Float32Array(frequency * frequency);
  let state = seed;
  for (let i = 0; i < grid.length; i += 1) {
    state = (state * 16807) % 2147483647;
    grid[i] = state / 2147483647;
  }
  return grid;
}

/** Ruído de valor com interpolação suave, envolvendo nas bordas. */
function value(grid: Float32Array, frequency: number, x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const sx = xf * xf * (3 - 2 * xf);
  const sy = yf * yf * (3 - 2 * yf);
  const at = (a: number, b: number) =>
    grid[
      (((b % frequency) + frequency) % frequency) * frequency +
        (((a % frequency) + frequency) % frequency)
    ] ?? 0;
  const a = at(xi, yi);
  const b = at(xi + 1, yi);
  const c = at(xi, yi + 1);
  const d = at(xi + 1, yi + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Frequência em X, em Y, nº de oitavas e semente, por canal. */
const CHANNELS: readonly (readonly [number, number, number, number])[] = [
  [16, 16, 4, 11],
  [6, 6, 4, 23],
  [2, 2, 3, 37],
  // frequências diferentes por eixo são o que faz as estrias do canal A
  [32, 2, 3, 51],
];

export function makeNoiseTexture(): DataTexture {
  const data = new Uint8Array(SIZE * SIZE * 4);

  const octaves = CHANNELS.map(([fx, fy, count, seed]) => {
    const grids = [];
    for (let o = 0; o < count; o += 1) {
      const frequency = Math.max(fx << o, fy << o);
      grids.push({ grid: lattice(frequency, seed + o * 977), frequency, fx: fx << o, fy: fy << o });
    }
    return grids;
  });

  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const u = x / SIZE;
      const v = y / SIZE;
      for (let channel = 0; channel < 4; channel += 1) {
        let sum = 0;
        let amplitude = 0.5;
        let norm = 0;
        for (const { grid, frequency, fx, fy } of octaves[channel] ?? []) {
          sum += amplitude * value(grid, frequency, u * fx, v * fy);
          norm += amplitude;
          amplitude *= 0.5;
        }
        const n = Math.min(1, Math.max(0, (sum / norm - 0.5) * 1.8 + 0.5));
        data[(y * SIZE + x) * 4 + channel] = Math.round(n * 255);
      }
    }
  }

  const texture = new DataTexture(data, SIZE, SIZE, RGBAFormat);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}
