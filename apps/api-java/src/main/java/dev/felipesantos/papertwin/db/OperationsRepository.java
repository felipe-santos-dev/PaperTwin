package dev.felipesantos.papertwin.db;

import dev.felipesantos.papertwin.alarm.Alarm;
import dev.felipesantos.papertwin.alarm.AlarmLimitLevel;
import dev.felipesantos.papertwin.alarm.AlarmPriority;
import dev.felipesantos.papertwin.alarm.AlarmState;
import dev.felipesantos.papertwin.operation.Entities;
import dev.felipesantos.papertwin.operation.Entities.Disposition;
import dev.felipesantos.papertwin.operation.Entities.Evidence;
import dev.felipesantos.papertwin.operation.Entities.EvidenceKind;
import dev.felipesantos.papertwin.operation.Entities.GradeChange;
import dev.felipesantos.papertwin.operation.Entities.Leak;
import dev.felipesantos.papertwin.operation.Entities.MaintenanceNote;
import dev.felipesantos.papertwin.operation.Entities.Noise;
import dev.felipesantos.papertwin.operation.Entities.NoteOrigin;
import dev.felipesantos.papertwin.operation.Entities.NoteStatus;
import dev.felipesantos.papertwin.operation.Entities.Precursor;
import dev.felipesantos.papertwin.operation.Entities.Reel;
import dev.felipesantos.papertwin.operation.Entities.Round;
import dev.felipesantos.papertwin.operation.Entities.RoundPoint;
import dev.felipesantos.papertwin.operation.Entities.SetpointChange;
import dev.felipesantos.papertwin.operation.Entities.Shift;
import dev.felipesantos.papertwin.operation.Entities.WebBreak;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import javax.sql.DataSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;

/**
 * As entidades de operação no banco.
 *
 * <p>Toda escrita é <b>upsert</b>, e isso não é conveniência: a retomada reexecuta trechos, e
 * reexecutar tem de produzir o mesmo banco. Um {@code insert} puro quebraria na segunda passagem;
 * um {@code insert ... on conflict do nothing} deixaria entidades pela metade quando a primeira
 * passagem tivesse parado no meio. O {@code do update} é o único que converge.
 *
 * <p>Os filhos — passagem de turno, sinais de quebra, pontos de ronda, evidências — são apagados e
 * reinseridos dentro da mesma transação do pai. Reconciliar linha a linha custaria mais do que
 * vale para listas de meia dúzia de itens, e deixaria órfãos quando a lista encolhesse.
 */
public class OperationsRepository {

  private final JdbcClient jdbc;
  private final JdbcTemplate template;
  private final TransactionTemplate transaction;

  public OperationsRepository(DataSource dataSource) {
    this.jdbc = JdbcClient.create(dataSource);
    this.template = new JdbcTemplate(dataSource);
    this.transaction = new TransactionTemplate(new DataSourceTransactionManager(dataSource));
  }

  private static Instant instant(ResultSet rs, String column) throws SQLException {
    var value = rs.getTimestamp(column);
    return value == null ? null : value.toInstant();
  }

  private static Timestamp stamp(Instant instant) {
    return instant == null ? null : Timestamp.from(instant);
  }

  private static Double nullableDouble(ResultSet rs, String column) throws SQLException {
    double value = rs.getDouble(column);
    return rs.wasNull() ? null : value;
  }

  /**
   * Roda um bloco de escritas numa transação só.
   *
   * <p>Cada {@code saveX} abre a sua própria transação, o que é o certo quando é chamado
   * sozinho. A colheita grava algumas dezenas de entidades de uma vez, e aí cada {@code commit}
   * é uma ida ao banco: num banco gerenciado, do outro lado da rede, isso domina o custo. As
   * transações internas se juntam a esta — é o que {@code PROPAGATION_REQUIRED} faz —, de modo
   * que tudo entra ou nada entra.
   */
  public void inOneTransaction(Runnable work) {
    transaction.executeWithoutResult(status -> work.run());
  }

  // ----------------------------------------------------------------- ativo ----

  /**
   * Reescreve a tabela de ativos a partir do modelo da máquina.
   *
   * <p>O modelo é a fonte da verdade das tags, então o banco segue o código e nunca o contrário. A
   * tabela existe porque as entidades apontam para ela — um ponto de ronda referencia o ativo que
   * a pessoa foi olhar, e sem a linha o banco recusa a ronda.
   *
   * <p>É <b>upsert sem apagar</b>, e aqui está a diferença em relação à versão TypeScript, que
   * fazia {@code delete from asset} antes de inserir. Aquilo funciona num banco em memória que
   * nasce vazio e falha num banco gerenciado: assim que existe uma ronda ou uma nota, o {@code
   * delete} bate na chave estrangeira e o arranque inteiro cai. O custo de não apagar é uma tag
   * removida do modelo ficar para trás na tabela; o custo de apagar é a API não subir.
   *
   * <p>A ordem importa: {@code parent_tag} referencia a própria tabela, então o corpo girante
   * precisa entrar antes do mancal. {@code MachineAssets.ALL} já vem nessa ordem.
   */
  public int replaceAssets(List<dev.felipesantos.papertwin.machine.MachineAssets.Asset> assets) {
    transaction.executeWithoutResult(
        status -> {
          for (var asset : assets) {
            template.update(
                """
                insert into asset
                  (tag, kind, label, section, position_x, position_y, position_z,
                   radius_m, length_m, side, parent_tag, steam_group,
                   iso_group, iso_support, source)
                values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                on conflict (tag) do update set
                  kind = excluded.kind,
                  label = excluded.label,
                  section = excluded.section,
                  position_x = excluded.position_x,
                  position_y = excluded.position_y,
                  position_z = excluded.position_z,
                  radius_m = excluded.radius_m,
                  length_m = excluded.length_m,
                  side = excluded.side,
                  parent_tag = excluded.parent_tag,
                  steam_group = excluded.steam_group,
                  iso_group = excluded.iso_group,
                  iso_support = excluded.iso_support,
                  source = excluded.source
                """,
                asset.tag(),
                asset.kind(),
                asset.label(),
                asset.section(),
                asset.x(),
                asset.y(),
                asset.z(),
                asset.radius(),
                asset.lengthM(),
                asset.side(),
                asset.parentTag(),
                asset.steamGroup(),
                asset.iso() == null ? null : asset.iso().group(),
                asset.iso() == null ? null : asset.iso().support(),
                asset.source());
          }
        });

    return assets.size();
  }

  public int countAssets() {
    var count = jdbc.sql("select count(*) from asset").query(Long.class).single();
    return count == null ? 0 : count.intValue();
  }

  // ----------------------------------------------------------------- turno ----

  public void saveShift(Shift shift) {
    transaction.executeWithoutResult(
        status -> {
          template.update(
              """
              insert into shift (id, letter, operation_date, started_at, ended_at, operator,
                                 production_t, efficiency_pct)
              values (?, ?, ?, ?, ?, ?, ?, ?)
              on conflict (id) do update set
                letter = excluded.letter,
                operation_date = excluded.operation_date,
                started_at = excluded.started_at,
                ended_at = excluded.ended_at,
                operator = excluded.operator,
                production_t = excluded.production_t,
                efficiency_pct = excluded.efficiency_pct
              """,
              shift.id(),
              shift.letter(),
              java.sql.Date.valueOf(shift.operationDate()),
              stamp(shift.startedAt()),
              stamp(shift.endedAt()),
              shift.operator(),
              shift.productionT(),
              shift.efficiencyPct());

          template.update("delete from shift_handover where shift_id = ?", shift.id());

          var lines = shift.handover();
          for (int i = 0; i < lines.size(); i++) {
            template.update(
                "insert into shift_handover (shift_id, sequence, line) values (?, ?, ?)",
                shift.id(),
                i + 1,
                lines.get(i));
          }
        });
  }

  public List<Shift> listShifts(int limit) {
    return listShifts(null, null, limit);
  }

  public List<Shift> listShifts(Instant from, Instant to, int limit) {
    var filter = new Filter().atOrAfter("started_at", from).atOrBefore("started_at", to);

    var shifts =
        jdbc.sql("select * from shift%s order by started_at desc limit ?".formatted(filter.where()))
            .params(filter.params(limit))
            .query((rs, row) -> shiftRow(rs))
            .list();

    return withHandover(shifts);
  }

  public Shift findShift(String id) {
    var shift =
        jdbc.sql("select * from shift where id = ?")
            .param(id)
            .query((rs, row) -> shiftRow(rs))
            .optional()
            .orElse(null);

    return shift == null ? null : withHandover(List.of(shift)).getFirst();
  }

  private static Shift shiftRow(ResultSet rs) throws SQLException {
    return new Shift(
        rs.getString("id"),
        rs.getString("letter"),
        rs.getDate("operation_date").toLocalDate(),
        instant(rs, "started_at"),
        instant(rs, "ended_at"),
        rs.getString("operator"),
        rs.getDouble("production_t"),
        rs.getDouble("efficiency_pct"),
        List.of());
  }

  /**
   * Junta as linhas de passagem aos turnos numa consulta só.
   *
   * <p>Uma consulta por turno seria o problema do N+1 numa tela que lista trinta turnos. Com uma
   * consulta e um agrupamento em memória, são duas idas ao banco qualquer que seja a lista.
   */
  private List<Shift> withHandover(List<Shift> shifts) {
    if (shifts.isEmpty()) {
      return shifts;
    }

    var ids = shifts.stream().map(Shift::id).toList();
    var byShift = new LinkedHashMap<String, List<String>>();

    jdbc.sql(
            "select shift_id, line from shift_handover where shift_id in (%s) order by shift_id, sequence"
                .formatted(placeholders(ids.size())))
        .params(ids.toArray())
        .query(
            (rs, row) -> {
              byShift
                  .computeIfAbsent(rs.getString("shift_id"), key -> new ArrayList<>())
                  .add(rs.getString("line"));
              return null;
            })
        .list();

    return shifts.stream()
        .map(
            shift ->
                new Shift(
                    shift.id(),
                    shift.letter(),
                    shift.operationDate(),
                    shift.startedAt(),
                    shift.endedAt(),
                    shift.operator(),
                    shift.productionT(),
                    shift.efficiencyPct(),
                    List.copyOf(byShift.getOrDefault(shift.id(), List.of()))))
        .toList();
  }

  /**
   * Marcadores {@code ?} para um {@code in (...)}.
   *
   * <p>Gerados, e não um {@code = any(?)} com array: o driver resolve o tipo de cada parâmetro
   * posicional sem ambiguidade, enquanto o array exige dizer o tipo do elemento e falha de formas
   * difíceis de ler quando a lista está vazia.
   */
  /**
   * Um filtro de lista: as condições que vieram, e só elas.
   *
   * <p>As rotas de lista aceitam filtros opcionais — turno, tag, estado, janela. Escrever um
   * {@code select} por combinação daria dezenas; passar os nulos para dentro do SQL com {@code
   * (? is null or coluna = ?)} funciona, mas cega o planejador: ele não sabe se o filtro existe e
   * escolhe o plano pelo pior caso. Montar a cláusula com o que chegou é mais código aqui e uma
   * consulta honesta lá.
   */
  private static final class Filter {

    private final List<String> conditions = new ArrayList<>();
    private final List<Object> values = new ArrayList<>();

    Filter eq(String column, Object value) {
      if (value != null) {
        conditions.add(column + " = ?");
        values.add(value);
      }
      return this;
    }

    Filter atOrAfter(String column, Instant value) {
      if (value != null) {
        conditions.add(column + " >= ?");
        values.add(stamp(value));
      }
      return this;
    }

    Filter atOrBefore(String column, Instant value) {
      if (value != null) {
        conditions.add(column + " <= ?");
        values.add(stamp(value));
      }
      return this;
    }

    /** O {@code where}, ou nada quando não há condição. */
    String where() {
      return conditions.isEmpty() ? "" : " where " + String.join(" and ", conditions);
    }

    /** Os valores na ordem das condições, com o {@code limit} no fim. */
    Object[] params(int limit) {
      var out = new ArrayList<>(values);
      out.add(limit);
      return out.toArray();
    }
  }

  private static String placeholders(int count) {
    return String.join(", ", java.util.Collections.nCopies(count, "?"));
  }

  // ---------------------------------------------------------------- bobina ----

  public void saveReel(Reel reel) {
    template.update(
        """
        insert into jumbo_reel (number, shift_id, started_at, ended_at, weight_t, length_m,
                                final_diameter_mm, basis_weight_gsm, moisture_pct, caliper_um,
                                cd_basis_weight_gsm, cd_moisture_pct, cd_caliper_um, splices,
                                disposition, disposition_reason)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        on conflict (number) do update set
          shift_id = excluded.shift_id,
          started_at = excluded.started_at,
          ended_at = excluded.ended_at,
          weight_t = excluded.weight_t,
          length_m = excluded.length_m,
          final_diameter_mm = excluded.final_diameter_mm,
          basis_weight_gsm = excluded.basis_weight_gsm,
          moisture_pct = excluded.moisture_pct,
          caliper_um = excluded.caliper_um,
          cd_basis_weight_gsm = excluded.cd_basis_weight_gsm,
          cd_moisture_pct = excluded.cd_moisture_pct,
          cd_caliper_um = excluded.cd_caliper_um,
          splices = excluded.splices,
          disposition = excluded.disposition,
          disposition_reason = excluded.disposition_reason
        """,
        reel.number(),
        reel.shiftId(),
        stamp(reel.startedAt()),
        stamp(reel.endedAt()),
        reel.weightT(),
        reel.lengthM(),
        reel.finalDiameterMm(),
        reel.basisWeightGsm(),
        reel.moisturePct(),
        reel.caliperUm(),
        reel.cdSpread() == null ? null : reel.cdSpread().basisWeightGsm(),
        reel.cdSpread() == null ? null : reel.cdSpread().moisturePct(),
        reel.cdSpread() == null ? null : reel.cdSpread().caliperUm(),
        reel.splices(),
        reel.disposition() == null ? null : reel.disposition().label(),
        reel.dispositionReason());
  }

  public List<Reel> listReels(String shiftId, int limit) {
    var sql =
        shiftId == null
            ? "select * from jumbo_reel order by number desc limit ?"
            : "select * from jumbo_reel where shift_id = ? order by number desc limit ?";

    var spec = jdbc.sql(sql);
    if (shiftId != null) {
      spec = spec.param(shiftId);
    }

    return spec.param(limit).query((rs, row) -> reelRow(rs)).list();
  }

  public Reel findReel(int number) {
    return jdbc
        .sql("select * from jumbo_reel where number = ?")
        .param(number)
        .query((rs, row) -> reelRow(rs))
        .optional()
        .orElse(null);
  }

  private static Reel reelRow(ResultSet rs) throws SQLException {
    return new Reel(
        rs.getInt("number"),
        rs.getString("shift_id"),
        instant(rs, "started_at"),
        instant(rs, "ended_at"),
        nullableDouble(rs, "weight_t"),
        nullableDouble(rs, "length_m"),
        nullableDouble(rs, "final_diameter_mm"),
        nullableDouble(rs, "basis_weight_gsm"),
        nullableDouble(rs, "moisture_pct"),
        nullableDouble(rs, "caliper_um"),
        cdSpread(rs),
        rs.getInt("splices"),
        Disposition.fromLabel(rs.getString("disposition")),
        rs.getString("disposition_reason"));
  }

  /**
   * O perfil transversal, se o scanner mediu as tres coisas.
   *
   * <p>A tabela guarda tres colunas e o modelo um registro so, e a conversao mora aqui. A coluna
   * de gramatura decide: a restricao {@code reel_cd_spread_complete} garante que as tres sejam
   * nulas juntas ou nao-nulas juntas, entao nao ha meio perfil para desempatar.
   */
  private static Entities.CdSpread cdSpread(ResultSet rs) throws SQLException {
    var basisWeight = nullableDouble(rs, "cd_basis_weight_gsm");
    if (basisWeight == null) {
      return null;
    }
    return new Entities.CdSpread(
        basisWeight, rs.getDouble("cd_moisture_pct"), rs.getDouble("cd_caliper_um"));
  }

  // ------------------------------------------------------- quebra de folha ----

  public void saveWebBreak(WebBreak brk) {
    transaction.executeWithoutResult(
        status -> {
          template.update(
              """
              insert into web_break (id, shift_id, started_at, ended_at, section, probable_cause)
              values (?, ?, ?, ?, ?, ?)
              on conflict (id) do update set
                shift_id = excluded.shift_id,
                started_at = excluded.started_at,
                ended_at = excluded.ended_at,
                section = excluded.section,
                probable_cause = excluded.probable_cause
              """,
              brk.id(),
              brk.shiftId(),
              stamp(brk.startedAt()),
              stamp(brk.endedAt()),
              brk.section(),
              brk.probableCause());

          template.update("delete from web_break_precursor where break_id = ?", brk.id());

          for (var precursor : brk.precursors()) {
            template.update(
                """
                insert into web_break_precursor
                  (break_id, lead_time_s, tag, description, value_before, value_at_signal)
                values (?, ?, ?, ?, ?, ?)
                """,
                brk.id(),
                precursor.leadTimeS(),
                precursor.tag(),
                precursor.description(),
                precursor.valueBefore(),
                precursor.valueAtSignal());
          }
        });
  }

  public List<WebBreak> listWebBreaks(int limit) {
    return listWebBreaks(null, limit);
  }

  public List<WebBreak> listWebBreaks(String shiftId, int limit) {
    var filter = new Filter().eq("shift_id", shiftId);

    var breaks =
        jdbc.sql(
                "select * from web_break%s order by started_at desc limit ?"
                    .formatted(filter.where()))
            .params(filter.params(limit))
            .query(
                (rs, row) ->
                    new WebBreak(
                        rs.getString("id"),
                        rs.getString("shift_id"),
                        instant(rs, "started_at"),
                        instant(rs, "ended_at"),
                        rs.getString("section"),
                        rs.getString("probable_cause"),
                        List.of()))
            .list();

    if (breaks.isEmpty()) {
      return breaks;
    }

    var ids = breaks.stream().map(WebBreak::id).toList();
    var byBreak = new LinkedHashMap<String, List<Precursor>>();

    jdbc.sql(
            "select * from web_break_precursor where break_id in (%s) order by break_id, lead_time_s desc"
                .formatted(placeholders(ids.size())))
        .params(ids.toArray())
        .query(
            (rs, row) -> {
              byBreak
                  .computeIfAbsent(rs.getString("break_id"), key -> new ArrayList<>())
                  .add(
                      new Precursor(
                          rs.getInt("lead_time_s"),
                          rs.getString("tag"),
                          rs.getString("description"),
                          rs.getDouble("value_before"),
                          rs.getDouble("value_at_signal")));
              return null;
            })
        .list();

    return breaks.stream()
        .map(
            brk ->
                new WebBreak(
                    brk.id(),
                    brk.shiftId(),
                    brk.startedAt(),
                    brk.endedAt(),
                    brk.section(),
                    brk.probableCause(),
                    List.copyOf(byBreak.getOrDefault(brk.id(), List.of()))))
        .toList();
  }

  // ---------------------------------------------------- troca de gramatura ----

  public void saveGradeChange(GradeChange change) {
    transaction.executeWithoutResult(
        status -> {
          template.update(
              """
              insert into grade_change (id, shift_id, from_gsm, to_gsm, started_at, stabilized_at)
              values (?, ?, ?, ?, ?, ?)
              on conflict (id) do update set
                shift_id = excluded.shift_id,
                from_gsm = excluded.from_gsm,
                to_gsm = excluded.to_gsm,
                started_at = excluded.started_at,
                stabilized_at = excluded.stabilized_at
              """,
              change.id(),
              change.shiftId(),
              change.fromGsm(),
              change.toGsm(),
              stamp(change.startedAt()),
              stamp(change.stabilizedAt()));

          template.update("delete from grade_change_reel where change_id = ?", change.id());

          for (int number : change.affectedReels()) {
            // a bobina pode ainda não existir quando a troca é gravada; a
            // referência é respeitada na ordem em que a colheita escreve
            template.update(
                "insert into grade_change_reel (change_id, reel_number) values (?, ?)"
                    + " on conflict do nothing",
                change.id(),
                number);
          }
        });
  }

  public List<GradeChange> listGradeChanges(int limit) {
    return listGradeChanges(null, limit);
  }

  public List<GradeChange> listGradeChanges(String shiftId, int limit) {
    var filter = new Filter().eq("shift_id", shiftId);

    var changes =
        jdbc.sql(
                "select * from grade_change%s order by started_at desc limit ?"
                    .formatted(filter.where()))
            .params(filter.params(limit))
            .query(
                (rs, row) ->
                    new GradeChange(
                        rs.getString("id"),
                        rs.getString("shift_id"),
                        rs.getDouble("from_gsm"),
                        rs.getDouble("to_gsm"),
                        instant(rs, "started_at"),
                        instant(rs, "stabilized_at"),
                        List.of()))
            .list();

    if (changes.isEmpty()) {
      return changes;
    }

    var ids = changes.stream().map(GradeChange::id).toList();
    var byChange = new LinkedHashMap<String, List<Integer>>();

    jdbc.sql(
            "select change_id, reel_number from grade_change_reel where change_id in (%s)"
                .formatted(placeholders(ids.size())))
        .params(ids.toArray())
        .query(
            (rs, row) -> {
              byChange
                  .computeIfAbsent(rs.getString("change_id"), key -> new ArrayList<>())
                  .add(rs.getInt("reel_number"));
              return null;
            })
        .list();

    return changes.stream()
        .map(
            change ->
                new GradeChange(
                    change.id(),
                    change.shiftId(),
                    change.fromGsm(),
                    change.toGsm(),
                    change.startedAt(),
                    change.stabilizedAt(),
                    List.copyOf(byChange.getOrDefault(change.id(), List.of()))))
        .toList();
  }

  // ----------------------------------------------------------------- ronda ----

  public void saveRound(Round round) {
    transaction.executeWithoutResult(
        status -> {
          template.update(
              """
              insert into inspection_round (id, shift_id, started_at, finished_at, inspector)
              values (?, ?, ?, ?, ?)
              on conflict (id) do update set
                shift_id = excluded.shift_id,
                started_at = excluded.started_at,
                finished_at = excluded.finished_at,
                inspector = excluded.inspector
              """,
              round.id(),
              round.shiftId(),
              stamp(round.startedAt()),
              stamp(round.finishedAt()),
              round.inspector());

          template.update("delete from round_point where round_id = ?", round.id());

          /*
           * A ordem do roteiro e a da lista, e a coluna sai do indice.
           *
           * O ponto nao carrega o numero: ele e a posicao. Guardar o numero no
           * registro daria duas verdades para a mesma coisa, e uma lista
           * reordenada passaria a mentir sem que nada reclamasse.
           */
          int sequence = 0;
          for (var point : round.points()) {
            sequence++;
            template.update(
                """
                insert into round_point
                  (round_id, sequence, asset_tag, field_temp_c, noise, leak, note,
                   online_tag, online_value)
                values (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                round.id(),
                sequence,
                point.assetTag(),
                point.fieldTempC(),
                point.noise().label(),
                point.leak().label(),
                point.note(),
                point.onlineTag(),
                point.onlineValue());
          }
        });
  }

  public List<Round> listRounds(int limit) {
    return listRounds(null, limit);
  }

  public List<Round> listRounds(String shiftId, int limit) {
    var filter = new Filter().eq("shift_id", shiftId);

    return withPoints(
        jdbc.sql(
                "select * from inspection_round%s order by started_at desc limit ?"
                    .formatted(filter.where()))
            .params(filter.params(limit))
            .query(ROUND_WITHOUT_POINTS)
            .list());
  }

  /** Uma ronda pelo id. */
  public Round findRound(String id) {
    var found =
        withPoints(
            jdbc.sql("select * from inspection_round where id = ?")
                .param(id)
                .query(ROUND_WITHOUT_POINTS)
                .list());

    return found.isEmpty() ? null : found.getFirst();
  }

  private static final org.springframework.jdbc.core.RowMapper<Round> ROUND_WITHOUT_POINTS =
      (rs, row) ->
          new Round(
              rs.getString("id"),
              rs.getString("shift_id"),
              instant(rs, "started_at"),
              instant(rs, "finished_at"),
              rs.getString("inspector"),
              List.of());

  /**
   * Preenche os pontos de um conjunto de rondas numa consulta só.
   *
   * <p>Uma consulta por ronda seria o {@code N+1} de sempre; com {@code in (...)} é uma ida,
   * independentemente de serem uma ronda ou cinquenta. É o que faz o {@code findRound}
   * compartilhar este caminho em vez de ter um próprio.
   */
  private List<Round> withPoints(List<Round> rounds) {
    if (rounds.isEmpty()) {
      return rounds;
    }

    var ids = rounds.stream().map(Round::id).toList();
    var byRound = new LinkedHashMap<String, List<RoundPoint>>();

    jdbc.sql(
            "select * from round_point where round_id in (%s) order by round_id, sequence"
                .formatted(placeholders(ids.size())))
        .params(ids.toArray())
        .query(
            (rs, row) -> {
              byRound
                  .computeIfAbsent(rs.getString("round_id"), key -> new ArrayList<>())
                  .add(
                      new RoundPoint(
                          rs.getString("asset_tag"),
                          nullableDouble(rs, "field_temp_c"),
                          Noise.fromLabel(rs.getString("noise")),
                          Leak.fromLabel(rs.getString("leak")),
                          rs.getString("note"),
                          rs.getString("online_tag"),
                          nullableDouble(rs, "online_value")));
              return null;
            })
        .list();

    return rounds.stream()
        .map(
            round ->
                new Round(
                    round.id(),
                    round.shiftId(),
                    round.startedAt(),
                    round.finishedAt(),
                    round.inspector(),
                    List.copyOf(byRound.getOrDefault(round.id(), List.of()))))
        .toList();
  }

  // ----------------------------------------------------- nota de manutenção ----

  public void saveNote(MaintenanceNote note) {
    transaction.executeWithoutResult(
        status -> {
          template.update(
              """
              insert into maintenance_note (number, asset_tag, symptom, priority, origin,
                                            origin_ref, status, requires_shutdown, created_at,
                                            closed_at)
              values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              on conflict (number) do update set
                asset_tag = excluded.asset_tag,
                symptom = excluded.symptom,
                priority = excluded.priority,
                origin = excluded.origin,
                origin_ref = excluded.origin_ref,
                status = excluded.status,
                requires_shutdown = excluded.requires_shutdown,
                created_at = excluded.created_at,
                closed_at = excluded.closed_at
              """,
              note.number(),
              note.assetTag(),
              note.symptom(),
              (short) note.priority(),
              note.origin().label(),
              note.originRef(),
              note.status().label(),
              note.requiresShutdown(),
              stamp(note.createdAt()),
              stamp(note.closedAt()));

          template.update("delete from note_evidence where note_number = ?", note.number());

          int sequence = 0;
          for (var evidence : note.evidence()) {
            sequence++;
            template.update(
                "insert into note_evidence (note_number, sequence, kind, ref, label)"
                    + " values (?, ?, ?, ?, ?)",
                note.number(),
                sequence,
                evidence.kind().label(),
                evidence.ref(),
                evidence.label());
          }
        });
  }

  public List<MaintenanceNote> listNotes(int limit) {
    return listNotes(null, null, limit);
  }

  public List<MaintenanceNote> listNotes(NoteStatus status, String assetTag, int limit) {
    var filter =
        new Filter()
            .eq("status", status == null ? null : status.label())
            .eq("asset_tag", assetTag);

    return withEvidence(
        jdbc.sql(
                "select * from maintenance_note%s order by created_at desc limit ?"
                    .formatted(filter.where()))
            .params(filter.params(limit))
            .query(NOTE_WITHOUT_EVIDENCE)
            .list());
  }

  /** Uma nota pelo número. */
  public MaintenanceNote findNote(String number) {
    var found =
        withEvidence(
            jdbc.sql("select * from maintenance_note where number = ?")
                .param(number)
                .query(NOTE_WITHOUT_EVIDENCE)
                .list());

    return found.isEmpty() ? null : found.getFirst();
  }

  private static final org.springframework.jdbc.core.RowMapper<MaintenanceNote>
      NOTE_WITHOUT_EVIDENCE =
          (rs, row) ->
              new MaintenanceNote(
                  rs.getString("number"),
                  rs.getString("asset_tag"),
                  rs.getString("symptom"),
                  rs.getShort("priority"),
                  NoteOrigin.fromLabel(rs.getString("origin")),
                  rs.getString("origin_ref"),
                  NoteStatus.fromLabel(rs.getString("status")),
                  rs.getBoolean("requires_shutdown"),
                  instant(rs, "created_at"),
                  instant(rs, "closed_at"),
                  List.of());

  /** Preenche as evidências de um conjunto de notas numa consulta só, como nas rondas. */
  private List<MaintenanceNote> withEvidence(List<MaintenanceNote> notes) {
    if (notes.isEmpty()) {
      return notes;
    }

    var numbers = notes.stream().map(MaintenanceNote::number).toList();
    var byNote = new LinkedHashMap<String, List<Evidence>>();

    jdbc.sql(
            "select * from note_evidence where note_number in (%s) order by note_number, sequence"
                .formatted(placeholders(numbers.size())))
        .params(numbers.toArray())
        .query(
            (rs, row) -> {
              byNote
                  .computeIfAbsent(rs.getString("note_number"), key -> new ArrayList<>())
                  .add(
                      new Evidence(
                          EvidenceKind.fromLabel(rs.getString("kind")),
                          rs.getString("ref"),
                          rs.getString("label")));
              return null;
            })
        .list();

    return notes.stream()
        .map(
            note ->
                new MaintenanceNote(
                    note.number(),
                    note.assetTag(),
                    note.symptom(),
                    note.priority(),
                    note.origin(),
                    note.originRef(),
                    note.status(),
                    note.requiresShutdown(),
                    note.createdAt(),
                    note.closedAt(),
                    List.copyOf(byNote.getOrDefault(note.number(), List.of()))))
        .toList();
  }

  // --------------------------------------------------- escrita de setpoint ----

  public void saveSetpointChange(SetpointChange change) {
    template.update(
        """
        insert into setpoint_change (id, tag, previous_value, new_value, unit, changed_by,
                                     changed_at, reason)
        values (?, ?, ?, ?, ?, ?, ?, ?)
        on conflict (id) do nothing
        """,
        change.id(),
        change.tag(),
        change.previousValue(),
        change.newValue(),
        change.unit(),
        change.changedBy(),
        stamp(change.changedAt()),
        change.reason());
  }

  /**
   * A última escrita registrada numa tag.
   *
   * <p>É a primeira escolha para o "valor anterior" de uma auditoria: o que vale como anterior é
   * o que alguém escreveu, e não o que a rede estava mostrando — entre a escrita e agora o
   * processo andou, e o valor da rede já é outro.
   */
  public SetpointChange latestSetpointChange(String tag) {
    var found = listSetpointChanges(tag, 1);
    return found.isEmpty() ? null : found.getFirst();
  }

  public List<SetpointChange> listSetpointChanges(int limit) {
    return listSetpointChanges(null, limit);
  }

  public List<SetpointChange> listSetpointChanges(String tag, int limit) {
    var filter = new Filter().eq("tag", tag);

    return jdbc
        .sql(
            "select * from setpoint_change%s order by changed_at desc limit ?"
                .formatted(filter.where()))
        .params(filter.params(limit))
        .query(
            (rs, row) ->
                new SetpointChange(
                    rs.getString("id"),
                    rs.getString("tag"),
                    rs.getDouble("previous_value"),
                    rs.getDouble("new_value"),
                    rs.getString("unit"),
                    rs.getString("changed_by"),
                    instant(rs, "changed_at"),
                    rs.getString("reason")))
        .list();
  }

  // ---------------------------------------------------------------- alarme ----

  public void saveAlarm(Alarm alarm) {
    template.update(
        """
        insert into alarm (id, tag, limit_level, threshold, priority, state, raised_at,
                           peak_value, acknowledged_at, acknowledged_by, cleared_at,
                           shelved_until, shelved_by)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        on conflict (id) do update set
          state = excluded.state,
          peak_value = excluded.peak_value,
          acknowledged_at = excluded.acknowledged_at,
          acknowledged_by = excluded.acknowledged_by,
          cleared_at = excluded.cleared_at,
          shelved_until = excluded.shelved_until,
          shelved_by = excluded.shelved_by
        """,
        alarm.id(),
        alarm.tag(),
        alarm.limit().name(),
        alarm.threshold(),
        alarm.priority().label(),
        alarm.state().label(),
        stamp(alarm.raisedAt()),
        alarm.peakValue(),
        stamp(alarm.acknowledgedAt()),
        alarm.acknowledgedBy(),
        stamp(alarm.clearedAt()),
        stamp(alarm.shelvedUntil()),
        alarm.shelvedBy());
  }

  public List<Alarm> listAlarms(int limit) {
    return listAlarms(null, null, null, limit);
  }

  public List<Alarm> listAlarms(
      AlarmState state, AlarmPriority priority, String tag, int limit) {

    var filter =
        new Filter()
            .eq("state", state == null ? null : state.label())
            .eq("priority", priority == null ? null : priority.label())
            .eq("tag", tag);

    return jdbc
        .sql("select * from alarm%s order by raised_at desc limit ?".formatted(filter.where()))
        .params(filter.params(limit))
        .query((rs, row) -> alarmRow(rs))
        .list();
  }

  public Alarm findAlarm(String id) {
    return jdbc
        .sql("select * from alarm where id = ?")
        .param(id)
        .query((rs, row) -> alarmRow(rs))
        .optional()
        .orElse(null);
  }

  /**
   * Reconhece num comando só.
   *
   * <p>A leitura e a escrita acontecem na mesma instrução, e é isso que impede dois cliques
   * simultâneos de gravarem dois reconhecimentos: o segundo não encontra linha para atualizar.
   * Devolver {@code null} cobre os dois casos — não existe, ou já estava reconhecido — e quem
   * chama separa os dois com uma segunda consulta, porque para quem clicou eles são bem
   * diferentes.
   */
  public Alarm acknowledgeAlarm(String id, String by, Instant at) {
    return jdbc
        .sql(
            """
            update alarm
               set acknowledged_at = ?, acknowledged_by = ?,
                   state = case when state = 'ativo' then 'reconhecido' else state end
             where id = ? and acknowledged_at is null
            returning *
            """)
        .param(stamp(at))
        .param(by)
        .param(id)
        .query((rs, row) -> alarmRow(rs))
        .optional()
        .orElse(null);
  }

  /**
   * Engavetar: silenciar um alarme por um prazo.
   *
   * <p>O prazo fica no banco e não num temporizador em memória, porque o host dorme: um
   * engavetamento que vivesse num `setTimeout` evaporaria no primeiro cochilo da instância, e o
   * alarme voltaria a tocar sem ninguém ter desengavetado.
   */
  public Alarm shelveAlarm(String id, String by, Instant until) {
    return jdbc
        .sql("update alarm set shelved_until = ?, shelved_by = ? where id = ? returning *")
        .param(stamp(until))
        .param(by)
        .param(id)
        .query((rs, row) -> alarmRow(rs))
        .optional()
        .orElse(null);
  }

  public Alarm unshelveAlarm(String id) {
    return jdbc
        .sql("update alarm set shelved_until = null, shelved_by = null where id = ? returning *")
        .param(id)
        .query((rs, row) -> alarmRow(rs))
        .optional()
        .orElse(null);
  }

  public int countAlarmsInWindow(Instant from, Instant to) {
    return jdbc
        .sql("select count(*)::int from alarm where raised_at > ? and raised_at <= ?")
        .param(stamp(from))
        .param(stamp(to))
        .query(Integer.class)
        .single();
  }

  private static Alarm alarmRow(ResultSet rs) throws SQLException {
    return new Alarm(
        rs.getString("id"),
        rs.getString("tag"),
        AlarmLimitLevel.valueOf(rs.getString("limit_level")),
        rs.getDouble("threshold"),
        priorityOf(rs.getString("priority")),
        stateOf(rs.getString("state")),
        instant(rs, "raised_at"),
        rs.getDouble("peak_value"),
        instant(rs, "acknowledged_at"),
        rs.getString("acknowledged_by"),
        instant(rs, "cleared_at"),
        instant(rs, "shelved_until"),
        rs.getString("shelved_by"));
  }

  private static AlarmPriority priorityOf(String label) {
    for (var value : AlarmPriority.values()) {
      if (value.label().equals(label)) {
        return value;
      }
    }
    throw new IllegalStateException("Prioridade desconhecida no banco: " + label);
  }

  private static AlarmState stateOf(String label) {
    for (var value : AlarmState.values()) {
      if (value.label().equals(label)) {
        return value;
      }
    }
    throw new IllegalStateException("Estado desconhecido no banco: " + label);
  }

  /** Os ativos semeados, para quem precisa saber se o banco já foi preparado. */
  public Map<String, String> assetKinds() {
    var out = new LinkedHashMap<String, String>();
    jdbc.sql("select tag, kind from asset order by tag")
        .query(
            (rs, row) -> {
              out.put(rs.getString("tag"), rs.getString("kind"));
              return null;
            })
        .list();
    return out;
  }
}
