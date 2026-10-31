import { CD_SIGMA_MM, CD_ZONE_COUNT, CD_ZONE_WIDTH_MM } from '@mp1/shared';

/**
 * O espalhamento lateral do controle CD.
 *
 * A relação 11 da pesquisa B é zona a zona: mexer na válvula de diluição da
 * zona `k` muda a gramatura medida na zona `k`. Mas a correção não fica contida
 * na zona — o jato se abre e vaza para os lados com forma gaussiana de
 * σ ≈ 45 mm, o que é menos de uma zona de largura.
 *
 * **O kernel é normalizado pelo pico, não pela soma.** O `kp` da relação é a
 * resposta *medida na zona k*: um degrau de +10 % na zona k dá −0,8 g/m² ali.
 * Normalizar pela soma espalharia esses −0,8 entre a zona e as vizinhas e a
 * zona corrigida responderia menos do que a pesquisa mediu. Com pico 1, a zona
 * k recebe `kp` cheio e as vizinhas recebem a fração gaussiana — o efeito total
 * sobre a folha é maior que `kp`, e é isso que acontece de verdade.
 */

/**
 * **Metade** do kernel gaussiano, do centro para fora, com pico 1.
 *
 * O índice é o afastamento em zonas: `[0]` é a própria zona e vale sempre 1.
 * Corta em 3σ, onde o peso já caiu a ~1 % — além disso é ruído numérico.
 *
 * Com os valores da lista base — σ 45 mm e zonas de 57,1 mm — 3σ dá 2,36
 * zonas, então o alcance é ±2: este vetor tem **3** elementos
 * (`1 / 0,447 / 0,040`) e o espalhamento inteiro cobre **5** zonas. Não
 * confundir o tamanho do meio kernel com o nº de zonas afetadas.
 */
export function cdKernel(sigmaMm = CD_SIGMA_MM, zoneWidthMm = CD_ZONE_WIDTH_MM): number[] {
  if (!(sigmaMm > 0)) throw new Error(`σ precisa ser maior que zero: ${String(sigmaMm)}`);
  if (!(zoneWidthMm > 0)) {
    throw new Error(`largura de zona precisa ser maior que zero: ${String(zoneWidthMm)}`);
  }

  const reach = Math.floor((3 * sigmaMm) / zoneWidthMm);
  const weights: number[] = [];

  for (let offset = 0; offset <= reach; offset += 1) {
    const distanceMm = offset * zoneWidthMm;
    weights.push(Math.exp(-(distanceMm * distanceMm) / (2 * sigmaMm * sigmaMm)));
  }

  return weights;
}

/**
 * Como um degrau numa zona se distribui pelo perfil.
 *
 * Devolve um peso por zona da folha: 1 na zona corrigida, a fração gaussiana
 * nas vizinhas e 0 fora do alcance. As zonas das bordas **truncam** — o que
 * vazaria para fora da folha simplesmente não existe, e não é redistribuído.
 */
export function spreadAcrossZones(
  zoneIndex: number,
  zoneCount = CD_ZONE_COUNT,
  kernel = cdKernel(),
): number[] {
  if (!Number.isInteger(zoneIndex) || zoneIndex < 0 || zoneIndex >= zoneCount) {
    throw new Error(
      `zona ${String(zoneIndex)} fora da folha, que tem ${String(zoneCount)} zonas (0 a ${String(zoneCount - 1)})`,
    );
  }

  const weights = new Array<number>(zoneCount).fill(0);

  for (const [offset, weight] of kernel.entries()) {
    for (const zone of offset === 0 ? [zoneIndex] : [zoneIndex - offset, zoneIndex + offset]) {
      if (zone >= 0 && zone < zoneCount) weights[zone] = weight;
    }
  }

  return weights;
}

/**
 * O desvio estacionário por zona de um degrau numa zona.
 *
 * O ganho da relação multiplica o degrau e o peso de cada zona, então a zona
 * corrigida recebe `kp · degrau` e as vizinhas uma fração disso.
 */
export function cdSteadyState(
  kp: number,
  stepValue: number,
  zoneIndex: number,
  zoneCount = CD_ZONE_COUNT,
  kernel = cdKernel(),
): number[] {
  return spreadAcrossZones(zoneIndex, zoneCount, kernel).map((weight) => weight * kp * stepValue);
}
