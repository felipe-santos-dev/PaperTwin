package dev.felipesantos.papertwin.operation;

import dev.felipesantos.papertwin.catalog.ProcessCatalog;
import dev.felipesantos.papertwin.operation.Shifts.ShiftWindow;
import dev.felipesantos.papertwin.simulation.Noise;
import dev.felipesantos.papertwin.simulation.OperatingPoint;
import dev.felipesantos.papertwin.simulation.ProcessEngine;
import dev.felipesantos.papertwin.simulation.SimClock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * Os cenários do turno: o que acontece, e quando, sem nada guardado.
 *
 * <p>Tudo aqui é função de (semente, instante). Um plano de turno não é sorteado ao vivo nem
 * guardado em tabela: ele é <b>calculado</b> a partir do dia e da letra do turno, então a API que
 * dorme e acorda chega ao mesmo plano, e o instantâneo do modo de demonstração conta a mesma
 * história que a API ao vivo.
 *
 * <p>O que o plano <b>não</b> faz é escrever o que as tags fizeram. A quebra de folha declara qual
 * malha foi perturbada e quando; os sinais dos 10 min anteriores saem do que o processo de verdade
 * fez com aquela perturbação. É a diferença entre um gêmeo digital e uma animação.
 */
public final class Scenarios {

  /** Diâmetro em que a bobina é trocada, em mm. */
  public static final double REEL_CHANGE_DIAMETER_MM = 3000;

  private Scenarios() {}

  // ----------------------------------------------------------- bobinas ----

  /**
   * Quanto papel cabe numa bobina, pela geometria.
   *
   * <p>A área da seção do rolo cresce com o papel enrolado: {@code π/4 · (d² − d₀²) = L ·
   * espessura}. Com o diâmetro de troca de 3.000 mm, o núcleo de 600 mm e a espessura de 102 µm,
   * dá ~66,5 km de papel.
   *
   * <p><b>A pesquisa diz "~45 min" por bobina, e esta conta dá ~53 min a 1.250 m/min.</b> Os dois
   * números não cabem juntos, e o desempate é que um é prosa aproximada, na coluna de frequência
   * de amostragem do laboratório, e o outro sai de três valores especificados que qualquer um pode
   * conferir. Fica anotado como pendência: com 1,2 m de núcleo a conta dá 46 min.
   */
  public static double reelLengthM() {
    var core = coreDiameterMm() / 1000;
    var finalDiameter = REEL_CHANGE_DIAMETER_MM / 1000;
    var caliper = OperatingPoint.require("AIC-905") / 1e6;

    return Math.PI / 4 * ((finalDiameter * finalDiameter - core * core) / caliper);
  }

  private static double coreDiameterMm() {
    var variable = ProcessCatalog.get("ZI-1004");
    return variable == null ? 600 : variable.min();
  }

  /** Duração nominal de uma bobina, em segundos, à velocidade de operação. */
  public static double reelDurationS() {
    return reelLengthM() / OperatingPoint.require("SIC-1104") * 60;
  }

  /**
   * A grade das bobinas, em passos.
   *
   * <p>É a duração <b>nominal</b>: a velocidade e a espessura variam, então a bobina de verdade
   * fecha um pouco antes ou depois. A grade existe para o nº da bobina ser função do instante —
   * sem ela, numerar bobinas exigiria um contador guardado, e um contador guardado perde o fio
   * quando o processo dorme.
   */
  public static final long REEL_TICKS = SimClock.secondsToTicks(reelDurationS());

  /** O passo em que a simulação começa a contar bobinas. */
  private static final long REEL_EPOCH_TICK = SimClock.tickAt(Instant.ofEpochMilli(SimClock.SIM_EPOCH_MS));

  public record ReelPlan(int number, long startTick, long endTick) {}

  /** A bobina que está sendo enrolada num passo. */
  public static ReelPlan reelAt(long tick) {
    long index = Math.floorDiv(tick - REEL_EPOCH_TICK, REEL_TICKS);
    long startTick = REEL_EPOCH_TICK + index * REEL_TICKS;

    return new ReelPlan((int) (index + 1), startTick, startTick + REEL_TICKS);
  }

  /**
   * O diâmetro da bobina num passo, pela geometria.
   *
   * <p>Cresce com a raiz do papel enrolado, e não em linha reta: as primeiras voltas engrossam o
   * rolo muito mais rápido que as últimas. É o que faz a curva de diâmetro da Pope ter a forma que
   * tem, e é por isso que a carga do nip é programada por diâmetro.
   */
  public static double reelDiameterMm(long tick, ReelPlan plan) {
    double progress = progressIn(tick, plan);
    double core = coreDiameterMm();

    return Math.sqrt(
        core * core + progress * (REEL_CHANGE_DIAMETER_MM * REEL_CHANGE_DIAMETER_MM - core * core));
  }

  /** O comprimento de papel enrolado até um passo, em metros. */
  public static double reelWoundM(long tick, ReelPlan plan) {
    return reelLengthM() * progressIn(tick, plan);
  }

  private static double progressIn(long tick, ReelPlan plan) {
    return Math.min(1, Math.max(0, (double) (tick - plan.startTick()) / REEL_TICKS));
  }

  // -------------------------------------------------- troca de gramatura ----

  /**
   * A troca de gramatura: uma por dia de operação, no turno B.
   *
   * <p><b>Suposição.</b> A pesquisa não diz com que frequência a MP1 troca de gramatura. Uma por
   * dia é o que uma máquina de papel de embalagem costuma fazer, e é frequente o bastante para a
   * tela de Turno ter o que mostrar sem virar uma máquina que nunca produz em regime.
   *
   * <p>As duas gramaturas são as que o catálogo dá: 75 g/m² é o alvo da {@code AIC-902}, e 80 está
   * dentro da faixa 68–92. O sentido alterna por dia, para a máquina não ficar subindo de
   * gramatura para sempre.
   */
  public static final String GRADE_CHANGE_SHIFT = "B";

  public static final int GRADE_CHANGE_HOUR_INTO_SHIFT = 3;

  public static final double ALTERNATE_GSM = 80;

  public record GradeChangePlan(long startTick, double fromGsm, double toGsm) {}

  /** Dias desde o início da simulação, para alternar o sentido da troca. */
  private static long daysSinceEpoch(LocalDate operationDate) {
    long ms = operationDate.atStartOfDay(java.time.ZoneOffset.UTC).toInstant().toEpochMilli();
    return Math.round((ms - SimClock.SIM_EPOCH_MS) / 86_400_000.0);
  }

  /** A troca de gramatura do turno, ou {@code null} se este turno não tem. */
  public static GradeChangePlan gradeChangeOf(ShiftWindow shift) {
    if (!GRADE_CHANGE_SHIFT.equals(shift.letter())) {
      return null;
    }

    double base = OperatingPoint.require("AIC-902");
    boolean rising = daysSinceEpoch(shift.operationDate()) % 2 == 0;

    return new GradeChangePlan(
        SimClock.tickAt(shift.startedAt()) + GRADE_CHANGE_HOUR_INTO_SHIFT * SimClock.TICKS_PER_HOUR,
        rising ? base : ALTERNATE_GSM,
        rising ? ALTERNATE_GSM : base);
  }

  /** O passo em que a troca de gramatura de um dia de operação acontece. */
  private static long gradeChangeTickOf(LocalDate operationDate) {
    int shiftIndex = Shifts.LETTERS.indexOf(GRADE_CHANGE_SHIFT);
    long dayStart = SimClock.tickAt(Shifts.dayStart(operationDate));

    return dayStart
        + (shiftIndex * 8L + GRADE_CHANGE_HOUR_INTO_SHIFT) * SimClock.TICKS_PER_HOUR;
  }

  /**
   * A gramatura que está valendo num passo.
   *
   * <p>É preciso porque a troca de gramatura é <b>evento</b>, e um evento só move o processo se o
   * processo estiver no estado de antes dele. Sem isto, um motor montado num dia em que a troca é
   * de 80 para 75 arrancaria em 75 e a "troca" não moveria nada — a tela mostraria uma transição
   * que não aconteceu.
   *
   * <p>A conta olha a troca de hoje e a de ontem, e pega a última que já passou: como as trocas
   * alternam de sentido por dia, o estado de agora é o destino da última troca.
   */
  public static double gradeInEffectAt(long tick) {
    double base = OperatingPoint.require("AIC-902");
    var today = Shifts.at(SimClock.tickTime(tick)).operationDate();
    var yesterday = today.minusDays(1);

    double grade = base;
    for (var day : List.of(yesterday, today)) {
      if (gradeChangeTickOf(day) <= tick) {
        grade = daysSinceEpoch(day) % 2 == 0 ? ALTERNATE_GSM : base;
      }
    }

    return grade;
  }

  // -------------------------------------------------------- quebra de folha ----

  /**
   * As quebras de folha que o cenário sabe produzir.
   *
   * <p>Cada uma declara <b>qual malha é perturbada e para onde</b>, e é só isso: os sinais dos 10
   * min anteriores não são escritos aqui, são o que o processo faz com a perturbação. A causa
   * provável é a frase que quem opera anotaria, e pode não bater com os sinais — é o que acontece
   * de verdade, e o modelo guarda as duas coisas separadas.
   */
  public record BreakCause(String section, String probableCause, String upsetTag, double upsetSetpoint) {}

  private static final List<BreakCause> BREAK_CAUSES =
      List.of(
          // sifões alagando: o condensado não sai e a folha descola
          new BreakCause("post-dryer", "descolamento na entrada da pós-secagem", "PDIC-721", 26),
          new BreakCause(
              "pre-dryer", "folha presa no cilindro depois de alagamento de sifão", "PDIC-524", 17),
          new BreakCause("press", "perda de vácuo na prensa de sapata", "WIC-401", 640),
          new BreakCause(
              "speed-sizer", "filme de amido irregular com a barra muito aberta", "PIC-604A", 0.9));

  /**
   * Quanto antes da quebra a perturbação começa, em segundos.
   *
   * <p>Igual à janela de sinais da LISTA-BASE: os 10 min anteriores. Não é coincidência — a janela
   * existe porque é nela que os sinais aparecem, e o cenário põe a perturbação exatamente onde
   * quem investiga vai olhar.
   */
  public static final int UPSET_LEAD_S = 600;

  /** Quanto tempo a máquina fica parada numa quebra, em segundos. <b>Suposição</b>. */
  public static final int BREAK_DURATION_S = 22 * 60;

  public record BreakPlan(
      BreakCause cause, long startTick, long endTick, long upsetTick) {}

  /**
   * Uma quebra por dia de operação, no turno que o dia escolher.
   *
   * <p><b>Suposição.</b> Uma máquina de papel bem cuidada tem de uma a três quebras por dia; uma
   * por dia é conservador. O turno e o momento dentro dele saem do ruído por posição, então variam
   * entre dias e não entre execuções.
   */
  public static BreakPlan webBreakOf(int seed, ShiftWindow shift) {
    int stream = Noise.streamOf(shift.operationDate().toString());
    int letterIndex = Shifts.LETTERS.indexOf(shift.letter());
    int chosen = (int) Math.floor(Noise.unit(seed, 0, stream, 1) * 3);
    if (chosen != letterIndex) {
      return null;
    }

    long shiftStart = SimClock.tickAt(shift.startedAt());
    long shiftTicks = SimClock.tickAt(shift.endedAt()) - shiftStart;

    // a quebra fica na metade do meio do turno, longe das bordas: uma quebra
    // exatamente na troca de turno deixaria a passagem sem dono
    double offset = 0.25 + Noise.unit(seed, 0, stream, 2) * 0.5;
    long startTick = shiftStart + (long) Math.floor(shiftTicks * offset);

    var cause = BREAK_CAUSES.get((int) Math.floor(Noise.unit(seed, 0, stream, 3) * BREAK_CAUSES.size()));

    return new BreakPlan(
        cause,
        startTick,
        startTick + SimClock.secondsToTicks(BREAK_DURATION_S),
        startTick - SimClock.secondsToTicks(UPSET_LEAD_S));
  }

  // ---------------------------------------------------------------- ronda ----

  /**
   * A ronda: uma por turno, duas horas depois do começo.
   *
   * <p><b>Suposição</b> na frequência e no horário. Os pontos são os mancais do grupo principal da
   * secagem mais o que estiver em alarme — a ronda de verdade segue um roteiro fixo e desvia para
   * onde há notícia, e é isso que está imitado aqui.
   */
  public static final int ROUND_HOUR_INTO_SHIFT = 2;

  public static final int ROUND_DURATION_S = 40 * 60;

  public record RoundPlan(long startTick, long endTick) {}

  public static RoundPlan roundOf(ShiftWindow shift) {
    long startTick =
        SimClock.tickAt(shift.startedAt()) + ROUND_HOUR_INTO_SHIFT * SimClock.TICKS_PER_HOUR;
    return new RoundPlan(startTick, startTick + SimClock.secondsToTicks(ROUND_DURATION_S));
  }

  // ------------------------------------------------------- o plano inteiro ----

  /** Tudo que um turno tem planejado. */
  public record ShiftPlan(
      ShiftWindow shift,
      long startTick,
      long endTick,
      List<ReelPlan> reels,
      GradeChangePlan gradeChange,
      BreakPlan webBreak,
      RoundPlan round) {}

  /** O plano de um turno, calculado do dia e da letra. */
  public static ShiftPlan shiftPlan(int seed, ShiftWindow shift) {
    long startTick = SimClock.tickAt(shift.startedAt());
    long endTick = SimClock.tickAt(shift.endedAt());

    var reels = new ArrayList<ReelPlan>();
    var cursor = reelAt(startTick);
    while (cursor.startTick() < endTick) {
      reels.add(cursor);
      cursor = reelAt(cursor.endTick());
    }

    return new ShiftPlan(
        shift,
        startTick,
        endTick,
        List.copyOf(reels),
        gradeChangeOf(shift),
        webBreakOf(seed, shift),
        roundOf(shift));
  }

  /** O plano do turno que contém um passo. */
  public static ShiftPlan planAt(int seed, long tick) {
    return shiftPlan(seed, Shifts.at(SimClock.tickTime(tick)));
  }

  /** Produção nominal de um turno, em toneladas, para a eficiência ter base. */
  public static double nominalShiftProductionT(ShiftWindow shift) {
    double hours = Duration.between(shift.startedAt(), shift.endedAt()).toMillis() / 3_600_000.0;
    double speed = OperatingPoint.require("SIC-1104");
    double basisWeight = OperatingPoint.require("AIC-902");

    return ProcessEngine.WEB_WIDTH_M * speed * basisWeight * 60 / 1e6 * hours;
  }

  /** O passo do fim da janela de um turno, para quem precisa fatiar a retomada. */
  public static final long SHIFT_TICKS = 8 * SimClock.TICKS_PER_HOUR;
}
