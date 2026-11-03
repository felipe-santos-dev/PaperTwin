package dev.felipesantos.papertwin.operation;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;

/**
 * O quadro de turnos da planta.
 *
 * <p>Três turnos de oito horas a partir das 06:00, letras A, B e C. <b>Suposição</b>: a pesquisa
 * não dá a escala da MP1, e uma quarta letra exigiria a regra de rotação das equipes.
 *
 * <p>O fuso é fixo em −03:00, e isso é deliberado: o Brasil não tem horário de verão desde 2019, e
 * um fuso com regra de verão faria a simulação mudar de resultado quando a base de dados de fusos
 * do sistema fosse atualizada. A grade de turnos de um gêmeo digital não pode depender de qual
 * versão do Java está instalada.
 */
public final class Shifts {

  public static final List<String> LETTERS = List.of("A", "B", "C");

  public static final int SHIFT_HOURS = 8;

  /** O primeiro turno do dia de operação começa às 06:00 locais. */
  public static final int FIRST_SHIFT_START_HOUR = 6;

  public static final int PLANT_UTC_OFFSET_HOURS = -3;

  public static final ZoneOffset PLANT_OFFSET = ZoneOffset.ofHours(PLANT_UTC_OFFSET_HOURS);

  /**
   * Qual turno está correndo num instante, e quando ele começou.
   *
   * @param operationDate dia de operação, no fuso da planta — o dia em que o turno <b>começou</b>,
   *     e não o dia do calendário em que o instante caiu. O turno C vai das 22:00 às 06:00 do dia
   *     seguinte, então às 02:00 de 1º de novembro quem está na máquina é o turno C de 31 de
   *     outubro.
   */
  public record ShiftWindow(
      String id, String letter, LocalDate operationDate, Instant startedAt, Instant endedAt) {}

  private Shifts() {}

  /** O id de um turno: {@code T-2026-06-15-B}. */
  public static String shiftId(LocalDate operationDate, String letter) {
    return "T-%s-%s".formatted(operationDate, letter);
  }

  /** O deslocamento do fuso da planta, como sufixo ISO: {@code -03:00}. */
  public static String plantOffsetSuffix() {
    return "%s%02d:00".formatted(PLANT_UTC_OFFSET_HOURS < 0 ? "-" : "+", Math.abs(PLANT_UTC_OFFSET_HOURS));
  }

  /**
   * Qual turno contém um instante.
   *
   * <p>A conta é feita sobre a hora local da planta porque a borda do turno é um horário de
   * parede: 06:00 em São Paulo, não 09:00 UTC.
   */
  public static ShiftWindow at(Instant instant) {
    var local = instant.atOffset(PLANT_OFFSET);

    double hoursSinceFirstStart =
        ((local.getHour() - FIRST_SHIFT_START_HOUR + 24) % 24)
            + local.getMinute() / 60.0
            + local.getSecond() / 3600.0
            + local.getNano() / 3_600_000_000_000.0;

    int index = (int) Math.floor(hoursSinceFirstStart / SHIFT_HOURS);
    if (index < 0 || index >= LETTERS.size()) {
      throw new IllegalStateException(
          "O quadro de %d turnos de %d h não cobre as 24 h do dia. Mudar um dos dois exige mudar o outro."
              .formatted(LETTERS.size(), SHIFT_HOURS));
    }
    var letter = LETTERS.get(index);

    long startedMs =
        instant.toEpochMilli() - Math.round(hoursSinceFirstStart * 3_600_000);
    var dayStart = Instant.ofEpochMilli(startedMs);
    var operationDate = dayStart.atOffset(PLANT_OFFSET).toLocalDate();

    return new ShiftWindow(
        shiftId(operationDate, letter),
        letter,
        operationDate,
        dayStart.plus(Duration.ofHours((long) index * SHIFT_HOURS)),
        dayStart.plus(Duration.ofHours((long) (index + 1) * SHIFT_HOURS)));
  }

  /** O começo do dia de operação — 06:00 locais. */
  public static Instant dayStart(LocalDate operationDate) {
    return operationDate.atTime(FIRST_SHIFT_START_HOUR, 0).toInstant(PLANT_OFFSET);
  }
}
