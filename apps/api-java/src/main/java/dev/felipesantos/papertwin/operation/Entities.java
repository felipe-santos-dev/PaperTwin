package dev.felipesantos.papertwin.operation;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/**
 * As entidades de operação: o que aconteceu na máquina, em linguagem de quem opera.
 *
 * <p>Todas ficam num arquivo só porque são um vocabulário, não oito módulos: elas se referenciam
 * entre si — a bobina pertence ao turno, a troca de gramatura cita as bobinas que pegou, a nota
 * aponta para o alarme que a originou — e lê-las juntas é como se lê um quadro de turno.
 *
 * <p>Os campos opcionais são {@code null} e não ausentes, e os filhos são listas e não colunas de
 * array: é isso que permite consultar por eles. "Quais quebras tiveram sinal na PDIC-721" é uma
 * pergunta que alguém faz, e com array dentro da linha ela não teria resposta.
 */
public final class Entities {

  private Entities() {}

  // ----------------------------------------------------------------- turno ----

  /**
   * Um turno.
   *
   * @param productionT produção acumulada, em toneladas
   * @param efficiencyPct contra a produção nominal do turno — 0 a 100
   * @param handover as linhas da passagem de turno, na ordem em que foram escritas
   */
  public record Shift(
      String id,
      String letter,
      LocalDate operationDate,
      Instant startedAt,
      Instant endedAt,
      String operator,
      double productionT,
      double efficiencyPct,
      List<String> handover) {}

  // ---------------------------------------------------------------- bobina ----

  /** O que se decidiu sobre uma bobina depois de medi-la. */
  public enum Disposition {
    APROVADA("aprovada"),
    REBAIXADA("rebaixada"),
    SEGREGADA("segregada");

    private final String label;

    Disposition(String label) {
      this.label = label;
    }

    public String label() {
      return label;
    }

    public static Disposition fromLabel(String label) {
      if (label == null) {
        return null;
      }
      for (var value : values()) {
        if (value.label.equals(label)) {
          return value;
        }
      }
      throw new IllegalArgumentException("Destino de bobina desconhecido: " + label);
    }
  }

  /**
   * Uma bobina mãe.
   *
   * <p>As médias são <b>no tempo</b>, colhidas do arquivo do historiador na janela da bobina, e
   * não amostras do instante do fechamento. Os três `cd` são a dispersão 2σ do perfil transversal:
   * ou vêm os três, ou nenhum — meia medição de perfil não diz nada.
   *
   * @param dispositionReason obrigatório quando a bobina não foi aprovada
   */
  public record Reel(
      int number,
      String shiftId,
      Instant startedAt,
      Instant endedAt,
      Double weightT,
      Double lengthM,
      Double finalDiameterMm,
      Double basisWeightGsm,
      Double moisturePct,
      Double caliperUm,
      Double cdBasisWeightGsm,
      Double cdMoisturePct,
      Double cdCaliperUm,
      int splices,
      Disposition disposition,
      String dispositionReason) {}

  // ------------------------------------------------------- quebra de folha ----

  /**
   * Um sinal que antecedeu a quebra.
   *
   * @param leadTimeS quantos segundos antes da quebra o sinal apareceu — de 0 a 600
   */
  public record Precursor(
      int leadTimeS, String tag, String description, double valueBefore, double valueAtSignal) {}

  /**
   * Uma quebra de folha.
   *
   * <p>A <b>causa provável</b> é o que quem opera anotaria, e os <b>sinais</b> são o que o
   * processo de fato fez nos dez minutos anteriores. As duas coisas podem não bater, e o modelo
   * guarda as duas separadas de propósito: é assim que acontece numa máquina de verdade, e juntar
   * as duas num campo só apagaria a diferença entre o que se achou e o que se mediu.
   */
  public record WebBreak(
      String id,
      String shiftId,
      Instant startedAt,
      Instant endedAt,
      String section,
      String probableCause,
      List<Precursor> precursors) {}

  // --------------------------------------------------- troca de gramatura ----

  /**
   * Uma troca de gramatura.
   *
   * @param stabilizedAt quando o processo voltou à faixa; {@code null} enquanto não voltou
   * @param affectedReels as bobinas que pegaram a transição — as que terminaram depois do começo
   *     da troca e começaram antes da estabilização
   */
  public record GradeChange(
      String id,
      String shiftId,
      double fromGsm,
      double toGsm,
      Instant startedAt,
      Instant stabilizedAt,
      List<Integer> affectedReels) {}

  // ----------------------------------------------------------------- ronda ----

  public enum Noise {
    NORMAL("normal"),
    ELEVADO("elevado"),
    ANORMAL("anormal");

    private final String label;

    Noise(String label) {
      this.label = label;
    }

    public String label() {
      return label;
    }

    public static Noise fromLabel(String label) {
      for (var value : values()) {
        if (value.label.equals(label)) {
          return value;
        }
      }
      throw new IllegalArgumentException("Nível de ruído desconhecido: " + label);
    }
  }

  public enum Leak {
    NENHUM("nenhum"),
    GOTEJAMENTO("gotejamento"),
    JATO("jato");

    private final String label;

    Leak(String label) {
      this.label = label;
    }

    public String label() {
      return label;
    }

    public static Leak fromLabel(String label) {
      for (var value : values()) {
        if (value.label.equals(label)) {
          return value;
        }
      }
      throw new IllegalArgumentException("Nível de vazamento desconhecido: " + label);
    }
  }

  /**
   * Um ponto de ronda.
   *
   * <p>O {@code onlineValue} é o que o instrumento dizia no mesmo instante, guardado junto com o
   * que a pessoa mediu em campo. É a comparação que dá valor à ronda: pirômetro e sensor
   * discordando é notícia, e sem os dois lado a lado ninguém vê.
   */
  public record RoundPoint(
      int sequence,
      String assetTag,
      Double fieldTempC,
      Noise noise,
      Leak leak,
      String note,
      String onlineTag,
      Double onlineValue) {}

  public record Round(
      String id,
      String shiftId,
      Instant startedAt,
      Instant finishedAt,
      String inspector,
      List<RoundPoint> points) {}

  // ---------------------------------------------- nota de manutenção ----

  public enum NoteOrigin {
    ALARME("alarme"),
    RONDA("ronda"),
    OPERACAO("operação");

    private final String label;

    NoteOrigin(String label) {
      this.label = label;
    }

    public String label() {
      return label;
    }

    public static NoteOrigin fromLabel(String label) {
      for (var value : values()) {
        if (value.label.equals(label)) {
          return value;
        }
      }
      throw new IllegalArgumentException("Origem de nota desconhecida: " + label);
    }
  }

  public enum NoteStatus {
    ABERTA("aberta"),
    PLANEJADA("planejada"),
    EM_EXECUCAO("em execução"),
    ENCERRADA("encerrada");

    private final String label;

    NoteStatus(String label) {
      this.label = label;
    }

    public String label() {
      return label;
    }

    public static NoteStatus fromLabel(String label) {
      for (var value : values()) {
        if (value.label.equals(label)) {
          return value;
        }
      }
      throw new IllegalArgumentException("Situação de nota desconhecida: " + label);
    }
  }

  public enum EvidenceKind {
    TENDENCIA("tendência"),
    ALARME("alarme"),
    RONDA("ronda"),
    MEDICAO("medição");

    private final String label;

    EvidenceKind(String label) {
      this.label = label;
    }

    public String label() {
      return label;
    }

    public static EvidenceKind fromLabel(String label) {
      for (var value : values()) {
        if (value.label.equals(label)) {
          return value;
        }
      }
      throw new IllegalArgumentException("Tipo de evidência desconhecido: " + label);
    }
  }

  /**
   * Uma evidência de nota.
   *
   * <p>É <b>referência</b>, não arquivo. O gêmeo não guarda foto nem anexo — não teria onde, nos
   * 0,5 GB — e aponta para o que já existe: uma janela de tendência, um alarme, um ponto de ronda,
   * uma medição.
   */
  public record Evidence(int sequence, EvidenceKind kind, String ref, String label) {}

  /**
   * Uma nota de manutenção.
   *
   * @param priority 1 parada imediata, 2 próxima parada programada, 3 parada de manutenção, 4
   *     quando houver oportunidade
   * @param originRef id do alarme ou da ronda que originou; {@code null} quando veio da operação
   */
  public record MaintenanceNote(
      String number,
      String assetTag,
      String symptom,
      int priority,
      NoteOrigin origin,
      String originRef,
      NoteStatus status,
      boolean requiresShutdown,
      Instant createdAt,
      Instant closedAt,
      List<Evidence> evidence) {}

  // --------------------------------------------------- escrita de setpoint ----

  /**
   * Uma escrita de setpoint.
   *
   * <p>O {@code previousValue} é lido no servidor, e não enviado por quem escreve: um cliente que
   * informasse o valor anterior poderia informar errado, e a auditoria passaria a registrar uma
   * ficção. O motivo é obrigatório — uma escrita sem motivo é a que ninguém consegue explicar
   * depois.
   */
  public record SetpointChange(
      String id,
      String tag,
      double previousValue,
      double newValue,
      String unit,
      String changedBy,
      Instant changedAt,
      String reason) {}
}
