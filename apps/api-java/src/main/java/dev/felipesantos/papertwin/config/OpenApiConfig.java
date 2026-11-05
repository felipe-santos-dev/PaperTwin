package dev.felipesantos.papertwin.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.info.License;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * A identificação do contrato.
 *
 * <p>Sem isto o springdoc publica "OpenAPI definition", versão "v0" — e esse texto não fica só na
 * tela do Swagger: ele entra no {@code openapi.json} versionado, de onde os tipos do front são
 * gerados. Quem abrir o arquivo em seis meses tem de saber de que API ele é.
 *
 * <p>A versão é a do artefato, não um número à parte. Duas versões para a mesma coisa divergem na
 * primeira vez que alguém esquecer de subir uma delas.
 */
@Configuration
public class OpenApiConfig {

  @Bean
  public OpenAPI papertwinApi() {
    return new OpenAPI()
        .info(
            new Info()
                .title("PaperTwin — API do gêmeo digital da MP1")
                .version("0.0.1")
                .description(
                    """
                    O estado da máquina de papel MP1: valores de processo, histórico comprimido,
                    alarmes ISO 20816-3 / ISA-18.2, vibração de mancais e as entidades de \
                    operação (turno, bobina, quebra de folha, ronda, nota de manutenção).

                    Não há processo de fundo: a simulação é reexecutada dentro da requisição, \
                    a partir do último passo gravado. É o que permite rodar num host que dorme \
                    sem tráfego.

                    Os erros seguem a RFC 9457 (`application/problem+json`), com `type` para o \
                    cliente decidir sem casar texto em português.""")
                .license(new License().name("MIT")));
  }
}
