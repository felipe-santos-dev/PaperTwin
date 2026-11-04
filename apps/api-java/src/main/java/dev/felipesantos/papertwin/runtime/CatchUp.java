package dev.felipesantos.papertwin.runtime;

import dev.felipesantos.papertwin.alarm.Alarm;
import dev.felipesantos.papertwin.alarm.AlarmEngine;
import dev.felipesantos.papertwin.db.HistorianRepository;
import dev.felipesantos.papertwin.db.OperationsRepository;
import dev.felipesantos.papertwin.db.SimStateRepository;
import dev.felipesantos.papertwin.historian.HistorianPoints;
import dev.felipesantos.papertwin.historian.Recorder;
import dev.felipesantos.papertwin.historian.Retention;
import dev.felipesantos.papertwin.historian.Samples.PointArchivedSample;
import dev.felipesantos.papertwin.historian.Samples.PointSample;
import dev.felipesantos.papertwin.operation.Scenarios;
import dev.felipesantos.papertwin.process.BearingTags;
import dev.felipesantos.papertwin.simulation.ProcessEngine;
import dev.felipesantos.papertwin.simulation.SimClock;
import dev.felipesantos.papertwin.vibration.Bearings;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * A retomada: o que roda quando a API acorda.
 *
 * <p>Não existe processo de fundo. O host gratuito dorme sem tráfego, e quem acorda a API é quem
 * abriu a tela — então a simulação não é um laço que roda sempre, é um trabalho que acontece
 * <b>dentro de uma requisição</b>, reexecutando o intervalo que faltou desde a última vez.
 *
 * <p>Isso só é possível porque a simulação é determinística a partir de (semente, passo): o
 * relógio é uma grade ancorada num instante absoluto, o ruído é função da posição e nenhum
 * estágio guarda estado que dependa de onde a execução começou.
 *
 * <h2>A ordem dentro de um passo</h2>
 *
 * <ol>
 *   <li>os eventos do plano do turno entram (troca de gramatura, perturbação que precede a
 *       quebra);
 *   <li>o motor de processo avança;
 *   <li>de cinco em cinco passos, o historiador varre e os alarmes são avaliados.
 * </ol>
 *
 * <p>Os eventos entram <b>antes</b> do passo, e não depois, porque um setpoint escrito depois de
 * avançar só teria efeito no passo seguinte — e aí o instante registrado na entidade não seria o
 * instante em que o processo começou a se mexer.
 */
public class CatchUp {

  /** O mancal que degrada, o mesmo do conceito de tela de monitoramento. */
  public static final String DEGRADING_BEARING = "MP1-SEC-G4-CS23-MLA";

  /**
   * Quanto tempo a degradação do mancal leva, em horas.
   *
   * <p><b>Suposição.</b> 72 h é a janela da tela de tendência, e é o que faz a subida caber
   * inteira no gráfico que alguém vai olhar. Um defeito de rolamento de verdade leva semanas; três
   * dias é escolha de apresentação, e está dita aqui em vez de passar por propriedade do mancal.
   */
  public static final int DEGRADATION_HOURS = 72;

  /** Quantas linhas vão ao banco por ida. */
  private static final int WRITE_CHUNK = 5000;

  private final HistorianRepository historian;
  private final OperationsRepository operations;
  private final SimStateRepository simState;
  private final long maxCatchupTicks;

  /** Com o teto padrão de quatro horas. */
  public CatchUp(
      HistorianRepository historian,
      OperationsRepository operations,
      SimStateRepository simState) {
    this(historian, operations, simState, MAX_CATCHUP_HOURS);
  }

  /**
   * Com o teto dado, em horas.
   *
   * <p>O teto depende da máquina. As quatro horas padrão foram medidas num desktop; o Render Free
   * dá uma fração de CPU e a JVM acorda fria, então lá a mesma janela custa várias vezes mais.
   * Quem opera ajusta {@code RESUME_MAX_HOURS} olhando o log da retomada.
   */
  public CatchUp(
      HistorianRepository historian,
      OperationsRepository operations,
      SimStateRepository simState,
      long maxHours) {

    if (maxHours < 1) {
      throw new IllegalArgumentException(
          "O teto da retomada precisa ser de pelo menos uma hora: " + maxHours);
    }

    this.historian = historian;
    this.operations = operations;
    this.simState = simState;
    this.maxCatchupTicks = maxHours * SimClock.TICKS_PER_HOUR;
  }

  /** O teto em vigor, em horas. */
  public long maxHours() {
    return maxCatchupTicks / SimClock.TICKS_PER_HOUR;
  }

  /** O que a retomada fez, para o log e para o {@code /health}. */
  public record Report(
      int seed,
      long fromTick,
      long toTick,
      long ticks,
      boolean reanchored,
      boolean seedChanged,
      boolean resumedFromState,
      int scans,
      int archived,
      int raw,
      int alarmsRaised,
      int alarmsCleared,
      Recorder.Stats compression,
      long durationMs,
      /** Heap em uso ao fim da retomada, em MB. É o número que o Render Free limita. */
      long heapUsedMb,
      Map<String, Double> values) {}

  private static long heapUsedMb() {
    var runtime = Runtime.getRuntime();
    return (runtime.totalMemory() - runtime.freeMemory()) / 1_048_576;
  }

  /**
   * O cenário de degradação do mancal, ancorado no instante pedido.
   *
   * <p>A janela termina <b>agora</b> e começa {@code DEGRADATION_HOURS} antes, o que põe o mancal
   * em zona D no presente. É escolha de apresentação: o gêmeo precisa ter o que mostrar a quem
   * abre a tela hoje.
   */
  public static Bearings.DegradationScenario scenarioAt(Instant now) {
    long toTick = SimClock.tickAt(now);
    return new Bearings.DegradationScenario(
        DEGRADING_BEARING, toTick - DEGRADATION_HOURS * SimClock.TICKS_PER_HOUR, toTick);
  }

  /**
   * Os valores dos mancais num passo, nas tags do catálogo.
   *
   * <p>O motor de processo não cuida dos mancais: ele para na área {@code mancais} do catálogo de
   * propósito, porque a dinâmica de um defeito de rolamento não é a de uma malha de controle. Aqui
   * as duas metades se juntam, pela ponte de tags.
   */
  public static Map<String, Double> bearingValuesAt(
      int seed, long tick, Bearings.DegradationScenario scenario) {

    var values = new LinkedHashMap<String, Double>();

    for (var bearing : BearingTags.ALL) {
      var sample = Bearings.sampleAt(seed, tick, bearing.assetTag(), scenario);
      values.put(bearing.vibration(), sample.rmsMmS());
      values.put(bearing.envelope(), sample.envelopeGe());
      values.put(bearing.temperature(), sample.tempC());
    }

    return values;
  }

  /**
   * Onde a máquina está num passo: processo e mancais juntos.
   *
   * <p>Montar a rede a partir do estado gravado e ler o instantâneo custa a construção dos
   * integradores — microssegundos — e dá o valor <b>exato</b> do passo gravado, sem interpolar
   * nada. É o caminho certo para "valores atuais".
   */
  public static Map<String, Double> valuesAt(
      int seed, long tick, ProcessEngine.State state, Bearings.DegradationScenario scenario) {

    /*
     * O estado só serve se for exatamente do passo pedido.
     *
     * O motor recusa estado de outro passo, e com razão — retomar de outro
     * passo salta ou repete processo. Mas aqui a recusa seria uma exceção numa
     * rota de leitura, e há um caso em que isso acontece sem ninguém ter feito
     * nada errado: o relógio do host andar PARA TRÁS, que é o que uma correção
     * de NTP faz. Nesse caso o certo é montar a rede em regime e responder,
     * não derrubar a requisição.
     */
    ProcessEngine engine;
    if (state != null && state.tick() == tick) {
      engine = ProcessEngine.resume(tick, seed, state);
    } else {
      engine =
          new ProcessEngine(
              tick, seed, Map.of("AIC-902", Scenarios.gradeInEffectAt(tick)), null);
    }

    var values = new LinkedHashMap<>(engine.snapshot());
    values.putAll(bearingValuesAt(seed, tick, scenario));
    return values;
  }

  /** Aplica os eventos do plano que caem neste passo. */
  private static void applyPlan(ProcessEngine engine, Scenarios.ShiftPlan plan, long tick) {
    if (plan.gradeChange() != null && plan.gradeChange().startTick() == tick) {
      engine.setSetpoint("AIC-902", plan.gradeChange().toGsm());
    }

    var brk = plan.webBreak();
    if (brk == null) {
      return;
    }

    // a perturbação entra 10 min antes da quebra e volta quando a folha volta
    if (brk.upsetTick() == tick) {
      engine.setSetpoint(brk.cause().upsetTag(), brk.cause().upsetSetpoint());
    }
    if (brk.endTick() == tick) {
      engine.resetSetpoint(brk.cause().upsetTag());
    }
  }

  /** Roda o intervalo que faltou e grava. */
  public Report run(int seed, Instant now, int scanTicks) {
    long started = System.nanoTime();

    var saved = simState.find();
    boolean seedChanged = saved != null && saved.seed() != seed;
    Long fromSaved = saved == null || seedChanged ? null : saved.lastTick();

    var range = SimClock.catchupRange(fromSaved, now, maxCatchupTicks);
    var scenario = scenarioAt(now);

    /*
     * O estado gravado só serve se a retomada continuar exatamente de onde ele é.
     *
     * Quando o intervalo passa do teto, o início é cortado, e o estado gravado
     * passa a ser de um passo que a execução nem vai visitar — retomar dele
     * seria saltar horas de processo sem dizer. Aí a rede arranca em regime,
     * que é o que `reanchored` significa.
     */
    ProcessEngine.State restored =
        !range.reanchored()
                && saved != null
                && !seedChanged
                && saved.state() != null
                && saved.state().tick() == range.fromTick()
            ? saved.state()
            : null;

    if (range.ticks() == 0) {
      return new Report(
          seed, range.fromTick(), range.toTick(), 0, false, seedChanged, false,
          0, 0, 0, 0, 0,
          new Recorder.Stats(0, 0, 0, 0, 0),
          (System.nanoTime() - started) / 1_000_000,
          heapUsedMb(),
          // nada rodou, mas a pergunta "onde a máquina está" continua tendo resposta
          valuesAt(seed, range.toTick(), saved == null ? null : saved.state(), scenario));
    }

    var engine =
        restored != null
            ? ProcessEngine.resume(range.fromTick(), seed, restored)
            : new ProcessEngine(
                range.fromTick(),
                seed,
                // a gramatura que está valendo, e não o alvo do catálogo: a
                // troca é evento, e um evento só move o processo se ele estiver
                // no estado de antes dele
                Map.of("AIC-902", Scenarios.gradeInEffectAt(range.fromTick())),
                null);

    /*
     * O motor de alarmes só recebe o que já existia quando esta janela começou.
     *
     * Um alarme disparado DEPOIS do fim da janela não faz parte do estado dela,
     * e deixá-lo entrar tem consequência concreta: a varredura o normalizaria
     * com um instante anterior ao do disparo, e o banco recusa — há uma
     * restrição `alarm_cleared_after_raised` justamente para isso.
     *
     * Parece impossível até lembrar que o relógio do host pode andar para trás:
     * é o que uma correção de NTP faz. O filtro custa nada e troca uma exceção
     * no meio da retomada por um alarme que simplesmente não é considerado.
     */
    var windowEnd = SimClock.tickTime(range.toTick());
    var alarms =
        new AlarmEngine(
            operations.listAlarms(1000).stream()
                .filter(alarm -> !alarm.raisedAt().isAfter(windowEnd))
                .toList());

    // o bruto só é coletado dentro da própria retenção dele
    long rawFrom = now.minusSeconds(Retention.RAW_RETENTION_MINUTES * 60L).toEpochMilli();
    var recorder = Recorder.forCatalog(rawFrom);

    var pendingArchive = new ArrayList<PointArchivedSample>();
    var pendingRaw = new ArrayList<PointSample>();
    var pendingAlarms = new LinkedHashMap<String, Alarm>();

    int scans = 0;
    int raised = 0;
    int cleared = 0;

    var plan = Scenarios.planAt(seed, range.fromTick());

    for (long tick = range.fromTick() + 1; tick <= range.toTick(); tick++) {
      if (tick >= plan.endTick()) {
        plan = Scenarios.planAt(seed, tick);
      }

      applyPlan(engine, plan, tick);
      engine.advance();

      /*
       * A varredura é ancorada na grade absoluta, não no início da retomada.
       *
       * Com `(tick - fromTick) % scanTicks`, duas retomadas que começassem em
       * passos diferentes varreriam instantes diferentes, e o `on conflict do
       * nothing` das amostras não reconheceria as repetições: um trecho
       * reexecutado entraria duas vezes no arquivo, deslocado em um segundo.
       */
      if (tick % scanTicks != 0) {
        continue;
      }

      var values = new LinkedHashMap<>(engine.snapshot());
      values.putAll(bearingValuesAt(seed, tick, scenario));

      recorder.feed(tick, values);
      scans++;

      var scan = alarms.scan(values, SimClock.tickTime(tick));
      for (var alarm : scan.raised()) {
        pendingAlarms.put(alarm.id(), alarm);
      }
      for (var alarm : scan.cleared()) {
        pendingAlarms.put(alarm.id(), alarm);
      }
      for (var alarm : scan.updated()) {
        pendingAlarms.put(alarm.id(), alarm);
      }
      raised += scan.raised().size();
      cleared += scan.cleared().size();

      var batch = recorder.drain();
      pendingArchive.addAll(batch.archive());
      pendingRaw.addAll(batch.raw());
    }

    pendingArchive.addAll(recorder.flush());

    // a semeadura dos pontos precisa estar feita antes das amostras
    if (historian.countPoints() == 0) {
      historian.replacePoints();
    }

    writeInChunks(pendingArchive, historian::insertArchive);
    writeInChunks(pendingRaw, historian::insertRaw);
    pendingAlarms.values().forEach(operations::saveAlarm);

    historian.prune(now);
    simState.save(seed, range.toTick(), engine.snapshotState(), now);

    var values = new LinkedHashMap<>(engine.snapshot());
    values.putAll(bearingValuesAt(seed, range.toTick(), scenario));

    return new Report(
        seed,
        range.fromTick(),
        range.toTick(),
        range.ticks(),
        range.reanchored(),
        seedChanged,
        restored != null,
        scans,
        pendingArchive.size(),
        pendingRaw.size(),
        raised,
        cleared,
        recorder.stats(),
        (System.nanoTime() - started) / 1_000_000,
        heapUsedMb(),
        values);
  }

  private static <T> void writeInChunks(List<T> rows, java.util.function.Function<List<T>, Integer> write) {
    for (int i = 0; i < rows.size(); i += WRITE_CHUNK) {
      write.apply(rows.subList(i, Math.min(i + WRITE_CHUNK, rows.size())));
    }
  }

  /** O teto da retomada em horas, para quem precisa explicar o buraco. */
  public static final long MAX_CATCHUP_HOURS = SimClock.MAX_CATCHUP_TICKS / SimClock.TICKS_PER_HOUR;
}
