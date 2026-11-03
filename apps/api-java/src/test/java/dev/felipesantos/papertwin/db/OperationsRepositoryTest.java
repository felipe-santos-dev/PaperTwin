package dev.felipesantos.papertwin.db;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.felipesantos.papertwin.alarm.Alarm;
import dev.felipesantos.papertwin.alarm.AlarmLimitLevel;
import dev.felipesantos.papertwin.alarm.AlarmPriority;
import dev.felipesantos.papertwin.alarm.AlarmState;
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
import dev.felipesantos.papertwin.simulation.ProcessEngine;
import dev.felipesantos.papertwin.simulation.SimClock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import javax.sql.DataSource;
import org.assertj.core.data.Offset;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.jdbc.core.JdbcTemplate;

/** As entidades de operação e o estado da simulação, contra um Postgres de verdade. */
@ExtendWith(EmbeddedPostgresExtension.class)
class OperationsRepositoryTest {

  private static final Instant T0 = Instant.parse("2026-03-02T09:00:00Z");

  private static DataSource dataSource;
  private static OperationsRepository repository;
  private static SimStateRepository simState;
  private static JdbcTemplate template;

  @BeforeAll
  static void migrate() {
    dataSource = EmbeddedPostgresExtension.freshDatabase();
    Migrations.run(dataSource);
    repository = new OperationsRepository(dataSource);
    simState = new SimStateRepository(dataSource, new ObjectMapper());
    template = new JdbcTemplate(dataSource);

    // as entidades referenciam ativos; dois bastam para os testes
    for (var tag : List.of("MP1-SEC-G4-CS23-MLA", "MP1-SEC-G1-CS01-MLC")) {
      template.update(
          """
          insert into asset (tag, kind, label, section, position_x, position_y, position_z, source)
          values (?, 'bearing', ?, 'pre-dryer', 0, 0, 0, 'assumed')
          on conflict do nothing
          """,
          tag,
          tag);
    }
  }

  private static Shift shift(String id) {
    return new Shift(
        id,
        "B",
        LocalDate.of(2026, 3, 2),
        T0,
        T0.plusSeconds(8 * 3600),
        "operador-turno-B",
        512.4,
        93.2,
        List.of("Trocado o feltro da 2ª prensa", "CS23 com ruído elevado na ronda"));
  }

  @Nested
  @DisplayName("turno")
  class Shifts {

    @Test
    @DisplayName("grava e lê, com as linhas da passagem na ordem")
    void roundTrip() {
      repository.saveShift(shift("T-2026-03-02-B"));
      var stored = repository.findShift("T-2026-03-02-B");

      assertThat(stored).isNotNull();
      assertThat(stored.letter()).isEqualTo("B");
      assertThat(stored.operationDate()).isEqualTo(LocalDate.of(2026, 3, 2));
      assertThat(stored.productionT()).isCloseTo(512.4, Offset.offset(1e-9));
      assertThat(stored.handover())
          .containsExactly("Trocado o feltro da 2ª prensa", "CS23 com ruído elevado na ronda");
    }

    @Test
    @DisplayName("gravar duas vezes atualiza em vez de duplicar, e não acumula passagem")
    void upsertConverges() {
      /*
       * A retomada reexecuta trechos, e reexecutar tem de produzir o mesmo
       * banco. Um insert puro quebraria na segunda passagem; um `do nothing`
       * deixaria a entidade com os valores da primeira, que podem estar
       * incompletos. O `do update` é o único que converge.
       */
      var first = shift("T-2026-03-02-A");
      repository.saveShift(first);

      var updated =
          new Shift(
              first.id(),
              first.letter(),
              first.operationDate(),
              first.startedAt(),
              first.endedAt(),
              first.operator(),
              600.0,
              97.0,
              List.of("só uma linha agora"));
      repository.saveShift(updated);

      var stored = repository.findShift("T-2026-03-02-A");
      assertThat(stored.productionT()).isCloseTo(600.0, Offset.offset(1e-9));
      assertThat(stored.handover()).containsExactly("só uma linha agora");

      // uma linha para este id, e não duas: a contagem é por id porque os
      // outros casos desta classe compartilham o banco e também gravam turnos
      assertThat(
              template.queryForObject(
                  "select count(*) from shift where id = ?", Integer.class, "T-2026-03-02-A"))
          .isEqualTo(1);
      assertThat(
              template.queryForObject(
                  "select count(*) from shift_handover where shift_id = ?",
                  Integer.class,
                  "T-2026-03-02-A"))
          .as("a passagem foi substituída, não acrescentada")
          .isEqualTo(1);
    }

    @Test
    @DisplayName("o banco recusa eficiência fora de 0 a 100")
    void efficiencyIsChecked() {
      var bad =
          new Shift(
              "T-2026-03-03-A",
              "A",
              LocalDate.of(2026, 3, 3),
              T0,
              null,
              "x",
              0,
              140,
              List.of());

      assertThatThrownBy(() -> repository.saveShift(bad))
          .hasMessageContaining("shift_efficiency_range");
    }
  }

  @Nested
  @DisplayName("bobina")
  class Reels {

    @Test
    @DisplayName("grava a dispersão do perfil CD inteira, ou nenhuma")
    void cdSpreadIsAllOrNothing() {
      repository.saveShift(shift("T-2026-03-04-B"));

      var complete =
          new Reel(
              1001, "T-2026-03-04-B", T0, T0.plusSeconds(3180), 24.1, 66_500.0, 3000.0,
              75.1, 4.8, 102.0, 0.9, 0.21, 2.4, 0, Disposition.APROVADA, null);
      repository.saveReel(complete);

      assertThat(repository.findReel(1001).cdCaliperUm()).isCloseTo(2.4, Offset.offset(1e-9));

      var half =
          new Reel(
              1002, "T-2026-03-04-B", T0, null, null, null, null, null, null, null,
              0.9, null, null, 0, null, null);

      // meia medição de perfil não diz nada
      assertThatThrownBy(() -> repository.saveReel(half))
          .hasMessageContaining("reel_cd_spread_complete");
    }

    @Test
    @DisplayName("uma bobina não aprovada precisa de motivo")
    void dispositionNeedsReason() {
      repository.saveShift(shift("T-2026-03-05-B"));

      var downgraded =
          new Reel(
              1003, "T-2026-03-05-B", T0, T0.plusSeconds(3180), 24.1, 66_500.0, 3000.0,
              79.4, 4.8, 102.0, null, null, null, 0, Disposition.REBAIXADA, null);

      assertThatThrownBy(() -> repository.saveReel(downgraded))
          .hasMessageContaining("reel_reason_matches_disposition");
    }

    @Test
    @DisplayName("filtra por turno")
    void filtersByShift() {
      repository.saveShift(shift("T-2026-03-06-A"));
      repository.saveShift(shift("T-2026-03-06-B"));

      repository.saveReel(
          new Reel(2001, "T-2026-03-06-A", T0, null, null, null, null, null, null, null,
              null, null, null, 0, null, null));
      repository.saveReel(
          new Reel(2002, "T-2026-03-06-B", T0, null, null, null, null, null, null, null,
              null, null, null, 0, null, null));

      assertThat(repository.listReels("T-2026-03-06-A", 10)).hasSize(1);
      assertThat(repository.listReels(null, 100)).hasSizeGreaterThanOrEqualTo(2);
    }
  }

  @Nested
  @DisplayName("quebra de folha")
  class Breaks {

    @Test
    @DisplayName("guarda a causa provável e os sinais como coisas separadas")
    void causeAndSignalsAreSeparate() {
      /*
       * A causa provável é o que quem opera anotaria; os sinais são o que o
       * processo de fato fez. As duas podem não bater, e é por isso que estão
       * em campos diferentes — juntá-las apagaria a diferença entre o que se
       * achou e o que se mediu.
       */
      repository.saveShift(shift("T-2026-03-07-B"));

      repository.saveWebBreak(
          new WebBreak(
              "QB-2026-03-07-1",
              "T-2026-03-07-B",
              T0,
              T0.plusSeconds(1320),
              "post-dryer",
              "descolamento na entrada da pós-secagem",
              List.of(
                  new Precursor(600, "PDIC-721", "ΔP de sifões caindo", 32.0, 26.0),
                  new Precursor(120, "AIC-903", "umidade subindo", 4.8, 5.4))));

      var stored = repository.listWebBreaks(10).getFirst();

      assertThat(stored.probableCause()).isEqualTo("descolamento na entrada da pós-secagem");
      assertThat(stored.precursors()).hasSize(2);
      assertThat(stored.precursors().getFirst().leadTimeS())
          .as("o sinal mais antigo primeiro")
          .isEqualTo(600);
    }

    @Test
    @DisplayName("um sinal fora da janela de dez minutos é recusado")
    void precursorWindow() {
      repository.saveShift(shift("T-2026-03-08-B"));

      assertThatThrownBy(
              () ->
                  repository.saveWebBreak(
                      new WebBreak(
                          "QB-2026-03-08-1",
                          "T-2026-03-08-B",
                          T0,
                          null,
                          "press",
                          "x",
                          List.of(new Precursor(900, "WIC-401", "y", 1, 2)))))
          .hasMessageContaining("precursor_within_window");
    }
  }

  @Nested
  @DisplayName("ronda e nota")
  class RoundsAndNotes {

    @Test
    @DisplayName("a ronda guarda o valor de campo ao lado do valor online")
    void fieldVersusOnline() {
      // é a comparação que dá valor à ronda: pirômetro e sensor discordando é
      // notícia, e sem os dois lado a lado ninguém vê
      repository.saveShift(shift("T-2026-03-09-B"));

      repository.saveRound(
          new Round(
              "RD-2026-03-09-1",
              "T-2026-03-09-B",
              T0,
              T0.plusSeconds(2400),
              "operador-turno-B",
              List.of(
                  new RoundPoint(
                      1, "MP1-SEC-G4-CS23-MLA", 63.0, Noise.ELEVADO, Leak.NENHUM,
                      "ruído metálico no LA", "TI-5323A", 66.0))));

      var point = repository.listRounds(10).getFirst().points().getFirst();

      assertThat(point.fieldTempC()).isCloseTo(63.0, Offset.offset(1e-9));
      assertThat(point.onlineValue()).isCloseTo(66.0, Offset.offset(1e-9));
      assertThat(point.noise()).isEqualTo(Noise.ELEVADO);
    }

    @Test
    @DisplayName("a nota aponta para evidências, e não guarda arquivo")
    void evidenceIsAReference() {
      repository.saveShift(shift("T-2026-03-10-B"));

      repository.saveNote(
          new MaintenanceNote(
              "NM-000123",
              "MP1-SEC-G4-CS23-MLA",
              "vibração em elevação sustentada",
              2,
              NoteOrigin.ALARME,
              "AL-1772442000-VI-5123A-H",
              NoteStatus.ABERTA,
              false,
              T0,
              null,
              List.of(
                  new Evidence(1, EvidenceKind.TENDENCIA, "VI-5123A/72h", "72 h de vibração"),
                  new Evidence(2, EvidenceKind.ALARME, "AL-1772442000-VI-5123A-H", "H em 2,8"))));

      var note = repository.listNotes(10).getFirst();

      assertThat(note.evidence()).hasSize(2);
      assertThat(note.evidence().getFirst().kind()).isEqualTo(EvidenceKind.TENDENCIA);
      assertThat(note.originRef()).isEqualTo("AL-1772442000-VI-5123A-H");
    }

    @Test
    @DisplayName("uma nota encerrada precisa de data de encerramento")
    void closedNeedsDate() {
      assertThatThrownBy(
              () ->
                  repository.saveNote(
                      new MaintenanceNote(
                          "NM-000999", "MP1-SEC-G1-CS01-MLC", "x", 3, NoteOrigin.OPERACAO,
                          null, NoteStatus.ENCERRADA, false, T0, null, List.of())))
          .hasMessageContaining("note_closed_matches_status");
    }
  }

  @Nested
  @DisplayName("alarme")
  class Alarms {

    private Alarm raised(String id) {
      return new Alarm(
          id, "VI-5123A", AlarmLimitLevel.H, 2.8, AlarmPriority.MEDIA, AlarmState.ATIVO,
          T0, 3.1, null, null, null, null, null);
    }

    @Test
    @DisplayName("reconhecer é um comando só, e o segundo clique não encontra o que atualizar")
    void acknowledgeIsAtomic() {
      /*
       * A leitura e a escrita acontecem na mesma instrução. É isso que impede
       * dois cliques simultâneos de gravarem dois reconhecimentos: o segundo
       * não encontra linha com `acknowledged_at is null`.
       */
      repository.saveAlarm(raised("AL-1-VI-5123A-H"));

      var first = repository.acknowledgeAlarm("AL-1-VI-5123A-H", "operador-A", T0.plusSeconds(60));
      var second = repository.acknowledgeAlarm("AL-1-VI-5123A-H", "operador-B", T0.plusSeconds(61));

      assertThat(first).isNotNull();
      assertThat(first.acknowledgedBy()).isEqualTo("operador-A");
      assertThat(first.state()).isEqualTo(AlarmState.RECONHECIDO);
      assertThat(second).as("quem chegou depois não sobrescreve").isNull();
    }

    @Test
    @DisplayName("reconhecer um alarme que não existe também devolve nada")
    void acknowledgeMissing() {
      assertThat(repository.acknowledgeAlarm("AL-não-existe", "x", T0)).isNull();
    }

    @Test
    @DisplayName("a contagem da janela de inundação olha o instante do disparo")
    void floodWindow() {
      for (int i = 0; i < 5; i++) {
        repository.saveAlarm(
            new Alarm(
                "AL-flood-" + i, "VI-5101A", AlarmLimitLevel.H, 2.8, AlarmPriority.MEDIA,
                AlarmState.ATIVO, T0.plusSeconds(i * 60L), 3.0, null, null, null, null, null));
      }

      assertThat(repository.countAlarmsInWindow(T0, T0.plusSeconds(600))).isEqualTo(4);
      assertThat(repository.countAlarmsInWindow(T0.minusSeconds(1), T0.plusSeconds(600)))
          .isEqualTo(5);
    }
  }

  @Nested
  @DisplayName("escrita de setpoint")
  class Setpoints {

    @Test
    @DisplayName("guarda o valor anterior, que o servidor leu, e exige motivo")
    void auditTrail() {
      repository.saveSetpointChange(
          new SetpointChange(
              "SP-1", "AIC-902", 75.0, 80.0, "g/m²", "operador-turno-B", T0,
              "troca de gramatura programada"));

      var stored = repository.listSetpointChanges(10).getFirst();

      assertThat(stored.previousValue()).isCloseTo(75.0, Offset.offset(1e-9));
      assertThat(stored.reason()).isEqualTo("troca de gramatura programada");
    }

    @Test
    @DisplayName("motivo em branco é recusado pelo banco")
    void reasonIsRequired() {
      assertThatThrownBy(
              () ->
                  repository.saveSetpointChange(
                      new SetpointChange(
                          "SP-2", "AIC-902", 75.0, 80.0, "g/m²", "x", T0, "   ")))
          .hasMessageContaining("setpoint_reason_not_blank");
    }
  }

  @Nested
  @DisplayName("estado da simulação")
  class SimulationState {

    @Test
    @DisplayName("grava e lê o estado da rede inteiro, em jsonb")
    void stateRoundTrips() {
      var engine = ProcessEngine.at(0, SimClock.DEFAULT_SEED);
      engine.runTo(120);
      var state = engine.snapshotState();

      simState.save(SimClock.DEFAULT_SEED, 120, state, T0);
      var marker = simState.find();

      assertThat(marker).isNotNull();
      assertThat(marker.seed()).isEqualTo(SimClock.DEFAULT_SEED);
      assertThat(marker.lastTick()).isEqualTo(120);
      assertThat(marker.state()).isNotNull();
      assertThat(marker.state().tick()).isEqualTo(120);
      assertThat(marker.state().runners()).hasSameSizeAs(state.runners());
      assertThat(marker.state().truth()).hasSameSizeAs(state.truth());
    }

    @Test
    @DisplayName("o estado restaurado retoma exatamente de onde parou")
    void restoredStateContinues() {
      var whole = ProcessEngine.at(0, SimClock.DEFAULT_SEED);
      whole.runTo(400);

      var first = ProcessEngine.at(0, SimClock.DEFAULT_SEED);
      first.runTo(200);
      simState.save(SimClock.DEFAULT_SEED, 200, first.snapshotState(), T0);

      var marker = simState.find();
      var resumed = ProcessEngine.resume(200, SimClock.DEFAULT_SEED, marker.state());
      resumed.runTo(400);

      // a volta pelo banco não pode mudar um bit
      assertThat(resumed.measured("AIC-902")).isEqualTo(whole.measured("AIC-902"));
      assertThat(resumed.measured("PIC-514")).isEqualTo(whole.measured("PIC-514"));
    }

    @Test
    @DisplayName("a tabela aceita uma linha só, e salvar de novo substitui")
    void singleRow() {
      simState.save(1, 10, null, T0);
      simState.save(2, 20, null, T0.plusSeconds(60));

      var marker = simState.find();
      assertThat(marker.seed()).isEqualTo(2);
      assertThat(marker.lastTick()).isEqualTo(20);
      assertThat(marker.state()).as("reancorou: sem estado gravado").isNull();

      assertThat(template.queryForObject("select count(*) from sim_state", Integer.class))
          .isEqualTo(1);
    }
  }
}
