package dev.felipesantos.papertwin.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.felipesantos.papertwin.db.SimStateRepository;
import dev.felipesantos.papertwin.golden.Golden;
import dev.felipesantos.papertwin.simulation.SimClock;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

/**
 * As rotas contra o gabarito da implementação TypeScript.
 *
 * <p>O estado é reconstruído do zero com o mesmo roteiro que gerou o gabarito: banco limpo,
 * migrations, pontos semeados e uma retomada até o instante fixo. Se o estado batesse por
 * coincidência, este teste não valeria nada — ele vale porque é o mesmo caminho.
 *
 * <p>Alguns campos mudam com o relógio de quem roda ({@code uptimeS}) e estão listados no próprio
 * gabarito, em {@code volatileFields}. Compará-los seria comparar quando o teste rodou.
 */
/*
 * A configuração vem de uma classe de primeiro nível para o contexto ser
 * compartilhado com o teste do contrato.
 *
 * `@ContextConfiguration` com uma classe `@TestConfiguration` acrescenta, e não
 * substitui: o bootstrapper do Boot só deixa de procurar a
 * `@SpringBootConfiguration` quando a lista traz algo que NÃO seja configuração
 * de teste. É o que permite reaproveitar o mesmo boot nas duas classes.
 */
@SpringBootTest
@ContextConfiguration(classes = GoldenInstantConfig.class)
class RoutesGoldenTest {

  private static final JsonNode GOLDEN = Golden.read("api/routes.json");
  private static final Instant NOW = GoldenInstantConfig.NOW;

  @Autowired private WebApplicationContext context;
  @Autowired private ObjectMapper mapper;
  @Autowired private SimStateRepository simState;

  private MockMvc mvc() {
    return MockMvcBuilders.webAppContextSetup(context).build();
  }

  private JsonNode fetch(String url) throws Exception {
    var response =
        mvc()
            .perform(get(url).accept(MediaType.APPLICATION_JSON))
            .andReturn()
            .getResponse();

    assertThat(response.getStatus()).as("GET %s", url).isEqualTo(200);
    return mapper.readTree(response.getContentAsString(StandardCharsets.UTF_8));
  }

  private static List<String> volatileFields() {
    var out = new ArrayList<String>();
    for (var field : GOLDEN.get("volatileFields")) {
      out.add(field.asText());
    }
    return out;
  }

  @TestFactory
  @DisplayName("cada rota responde com o mesmo corpo do gabarito")
  List<DynamicTest> routes() {
    var volatileFields = volatileFields();
    var tests = new ArrayList<DynamicTest>();

    GOLDEN
        .get("responses")
        .fields()
        .forEachRemaining(
            entry -> {
              var url = entry.getKey();
              var expected = entry.getValue();

              tests.add(
                  DynamicTest.dynamicTest(
                      "GET " + url,
                      () -> {
                        var actual = fetch(java.net.URI.create("http://localhost" + url).getRawPath());
                        var differences = new ArrayList<String>();
                        compare("", expected, actual, volatileFields, differences);

                        assertThat(differences)
                            .as("GET %s divergiu do gabarito", url)
                            .isEmpty();
                      }));
            });

    return tests;
  }

  /**
   * Compara dois corpos campo a campo, acumulando as diferenças.
   *
   * <p>Acumula em vez de falhar na primeira: quando uma rota diverge, saber que são três campos
   * e quais vale muito mais que saber o primeiro e ter de rodar de novo.
   */
  private static void compare(
      String path, JsonNode expected, JsonNode actual, List<String> ignore, List<String> into) {

    if (expected.isObject()) {
      expected
          .fields()
          .forEachRemaining(
              field -> {
                if (ignore.contains(field.getKey())) {
                  return;
                }
                var child = path.isEmpty() ? field.getKey() : path + "." + field.getKey();
                var there = actual.get(field.getKey());

                if (there == null) {
                  into.add("%s: falta no corpo da resposta".formatted(child));
                  return;
                }
                compare(child, field.getValue(), there, ignore, into);
              });
      return;
    }

    if (expected.isArray()) {
      if (expected.size() != actual.size()) {
        into.add(
            "%s: %d itens, o gabarito tem %d".formatted(path, actual.size(), expected.size()));
        return;
      }
      for (int i = 0; i < expected.size(); i++) {
        compare(path + "[" + i + "]", expected.get(i), actual.get(i), ignore, into);
      }
      return;
    }

    if (expected.isNumber() && actual.isNumber()) {
      double tolerance = GOLDEN.get("tolerance").asDouble();
      double a = expected.asDouble();
      double b = actual.asDouble();
      if (Math.abs(a - b) > Math.max(tolerance, Math.abs(a) * tolerance)) {
        into.add("%s: %s, o gabarito tem %s".formatted(path, b, a));
      }
      return;
    }

    if (!expected.equals(actual)) {
      into.add("%s: %s, o gabarito tem %s".formatted(path, actual, expected));
    }
  }

  @Nested
  @DisplayName("as escritas")
  class Writes {

    private JsonNode putSetpoint(String tag, String body, int expectedStatus) throws Exception {
      var response =
          mvc()
              .perform(
                  put("/process/tags/%s/setpoint".formatted(tag))
                      .contentType(MediaType.APPLICATION_JSON)
                      .content(body))
              .andReturn()
              .getResponse();

      assertThat(response.getStatus()).as("PUT setpoint de %s", tag).isEqualTo(expectedStatus);
      return mapper.readTree(response.getContentAsString(StandardCharsets.UTF_8));
    }

    @Test
    @DisplayName("a escrita de setpoint lê o valor anterior no servidor")
    void setpointAudit() throws Exception {
      /*
       * O anterior nunca vem do cliente. Um cliente que informasse o valor
       * anterior poderia informar errado, e a auditoria passaria a registrar
       * uma ficção — que é o oposto do que ela existe para fazer.
       */
      var json =
          putSetpoint(
              "AIC-902",
              """
              {"value": 78.0, "changedBy": "operador-turno-B", "reason": "ajuste de gramatura"}
              """,
              200);

      assertThat(json.get("change").get("newValue").asDouble()).isEqualTo(78.0);
      assertThat(json.get("change").get("reason").asText()).isEqualTo("ajuste de gramatura");
      assertThat(json.get("change").get("changedBy").asText()).isEqualTo("operador-turno-B");

      assertThat(json.get("min").isNumber())
          .as("a faixa vai junto, para a tela validar sem buscar o catálogo")
          .isTrue();
      assertThat(json.get("max").asDouble()).isGreaterThan(json.get("min").asDouble());

      assertThat(json.get("change").get("previousValue").isNumber())
          .as("o anterior veio do servidor")
          .isTrue();
    }

    @Test
    @DisplayName("sem changedBy a auditoria registra `operador`, e não um campo vazio")
    void setpointDefaultsOperator() throws Exception {
      // não há autenticação neste projeto; exigir o nome daria a impressão de
      // que alguém o verificou
      var json =
          putSetpoint(
              "AIC-903",
              """
              {"value": 5.0, "reason": "teste do padrão de operador"}
              """,
              200);

      assertThat(json.get("change").get("changedBy").asText()).isEqualTo("operador");
    }

    @Test
    @DisplayName("a escrita entra no estado gravado, e não só na auditoria")
    void setpointReachesSavedState() throws Exception {
      /*
       * É o que faz a escrita ter efeito. A rede é remontada do estado a cada
       * retomada: sem isto, a auditoria registraria uma escrita que a simulação
       * nunca viu, e a tela mostraria o registro com o processo parado.
       */
      putSetpoint(
          "AIC-905",
          """
          {"value": 104.0, "reason": "conferir que o estado recebe"}
          """,
          200);

      var marker = simState.find();
      assertThat(marker).as("há estado gravado para receber a escrita").isNotNull();
      assertThat(marker.state().setpoints())
          .as("o setpoint escrito está no estado que a próxima retomada vai montar")
          .containsEntry("AIC-905", 104.0);
    }

    @Test
    @DisplayName("escrever numa escrava de cascata é recusado, e a mensagem diz onde mexer")
    void cascadeSlaveRefused() throws Exception {
      var json =
          putSetpoint(
              "FIC-105",
              """
              {"value": 100.0, "changedBy": "x", "reason": "y"}
              """,
              422);

      assertThat(json.get("rejection").asText()).isEqualTo("escrava-de-cascata");
      assertThat(json.get("detail").asText()).contains("pertence ao mestre");
      assertThat(json.get("min").isNumber()).as("a faixa vai junto na recusa").isTrue();
    }

    @Test
    @DisplayName("um setpoint fora da faixa é recusado com a faixa na mensagem")
    void outOfRangeRefused() throws Exception {
      var json =
          putSetpoint(
              "AIC-902",
              """
              {"value": 9000.0, "changedBy": "x", "reason": "y"}
              """,
              422);

      assertThat(json.get("rejection").asText()).isEqualTo("fora-da-faixa");
      assertThat(json.get("detail").asText()).contains("fora da faixa de operação");
    }

    @Test
    @DisplayName("tag desconhecida é 404, e não 422: não existe, não tente de novo")
    void unknownTagIs404() throws Exception {
      var json =
          putSetpoint(
              "XX-9999",
              """
              {"value": 1.0, "changedBy": "x", "reason": "y"}
              """,
              404);

      assertThat(json.get("rejection").asText()).isEqualTo("tag-desconhecida");
    }

    @Test
    @DisplayName("engavetar além de um turno é recusado em vez de cortado")
    void shelveCeiling() throws Exception {
      // quem pediu doze horas precisa saber que não vai ter doze horas
      var response =
          mvc()
              .perform(
                  post("/alarms/qualquer/shelve")
                      .contentType(MediaType.APPLICATION_JSON)
                      .content("""
                          {"shelvedBy": "x", "hours": 12}
                          """))
              .andReturn()
              .getResponse();

      assertThat(response.getStatus()).isEqualTo(422);
      assertThat(response.getContentAsString(StandardCharsets.UTF_8)).contains("teto de 8 h");
    }
  }

  @Nested
  @DisplayName("os erros")
  class Errors {

    @Test
    @DisplayName("uma tag que não existe dá 404 em Problem Details")
    void notFoundIsProblemDetails() throws Exception {
      var response = mvc().perform(get("/process/tags/XX-9999")).andReturn().getResponse();

      assertThat(response.getStatus()).isEqualTo(404);
      assertThat(response.getContentType()).contains("application/problem+json");

      var json = mapper.readTree(response.getContentAsString(StandardCharsets.UTF_8));
      assertThat(json.get("type").asText()).endsWith("/nao-encontrado");
      assertThat(json.get("detail").asText()).contains("XX-9999");
    }
  }

  @Test
  @DisplayName("o instante do gabarito é o que a simulação alcança")
  void clockIsFixed() throws Exception {
    var health = fetch("/health");

    assertThat(health.get("simulation").get("lastTick").asLong())
        .isEqualTo(SimClock.tickAt(NOW));
  }
}
