package dev.felipesantos.papertwin.api;

import dev.felipesantos.papertwin.alarm.Alarm;
import dev.felipesantos.papertwin.alarm.AlarmPriority;
import dev.felipesantos.papertwin.alarm.AlarmRules;
import dev.felipesantos.papertwin.alarm.AlarmState;
import dev.felipesantos.papertwin.catalog.ProcessCatalog;
import dev.felipesantos.papertwin.db.OperationsRepository;
import dev.felipesantos.papertwin.db.SimStateRepository;
import dev.felipesantos.papertwin.operation.Entities;
import dev.felipesantos.papertwin.runtime.SimulationService;
import dev.felipesantos.papertwin.simulation.ProcessEngine;
import dev.felipesantos.papertwin.simulation.SimClock;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * As entidades de operação e as duas escritas que a API aceita: reconhecer alarme e mover
 * setpoint.
 *
 * <p>São só essas duas porque são as únicas ações que a norma e a operação reconhecem como de
 * operador. Tudo o mais que aparece nas telas é consequência do processo, não comando.
 */
@RestController
public class OperationController {

  private final SimulationService simulation;
  private final OperationsRepository operations;
  private final SimStateRepository simState;
  private final java.time.Clock clock;

  public OperationController(
      SimulationService simulation,
      OperationsRepository operations,
      SimStateRepository simState,
      java.time.Clock clock) {

    this.simulation = simulation;
    this.operations = operations;
    this.simState = simState;
    this.clock = clock;
  }

  private static final int DEFAULT_LIMIT = 40;

  // ---------------------------------------------------------------- listas ----

  public record Shifts(int count, List<Entities.Shift> shifts) {}

  @GetMapping("/shifts")
  public Shifts shifts(
      @RequestParam(required = false) String from,
      @RequestParam(required = false) String to,
      @RequestParam(required = false) Integer limit) {

    simulation.ensureCurrent();
    var list =
        operations.listShifts(
            from == null ? null : Instant.parse(from),
            to == null ? null : Instant.parse(to),
            limit == null ? DEFAULT_LIMIT : limit);
    return new Shifts(list.size(), list);
  }

  /**
   * O turno com o que aconteceu nele.
   *
   * <p>Vem tudo junto de propósito. A tela de Turno mostra as bobinas, as quebras, as trocas de
   * gramatura e a ronda do turno — cinco requisições para desenhar uma tela, num host que dorme,
   * são cinco chances de uma delas chegar depois. O limite de cem por lista é folgado: um turno
   * de oito horas fecha dez bobinas.
   */
  public record ShiftDetail(
      Entities.Shift shift,
      List<Entities.Reel> reels,
      List<Entities.WebBreak> webBreaks,
      List<Entities.GradeChange> gradeChanges,
      List<Entities.Round> rounds) {}

  /** O teto das listas do detalhe de turno. */
  private static final int DETAIL_LIMIT = 100;

  @GetMapping("/shifts/{id}")
  public ShiftDetail shift(@PathVariable String id) {
    simulation.ensureCurrent();
    var shift = operations.findShift(id);
    if (shift == null) {
      throw ApiErrors.notFound("O turno %s não existe".formatted(id));
    }

    return new ShiftDetail(
        shift,
        operations.listReels(id, DETAIL_LIMIT),
        operations.listWebBreaks(id, DETAIL_LIMIT),
        operations.listGradeChanges(id, DETAIL_LIMIT),
        operations.listRounds(id, DETAIL_LIMIT));
  }

  public record Reels(int count, List<Entities.Reel> reels) {}

  @GetMapping("/reels")
  public Reels reels(
      @RequestParam(required = false) String shiftId, @RequestParam(required = false) Integer limit) {

    simulation.ensureCurrent();
    var list = operations.listReels(shiftId, limit == null ? DEFAULT_LIMIT : limit);
    return new Reels(list.size(), list);
  }

  public record ReelDetail(Entities.Reel reel) {}

  @GetMapping("/reels/{number}")
  public ReelDetail reel(@PathVariable int number) {
    simulation.ensureCurrent();
    var reel = operations.findReel(number);
    if (reel == null) {
      throw ApiErrors.notFound("A bobina %d não existe".formatted(number));
    }
    return new ReelDetail(reel);
  }

  public record WebBreaks(int count, List<Entities.WebBreak> webBreaks) {}

  @GetMapping("/web-breaks")
  public WebBreaks webBreaks(
      @RequestParam(required = false) String shiftId,
      @RequestParam(required = false) Integer limit) {

    simulation.ensureCurrent();
    var list = operations.listWebBreaks(shiftId, limit == null ? DEFAULT_LIMIT : limit);
    return new WebBreaks(list.size(), list);
  }

  public record GradeChanges(int count, List<Entities.GradeChange> gradeChanges) {}

  @GetMapping("/grade-changes")
  public GradeChanges gradeChanges(
      @RequestParam(required = false) String shiftId,
      @RequestParam(required = false) Integer limit) {

    simulation.ensureCurrent();
    var list = operations.listGradeChanges(shiftId, limit == null ? DEFAULT_LIMIT : limit);
    return new GradeChanges(list.size(), list);
  }

  public record Rounds(int count, List<Entities.Round> rounds) {}

  @GetMapping("/rounds")
  public Rounds rounds(
      @RequestParam(required = false) String shiftId,
      @RequestParam(required = false) Integer limit) {

    simulation.ensureCurrent();
    var list = operations.listRounds(shiftId, limit == null ? DEFAULT_LIMIT : limit);
    return new Rounds(list.size(), list);
  }

  public record RoundDetail(Entities.Round round) {}

  @GetMapping("/rounds/{id}")
  public RoundDetail round(@PathVariable String id) {
    simulation.ensureCurrent();
    var round = operations.findRound(id);
    if (round == null) {
      throw ApiErrors.notFound("A ronda %s não existe".formatted(id));
    }
    return new RoundDetail(round);
  }

  public record Notes(int count, List<Entities.MaintenanceNote> notes) {}

  @GetMapping("/notes")
  public Notes notes(
      @RequestParam(required = false) String status,
      @RequestParam(required = false) String assetTag,
      @RequestParam(required = false) Integer limit) {

    simulation.ensureCurrent();
    var list =
        operations.listNotes(
            status == null ? null : Entities.NoteStatus.fromLabel(status),
            assetTag,
            limit == null ? DEFAULT_LIMIT : limit);
    return new Notes(list.size(), list);
  }

  public record NoteDetail(Entities.MaintenanceNote note) {}

  @GetMapping("/notes/{number}")
  public NoteDetail note(@PathVariable String number) {
    simulation.ensureCurrent();
    var note = operations.findNote(number);
    if (note == null) {
      throw ApiErrors.notFound("A nota %s não existe".formatted(number));
    }
    return new NoteDetail(note);
  }

  public record SetpointChanges(int count, List<Entities.SetpointChange> changes) {}

  @GetMapping("/setpoint-changes")
  public SetpointChanges setpointChanges(
      @RequestParam(required = false) String tag,
      @RequestParam(required = false) Integer limit) {

    simulation.ensureCurrent();
    var list = operations.listSetpointChanges(tag, limit == null ? DEFAULT_LIMIT : limit);
    return new SetpointChanges(list.size(), list);
  }

  /*
   * Um rótulo de filtro que não existe dá 400 com a lista dos aceitos, e não
   * uma lista vazia. Lista vazia é a resposta certa para "nenhum alarme
   * crítico" e a resposta errada para "crítico não é uma prioridade" — quem
   * errou de palavra ficaria procurando o alarme que não aparece.
   */

  private static AlarmState stateFilter(String label) {
    if (label == null) {
      return null;
    }
    for (var value : AlarmState.values()) {
      if (value.label().equals(label)) {
        return value;
      }
    }
    throw ApiErrors.badRequest(
        "%s não é um estado de alarme. Os aceitos são: ativo, reconhecido, normalizado"
            .formatted(label));
  }

  private static AlarmPriority priorityFilter(String label) {
    if (label == null) {
      return null;
    }
    for (var value : AlarmPriority.values()) {
      if (value.label().equals(label)) {
        return value;
      }
    }
    throw ApiErrors.badRequest(
        "%s não é uma prioridade de alarme. As aceitas são: crítica, alta, média, baixa"
            .formatted(label));
  }

  // ---------------------------------------------------------------- alarmes ----

  public record Alarms(
      int count,
      int floodWindowS,
      int floodThreshold,
      int inFloodWindow,
      boolean flooding,
      List<Alarm> alarms) {}

  @GetMapping("/alarms")
  public Alarms alarms(
      @RequestParam(required = false) String state,
      @RequestParam(required = false) String priority,
      @RequestParam(required = false) String tag,
      @RequestParam(required = false) Integer limit) {

    var report = simulation.ensureCurrent();
    var list =
        operations.listAlarms(
            stateFilter(state),
            priorityFilter(priority),
            tag,
            limit == null ? DEFAULT_LIMIT : limit);

    /*
     * A contagem de inundação vai na resposta, e não numa rota própria.
     *
     * Quem está olhando a lista é exatamente quem precisa saber que ela está
     * inundada — e uma segunda requisição para descobrir isso chegaria depois
     * de a tela já ter desenhado quarenta linhas.
     *
     * A janela é contada do INSTANTE DA SIMULAÇÃO, não do relógio de parede.
     * Os dois quase coincidem num host com tráfego, mas não no instantâneo do
     * modo de demonstração, que é de um instante escolhido: com o relógio de
     * parede a janela cairia num lugar sem alarme nenhum, e a tela mostraria
     * "0 na janela" tendo oito alarmes na lista.
     */
    var now = SimClock.tickTime(report.toTick());
    int inWindow =
        operations.countAlarmsInWindow(now.minusSeconds(AlarmRules.FLOOD_WINDOW_S), now);

    return new Alarms(
        list.size(),
        AlarmRules.FLOOD_WINDOW_S,
        AlarmRules.FLOOD_THRESHOLD,
        inWindow,
        inWindow > AlarmRules.FLOOD_THRESHOLD,
        list);
  }

  public record Acknowledge(@NotBlank String acknowledgedBy) {}

  public record AlarmResponse(Alarm alarm) {}

  /**
   * Reconhecer.
   *
   * <p>O repositório devolve nada tanto quando o alarme não existe quanto quando ele já havia
   * sido reconhecido, porque a leitura e a escrita acontecem no mesmo comando — e é isso que
   * impede dois cliques simultâneos de gravarem dois reconhecimentos. Aqui os dois casos são
   * separados por uma segunda consulta, porque para quem chamou eles são bem diferentes: 404 é
   * "esse alarme não existe", 409 é "alguém chegou antes de você".
   */
  @PostMapping("/alarms/{id}/ack")
  public AlarmResponse acknowledge(@PathVariable String id, @Valid @RequestBody Acknowledge body) {
    var acknowledged = operations.acknowledgeAlarm(id, body.acknowledgedBy(), clock.instant());
    if (acknowledged != null) {
      return new AlarmResponse(acknowledged);
    }

    var existing = operations.findAlarm(id);
    if (existing == null) {
      throw ApiErrors.notFound("O alarme %s não existe".formatted(id));
    }

    throw ApiErrors.conflict(
        "O alarme %s já foi reconhecido por %s"
            .formatted(id, existing.acknowledgedBy() == null ? "outro operador" : existing.acknowledgedBy()));
  }

  public record Shelve(@NotBlank String shelvedBy, int hours) {}

  /**
   * Engavetar.
   *
   * <p>O prazo tem teto de um turno, e o teto é <b>recusado</b> em vez de silenciosamente cortado:
   * quem pediu doze horas precisa saber que não vai ter doze horas, em vez de descobrir quando o
   * alarme voltar no meio do turno seguinte.
   */
  @PostMapping("/alarms/{id}/shelve")
  public AlarmResponse shelve(@PathVariable String id, @Valid @RequestBody Shelve body) {
    if (body.hours() > AlarmRules.MAX_SHELVE_HOURS) {
      throw ApiErrors.unprocessable(
          "O engavetamento tem teto de %d h, um turno: uma gaveta que sobrevive à troca de turno esconde o alarme de quem assume."
              .formatted(AlarmRules.MAX_SHELVE_HOURS));
    }
    if (body.hours() < 1) {
      throw ApiErrors.unprocessable("O engavetamento precisa de pelo menos uma hora.");
    }

    var until = clock.instant().plus(Duration.ofHours(body.hours()));
    var shelved = operations.shelveAlarm(id, body.shelvedBy(), until);
    if (shelved == null) {
      throw ApiErrors.notFound("O alarme %s não existe".formatted(id));
    }
    return new AlarmResponse(shelved);
  }

  @PostMapping("/alarms/{id}/unshelve")
  public AlarmResponse unshelve(@PathVariable String id) {
    var alarm = operations.unshelveAlarm(id);
    if (alarm == null) {
      throw ApiErrors.notFound("O alarme %s não existe".formatted(id));
    }
    return new AlarmResponse(alarm);
  }

  // -------------------------------------------------- escrita de setpoint ----

  /**
   * O corpo de uma escrita de setpoint.
   *
   * <p>{@code changedBy} é opcional e cai em "operador". Não há autenticação neste projeto, e
   * exigir o nome de quem escreve daria a impressão de que alguém o verificou. O {@code reason},
   * por outro lado, é obrigatório: uma escrita sem motivo é exatamente a que ninguém consegue
   * explicar depois, e explicar depois é para que a auditoria existe.
   */
  public record WriteSetpoint(double value, @Nullable String changedBy, @NotBlank String reason) {}

  /**
   * O que a escrita devolve.
   *
   * <p>A faixa vai junto para a tela poder validar o campo sem uma segunda requisição ao
   * catálogo — a mesma faixa que uma recusa devolve, de modo que o cliente trata os dois casos
   * com o mesmo código.
   */
  public record SetpointWritten(Entities.SetpointChange change, double min, double max) {}

  /** O nome que entra na auditoria quando ninguém se identifica. */
  private static final String DEFAULT_OPERATOR = "operador";

  /**
   * Mover um setpoint.
   *
   * <p>{@code PUT} e não {@code POST} porque o setpoint é um valor com identidade — a tag — e
   * escrever o mesmo valor duas vezes é a mesma coisa que escrever uma. O registro de auditoria
   * que isso gera, por outro lado, não é idempotente: ele é um evento, e dois eventos são dois.
   *
   * <p>A escrita é auditada por construção: o valor anterior é <b>lido no servidor</b>, nunca
   * enviado por quem escreve. Quem escreve não tem como saber se alguém mexeu entre a leitura da
   * tela e o clique, e um anterior informado errado faria a auditoria registrar uma ficção.
   */
  @PutMapping("/process/tags/{tag}/setpoint")
  public SetpointWritten writeSetpoint(
      @PathVariable String tag, @Valid @RequestBody WriteSetpoint body) {

    var variable = ProcessCatalog.get(tag);
    if (variable == null) {
      throw ApiErrors.setpointRejected(
          org.springframework.http.HttpStatus.NOT_FOUND,
          "tag-desconhecida",
          "A tag %s não existe no catálogo de processo".formatted(tag),
          null,
          null);
    }

    if (!variable.controlled()) {
      throw ApiErrors.setpointRejected(
          org.springframework.http.HttpStatus.UNPROCESSABLE_ENTITY,
          "nao-e-malha",
          "A tag %s não é malha de controle: é só medição, e medição não tem setpoint"
              .formatted(tag),
          variable.min(),
          variable.max());
    }

    /*
     * A escrava de uma cascata não aceita escrita, e isso não é regra do catálogo.
     *
     * A PIC-711 passa em tudo o que o catálogo pede — existe, é malha, está na
     * faixa — e ainda assim não aceita, porque o setpoint dela pertence ao
     * mestre. Recusar é melhor que aceitar e ignorar: aceitar gravaria uma
     * auditoria dizendo que alguém mudou um setpoint que o passo seguinte
     * sobrescreveria sem aviso.
     */
    if (ProcessEngine.isCascadeSlave(tag)) {
      var master = ProcessEngine.cascadeMasterOf(tag);
      throw ApiErrors.setpointRejected(
          org.springframework.http.HttpStatus.UNPROCESSABLE_ENTITY,
          "escrava-de-cascata",
          "%s é a malha escrava da cascata de %s: o setpoint dela pertence ao mestre. Escreva em %s."
              .formatted(tag, master, master),
          variable.min(),
          variable.max());
    }

    if (body.value() < variable.min() || body.value() > variable.max()) {
      throw ApiErrors.setpointRejected(
          org.springframework.http.HttpStatus.UNPROCESSABLE_ENTITY,
          "fora-da-faixa",
          "O valor %s está fora da faixa de operação de %s, que vai de %s a %s %s"
              .formatted(body.value(), tag, variable.min(), variable.max(), variable.unit()),
          variable.min(),
          variable.max());
    }

    var report = simulation.ensureCurrent();

    /*
     * A ordem de preferência do valor anterior: a última escrita registrada e,
     * se nunca houve nenhuma, o setpoint em vigor na rede — que no arranque é
     * o ponto de operação do catálogo.
     */
    var previousWrite = operations.latestSetpointChange(tag);
    double previous =
        previousWrite != null
            ? previousWrite.newValue()
            : report.values().getOrDefault(
                tag, variable.target() == null ? 0 : variable.target());

    var at = clock.instant();
    var change =
        new Entities.SetpointChange(
            "SP-%d-%s".formatted(at.getEpochSecond(), tag),
            tag,
            round4(previous),
            body.value(),
            variable.unit(),
            body.changedBy() == null || body.changedBy().isBlank()
                ? DEFAULT_OPERATOR
                : body.changedBy(),
            at,
            body.reason());

    operations.saveSetpointChange(change);

    /*
     * A escrita só tem efeito se entrar no estado gravado.
     *
     * A rede é remontada do estado a cada retomada, e o setpoint faz parte
     * dele. Sem isto a auditoria registraria uma escrita que a simulação nunca
     * viu — o pior dos dois mundos, porque a tela mostraria o registro e o
     * processo não se mexeria.
     */
    simState.applySetpoint(tag, body.value());

    return new SetpointWritten(change, variable.min(), variable.max());
  }

  /** O mesmo arredondamento do {@code toFixed(4)} do outro lado: meio para cima, valor exato. */
  private static double round4(double value) {
    return new java.math.BigDecimal(value)
        .setScale(4, java.math.RoundingMode.HALF_UP)
        .doubleValue();
  }
}
