import { mkdir, writeFile } from 'node:fs/promises';

import * as geometry from '../src/machine/geometry';
import { MP1 } from '../src/machine/mp1';
import { allAssets, dryerCylinders } from '../src/machine/query';
import { DRYER_STEAM_GROUPS } from '../src/machine/steam-groups';

/**
 * Grava `tools/scene-bake/machine.json`, o contrato entre o modelo e o Blender.
 *
 *     npm run export:machine --workspace @mp1/shared
 *
 * O gerador do Blender não conhece `mp1.ts`: ele lê este arquivo. É o que
 * garante que nenhuma posição de ativo seja escrita no Python — mudar uma
 * medida em `geometry.ts` e rodar este script é o caminho inteiro.
 *
 * Sai daqui, além dos ativos:
 *
 * - **as constantes de `geometry.ts` inteiras**, sem lista à mão: o que o módulo
 *   exporta como dado vai junto, então uma medida nova aparece no Python sem
 *   ninguém tocar neste arquivo;
 * - **as zonas de bake**, que são uma partição do eixo X em trechos sem buraco
 *   nem sobreposição, derivada dos grupos de vapor e das capotas. Elas existem
 *   para a densidade do lightmap não cair: um lightmap só para a máquina de 100 m
 *   daria poucos texels por metro.
 */

const OUT = new URL('../../../tools/scene-bake/machine.json', import.meta.url);

/** Uma zona de bake: um trecho de X com o seu próprio lightmap. */
interface Zone {
  readonly id: string;
  readonly label: string;
  /** `machine` assa junto com a máquina; `building` é o prédio inteiro. */
  readonly group: 'machine' | 'building';
  /** Lado do lightmap em pixels. */
  readonly lightmap: number;
  /** Trecho de X que a zona cobre; `null` no prédio, que não é fatiado. */
  readonly span: { readonly from: number; readonly to: number } | null;
}

const midpoint = (a: number, b: number) => Number(((a + b) / 2).toFixed(3));

/**
 * As zonas, derivadas do modelo.
 *
 * Os limites entre dois grupos de vapor caem no meio do caminho entre o último
 * cilindro de um e o primeiro do outro — assim nenhuma peça fica partida ao
 * meio por uma fronteira, e mover um grupo move a fronteira junto.
 */
function zones(): Zone[] {
  const cylinders = dryerCylinders(MP1);

  /** Extremos em X dos cilindros de cada grupo de vapor. */
  const spans = DRYER_STEAM_GROUPS.map((group) => {
    const xs = cylinders
      .filter((c) => c.number >= group.from && c.number <= group.to)
      .map((c) => c.asset.position[0]);
    return { group, from: Math.min(...xs), to: Math.max(...xs) };
  });

  // Fronteiras fixas, nas folgas entre uma seção e a seguinte.
  const wetSplit = 0;
  const wetToPreDryer = midpoint(geometry.PRESS_X_M, geometry.PRE_DRYER_HOOD.from);
  const preDryerToScanner = midpoint(geometry.PRE_DRYER_HOOD.to, geometry.SCANNER_1_X_M);
  const sizerToPostDryer = midpoint(geometry.SIZER_X_M, geometry.POST_DRYER_HOOD.from);
  const postDryerToCalender = midpoint(geometry.POST_DRYER_HOOD.to, geometry.CALENDER_X_M);

  /** Onde cada grupo de vapor começa e acaba, já encaixado nas fronteiras fixas. */
  const groupEdges = spans.map((span, index) => {
    const previous = spans[index - 1];
    const next = spans[index + 1];
    const sameSectionBefore = previous?.group.section === span.group.section;
    const sameSectionAfter = next?.group.section === span.group.section;

    return {
      id: span.group.id,
      section: span.group.section,
      from: sameSectionBefore
        ? midpoint(previous.to, span.from)
        : span.group.section === 'pre-dryer'
          ? wetToPreDryer
          : sizerToPostDryer,
      to: sameSectionAfter
        ? midpoint(span.to, next.from)
        : span.group.section === 'pre-dryer'
          ? preDryerToScanner
          : postDryerToCalender,
    };
  });

  const machine = (id: string, label: string, from: number, to: number): Zone => ({
    id,
    label,
    group: 'machine',
    lightmap: 2048,
    span: { from, to },
  });

  return [
    machine('umida-formacao', 'Caixa de entrada e formação', geometry.BUILDING_X0_M, wetSplit),
    machine('umida-prensas', 'Prensas', wetSplit, wetToPreDryer),
    ...groupEdges.map((edge) =>
      machine(edge.id.toLowerCase(), `Grupo de vapor ${edge.id}`, edge.from, edge.to),
    ),
    machine('scanner-sizer', 'Scanner 1 e Speed Sizer', preDryerToScanner, sizerToPostDryer),
    machine(
      'acabamento',
      'Calandra, scanner final e Pope',
      postDryerToCalender,
      geometry.BUILDING_X1_M,
    ),
    {
      id: 'predio',
      label: 'Prédio',
      group: 'building',
      lightmap: 2048,
      span: null,
    } satisfies Zone,
  ].sort((a, b) => (a.span?.from ?? Infinity) - (b.span?.from ?? Infinity));
}

/**
 * As constantes de `geometry.ts`, sem lista à mão.
 *
 * Mesma regra de `provenance.test.ts`: o que não é função é medida. Assim o
 * Python recebe toda medida nova de graça, e o teste de proveniência continua
 * sendo o que cobra a origem de cada uma.
 */
function measurements(): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(geometry).filter(([, value]) => typeof value !== 'function'),
  );
}

/** Verifica que as zonas cobrem o eixo X sem buraco nem sobreposição. */
function checkZones(all: Zone[]): void {
  const spans = all.filter((zone) => zone.span !== null).map((zone) => zone.span!);

  for (const [index, span] of spans.entries()) {
    if (span.to <= span.from) {
      throw new Error(`Zona ${all[index]?.id ?? '?'} com trecho invertido.`);
    }
    const previous = spans[index - 1];
    if (previous && previous.to !== span.from) {
      throw new Error(
        `Zonas não encostam: ${String(previous.to)} → ${String(span.from)}. ` +
          'Uma fronteira mudou e deixou buraco ou sobreposição.',
      );
    }
  }

  const assets = allAssets(MP1);
  for (const asset of assets) {
    const x = asset.position[0];
    const covering = spans.filter((span) => x >= span.from && x <= span.to);
    if (covering.length === 0) throw new Error(`${asset.tag} em x=${String(x)} fora de toda zona.`);
  }
}

const all = zones();
checkZones(all);

const payload = {
  /** Para o Python falhar cedo se o contrato mudar de forma. */
  schema: 1,
  generatedBy: 'packages/shared/scripts/export-machine-model.ts',
  model: MP1,
  steamGroups: DRYER_STEAM_GROUPS,
  measurements: measurements(),
  zones: all,
};

await mkdir(new URL('.', OUT), { recursive: true });
await writeFile(OUT, `${JSON.stringify(payload, null, 1)}\n`, 'utf8');

const bearings = allAssets(MP1).filter((asset) => asset.kind === 'bearing').length;
process.stdout.write(
  `machine.json: ${String(allAssets(MP1).length)} ativos (${String(bearings)} mancais), ` +
    `${String(Object.keys(payload.measurements).length)} medidas, ${String(all.length)} zonas\n`,
);
