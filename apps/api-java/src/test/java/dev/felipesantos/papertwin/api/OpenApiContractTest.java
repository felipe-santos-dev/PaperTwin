package dev.felipesantos.papertwin.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

/**
 * O contrato da API, versionado.
 *
 * <p>O {@code openapi.json} fica no repositório porque é a <b>entrada do front</b>: os tipos que o
 * React usa são gerados dele, e um contrato que só existe numa rota de um servidor rodando não
 * serve para gerar nada em CI. Versionado, uma mudança de rota aparece no diff — que é onde
 * alguém a vê antes de o front quebrar.
 *
 * <p>O teste <b>compara</b> por padrão e só regrava quando pedido:
 *
 * <pre>{@code ./mvnw test -Dtest=OpenApiContractTest -Dopenapi.write=true}</pre>
 *
 * <p>Regravar sozinho faria o arquivo seguir o código em silêncio, e o diff — que é o ponto todo —
 * nunca chamaria a atenção de ninguém.
 */
@SpringBootTest
@ContextConfiguration(classes = GoldenInstantConfig.class)
class OpenApiContractTest {

  /** O arquivo versionado, ao lado do {@code pom.xml} do módulo. */
  private static Path contractFile() {
    var current = Path.of("").toAbsolutePath();

    for (var directory = current; directory != null; directory = directory.getParent()) {
      if (Files.isRegularFile(directory.resolve("pom.xml"))) {
        return directory.resolve("openapi.json");
      }
    }

    throw new IllegalStateException("pom.xml não foi encontrado a partir de " + current);
  }

  @Autowired private WebApplicationContext context;

  @Test
  @DisplayName("o openapi.json versionado é o que a aplicação publica")
  void contractIsUpToDate() throws Exception {
    var response =
        MockMvcBuilders.webAppContextSetup(context)
            .build()
            .perform(get("/v3/api-docs").accept(MediaType.APPLICATION_JSON))
            .andReturn()
            .getResponse();

    assertThat(response.getStatus()).as("GET /v3/api-docs").isEqualTo(200);

    /*
     * Gravado indentado e com as chaves ordenadas.
     *
     * Indentado para o diff ser legível linha a linha; ordenado porque a ordem
     * em que o springdoc monta o mapa não é estável entre execuções, e sem
     * ordenar o arquivo mudaria sem nada ter mudado.
     */
    var mapper =
        new ObjectMapper()
            .enable(SerializationFeature.INDENT_OUTPUT)
            .enable(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS);

    var published =
        mapper.writeValueAsString(
                mapper.readTree(response.getContentAsString(StandardCharsets.UTF_8)))
            .replace("\r\n", "\n")
        + "\n";

    var file = contractFile();

    if (Boolean.getBoolean("openapi.write")) {
      Files.writeString(file, published, StandardCharsets.UTF_8);
      return;
    }

    assertThat(Files.exists(file))
        .as(
            "%s não existe. Gere com `./mvnw test -Dtest=OpenApiContractTest -Dopenapi.write=true`",
            file)
        .isTrue();

    assertThat(Files.readString(file, StandardCharsets.UTF_8).replace("\r\n", "\n"))
        .as(
            "o contrato versionado está diferente do que a aplicação publica. Regrave com"
                + " `./mvnw test -Dtest=OpenApiContractTest -Dopenapi.write=true` e confira o"
                + " diff — o front gera os tipos deste arquivo.")
        .isEqualTo(published);
  }
}
