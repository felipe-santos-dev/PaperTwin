package dev.felipesantos.papertwin.simulation;

import dev.felipesantos.papertwin.catalog.ProcessCatalog;
import dev.felipesantos.papertwin.machine.SteamGroups;
import dev.felipesantos.papertwin.process.FopdtRelation;
import dev.felipesantos.papertwin.process.ProcessRelations;
import dev.felipesantos.papertwin.process.SteamGroupTags;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

/**
 * A rede de processo da MP1.
 *
 * <p>Junta o que as fases anteriores prepararam: o catálogo diz quais variáveis existem e em que
 * faixa, as relações dizem como uma mexe na outra, o núcleo de primeira ordem integra, o relógio dá
 * a grade de passos e o ruído por posição torna tudo reproduzível.
 *
 * <h2>Verdade e medida são coisas diferentes</h2>
 *
 * <p>O motor guarda <b>dois</b> valores por tag:
 *
 * <ul>
 *   <li>a <b>verdade</b>, que é o valor físico — é ela que as relações leem, porque o processo
 *       responde ao que a válvula fez, não ao que o transmissor relatou;
 *   <li>a <b>medida</b>, que é a verdade mais o ruído do instrumento — é ela que as malhas leem,
 *       que o historiador grava e que a tela mostra.
 * </ul>
 *
 * <p>A distinção não é preciosismo. Uma malha PI que lesse o valor sem ruído ficaria irrealmente
 * quieta, e é o ruído na medida que faz a válvula se mexer de leve todo o tempo, como numa máquina
 * de verdade.
 *
 * <h2>O que é clampeado e o que não é</h2>
 *
 * <p>A <b>MV é clampeada</b> na faixa do catálogo: a válvula tem fim de curso, e é por isso que o
 * PI precisa de trava de integral.
 *
 * <p>A <b>medida não é clampeada</b>. Prender a umidade final à faixa 3,8–6,0 do catálogo apagaria
 * todo alarme de {@code H}/{@code HH} que mora fora dela — e a razão de a faixa existir é
 * justamente dizer onde é normal, não onde é possível.
 */
public final class ProcessEngine {

  /** Largura da folha, em metros. */
  public static final double WEB_WIDTH_M = 8;

  /**
   * Constante de tempo de uma malha seguindo o próprio setpoint, em segundos.
   *
   * <p><b>Suposição.</b> É a dinâmica da válvula mais a da malha escrava: uma malha de vazão ou de
   * pressão bem ajustada chega ao novo setpoint em alguns segundos. 6 s é conservador para 1 s de
   * passo — rápido o bastante para não atrasar a cascata, lento o bastante para a MV não pular em
   * degrau, o que daria à rede de primeira ordem um degrau que nenhuma válvula faz.
   */
  public static final double MV_LAG_S = 6;

  /**
   * Constante de correlação do ruído de processo, em passos.
   *
   * <p><b>Suposição.</b> 10 s de memória: o ruído de um instante parece com o do anterior, como a
   * turbulência de uma caixa de entrada, e não como erro de quantização.
   */
  public static final double NOISE_TAU_TICKS = 10;

  public static final int STATE_VERSION = 1;

  private static final double DT_S = SimClock.TICK_MS / 1000.0;

  /**
   * As cascatas: a medida de qualidade que manda na malha de campo.
   *
   * <p>Cada linha sai da coluna {@code mv} do catálogo — "MD: FV-105", "MD: PIC-711/712" — cruzada
   * com a relação que mede aquele par. O ajuste do PI <b>não é escolhido</b>: sai por SIMC dos
   * coeficientes dessa relação.
   *
   * <p>A coluna {@code mv} é prosa em português e não é lida por expressão regular. Seis linhas não
   * justificam um analisador, e um analisador erraria quieto quando a prosa mudasse — enquanto uma
   * tabela errada aqui falha na carga, porque as tags são resolvidas contra o catálogo e as
   * relações.
   */
  private record CascadeSpec(String pv, String mv, String relationId) {}

  private static final List<CascadeSpec> CASCADES =
      List.of(
          new CascadeSpec("AIC-901", "PIC-514", "4"),
          new CascadeSpec("AIC-902", "FIC-105", "1"),
          new CascadeSpec("AIC-903", "PIC-711", "5"),
          new CascadeSpec("AIC-904", "FIC-106", "7"),
          new CascadeSpec("AIC-905", "WIC-801", "14"),
          new CascadeSpec("AIC-306", "FIC-109", "8"));

  /**
   * O estado da rede, serializável.
   *
   * <p>Isto existe porque a rede <b>tem</b> estado, e fingir que não tem foi um erro que um teste
   * pegou na implementação anterior: cada retomada montava um motor novo no ponto de operação, e
   * acordar no meio de uma troca de gramatura perderia a transição inteira. O valor de uma tag não
   * é função só de (semente, passo) — é função disso e do que já estava no caminho.
   *
   * <p>O que precisa ser gravado é o que não dá para recalcular: as linhas de atraso das relações,
   * os termos integrais das cascatas, a verdade de cada tag e os setpoints. A <b>medida</b> não é
   * gravada: ela é a verdade mais o ruído do passo, e o ruído é função da posição.
   */
  public record State(
      int version,
      long tick,
      int seed,
      Map<String, Double> truth,
      Map<String, Double> setpoints,
      Map<String, Double> integrals,
      Map<String, Fopdt.State> runners) {}

  // ------------------------------------------------------------- estrutura ----

  private record RelationRunner(FopdtRelation relation, double inputBase, Fopdt.Runner runner) {}

  private record DrivenOutput(String tag, double base, List<RelationRunner> runners) {}

  private record TrackingLoop(String tag, double base, double min, double max) {}

  private record Cascade(String pv, String mv, Pi.Controller controller) {}

  private record Cylinder(String tag, String pressureTag) {}

  // ---------------------------------------------------------------- estado ----

  private final int seed;
  private long tick;

  private final Map<String, Double> truth = new LinkedHashMap<>();
  private final Map<String, Double> measured = new LinkedHashMap<>();
  private final Map<String, Integer> streams = new LinkedHashMap<>();

  private final List<DrivenOutput> outputs;
  private final List<TrackingLoop> loops;
  private final List<Cascade> cascades;
  private final List<Cylinder> cylinders;
  private final List<String> freeTags;
  private final Map<String, Double> setpoints = new LinkedHashMap<>();
  private final Map<String, Double> slaveSetpoints = new LinkedHashMap<>();

  private final double mvDecay = Math.exp(-DT_S / MV_LAG_S);

  /**
   * Monta a rede e devolve o motor, posicionado em {@code startTick}.
   *
   * <p>O estado inicial é o ponto de operação de tudo: a máquina em regime, sem desvio nenhum. Quem
   * precisa de uma rede já "quente" roda alguns minutos de passos antes de olhar — é o que a
   * retomada faz ao reancorar.
   */
  public ProcessEngine(long startTick, int seed, Map<String, Double> initialSetpoints, State restored) {
    this.seed = seed;
    this.tick = startTick;

    if (restored != null) {
      if (restored.version() != STATE_VERSION) {
        throw new IllegalArgumentException(
            "Estado da rede na versão %d; esta build lê a %d. Reancore em vez de retomar."
                .formatted(restored.version(), STATE_VERSION));
      }
      if (restored.seed() != seed) {
        throw new IllegalArgumentException(
            "O estado gravado é da semente %d e esta execução usa %d. Semente diferente é outra máquina."
                .formatted(restored.seed(), seed));
      }
      if (restored.tick() != startTick) {
        throw new IllegalArgumentException(
            "O estado gravado é do passo %d e a retomada pede %d. Retomar de outro passo salta ou repete processo."
                .formatted(restored.tick(), startTick));
      }
    }

    var relations = mdRelations();
    var cascadedPvs = CASCADES.stream().map(CascadeSpec::pv).collect(java.util.stream.Collectors.toSet());
    var cascadedMvs = CASCADES.stream().map(CascadeSpec::mv).collect(java.util.stream.Collectors.toSet());

    // --- saídas movidas por relação, na ordem em que aparecem ---
    var outputTags = new LinkedHashSet<String>();
    for (var item : relations) {
      outputTags.add(item.output());
    }

    var built = new ArrayList<DrivenOutput>();
    for (var tag : outputTags) {
      var runners = new ArrayList<RelationRunner>();
      for (var item : relations) {
        if (!item.output().equals(tag)) {
          continue;
        }
        var model = new Fopdt.Model(item.kp(), item.deadTimeS(), item.tauS());
        var saved = restored == null ? null : restored.runners().get(item.id());
        runners.add(
            new RelationRunner(
                item,
                OperatingPoint.require(item.input()),
                saved == null ? Fopdt.runner(model, DT_S) : Fopdt.runner(model, DT_S, saved)));
      }
      built.add(new DrivenOutput(tag, OperatingPoint.require(tag), List.copyOf(runners)));
    }
    this.outputs = List.copyOf(built);

    // --- malhas que seguem o próprio setpoint ---
    var tracking = new ArrayList<TrackingLoop>();
    for (var variable : ProcessCatalog.controlled()) {
      if (cascadedPvs.contains(variable.tag())) {
        continue;
      }
      tracking.add(
          new TrackingLoop(
              variable.tag(),
              OperatingPoint.require(variable.tag()),
              variable.min(),
              variable.max()));
    }
    this.loops = List.copyOf(tracking);
    var loopTags = new LinkedHashSet<String>();
    for (var loop : loops) {
      loopTags.add(loop.tag());
    }

    // --- cilindros, para a temperatura de superfície ---
    var shells = new ArrayList<Cylinder>();
    for (int number : SteamGroups.allCylinders()) {
      shells.add(
          new Cylinder("TI-52%02d".formatted(number), SteamGroupTags.pressureOfCylinder(number)));
    }
    this.cylinders = List.copyOf(shells);
    var surfaceTags = new LinkedHashSet<String>();
    for (var cylinder : cylinders) {
      surfaceTags.add(cylinder.tag());
    }

    /*
     * O que a rede não move.
     *
     * São as variáveis sem relação que chegue nelas e sem setpoint: viscosidade
     * do amido, dispersão do perfil CD, pressão do ar de instrumentação,
     * temperatura da capa do rolo macio. Elas oscilam em torno do ponto de
     * operação, e o simulador não finge saber mais do que isso.
     *
     * As tags por cilindro de vibração, envelope e temperatura de mancal ficam
     * de fora: quem as produz é o simulador de mancal, com a sua própria
     * dinâmica de degradação.
     */
    var free = new ArrayList<String>();
    for (var variable : ProcessCatalog.ALL) {
      var tag = variable.tag();
      if (outputTags.contains(tag)
          || loopTags.contains(tag)
          || cascadedPvs.contains(tag)
          || surfaceTags.contains(tag)
          || "mancais".equals(variable.area())
          || "XI-0001".equals(tag)
          || "XI-0002".equals(tag)) {
        continue;
      }
      free.add(tag);
    }
    this.freeTags = List.copyOf(free);

    /*
     * Tags que aceitam setpoint: as malhas próprias e as PV de cascata — não as
     * escravas. Numa cascata o setpoint da escrava pertence ao mestre, e deixar
     * o operador escrever nele com o mestre em automático daria uma briga entre
     * os dois que nenhuma tela explicaria.
     */
    for (var tag : loopTags) {
      if (!cascadedMvs.contains(tag)) {
        setpoints.put(tag, OperatingPoint.require(tag));
      }
    }
    for (var spec : CASCADES) {
      setpoints.put(spec.pv(), OperatingPoint.require(spec.pv()));
    }

    if (restored != null) {
      for (var entry : restored.setpoints().entrySet()) {
        if (setpoints.containsKey(entry.getKey())) {
          setpoints.put(entry.getKey(), entry.getValue());
        }
      }
    }

    if (initialSetpoints != null) {
      for (var entry : initialSetpoints.entrySet()) {
        if (!setpoints.containsKey(entry.getKey())) {
          throw new IllegalArgumentException(
              "%s não aceita setpoint: ou não é malha de controle, ou é a escrava de uma cascata — nesse caso o setpoint pertence ao mestre."
                  .formatted(entry.getKey()));
        }
        setpoints.put(entry.getKey(), entry.getValue());
      }
    }

    // --- cascatas ---
    var wired = new ArrayList<Cascade>();
    for (var spec : CASCADES) {
      var model = ProcessRelations.get(spec.relationId());
      if (model == null) {
        throw new IllegalStateException(
            "A cascata %s → %s cita a relação %s, que não existe mais."
                .formatted(spec.pv(), spec.mv(), spec.relationId()));
      }
      if (!model.input().equals(spec.mv()) || !model.output().equals(spec.pv())) {
        throw new IllegalStateException(
            "A cascata %s → %s cita a relação %s, que mede %s → %s. O ajuste do PI sai dela, então o par tem de bater."
                .formatted(
                    spec.pv(), spec.mv(), spec.relationId(), model.input(), model.output()));
      }

      var mvVariable = ProcessCatalog.get(spec.mv());
      if (mvVariable == null) {
        throw new IllegalStateException(
            "A cascata %s → %s aponta para uma MV fora do catálogo."
                .formatted(spec.pv(), spec.mv()));
      }

      double integral =
          restored == null ? 0 : restored.integrals().getOrDefault(spec.pv(), 0.0);

      wired.add(
          new Cascade(
              spec.pv(),
              spec.mv(),
              new Pi.Controller(
                  Pi.simcTuning(new Fopdt.Model(model.kp(), model.deadTimeS(), model.tauS())),
                  OperatingPoint.require(spec.mv()),
                  mvVariable.min(),
                  mvVariable.max(),
                  integral)));
    }
    this.cascades = List.copyOf(wired);

    for (var cascade : cascades) {
      slaveSetpoints.put(cascade.mv(), OperatingPoint.require(cascade.mv()));
    }

    // --- estado inicial: tudo no ponto de operação ---

    for (var variable : ProcessCatalog.ALL) {
      if ("mancais".equals(variable.area())) {
        continue;
      }
      publish(variable.tag(), OperatingPoint.require(variable.tag()));
    }
    for (var output : outputs) {
      publish(output.tag(), output.base());
    }

    /*
     * A superfície dos cilindros arranca da fórmula, não do alvo do catálogo.
     *
     * `TI-52nn` é um padrão por cilindro, então o catálogo dá UM alvo (125 °C)
     * para os 36 — não poderia ser diferente, porque é uma linha só no CSV. Mas
     * a superfície segue a saturação do vapor do grupo, e os seis grupos operam
     * em pressões diferentes: o G4, em 230 kPa rel, cai perto dos 125; o G1, em
     * 15, fica em ~95.
     *
     * Iniciar pelo alvo e só depois aplicar a fórmula daria um salto de dez
     * graus no primeiro passo — degrau que nenhum cilindro dá, e que a porta
     * oscilante gravaria como se fosse processo.
     */
    for (var cylinder : cylinders) {
      publish(cylinder.tag(), Pi.cylinderSurfaceTempC(truth.getOrDefault(cylinder.pressureTag(), 0.0)));
    }

    publish("XI-0002", WEB_WIDTH_M);
    publish("XI-0001", production());

    /*
     * A verdade gravada substitui o ponto de operação, e a medida é recalculada.
     *
     * Vem depois de tudo porque sobrescreve: o arranque põe a rede em regime, e
     * o estado gravado diz onde ela realmente estava.
     */
    if (restored != null) {
      for (var entry : restored.truth().entrySet()) {
        publish(entry.getKey(), entry.getValue());
      }
    }
  }

  /** Um motor novo, no ponto de operação. */
  public static ProcessEngine at(long startTick, int seed) {
    return new ProcessEngine(startTick, seed, null, null);
  }

  /** Um motor retomado de um estado gravado. */
  public static ProcessEngine resume(long startTick, int seed, State state) {
    return new ProcessEngine(startTick, seed, null, state);
  }

  /**
   * As relações que entram na rede MD.
   *
   * <p>As zonadas ficam de fora: a relação 11 é zona a zona, e o seu efeito no sentido da máquina é
   * a média das 140 zonas — que é zero quando o perfil está equilibrado, que é o caso em operação
   * normal. O perfil CD em si é resolvido por {@link CdProfile}, com o kernel gaussiano.
   */
  public static List<FopdtRelation> mdRelations() {
    return ProcessRelations.ALL.stream().filter(item -> !item.zoned()).toList();
  }

  private int stream(String tag) {
    return streams.computeIfAbsent(tag, Noise::streamOf);
  }

  private void publish(String tag, double value) {
    truth.put(tag, value);
    double sd = OperatingPoint.instrumentNoiseSd(tag);
    measured.put(
        tag,
        sd == 0
            ? value
            : value + sd * Noise.correlated(seed, (int) tick, stream(tag), NOISE_TAU_TICKS, 0));
  }

  /** Produção instantânea, da nota do catálogo em {@code XI-0001}. */
  private double production() {
    double speed = truth.getOrDefault("SIC-1104", 0.0);
    double basisWeight = truth.getOrDefault("AIC-902", 0.0);
    return WEB_WIDTH_M * speed * basisWeight * 60 / 1e6;
  }

  private static double clamp(double value, double min, double max) {
    return Math.min(Math.max(value, min), max);
  }

  /** Avança um passo. */
  public void advance() {
    tick += 1;

    // 1. as cascatas escrevem o setpoint das escravas, lendo a MEDIDA da PV
    for (var cascade : cascades) {
      double pv = measured.getOrDefault(cascade.pv(), 0.0);
      double sp = setpoints.getOrDefault(cascade.pv(), 0.0);
      slaveSetpoints.put(cascade.mv(), cascade.controller().step(sp, pv, DT_S));
    }

    // 2. as malhas caminham para o seu setpoint
    for (var loop : loops) {
      Double slave = slaveSetpoints.get(loop.tag());
      double target = slave != null ? slave : setpoints.getOrDefault(loop.tag(), loop.base());
      double current = truth.getOrDefault(loop.tag(), loop.base());
      publish(loop.tag(), clamp(target + (current - target) * mvDecay, loop.min(), loop.max()));
    }

    // 3. as relações integram o desvio da VERDADE da entrada
    for (var output : outputs) {
      double deviation = 0;
      for (var item : output.runners()) {
        double input = truth.getOrDefault(item.relation().input(), item.inputBase());
        deviation += item.runner().advance(input - item.inputBase());
      }
      // a medida NÃO é presa à faixa: é fora dela que o alarme vive
      publish(output.tag(), output.base() + deviation);
    }

    // 4. a superfície do cilindro segue a saturação do vapor do seu grupo
    for (var cylinder : cylinders) {
      publish(
          cylinder.tag(),
          Pi.cylinderSurfaceTempC(truth.getOrDefault(cylinder.pressureTag(), 0.0)));
    }

    // 5. derivadas
    publish("XI-0001", production());
    publish("XI-0002", WEB_WIDTH_M);

    // 6. o que a rede não move oscila em torno do ponto de operação
    for (var tag : freeTags) {
      publish(tag, OperatingPoint.require(tag));
    }
  }

  /** Avança até o passo pedido. Não volta atrás. */
  public void runTo(long target) {
    for (long k = tick; k < target; k++) {
      advance();
    }
  }

  public long tick() {
    return tick;
  }

  public int seed() {
    return seed;
  }

  /** O valor medido de uma tag — o que o historiador gravaria. */
  public Double measured(String tag) {
    return measured.get(tag);
  }

  /** O valor físico de uma tag, sem ruído de instrumento. */
  public Double truth(String tag) {
    return truth.get(tag);
  }

  /** Todas as medidas do passo atual. */
  public Map<String, Double> snapshot() {
    return Map.copyOf(measured);
  }

  /** O estado da rede, para gravar e retomar exatamente daqui. */
  public State snapshotState() {
    var runnerStates = new TreeMap<String, Fopdt.State>();
    for (var output : outputs) {
      for (var item : output.runners()) {
        runnerStates.put(item.relation().id(), item.runner().snapshot());
      }
    }

    var integrals = new TreeMap<String, Double>();
    for (var cascade : cascades) {
      integrals.put(cascade.pv(), cascade.controller().integral());
    }

    return new State(
        STATE_VERSION,
        tick,
        seed,
        new TreeMap<>(truth),
        new TreeMap<>(setpoints),
        integrals,
        runnerStates);
  }

  /** O setpoint de uma malha, ou {@code null} se a tag não tem setpoint. */
  public Double setpoint(String tag) {
    return setpoints.get(tag);
  }

  /**
   * Move o setpoint de uma malha.
   *
   * <p>Nas cascatas, a tag com setpoint é a <b>medida de qualidade</b> ({@code AIC-902}), e não a
   * malha de campo: é assim que se opera uma cascata, e deixar o operador escrever na escrava
   * enquanto o mestre está em automático daria uma briga entre os dois que nenhuma tela
   * explicaria.
   */
  public void setSetpoint(String tag, double value) {
    if (!setpoints.containsKey(tag)) {
      throw new IllegalArgumentException(
          "%s não aceita setpoint: ou não é malha de controle, ou é a escrava de uma cascata — nesse caso o setpoint pertence ao mestre."
              .formatted(tag));
    }
    setpoints.put(tag, value);
  }

  /**
   * Devolve a malha ao ponto de operação.
   *
   * <p>É o que fecha uma perturbação: o cenário mexe num setpoint, e quando o evento passa a malha
   * volta para onde estava. Guardar o valor anterior em quem chama daria um lugar a mais para
   * esquecer de restaurar.
   */
  public void resetSetpoint(String tag) {
    if (!setpoints.containsKey(tag)) {
      throw new IllegalArgumentException(
          "%s não aceita setpoint, então não há o que devolver.".formatted(tag));
    }
    setpoints.put(tag, OperatingPoint.require(tag));
  }

  /** As tags que aceitam setpoint, em ordem. */
  public List<String> settableTags() {
    return setpoints.keySet().stream().sorted().toList();
  }

  /** Os pares de cascata montados, para quem precisa saber quem manda em quem. */
  public static List<Map.Entry<String, String>> cascadePairs() {
    return CASCADES.stream()
        .map(spec -> Map.entry(spec.pv(), spec.mv()))
        .map(entry -> (Map.Entry<String, String>) entry)
        .toList();
  }

  /** Se a tag é a entrada manipulada de alguma cascata. */
  public static boolean isCascadeSlave(String tag) {
    return CASCADES.stream().anyMatch(spec -> spec.mv().equals(tag));
  }

  /** As tags que alguma relação move. */
  public static List<String> drivenTags() {
    return mdRelations().stream().map(FopdtRelation::output).distinct().sorted().toList();
  }

  /** As tags que a rede considera entrada. */
  public static List<String> networkInputs() {
    Set<String> inputs = new LinkedHashSet<>();
    for (var item : mdRelations()) {
      inputs.add(item.input());
    }
    return inputs.stream().sorted().toList();
  }
}
