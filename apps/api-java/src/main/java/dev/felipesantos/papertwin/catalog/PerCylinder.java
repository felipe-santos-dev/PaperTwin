package dev.felipesantos.papertwin.catalog;

import java.util.regex.Pattern;

/**
 * A gramática do marcador {@code nn} dos padrões por cilindro.
 *
 * <p>No CSV, uma variável que existe uma vez por cilindro aparece numa linha só, com {@code nn} no
 * lugar do número: a tag {@code VI-51nnA} vale para os 36 cilindros.
 *
 * <p>O marcador é reconhecido por posição, nunca por substring solta, e o motivo está no próprio
 * catálogo: <b>"scanner" contém "nn"</b>. Um {@code tag.contains("nn")} classificaria {@code
 * AIC-901} ("Umidade antes da colagem · scanner 1") como padrão por cilindro, e um {@code
 * name.replace("nn", "7")} escreveria "sca7er". Daí a tag ser casada com uma âncora e o nome com
 * {@code \b}.
 */
public final class PerCylinder {

  /** {@code VI-51nnA}, {@code TI-52nn} — o {@code nn} vem depois dos dígitos, com lado opcional. */
  private static final Pattern TAG = Pattern.compile("^([A-Z]+-\\d+)nn([AB]?)$");

  /** O {@code nn} como palavra inteira, que é como ele aparece nos nomes. */
  private static final Pattern NAME = Pattern.compile("\\bnn\\b");

  private PerCylinder() {}

  /** Se a tag é de um padrão por cilindro. */
  public static boolean isTag(String tag) {
    return TAG.matcher(tag).matches();
  }

  /** Se o nome tem o marcador. */
  public static boolean isName(String name) {
    return NAME.matcher(name).find();
  }

  /**
   * A tag do padrão aplicada a um cilindro: {@code VI-51nnA} + 7 → {@code VI-5107A}.
   *
   * <p>Dois dígitos, para a ordem alfabética das tags bater com a numérica — a mesma razão pela
   * qual o modelo da máquina usa {@code MP1-SEC-G1-CS07}.
   */
  public static String expandTag(String tagPattern, int cylinder) {
    var parsed = TAG.matcher(tagPattern);
    if (!parsed.matches()) {
      throw new IllegalArgumentException(
          "Tag de padrão por cilindro fora do formato esperado: " + tagPattern);
    }
    return "%s%02d%s".formatted(parsed.group(1), cylinder, parsed.group(2));
  }

  /**
   * O nome do padrão aplicado a um cilindro.
   *
   * <p>Aqui o número vai como se fala — "cilindro 7", não "cilindro 07" — igual ao rótulo {@code
   * Cilindro secador 7} do modelo da máquina.
   */
  public static String expandName(String namePattern, int cylinder) {
    var matcher = NAME.matcher(namePattern);
    if (!matcher.find()) {
      throw new IllegalArgumentException(
          "Nome de padrão por cilindro sem o marcador nn: " + namePattern);
    }
    return matcher.reset().replaceFirst(String.valueOf(cylinder));
  }
}
