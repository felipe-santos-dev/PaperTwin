package dev.felipesantos.papertwin.runtime;

import dev.felipesantos.papertwin.alarm.Alarm;
import dev.felipesantos.papertwin.alarm.AlarmPriority;
import dev.felipesantos.papertwin.catalog.ProcessCatalog;
import dev.felipesantos.papertwin.db.HistorianRepository;
import dev.felipesantos.papertwin.db.OperationsRepository;
import dev.felipesantos.papertwin.historian.HistorianPoints;
import dev.felipesantos.papertwin.historian.Samples;
import dev.felipesantos.papertwin.operation.Entities;
import dev.felipesantos.papertwin.operation.Scenarios;
import dev.felipesantos.papertwin.operation.Shifts;
import dev.felipesantos.papertwin.process.BearingTags;
import dev.felipesantos.papertwin.simulation.Noise;
import dev.felipesantos.papertwin.simulation.ProcessEngine;
import dev.felipesantos.papertwin.simulation.SimClock;
import dev.felipesantos.papertwin.vibration.Iso20816;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * A colheita: as entidades de operação derivadas do que ficou no arquivo.
 *
 * <p>Nada aqui é acumulado em memória durante a simulação. A gramatura média de uma bobina é uma
 * <b>consulta ao historiador</b> na janela dela, e por isso a colheita acontece depois de o
 * arquivo estar gravado — colher antes daria bobinas sem gramatura.
 *
 * <p>Os ids são derivados do passo, e não sorteados: bobina pelo número da grade, turno pelo dia e
 * pela letra, quebra e troca e ronda pelo passo em que começaram. É isso que transforma uma
 * reexecução em nada, porque o {@code upsert} do repositório reencontra a mesma linha.
 */
public final class Harvest {

  /**
   * De quanto em quanto tempo as entidades são recolhidas, em passos.
   *
   * <p>Cinco minutos. A colheita lê o arquivo de cada tag pela janela do turno — até oito horas
   * — e reescreve as entidades dele. Isso custa alguns segundos, e rodá-la em <b>toda</b>
   * retomada fazia cada requisição pagar esse preço: a janela de frescor é de cinco segundos,
   * então duas telas abertas com seis segundos de intervalo colhiam duas vezes a mesma coisa.
   * Medido: um {@code /assets/…} que deveria custar milissegundos levava <b>11 s</b>.
   */
  public static final long HARVEST_EVERY_TICKS = 5 * SimClock.TICKS_PER_MINUTE;

  /**
   * Se vale colher nesta janela.
   *
   * <p>Duas razões para colher, e nenhuma delas é "passou tempo":
   *
   * <ol>
   *   <li><b>Uma fronteira caiu dentro.</b> Uma bobina fechou, um turno virou, uma ronda
   *       terminou, uma quebra começou ou acabou, uma troca de gramatura começou. São os
   *       instantes em que uma entidade nasce ou muda de estado, e eles saem do plano —
   *       aritmética pura, sem banco.
   *   <li><b>A janela cruzou a grade de cinco minutos.</b> É o que atualiza o que muda
   *       continuamente: a produção acumulada do turno e a eficiência. A grade é absoluta, e
   *       não contada a partir da última colheita, pelo mesmo motivo que a varredura do
   *       historiador é: duas retomadas que começassem em passos diferentes colheriam em
   *       instantes diferentes, e a idempotência se perderia.
   * </ol>
   *
   * <p>O que se perde: uma bobina que fecha aparece na tela no mesmo instante (é fronteira), mas
   * a produção do turno pode estar até cinco minutos atrasada. Numa tela de passagem de turno
   * isso não se nota; num gráfico de tendência notaria, e por isso a tendência não vem daqui.
   */
  public static boolean dueIn(int seed, long fromTick, long toTick) {
    if (toTick <= fromTick) {
      return false;
    }

    if (Math.floorDiv(fromTick, HARVEST_EVERY_TICKS)
        != Math.floorDiv(toTick, HARVEST_EVERY_TICKS)) {
      return true;
    }

    for (var plan : shiftsInRange(seed, fromTick, toTick)) {
      if (crosses(fromTick, toTick, plan.startTick(), plan.endTick(), plan.round().endTick())) {
        return true;
      }

      var brk = plan.webBreak();
      if (brk != null && crosses(fromTick, toTick, brk.startTick(), brk.endTick())) {
        return true;
      }

      var change = plan.gradeChange();
      if (change != null && crosses(fromTick, toTick, change.startTick())) {
        return true;
      }

      for (var reel : plan.reels()) {
        if (crosses(fromTick, toTick, reel.startTick(), reel.endTick())) {
          return true;
        }
      }
    }

    return false;
  }

  /** Se algum dos instantes cai dentro da janela {@code (from, to]}. */
  private static boolean crosses(long fromTick, long toTick, long... instants) {
    for (var instant : instants) {
      if (instant > fromTick && instant <= toTick) {
        return true;
      }
    }
    return false;
  }

  /** O resultado da colheita. */
  public record Result(
      List<Entities.Shift> shifts,
      List<Entities.Reel> reels,
      List<Entities.GradeChange> gradeChanges,
      List<Entities.WebBreak> webBreaks,
      List<Entities.Round> rounds,
      List<Entities.MaintenanceNote> notes,
      List<Entities.SetpointChange> setpointChanges) {}

  private final HistorianRepository historian;

  /**
   * O arquivo da janela, uma leitura por tag.
   *
   * <p>A colheita faz muitas perguntas sobre a mesma série: a gramatura média de cada bobina, a
   * produção de cada turno, a temperatura em cada ponto de ronda. Com uma consulta por pergunta,
   * uma retomada de 72 h fazia milhares de idas ao banco — e num {@code DataSource} sem pool, cada
   * ida é uma conexão nova: o servidor recusa muito antes de o cálculo acabar. Foi assim que
   * apareceu, no teste do teto.
   *
   * <p>Aqui cada tag é lida <b>uma vez</b>, pela janela inteira, e as perguntas são respondidas
   * dessa lista. O resultado é idêntico — a média no tempo recebe o recorte e as amostras de fora
   * dele só ancoram as pontas — e o número de consultas passa a depender de quantas tags a
   * colheita toca, não de quantas bobinas ela fecha.
   *
   * <p>A leitura é preguiçosa: um turno sem quebra de folha não paga pelas tags de diagnóstico.
   */
  private static final class Archive {

    private final HistorianRepository historian;
    private final Instant from;
    private final Instant to;
    private final Map<String, HistorianRepository.Window> windows = new HashMap<>();

    Archive(HistorianRepository historian, Instant from, Instant to) {
      this.historian = historian;
      this.from = from;
      this.to = to;
    }

    /** A janela de uma tag, ou {@code null} se a tag não é ponto do historiador. */
    HistorianRepository.Window of(String tag) {
      return windows.computeIfAbsent(
          tag,
          name -> {
            var point = HistorianPoints.byTag(name);
            return point == null ? null : historian.window(point.pointId(), from, to);
          });
    }

    Double average(String tag, Instant start, Instant end) {
      var window = of(tag);
      return window == null ? null : window.averageIn(start, end);
    }

    Double valueAt(String tag, Instant at) {
      var window = of(tag);
      if (window == null) {
        return null;
      }
      var read = window.valueAt(at);
      return read == null ? null : read.v();
    }

    List<Samples.ArchivedSample> samplesIn(String tag, Instant start, Instant end) {
      var window = of(tag);
      return window == null ? List.of() : window.samplesIn(start, end);
    }
  }

  public Harvest(HistorianRepository historian) {
    this.historian = historian;
  }

  // --------------------------------------------------------------- ajudas ----

  private static String operatorOf(Shifts.ShiftWindow shift) {
    return "turno " + shift.letter();
  }

  /** Arredonda como o {@code toFixed} do outro lado: meio para cima, sobre o valor exato. */
  private static Double round(Double value, int scale) {
    if (value == null || !Double.isFinite(value)) {
      return value;
    }
    return new BigDecimal(value).setScale(scale, RoundingMode.HALF_UP).doubleValue();
  }

  /** Tolerância da gramatura, do catálogo: metade da faixa entre {@code L} e {@code H}. */
  private static double basisWeightTolerance() {
    var variable = ProcessCatalog.get("AIC-902");
    if (variable == null || variable.limits().l() == null || variable.limits().h() == null) {
      return 1.5;
    }
    return (variable.limits().h() - variable.limits().l()) / 2;
  }

  /**
   * Peso da bobina, pela área de papel enrolada.
   *
   * <p>Comprimento × largura × gramatura, com a gramatura <b>medida</b> no período da bobina e não
   * o alvo: uma bobina enrolada durante uma troca de gramatura não pesa o que o alvo diz.
   */
  public static double reelWeightT(double lengthM, double basisWeightGsm) {
    return lengthM * ProcessEngine.WEB_WIDTH_M * basisWeightGsm / 1e6;
  }

  /** Os turnos que uma janela de passos toca, do mais antigo ao mais recente. */
  public static List<Scenarios.ShiftPlan> shiftsInRange(int seed, long fromTick, long toTick) {
    var plans = new ArrayList<Scenarios.ShiftPlan>();
    var cursor = Scenarios.shiftPlan(seed, Shifts.at(SimClock.tickTime(fromTick)));

    while (cursor.startTick() <= toTick) {
      plans.add(cursor);
      cursor =
          Scenarios.shiftPlan(seed, Shifts.at(SimClock.tickTime(cursor.endTick() + 1)));
      if (plans.size() > 32) {
        break; // trava: a janela nunca cobre 32 turnos
      }
    }

    return plans;
  }

  // --------------------------------------------------------------- bobina ----

  private record ReelContext(int breaksInside, boolean gradeChangeInside) {}

  private Entities.Reel buildReel(
      Archive archive,
      String shiftId,
      Scenarios.ReelPlan plan,
      boolean closed,
      ReelContext context) {

    var from = SimClock.tickTime(plan.startTick());
    var to = SimClock.tickTime(plan.endTick());

    if (!closed) {
      return new Entities.Reel(
          plan.number(), shiftId, from, null, null, null, null, null, null, null,
          null, context.breaksInside(), null, null);
    }

    var basisWeight = archive.average("AIC-902", from, to);
    var moisture = archive.average("AIC-903", from, to);
    var caliper = archive.average("AIC-905", from, to);
    var cdBasis = archive.average("AI-912", from, to);
    var cdMoisture = archive.average("AI-913", from, to);
    var cdCaliper = archive.average("AI-915", from, to);

    double lengthM = Scenarios.reelWoundM(plan.endTick(), plan);
    Double weightT = basisWeight == null ? null : reelWeightT(lengthM, basisWeight);

    /*
     * O destino sai do que aconteceu, não de um sorteio.
     *
     * Uma bobina que pegou uma quebra tem emenda e vai rebaixada; uma que
     * pegou uma troca de gramatura tem papel fora da especificação no meio.
     * Fora disso, a gramatura média fora da tolerância do catálogo também
     * rebaixa. São as três razões que a LISTA-BASE pede que a bobina diga.
     */
    var reasons = new ArrayList<String>();
    if (context.breaksInside() > 0) {
      reasons.add(
          context.breaksInside() == 1
              ? "emenda de quebra de folha"
              : "%d emendas de quebra de folha".formatted(context.breaksInside()));
    }
    if (context.gradeChangeInside()) {
      reasons.add("papel de transição de gramatura");
    }

    var target = ProcessCatalog.get("AIC-902");
    double aim = target == null || target.target() == null ? 75 : target.target();
    if (basisWeight != null && Math.abs(basisWeight - aim) > basisWeightTolerance()) {
      reasons.add(
          "gramatura média em %s g/m², fora da tolerância"
              .formatted(format1(basisWeight)));
    }

    boolean approved = reasons.isEmpty();

    return new Entities.Reel(
        plan.number(),
        shiftId,
        from,
        to,
        round(weightT, 2),
        (double) Math.round(lengthM),
        (double) Math.round(Scenarios.reelDiameterMm(plan.endTick(), plan)),
        round(basisWeight, 2),
        round(moisture, 2),
        round(caliper, 2),
        cdBasis == null || cdMoisture == null || cdCaliper == null
            ? null
            : new Entities.CdSpread(cdBasis, cdMoisture, cdCaliper),
        context.breaksInside(),
        approved ? Entities.Disposition.APROVADA : Entities.Disposition.REBAIXADA,
        approved ? null : String.join("; ", reasons));
  }

  /** Uma casa decimal, no formato que o outro lado escreve (ponto, não vírgula). */
  private static String format1(double value) {
    return new BigDecimal(value).setScale(1, RoundingMode.HALF_UP).toPlainString();
  }

  private static String format2(double value) {
    return new BigDecimal(value).setScale(2, RoundingMode.HALF_UP).toPlainString();
  }

  // ------------------------------------------------------- quebra de folha ----

  /**
   * As tags que a investigação de uma quebra olha.
   *
   * <p>A malha perturbada entra sempre; as outras são o caminho por onde o efeito desce até a
   * folha.
   */
  private static final List<String> DIAGNOSTIC_TAGS =
      List.of("AIC-903", "AIC-901", "AI-407", "SDIC-703", "AIC-902");

  /**
   * Quantos desvios de exceção um sinal precisa andar para contar como precursor.
   *
   * <p><b>Suposição</b>, e com razão: o {@code excDev} é a banda em que o instrumento tremelica,
   * então três vezes ela é movimento que não é ruído. Um limiar absoluto não serviria — a mesma
   * régua teria de valer para umidade em % e pressão em kPa.
   */
  private static final int PRECURSOR_SIGMAS = 3;

  private static String describeMove(String tag, double before, double at, long leadS) {
    var variable = ProcessCatalog.get(tag);
    var unit = variable == null ? "" : variable.unit();
    double delta = at - before;

    return "%s %s %s nos %d min antes da quebra"
        .formatted(
            delta >= 0 ? "subiu" : "caiu",
            format2(Math.abs(delta)),
            unit,
            Math.round(leadS / 60.0));
  }

  /**
   * Os sinais dos 10 min anteriores, <b>lidos do arquivo</b>.
   *
   * <p>Nada aqui é escrito à mão: o cenário perturbou uma malha e o processo respondeu, e isto lê
   * a resposta. É a diferença entre um gêmeo digital e uma animação — se a rede de relações
   * mudar, os sinais mudam com ela.
   */
  private List<Entities.Precursor> precursorsOf(
      Archive archive, String upsetTag, long breakTick) {
    var breakAt = SimClock.tickTime(breakTick);
    var from = SimClock.tickTime(breakTick - Scenarios.UPSET_LEAD_S);

    var tags = new ArrayList<String>();
    tags.add(upsetTag);
    DIAGNOSTIC_TAGS.stream().filter(tag -> !tag.equals(upsetTag)).forEach(tags::add);

    var found = new ArrayList<Entities.Precursor>();

    for (var tag : tags) {
      var point = HistorianPoints.byTag(tag);
      if (point == null) {
        continue;
      }

      var variable = ProcessCatalog.get(tag);
      double excDev =
          variable == null || variable.compression().excDev() == null
              ? 0
              : variable.compression().excDev();
      double threshold = excDev * PRECURSOR_SIGMAS;
      if (threshold <= 0) {
        continue;
      }

      var valueBefore = archive.valueAt(tag, from);
      if (valueBefore == null) {
        continue;
      }

      var samples = archive.samplesIn(tag, from, breakAt);
      final double before = valueBefore;

      var crossed =
          samples.stream().filter(s -> Math.abs(s.v() - before) > threshold).findFirst();
      if (crossed.isEmpty()) {
        continue;
      }

      long leadTimeS = Math.round((breakAt.toEpochMilli() - crossed.get().t()) / 1000.0);

      found.add(
          new Entities.Precursor(
              (int) leadTimeS,
              tag,
              describeMove(tag, before, crossed.get().v(), leadTimeS),
              round(before, 3),
              round(crossed.get().v(), 3)));
    }

    // do mais antigo para o mais recente, que é como a tela desenha a linha do
    // tempo e como a restrição da tabela exige
    found.sort(java.util.Comparator.comparingInt(Entities.Precursor::leadTimeS).reversed());
    return List.copyOf(found);
  }

  // ----------------------------------------------------------------- ronda ----

  /**
   * O roteiro da ronda.
   *
   * <p>Seis pontos: o mancal que o conceito de tela acompanha e cinco vizinhos. <b>Suposição</b> —
   * a ronda de verdade segue um roteiro da planta, e este é escolhido para a tela ter o que
   * mostrar sem percorrer os 72 mancais da secagem.
   */
  private static final List<String> ROUND_ROUTE =
      List.of(
          "MP1-SEC-G4-CS23-MLA",
          "MP1-SEC-G4-CS23-MLC",
          "MP1-SEC-G4-CS19-MLA",
          "MP1-SEC-G4-CS26-MLC",
          "MP1-SEC-G1-CS01-MLA",
          "MP1-SEC-G6-CS36-MLC");

  /**
   * Quanto o pirômetro de campo lê abaixo do sensor do mancal, em °C.
   *
   * <p><b>Suposição.</b> O sensor está dentro da caixa e o pirômetro mede a carcaça por fora, que
   * é mais fria. Três graus é o que faz a coluna "campo × online" mostrar uma diferença pequena e
   * constante em operação normal — de modo que uma diferença grande signifique alguma coisa.
   */
  private static final int FIELD_PYROMETER_OFFSET_C = 3;

  private record Perception(Entities.Noise noise, Entities.Leak leak) {}

  private static Perception perceptionOf(Double rms, int seed, long tick, String assetTag) {
    var limits = Iso20816.limitsOf(Iso20816.DRYER_BEARING);
    var zone = rms == null ? null : Iso20816.classify(rms, limits);
    int stream = Noise.streamOf(assetTag);

    var noise =
        zone == Iso20816.Zone.D
            ? Entities.Noise.ANORMAL
            : zone == Iso20816.Zone.C ? Entities.Noise.ELEVADO : Entities.Noise.NORMAL;

    // vazamento é independente da vibração: um selo pinga sem o mancal vibrar
    double draw = Noise.unit(seed, (int) tick, stream, 7);
    var leak =
        draw > 0.99
            ? Entities.Leak.JATO
            : draw > 0.92 ? Entities.Leak.GOTEJAMENTO : Entities.Leak.NENHUM;

    return new Perception(noise, leak);
  }

  private Entities.Round buildRound(
      Archive archive, int seed, String shiftId, Scenarios.ShiftPlan plan) {
    var at = SimClock.tickTime(plan.round().endTick());
    var points = new ArrayList<Entities.RoundPoint>();

    for (var assetTag : ROUND_ROUTE) {
      var tags = BearingTags.of(assetTag);
      if (tags == null) {
        continue;
      }

      var rms = archive.valueAt(tags.vibration(), at);
      var bearingTemp = archive.valueAt(tags.temperature(), at);

      var perception = perceptionOf(rms, seed, plan.round().endTick(), assetTag);
      double jitter =
          (Noise.unit(seed, (int) plan.round().endTick(), Noise.streamOf(assetTag), 8) - 0.5) * 2;

      var parts = new ArrayList<String>();
      if (perception.noise() == Entities.Noise.ANORMAL) {
        parts.add("ruído anormal, zunido constante");
      }
      if (perception.noise() == Entities.Noise.ELEVADO) {
        parts.add("ruído acima do normal");
      }
      if (perception.leak() != Entities.Leak.NENHUM) {
        parts.add("vazamento: " + perception.leak().label());
      }

      points.add(
          new Entities.RoundPoint(
              assetTag,
              bearingTemp == null
                  ? null
                  : round(bearingTemp - FIELD_PYROMETER_OFFSET_C + jitter, 1),
              perception.noise(),
              perception.leak(),
              parts.isEmpty() ? null : String.join("; ", parts),
              bearingTemp == null ? null : tags.temperature(),
              bearingTemp == null ? null : round(bearingTemp, 1)));
    }

    return new Entities.Round(
        "RD-" + plan.round().startTick(),
        shiftId,
        SimClock.tickTime(plan.round().startTick()),
        at,
        operatorOf(plan.shift()),
        List.copyOf(points));
  }

  // ------------------------------------------------- nota de manutenção ----

  /**
   * O número da nota, derivado do instante e do ativo.
   *
   * <p>Derivá-lo em vez de contar numa sequência é o que mantém a idempotência: reexecutar um
   * trecho recria a mesma nota com o mesmo número, e o {@code upsert} não duplica.
   *
   * <p>O resto é <b>euclidiano</b>. O minuto é medido a partir da época da simulação, então é
   * negativo para qualquer instante anterior a ela — e esses instantes existem, porque a semente
   * grava 72 h de histórico terminando agora. Com o resto comum, o número sairia negativo.
   */
  public static String noteNumberFor(String assetTag, Instant raisedAt) {
    long minute = Math.floorDiv(raisedAt.toEpochMilli() - SimClock.SIM_EPOCH_MS, 60_000L);
    int slot = -1;
    for (int i = 0; i < BearingTags.ALL.size(); i++) {
      if (BearingTags.ALL.get(i).assetTag().equals(assetTag)) {
        slot = i;
        break;
      }
    }

    long slotOfDay = Math.floorMod(minute, 90_000L);
    long sequence = slotOfDay * 10 + Math.max(0, slot) % 10 + 1;

    return "NM-%06d".formatted(sequence);
  }

  /** As notas que os alarmes de mancal abrem. */
  public static List<Entities.MaintenanceNote> notesFromAlarms(
      List<Alarm> alarms, String roundId) {

    var notes = new LinkedHashMap<String, Entities.MaintenanceNote>();

    for (var alarm : alarms) {
      if (alarm.priority() != AlarmPriority.ALTA && alarm.priority() != AlarmPriority.CRITICA) {
        continue;
      }

      BearingTags.Tags bearing = null;
      for (var candidate : BearingTags.ALL) {
        if (candidate.vibration().equals(alarm.tag())
            || candidate.envelope().equals(alarm.tag())
            || candidate.temperature().equals(alarm.tag())) {
          bearing = candidate;
          break;
        }
      }
      if (bearing == null) {
        continue;
      }

      var number = noteNumberFor(bearing.assetTag(), alarm.raisedAt());
      if (notes.containsKey(number)) {
        continue;
      }

      var measurement =
          alarm.tag().equals(bearing.vibration())
              ? "vibração"
              : alarm.tag().equals(bearing.envelope())
                  ? "envelope de aceleração"
                  : "temperatura do mancal";

      var evidence = new ArrayList<Entities.Evidence>();
      evidence.add(
          new Entities.Evidence(
              Entities.EvidenceKind.ALARME,
              alarm.id(),
              "alarme %s de %s".formatted(alarm.limit().name(), alarm.tag())));
      evidence.add(
          new Entities.Evidence(
              Entities.EvidenceKind.TENDENCIA, alarm.tag(), "tendência das últimas 72 h"));
      if (roundId != null) {
        evidence.add(
            new Entities.Evidence(Entities.EvidenceKind.RONDA, roundId, "ponto da ronda"));
      }

      boolean critical = alarm.priority() == AlarmPriority.CRITICA;

      notes.put(
          number,
          new Entities.MaintenanceNote(
              number,
              bearing.assetTag(),
              "%s acima do limite %s (%s), pior valor %s"
                  .formatted(
                      measurement,
                      alarm.limit().name(),
                      trimNumber(alarm.threshold()),
                      format2(alarm.peakValue())),
              critical ? 1 : 2,
              Entities.NoteOrigin.ALARME,
              alarm.id(),
              Entities.NoteStatus.ABERTA,
              critical,
              alarm.raisedAt(),
              null,
              List.copyOf(evidence)));
    }

    return List.copyOf(notes.values());
  }

  /** Um número sem casas desnecessárias, como o JavaScript o escreve. */
  private static String trimNumber(double value) {
    return value == Math.rint(value)
        ? String.valueOf((long) value)
        : BigDecimal.valueOf(value).stripTrailingZeros().toPlainString();
  }

  // -------------------------------------------------------------- colheita ----

  /** Colhe as entidades da janela. Chamado depois de o arquivo estar gravado. */
  public Result run(int seed, long fromTick, long toTick, List<Alarm> alarms) {
    var shifts = new ArrayList<Entities.Shift>();
    var reels = new ArrayList<Entities.Reel>();
    var gradeChanges = new ArrayList<Entities.GradeChange>();
    var webBreaks = new ArrayList<Entities.WebBreak>();
    var rounds = new ArrayList<Entities.Round>();
    var setpointChanges = new ArrayList<Entities.SetpointChange>();

    var plans = shiftsInRange(seed, fromTick, toTick);
    if (plans.isEmpty()) {
      return new Result(
          List.of(), List.of(), List.of(), List.of(), List.of(),
          notesFromAlarms(alarms, null), List.of());
    }

    /*
     * A janela do arquivo começa no início do PRIMEIRO TURNO, e não em
     * `fromTick`.
     *
     * O turno que contém `fromTick` começou antes dele — até oito horas antes
     * —, e a produção do turno é a média desde o começo dele. Lendo só de
     * `fromTick`, a média sairia do pedaço que esta retomada calhou de
     * cobrir, e o mesmo turno teria produção diferente em cada reexecução.
     */
    var archive =
        new Archive(
            historian,
            SimClock.tickTime(plans.getFirst().startTick()),
            SimClock.tickTime(toTick));

    String lastRoundId = null;

    for (var plan : plans) {
      var shiftId = plan.shift().id();
      var shiftStart = SimClock.tickTime(plan.startTick());
      boolean closedShift = plan.endTick() <= toTick;
      var until = SimClock.tickTime(Math.min(plan.endTick(), toTick));

      // --- quebra de folha ---
      var brk = plan.webBreak();
      boolean breakStarted = brk != null && brk.startTick() <= toTick;

      if (breakStarted) {
        webBreaks.add(
            new Entities.WebBreak(
                "QB-" + brk.startTick(),
                shiftId,
                SimClock.tickTime(brk.startTick()),
                brk.endTick() <= toTick ? SimClock.tickTime(brk.endTick()) : null,
                brk.cause().section(),
                brk.cause().probableCause(),
                precursorsOf(archive, brk.cause().upsetTag(), brk.startTick())));
      }

      // --- troca de gramatura ---
      var change = plan.gradeChange();
      if (change != null && change.startTick() <= toTick) {
        double tolerance = basisWeightTolerance();
        var samples =
            archive.samplesIn(
                "AIC-902",
                SimClock.tickTime(change.startTick()),
                SimClock.tickTime(Math.min(change.startTick() + 3600, toTick)));

        Instant stabilizedAt =
            samples.stream()
                .filter(sample -> Math.abs(sample.v() - change.toGsm()) <= tolerance)
                .findFirst()
                .map(sample -> Instant.ofEpochMilli(sample.t()))
                .orElse(null);

        /*
         * As bobinas afetadas são as que estavam na Pope durante a transição.
         *
         * A comparação é toda em PASSOS. Na implementação anterior a primeira
         * versão comparava passo com milissegundos, e o teste passava por
         * acidente porque milissegundos são sempre maiores — unidade errada
         * numa comparação é o tipo de erro que não quebra nada e responde
         * errado para sempre.
         */
        long stabilizedTick =
            stabilizedAt == null ? Long.MAX_VALUE : SimClock.tickAt(stabilizedAt);

        var affected = new ArrayList<Integer>();
        for (var reel : plan.reels()) {
          if (reel.startTick() <= toTick
              && reel.endTick() > change.startTick()
              && reel.startTick() < stabilizedTick) {
            affected.add(reel.number());
          }
        }

        gradeChanges.add(
            new Entities.GradeChange(
                "TG-" + change.startTick(),
                shiftId,
                change.fromGsm(),
                change.toGsm(),
                SimClock.tickTime(change.startTick()),
                stabilizedAt,
                List.copyOf(affected)));

        var variable = ProcessCatalog.get("AIC-902");
        setpointChanges.add(
            new Entities.SetpointChange(
                "SP-%d-AIC-902".formatted(change.startTick()),
                "AIC-902",
                change.fromGsm(),
                change.toGsm(),
                variable == null ? "g/m²" : variable.unit(),
                operatorOf(plan.shift()),
                SimClock.tickTime(change.startTick()),
                "troca de gramatura programada"));
      }

      // --- ronda ---
      if (plan.round().endTick() <= toTick) {
        var round = buildRound(archive, seed, shiftId, plan);
        rounds.add(round);
        lastRoundId = round.id();
      }

      // --- bobinas ---
      for (var reel : plan.reels()) {
        if (reel.startTick() > toTick) {
          continue;
        }

        boolean closed = reel.endTick() <= toTick;
        int breaksInside =
            brk != null && brk.startTick() >= reel.startTick() && brk.startTick() < reel.endTick()
                ? 1
                : 0;
        boolean gradeInside =
            change != null
                && change.startTick() >= reel.startTick()
                && change.startTick() < reel.endTick();

        reels.add(
            buildReel(archive, shiftId, reel, closed, new ReelContext(breaksInside, gradeInside)));
      }

      // --- turno ---
      double hours = (until.toEpochMilli() - shiftStart.toEpochMilli()) / 3_600_000.0;
      var avgProduction = archive.average("XI-0001", shiftStart, until);
      double productionT = avgProduction == null ? 0 : avgProduction * hours;
      double nominal = Scenarios.nominalShiftProductionT(plan.shift()) * (hours / 8);

      var handover = new ArrayList<String>();
      if (breakStarted) {
        handover.add(
            "quebra de folha em %s às %s UTC: %s"
                .formatted(
                    brk.cause().section(),
                    SimClock.tickTime(brk.startTick()).toString().substring(11, 16),
                    brk.cause().probableCause()));
      }
      if (change != null && change.startTick() <= toTick) {
        handover.add(
            "troca de gramatura de %s para %s g/m²"
                .formatted(trimNumber(change.fromGsm()), trimNumber(change.toGsm())));
      }

      final var currentShift = shiftId;
      long downgraded =
          reels.stream()
              .filter(
                  reel ->
                      reel.shiftId().equals(currentShift)
                          && reel.disposition() == Entities.Disposition.REBAIXADA)
              .count();
      if (downgraded > 0) {
        handover.add(
            "%d bobina%s rebaixada%s"
                .formatted(downgraded, downgraded > 1 ? "s" : "", downgraded > 1 ? "s" : ""));
      }

      shifts.add(
          new Entities.Shift(
              shiftId,
              plan.shift().letter(),
              plan.shift().operationDate(),
              plan.shift().startedAt(),
              closedShift ? plan.shift().endedAt() : null,
              operatorOf(plan.shift()),
              round(productionT, 1),
              nominal <= 0 ? 0 : round(Math.min(100, productionT / nominal * 100), 1),
              List.copyOf(handover)));
    }

    return new Result(
        List.copyOf(shifts),
        List.copyOf(reels),
        List.copyOf(gradeChanges),
        List.copyOf(webBreaks),
        List.copyOf(rounds),
        notesFromAlarms(alarms, lastRoundId),
        List.copyOf(setpointChanges));
  }

  /**
   * Grava a colheita, na ordem que as chaves estrangeiras exigem.
   *
   * <p>Tudo numa transação só, e não uma por entidade: são algumas dezenas de escritas, e cada
   * {@code commit} é uma ida ao banco. Também torna a colheita atómica — uma retomada
   * interrompida no meio não deixa um turno com metade das bobinas dele.
   */
  public static void persist(OperationsRepository operations, Result harvest) {
    operations.inOneTransaction(
        () -> {
          harvest.shifts().forEach(operations::saveShift);
          harvest.reels().forEach(operations::saveReel);
          harvest.webBreaks().forEach(operations::saveWebBreak);
          harvest.gradeChanges().forEach(operations::saveGradeChange);
          harvest.rounds().forEach(operations::saveRound);
          harvest.notes().forEach(operations::saveNote);
          harvest.setpointChanges().forEach(operations::saveSetpointChange);
        });
  }
}
