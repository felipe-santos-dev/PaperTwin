package dev.felipesantos.papertwin.config;

import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.databind.JsonSerializer;
import com.fasterxml.jackson.databind.SerializerProvider;
import com.fasterxml.jackson.databind.module.SimpleModule;
import java.io.IOException;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import org.springframework.boot.autoconfigure.jackson.Jackson2ObjectMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Como os instantes vão para o JSON.
 *
 * <p>Sempre com três casas de milissegundo e sempre em UTC: {@code 2026-03-02T09:00:00.000Z}.
 *
 * <p>O padrão do Jackson omite os milissegundos quando eles são zero, e isso é exatamente o tipo
 * de diferença que não quebra nada até quebrar. O front compara instantes como texto em alguns
 * lugares, o instantâneo do modo de demonstração é gerado uma vez e servido muitas, e o gabarito
 * da implementação TypeScript — contra o qual as rotas são conferidas — usa o formato do
 * {@code toISOString()} do JavaScript, que sempre escreve as três casas.
 *
 * <p>Fixar o formato aqui é mais barato que descobrir, meses depois, que um turno começou em
 * {@code 09:00:00Z} num ambiente e em {@code 09:00:00.000Z} no outro.
 */
@Configuration
public class JacksonConfig {

  private static final DateTimeFormatter ISO_MILLIS =
      DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC);

  @Bean
  public Jackson2ObjectMapperBuilderCustomizer instantsAsIsoMillis() {
    var module = new SimpleModule();

    module.addSerializer(
        Instant.class,
        new JsonSerializer<>() {
          @Override
          public void serialize(Instant value, JsonGenerator json, SerializerProvider provider)
              throws IOException {
            json.writeString(ISO_MILLIS.format(value));
          }
        });

    /*
     * `modulesToInstall`, e nunca `modules`.
     *
     * `modules` SUBSTITUI a lista que o Boot montou, e lá dentro está o
     * `JavaTimeModule`. Trocada a lista, `Instant` continuaria funcionando
     * — este módulo o cobre — e `LocalDate` passaria a estourar na
     * serialização, o que é um jeito peculiar de quebrar: a data de operação
     * do turno derrubaria a rota /shifts e nada mais.
     */
    return builder -> builder.modulesToInstall(module);
  }
}
