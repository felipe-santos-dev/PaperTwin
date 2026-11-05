package dev.felipesantos.papertwin.config;

import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Quem pode chamar esta API de um navegador.
 *
 * <p>Sem isto a API responde a {@code curl} e não ao front: o navegador bloqueia a resposta antes
 * de ela chegar ao JavaScript, e a tela mostra um erro de rede que não diz o que houve. Vale para
 * os dois casos deste projeto — o Vite em {@code localhost:5173} em desenvolvimento e o GitHub
 * Pages em produção, que estão em origens diferentes do host da API em qualquer cenário.
 *
 * <p>A lista vem de {@code CORS_ORIGINS}, separada por vírgulas. <b>Vazia libera todas</b>, e isso
 * é escolha consciente: a API é de leitura pública — ela não tem autenticação, não tem dado de
 * ninguém e a única escrita que aceita mexe num processo simulado. Fechar a origem daria uma
 * aparência de proteção que não existe, e atrapalharia quem quiser abrir o front de um clone
 * local. Em produção a variável é preenchida com o domínio das Pages, pelo checklist de deploy.
 */
@Configuration
public class CorsConfig implements WebMvcConfigurer {

  private final List<String> origins;

  public CorsConfig(@Value("${CORS_ORIGINS:}") String configured) {
    this.origins =
        configured.isBlank()
            ? List.of("*")
            : java.util.Arrays.stream(configured.split(","))
                .map(String::trim)
                .filter(origin -> !origin.isEmpty())
                .toList();
  }

  @Override
  public void addCorsMappings(CorsRegistry registry) {
    var mapping = registry.addMapping("/**").allowedMethods("GET", "POST", "PUT", "OPTIONS");

    /*
     * `allowedOriginPatterns` e não `allowedOrigins`, porque com `*` os dois não
     * são a mesma coisa: `allowedOrigins("*")` recusa quando há credenciais, e
     * é o que faria o SSE parar de funcionar atrás de um proxy que as manda.
     */
    mapping.allowedOriginPatterns(origins.toArray(String[]::new));
  }
}
