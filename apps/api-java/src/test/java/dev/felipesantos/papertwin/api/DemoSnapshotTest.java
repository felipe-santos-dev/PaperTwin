package dev.felipesantos.papertwin.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.felipesantos.papertwin.catalog.ProcessCatalog;
import dev.felipesantos.papertwin.db.EmbeddedPostgresExtension;
import dev.felipesantos.papertwin.db.Migrations;
import dev.felipesantos.papertwin.db.SimStateRepository;
import dev.felipesantos.papertwin.historian.HistorianPoints;
import dev.felipesantos.papertwin.machine.MachineAssets;
import dev.felipesantos.papertwin.operation.Scenarios;
import dev.felipesantos.papertwin.operation.Shifts;
import dev.felipesantos.papertwin.runtime.SimulationService;
import dev.felipesantos.papertwin.simulation.SimClock;
import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Comparator;
import java.util.stream.Stream;
import javax.sql.DataSource;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

/**
 * Gera o espelho estático da API para o modo de demonstração.
 *
 * <pre>{@code ./mvnw test -Dtest=DemoSnapshotTest -Ddemo.write=true -DfailIfNoTests=false}</pre>
 *
 * <p>Sem a propriedade o teste é <b>pulado</b>, e não falha: ele é uma ferramenta de build, não uma
 * verificação. Quem roda a suíte não quer esperar seiscentos arquivos serem escritos, e quem roda o
 * build precisa deles.
 *
 * <p>A web vive no GitHub Pages, que serve arquivo e nada mais. Sem a API no ar, abrir a tela de
 * Turno não mostraria nada — e um portfólio que abre quebrado não serve para o que existe.
 *
 * <p>O ponto importante é <b>como</b> os arquivos são gerados: em vez de reimplementar a agregação,
 * isto sobe a API de verdade contra um Postgres embutido, com as mesmas migrations, a mesma
 * simulação e a mesma retomada, e grava as respostas que ela devolve. O {@code date_bin()} que
 * monta as colunas do gráfico é o do Postgres, não uma segunda versão escrita à mão que divergiria
 * na primeira mudança de regra.
 *
 * <h2>Um arquivo por rota</h2>
 *
 * O nome é o caminho da rota com {@code /} virando {@code ~}:
 *
 * <pre>
 *   GET /shifts                      -&gt; demo/shifts.json
 *   GET /shifts/T-2026-06-15-B       -&gt; demo/shifts~T-2026-06-15-B.json
 *   GET /process/tags/PIC-514/trend  -&gt; demo/process~tags~PIC-514~trend.json
 * </pre>
 *
 * <p>Os parâmetros de consulta <b>não</b> entram no nome. O portão de demonstração baixa a lista
 * inteira e filtra no cliente, e a razão está lá: com a consulta no nome, o gerador teria de
 * acertar exatamente as combinações que as sete telas pedem, e um filtro novo em qualquer tela
 * daria 404 sem ninguém notar.
 *
 * <p>As rotas de ativo mantêm o caminho de pasta que já tinham ({@code assets/<tag>.json}), porque
 * {@code demo.ts} as lê assim desde a Fase 3 e trocar o nome por consistência cosmética quebraria
 * um instantâneo publicado.
 */
/*
 * Desligado na classe, e nao dentro do teste.
 *
 * Uma condicao dentro do metodo so e avaliada depois de o Spring subir o
 * contexto e o Postgres embutido nascer — vinte segundos para decidir nao fazer
 * nada. Na classe, o JUnit pula antes de qualquer uma das duas coisas.
 */
@EnabledIfSystemProperty(
    named = "demo.write",
    matches = "true",
    disabledReason = "ferramenta de build: rode com -Ddemo.write=true para gravar")
@SpringBootTest
@ContextConfiguration(classes = DemoSnapshotTest.DemoInstant.class)
class DemoSnapshotTest {

  /**
   * O instante do instantâneo: turno B de 15/06/2026, quatro horas adentro.
   *
   * <p>É <b>escolhido</b>, e não {@code now()}: o plano põe a troca de gramatura três horas depois
   * do começo do turno, então a janela de quatro horas contém a transição inteira e o fechamento da
   * bobina que a pegou. Com o relógio de parede, o instantâneo de uma build noturna cairia num
   * turno sem nada acontecendo.
   */
  static final Scenarios.ShiftPlan PLAN =
      Scenarios.shiftPlan(
          SimClock.DEFAULT_SEED, Shifts.at(Instant.parse("2026-06-15T18:00:00Z")));

  static final Instant NOW = SimClock.tickTime(PLAN.startTick() + 4 * SimClock.TICKS_PER_HOUR);

  @TestConfiguration
  static class DemoInstant {

    @Bean
    @Primary
    Clock demoClock() {
      return Clock.fixed(NOW, ZoneOffset.UTC);
    }

    @Bean
    @Primary
    DataSource demoDataSource() {
      var dataSource = EmbeddedPostgresExtension.freshDatabase();
      Migrations.run(dataSource);
      return dataSource;
    }
  }

  /** Quantas colunas a tendência de cada tag traz. */
  private static final int TREND_BUCKETS = 240;

  @Autowired private WebApplicationContext context;
  @Autowired private ObjectMapper mapper;
  @Autowired private SimulationService simulation;
  @Autowired private SimStateRepository simState;

  private MockMvc mvc;
  private Path out;
  private int files;
  private long bytes;

  /** A pasta `apps/web/public/demo`, encontrada subindo até a raiz do repositório. */
  private static Path demoDirectory() {
    var current = Path.of("").toAbsolutePath();

    for (var directory = current; directory != null; directory = directory.getParent()) {
      var candidate = directory.resolve("apps").resolve("web").resolve("public");
      if (Files.isDirectory(candidate)) {
        return candidate.resolve("demo");
      }
    }

    throw new IllegalStateException("apps/web/public não foi encontrado a partir de " + current);
  }

  @Test
  @DisplayName("grava o espelho estático de cada rota")
  @Timeout(900)
  void writeSnapshot() throws Exception {
    mvc = MockMvcBuilders.webAppContextSetup(context).build();
    out = demoDirectory();

    /*
     * O marcador vai no começo do turno, e sem estado.
     *
     * Sem ele, a retomada reancoraria quatro horas antes de NOW — o que daria
     * quatro horas de dados mas começando no meio do turno anterior. Com o
     * marcador no começo do turno B, a janela é exatamente o turno.
     */
    simState.save(
        SimClock.DEFAULT_SEED, PLAN.startTick(), null, SimClock.tickTime(PLAN.startTick()));

    var report = simulation.ensureCurrent();

    deleteRecursively(out);
    Files.createDirectories(out);

    // --- as rotas que `demo.ts` lê com caminho de pasta, desde a Fase 3 ---

    write("health.json", capture("/health"));
    write("assets.json", capture("/assets"));

    for (var asset : MachineAssets.ALL) {
      var tag = encode(asset.tag());
      write("assets/%s.json".formatted(asset.tag()), capture("/assets/" + tag));

      // só os ativos medidos têm série; os demais não têm o que espelhar
      if (asset.monitored()) {
        write(
            "assets/%s/vibration.json".formatted(asset.tag()),
            capture("/assets/%s/vibration".formatted(tag)));
      }
    }

    // --- as listas, uma por rota ---

    for (var path :
        new String[] {
          "/process/values",
          "/process/steam-groups",
          "/alarms",
          "/shifts",
          "/reels",
          "/web-breaks",
          "/grade-changes",
          "/rounds",
          "/notes",
          "/setpoint-changes"
        }) {
      grab(path);
    }

    // --- os detalhes que as telas abrem ---

    for (var shift : capture("/shifts").get("shifts")) {
      grab("/shifts/" + encode(shift.get("id").asText()));
    }
    for (var reel : capture("/reels").get("reels")) {
      grab("/reels/" + reel.get("number").asInt());
    }
    for (var round : capture("/rounds").get("rounds")) {
      grab("/rounds/" + encode(round.get("id").asText()));
    }
    for (var note : capture("/notes").get("notes")) {
      grab("/notes/" + encode(note.get("number").asText()));
    }

    // --- catálogo e tendência de cada tag ---

    var from = NOW.minusSeconds(4 * 3600);

    for (var variable : ProcessCatalog.ALL) {
      var tag = encode(variable.tag());
      write(fileFor("/process/tags/" + variable.tag()), capture("/process/tags/" + tag));

      if (HistorianPoints.byTag(variable.tag()) == null) {
        continue;
      }

      write(
          fileFor("/process/tags/%s/trend".formatted(variable.tag())),
          capture(
              "/process/tags/%s/trend?from=%s&to=%s&buckets=%d"
                  .formatted(tag, from, NOW, TREND_BUCKETS)));
    }

    System.out.printf(
        "demo: %d arquivos, %.0f kB — %d ativos, %d varreduras, %d linhas arquivadas,"
            + " compressão %.0f:1, até %s%n",
        files,
        bytes / 1024.0,
        MachineAssets.ALL.size(),
        report.scans(),
        report.archived(),
        report.compression().ratio(),
        NOW);

    assertThat(files).as("o instantâneo cobre as rotas das sete telas").isGreaterThan(600);
  }

  /** Chama a rota e devolve o corpo, falhando alto se ela não responder 200. */
  private JsonNode capture(String url) throws Exception {
    var response =
        mvc.perform(get(url).accept(MediaType.APPLICATION_JSON)).andReturn().getResponse();

    assertThat(response.getStatus())
        .as("GET %s: %s", url, response.getContentAsString(StandardCharsets.UTF_8))
        .isEqualTo(200);

    return mapper.readTree(response.getContentAsString(StandardCharsets.UTF_8));
  }

  private void grab(String path) throws Exception {
    write(fileFor(path), capture(path));
  }

  /** O nome do arquivo de uma rota: {@code /a/b} vira {@code a~b.json}. */
  private static String fileFor(String path) {
    return path.replaceFirst("^/", "").replace("/", "~") + ".json";
  }

  private static String encode(String value) {
    return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
  }

  private void write(String relativePath, JsonNode body) throws IOException {
    var file = out.resolve(relativePath);
    Files.createDirectories(file.getParent());

    var json = mapper.writeValueAsString(body);
    Files.writeString(file, json, StandardCharsets.UTF_8);

    files++;
    bytes += json.length();
  }

  /**
   * Apaga a pasta antes de gravar.
   *
   * <p>Sem isto, um arquivo de uma rota que deixou de existir ficaria para trás e o modo de
   * demonstração continuaria servindo uma resposta que a API já não dá.
   */
  private static void deleteRecursively(Path directory) throws IOException {
    if (!Files.exists(directory)) {
      return;
    }

    try (Stream<Path> paths = Files.walk(directory)) {
      paths.sorted(Comparator.reverseOrder()).forEach(path -> path.toFile().delete());
    }
  }
}
