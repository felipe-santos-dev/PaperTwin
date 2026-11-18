import type { LabVariable } from './relation-types';

/**
 * Os ensaios de laboratório, da seção 12.2 da pesquisa B.
 *
 * Escritos à mão, e não gerados: as células da §12.2 vêm em LaTeX
 * (`$\\text{g/m}^2$`, `$4,3\\text{–}5,3$ (Alvo: $4,8$)`), e extrair valor de lá
 * seria regex frágil para doze linhas que não mudam. O que amarra esta lista à
 * fonte é o teste: ele lê a coluna de TAG da tabela da §12.2 e exige que as
 * duas listas coincidam, então um ensaio novo na pesquisa quebra o teste.
 *
 * Nenhum deles é malha nem tem compressão de histórico — é bancada, com norma,
 * instrumento e frequência.
 */
export const LAB_VARIABLES: readonly LabVariable[] = [
  {
    tag: 'LAB-1201',
    name: 'Gramatura condicionada',
    unit: 'g/m²',
    range: '73,5–76,5 (alvo 75,0)',
    standard: 'ISO 536 / TAPPI T 410',
    instrument: 'Módulo gravimétrico L&W Autoline / balança',
    sampling: 'A cada bobina mãe (~45 min)',
    correction: 'Válvula de massa (FV-105) / offset do QCS (AIC-902)',
    source: 'B',
    derivedFrom: null,
  },
  {
    tag: 'LAB-1202',
    name: 'Umidade de estufa',
    unit: '%',
    range: '4,3–5,3 (alvo 4,8)',
    standard: 'ISO 287 / TAPPI T 412',
    instrument: 'Estufa 105 °C / balança termogravimétrica',
    sampling: '1x por turno (auditoria do QCS)',
    correction: 'Vapor da pós-secagem (PIC-711/712) / offset da AIC-903',
    source: 'B',
    derivedFrom: null,
  },
  {
    tag: 'LAB-1203',
    name: 'Espessura (caliper) e bulk',
    unit: 'µm',
    range: '98–106 µm (1,36 cm³/g)',
    standard: 'ISO 534 / TAPPI T 411',
    instrument: 'Micrômetro motorizado (100 kPa)',
    sampling: 'A cada bobina mãe (~45 min)',
    correction: 'Carga linear da calandra soft (WIC-801)',
    source: 'B',
    derivedFrom: null,
  },
  {
    tag: 'LAB-1204',
    name: 'Rugosidade Bendtsen (topo/tela)',
    unit: 'mL/min',
    range: '120–200 (alvo 160)',
    standard: 'ISO 8791-2',
    instrument: 'Rugosímetro Bendtsen automático',
    sampling: 'A cada bobina mãe (~45 min)',
    correction: 'Carga (WIC-801) e temperatura (TIC-802) da calandra',
    source: 'B',
    derivedFrom: null,
  },
  {
    tag: 'LAB-1205',
    name: 'Porosidade Gurley (permeância)',
    unit: 's/100mL',
    range: '12–24 (alvo 16)',
    standard: 'ISO 5636-5 / TAPPI T 460',
    instrument: 'Porosímetro Gurley / módulo de permeância',
    sampling: 'A cada bobina mãe (~45 min)',
    correction: 'Potência de refinação (JIC-101) e amido no film press',
    source: 'B',
    derivedFrom: null,
  },
  {
    tag: 'LAB-1206',
    name: 'Resistência à tração MD / CD',
    unit: 'kN/m',
    range: '5,2 MD / 2,4 CD',
    standard: 'ISO 1924-2 / TAPPI T 494',
    instrument: 'Dinamômetro de tração horizontal',
    sampling: 'A cada 1–2 bobinas (~60 min)',
    correction: 'Refinação (JIC-101), jato/tela (XHIC-202) e amido',
    source: 'B',
    derivedFrom: null,
  },
  {
    tag: 'LAB-1207',
    name: 'Resistência ao rasgo Elmendorf',
    unit: 'mN',
    range: '480 MD / 560 CD',
    standard: 'ISO 1974 / TAPPI T 414',
    instrument: 'Pêndulo de rasgo Elmendorf digital',
    sampling: '2x por turno (~4 h)',
    correction: 'Intensidade de refinação (JIC-101) e receita de fibras',
    source: 'B',
    derivedFrom: null,
  },
  {
    tag: 'LAB-1208',
    name: 'Teor de cinzas (525 °C)',
    unit: '%',
    range: '19,0–23,0 (alvo 21,0)',
    standard: 'ISO 1762 / TAPPI T 211',
    instrument: 'Mufla a 525 °C / analisador TGA',
    sampling: '2x por turno (~4 h)',
    correction: 'Dosagem de PCC (FIC-106) / calibração da AIC-904',
    source: 'B',
    derivedFrom: null,
  },
  {
    tag: 'LAB-1209',
    name: 'Alvura ISO / brancura CIE',
    unit: '% ISO',
    range: '99 % ISO / 162 CIE',
    standard: 'ISO 2470-1 / ISO 11475',
    instrument: 'Espectrofotômetro Elrepho (D65/10°)',
    sampling: 'A cada bobina mãe (~45 min)',
    correction: 'Dosagem de OBA e corantes de matização',
    source: 'B',
    derivedFrom: null,
  },
  {
    tag: 'LAB-1210',
    name: 'Opacidade difusa',
    unit: '%',
    range: '90,0–93,5 (alvo 91,5)',
    standard: 'ISO 2471 / TAPPI T 425',
    instrument: 'Espectrofotômetro Elrepho (R₀/R∞)',
    sampling: 'A cada bobina mãe (~45 min)',
    correction: 'Dosagem de PCC (FIC-106), corante e calandra (WIC-801)',
    source: 'B',
    derivedFrom: null,
  },
  {
    tag: 'LAB-1211',
    name: 'Absorção de água Cobb₆₀',
    unit: 'g/m²',
    range: '22,0–28,0 (alvo 25,0)',
    standard: 'ISO 535 / TAPPI T 441',
    instrument: 'Anel Cobb 100 cm² + rolo 10 kg + balança',
    sampling: 'A cada bobina mãe (~45 min)',
    correction: 'Dosagem de cola AKD/ASA e aditivo superficial',
    source: 'B',
    derivedFrom: null,
  },
  {
    tag: 'LAB-1212',
    name: 'Encanoamento (curl) A4',
    unit: 'mm',
    range: '−10 a +10 (alvo 0)',
    standard: 'ISO 11556 / TAPPI T 520',
    instrument: 'Gabarito ISO 11556 + copiadora de teste',
    sampling: 'A cada 1–2 bobinas (~60 min)',
    correction: 'Diferencial de vapor da pós-secagem (PDIC-702) e barras (PIC-604A/B)',
    source: 'B',
    derivedFrom: null,
  },

  /**
   * Derivada, não medida.
   *
   * A §12.2 mede tração MD e CD no mesmo ensaio (`LAB-1206`); a razão entre as
   * duas é o que a relação 10 usa para falar de orientação de fibras. Ela
   * aparece aqui com tag própria porque é a ponta de uma relação, mas herda a
   * frequência do ensaio que a origina — não existe medir a razão sozinha.
   */
  {
    tag: 'LAB-1206R',
    name: 'Razão de tração MD/CD',
    unit: 'adim.',
    range: '≈ 2,17 (5,2 MD / 2,4 CD)',
    standard: 'ISO 1924-2 / TAPPI T 494',
    instrument: 'Dinamômetro de tração horizontal',
    sampling: 'A cada 1–2 bobinas (~60 min)',
    correction: 'Relação jato/tela (XHIC-202)',
    source: 'B',
    derivedFrom: 'LAB-1206',
  },
  /**
   * Os sete da Fase 3, que a §12.2 não tem.
   *
   * O engenheiro de processo lista, para o rolo jumbo, ensaios que a pesquisa B
   * não cobre. Eles entram com `source: 'assumed'` — faixa e alvo saem de
   * literatura pública de papel para imprimir e escrever, não da pesquisa — e é
   * esse campo que mantém o teste da §12.2 honesto: ele compara a tabela da
   * pesquisa com os ensaios de fonte `B`, e estes sete ficam de fora da
   * comparação em vez de afrouxá-la.
   *
   * Nenhum deles é movido por relação: são dado fixo no laboratório, com selo,
   * até alguém ter física para colocar atrás deles.
   */
  {
    tag: 'LAB-1213',
    name: 'Cor L*a*b*',
    unit: 'adim.',
    range: 'L* 92–96 (alvo 94)',
    standard: 'ISO 5631 / TAPPI T 527',
    instrument: 'Espectrofotômetro de bancada, D65/10°',
    sampling: 'A cada 4 bobinas (~3 h)',
    correction: 'Dosagem de OBA (FIC-110) e carga mineral',
    source: 'assumed',
    derivedFrom: null,
  },
  {
    tag: 'LAB-1214',
    name: 'Dureza superficial',
    unit: 'N',
    range: '120–260 (alvo 190)',
    standard: 'TAPPI T 834',
    instrument: 'Durômetro de bancada com esfera',
    sampling: 'A cada 4 bobinas (~3 h)',
    correction: 'Carga do nip da calandra (WIC-801)',
    source: 'assumed',
    derivedFrom: null,
  },
  {
    tag: 'LAB-1215',
    name: 'Rigidez Taber',
    unit: 'mN·m',
    range: '0,8–2,2 (alvo 1,4)',
    standard: 'ISO 2493 / TAPPI T 489',
    instrument: 'Rigidímetro Taber, 15°',
    sampling: 'A cada 4 bobinas (~3 h)',
    correction: 'Gramatura (AIC-902) e calandragem (WIC-801)',
    source: 'assumed',
    derivedFrom: null,
  },
  {
    tag: 'LAB-1216',
    name: 'Resistência ao arrebentamento',
    unit: 'kPa',
    range: '180–320 (alvo 240)',
    standard: 'ISO 2758 / TAPPI T 403',
    instrument: 'Mullen de diafragma',
    sampling: 'A cada 2 bobinas (~1,5 h)',
    correction: 'Energia de refino (JIC-101)',
    source: 'assumed',
    derivedFrom: null,
  },
  {
    tag: 'LAB-1217',
    name: 'Ligação interna Scott Bond',
    unit: 'J/m²',
    range: '120–280 (alvo 190)',
    standard: 'TAPPI T 569',
    instrument: 'Scott Bond de pêndulo',
    sampling: 'A cada 4 bobinas (~3 h)',
    correction: 'Energia de refino (JIC-101) e amido de superfície (XI-606A/B)',
    source: 'assumed',
    derivedFrom: null,
  },
  {
    tag: 'LAB-1218',
    name: 'Desprendimento de pó',
    unit: 'adim.',
    range: '0–5 (alvo 1,8)',
    standard: 'IGT A2 (escala 0–5)',
    instrument: 'IGT com tinta de alta pega',
    sampling: 'A cada 8 bobinas (~6 h)',
    correction: 'Amido de superfície (XI-606A/B) e carga mineral',
    source: 'assumed',
    derivedFrom: null,
  },
  {
    tag: 'LAB-1219',
    name: 'Sujidade',
    unit: 'mm²/m²',
    range: '0–8 (alvo 2,0)',
    standard: 'ISO 5350-2 / TAPPI T 437',
    instrument: 'Mesa de contagem com gabarito',
    sampling: 'A cada 8 bobinas (~6 h)',
    correction: 'Depuração (JI-151) e troca de telas',
    source: 'assumed',
    derivedFrom: null,
  },
];

const BY_TAG = new Map(LAB_VARIABLES.map((variable) => [variable.tag, variable]));

/** Busca um ensaio pela tag, ou `null`. */
export function labVariable(tag: string): LabVariable | null {
  return BY_TAG.get(tag) ?? null;
}

/** Se a tag é de um ensaio de laboratório. */
export function isLabTag(tag: string): boolean {
  return BY_TAG.has(tag);
}

/** Os ensaios medidos direto, sem as tags derivadas. */
export function measuredLabVariables(): LabVariable[] {
  return LAB_VARIABLES.filter((variable) => variable.derivedFrom === null);
}
