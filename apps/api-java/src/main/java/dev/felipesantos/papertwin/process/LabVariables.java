package dev.felipesantos.papertwin.process;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Os ensaios de laboratório, da seção 12.2 da pesquisa B.
 *
 * <p>Escritos à mão, e não lidos de CSV: as células da §12.2 vêm em LaTeX
 * ({@code $\text{g/m}^2$}, {@code $4,3\text{–}5,3$ (Alvo: $4,8$)}), e extrair valor de lá seria
 * regex frágil para doze linhas que não mudam. O que amarra esta lista à fonte é o teste.
 *
 * <p>Nenhum deles é malha nem tem compressão de histórico — é bancada, com norma, instrumento e
 * frequência.
 */
public final class LabVariables {

  /** Os treze ensaios: doze medidos e um derivado. */
  public static final List<LabVariable> ALL =
      List.of(
          new LabVariable(
              "LAB-1201",
              "Gramatura condicionada",
              "g/m²",
              "73,5–76,5 (alvo 75,0)",
              "ISO 536 / TAPPI T 410",
              "Módulo gravimétrico L&W Autoline / balança",
              "A cada bobina mãe (~45 min)",
              "Válvula de massa (FV-105) / offset do QCS (AIC-902)",
              null),
          new LabVariable(
              "LAB-1202",
              "Umidade de estufa",
              "%",
              "4,3–5,3 (alvo 4,8)",
              "ISO 287 / TAPPI T 412",
              "Estufa 105 °C / balança termogravimétrica",
              "1x por turno (auditoria do QCS)",
              "Vapor da pós-secagem (PIC-711/712) / offset da AIC-903",
              null),
          new LabVariable(
              "LAB-1203",
              "Espessura (caliper) e bulk",
              "µm",
              "98–106 µm (1,36 cm³/g)",
              "ISO 534 / TAPPI T 411",
              "Micrômetro motorizado (100 kPa)",
              "A cada bobina mãe (~45 min)",
              "Carga linear da calandra soft (WIC-801)",
              null),
          new LabVariable(
              "LAB-1204",
              "Rugosidade Bendtsen (topo/tela)",
              "mL/min",
              "120–200 (alvo 160)",
              "ISO 8791-2",
              "Rugosímetro Bendtsen automático",
              "A cada bobina mãe (~45 min)",
              "Carga (WIC-801) e temperatura (TIC-802) da calandra",
              null),
          new LabVariable(
              "LAB-1205",
              "Porosidade Gurley (permeância)",
              "s/100mL",
              "12–24 (alvo 16)",
              "ISO 5636-5 / TAPPI T 460",
              "Porosímetro Gurley / módulo de permeância",
              "A cada bobina mãe (~45 min)",
              "Potência de refinação (JIC-101) e amido no film press",
              null),
          new LabVariable(
              "LAB-1206",
              "Resistência à tração MD / CD",
              "kN/m",
              "5,2 MD / 2,4 CD",
              "ISO 1924-2 / TAPPI T 494",
              "Dinamômetro de tração horizontal",
              "A cada 1–2 bobinas (~60 min)",
              "Refinação (JIC-101), jato/tela (XHIC-202) e amido",
              null),
          new LabVariable(
              "LAB-1207",
              "Resistência ao rasgo Elmendorf",
              "mN",
              "480 MD / 560 CD",
              "ISO 1974 / TAPPI T 414",
              "Pêndulo de rasgo Elmendorf digital",
              "2x por turno (~4 h)",
              "Intensidade de refinação (JIC-101) e receita de fibras",
              null),
          new LabVariable(
              "LAB-1208",
              "Teor de cinzas (525 °C)",
              "%",
              "19,0–23,0 (alvo 21,0)",
              "ISO 1762 / TAPPI T 211",
              "Mufla a 525 °C / analisador TGA",
              "2x por turno (~4 h)",
              "Dosagem de PCC (FIC-106) / calibração da AIC-904",
              null),
          new LabVariable(
              "LAB-1209",
              "Alvura ISO / brancura CIE",
              "% ISO",
              "99 % ISO / 162 CIE",
              "ISO 2470-1 / ISO 11475",
              "Espectrofotômetro Elrepho (D65/10°)",
              "A cada bobina mãe (~45 min)",
              "Dosagem de OBA e corantes de matização",
              null),
          new LabVariable(
              "LAB-1210",
              "Opacidade difusa",
              "%",
              "90,0–93,5 (alvo 91,5)",
              "ISO 2471 / TAPPI T 425",
              "Espectrofotômetro Elrepho (R₀/R∞)",
              "A cada bobina mãe (~45 min)",
              "Dosagem de PCC (FIC-106), corante e calandra (WIC-801)",
              null),
          new LabVariable(
              "LAB-1211",
              "Absorção de água Cobb₆₀",
              "g/m²",
              "22,0–28,0 (alvo 25,0)",
              "ISO 535 / TAPPI T 441",
              "Anel Cobb 100 cm² + rolo 10 kg + balança",
              "A cada bobina mãe (~45 min)",
              "Dosagem de cola AKD/ASA e aditivo superficial",
              null),
          new LabVariable(
              "LAB-1212",
              "Encanoamento (curl) A4",
              "mm",
              "−10 a +10 (alvo 0)",
              "ISO 11556 / TAPPI T 520",
              "Gabarito ISO 11556 + copiadora de teste",
              "A cada 1–2 bobinas (~60 min)",
              "Diferencial de vapor da pós-secagem (PDIC-702) e barras (PIC-604A/B)",
              null),
          // Derivada, não medida.
          //
          // A §12.2 mede tração MD e CD no mesmo ensaio (LAB-1206); a razão entre as
          // duas é o que a relação 10 usa para falar de orientação de fibras. Ela tem
          // tag própria porque é a ponta de uma relação, mas herda a frequência do
          // ensaio que a origina — não existe medir a razão sozinha.
          new LabVariable(
              "LAB-1206R",
              "Razão de tração MD/CD",
              "adim.",
              "≈ 2,17 (5,2 MD / 2,4 CD)",
              "ISO 1924-2 / TAPPI T 494",
              "Dinamômetro de tração horizontal",
              "A cada 1–2 bobinas (~60 min)",
              "Relação jato/tela (XHIC-202)",
              "LAB-1206")
);

  private static final Map<String, LabVariable> BY_TAG = index();

  private LabVariables() {}

  private static Map<String, LabVariable> index() {
    var byTag = new LinkedHashMap<String, LabVariable>();
    for (var variable : ALL) {
      byTag.put(variable.tag(), variable);
    }
    return Map.copyOf(byTag);
  }

  /** Busca um ensaio pela tag, ou {@code null}. */
  public static LabVariable get(String tag) {
    return BY_TAG.get(tag);
  }

  /** Se a tag é de um ensaio de laboratório. */
  public static boolean has(String tag) {
    return BY_TAG.containsKey(tag);
  }

  /** Os ensaios medidos direto, sem as tags derivadas. */
  public static List<LabVariable> measured() {
    return ALL.stream().filter(LabVariable::measured).toList();
  }
}
