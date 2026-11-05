package dev.felipesantos.papertwin.api;

import java.net.URI;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;
import org.springframework.web.bind.annotation.ExceptionHandler;

/**
 * Os erros da API, no formato da RFC 9457.
 *
 * <p>Um corpo de erro padronizado vale mais que um `message` solto porque ele tem <b>tipo</b>: o
 * cliente pode decidir o que fazer olhando o `type`, sem casar texto em português. E porque o
 * campo `detail` fica livre para ser escrito para quem vai ler — que, nas telas deste projeto, é
 * quem opera a máquina.
 *
 * <p>As mensagens explicam a regra, e não só o fato. "O alarme X já foi reconhecido por Y" diz
 * mais que "conflito", e é a diferença entre quem clicou entender o que houve e achar que o
 * sistema falhou.
 */
@RestControllerAdvice
public class ApiErrors {

  private static final String BASE = "https://papertwin.dev/problems/";

  /** Um problema com tipo, para o cliente poder decidir sem ler português. */
  public static ErrorResponseException of(HttpStatus status, String type, String detail) {
    var problem = ProblemDetail.forStatus(status);
    problem.setType(URI.create(BASE + type));
    problem.setDetail(detail);
    return new ErrorResponseException(status, problem, null);
  }

  public static ErrorResponseException notFound(String detail) {
    return of(HttpStatus.NOT_FOUND, "nao-encontrado", detail);
  }

  public static ErrorResponseException conflict(String detail) {
    return of(HttpStatus.CONFLICT, "conflito", detail);
  }

  public static ErrorResponseException unprocessable(String detail) {
    return of(HttpStatus.UNPROCESSABLE_ENTITY, "nao-processavel", detail);
  }

  public static ErrorResponseException badRequest(String detail) {
    return of(HttpStatus.BAD_REQUEST, "requisicao-invalida", detail);
  }

  /**
   * Uma escrita de setpoint recusada, com o que a tela precisa para corrigir o campo.
   *
   * <p>A RFC 9457 permite <b>membros de extensão</b>, e é para isto que eles servem: o
   * {@code rejection} é um código que o cliente pode testar sem casar texto, e a faixa vai junto
   * porque é o que falta para quem errou o valor acertar na segunda tentativa. Um corpo de erro
   * só com a mensagem obrigaria a tela a buscar o catálogo numa segunda requisição.
   *
   * <p>Tag desconhecida é 404; o resto é 422. A diferença importa para quem consome: 404
   * significa "não existe, não tente de novo"; 422 significa "existe, mas este pedido não
   * serve".
   */
  public static ErrorResponseException setpointRejected(
      HttpStatus status, String rejection, String detail, Double min, Double max) {

    var problem = ProblemDetail.forStatus(status);
    problem.setType(URI.create(BASE + "setpoint-recusado"));
    problem.setDetail(detail);
    problem.setProperty("rejection", rejection);
    problem.setProperty("min", min);
    problem.setProperty("max", max);

    return new ErrorResponseException(status, problem, null);
  }

  /**
   * Um argumento inválido vindo do domínio vira 422, e não 500.
   *
   * <p>As classes de domínio recusam entrada incoerente com {@code IllegalArgumentException} —
   * uma janela de tendência que termina antes de começar, um setpoint numa escrava de cascata.
   * Isso é erro de quem chamou, e não da aplicação, e a mensagem já está escrita em português
   * para quem lê.
   */
  @ExceptionHandler(IllegalArgumentException.class)
  public ResponseEntity<ProblemDetail> onIllegalArgument(IllegalArgumentException e) {
    return body(unprocessable(e.getMessage()));
  }

  /** Rota que não existe: 404 com corpo, e não a página de erro padrão. */
  @ExceptionHandler(NoResourceFoundException.class)
  public ResponseEntity<ProblemDetail> onMissingRoute(NoResourceFoundException e) {
    return body(notFound("Esta rota não existe: " + e.getResourcePath()));
  }

  /**
   * O corpo do problema, com o tipo de mídia da RFC 9457.
   *
   * <p>Um {@code @ExceptionHandler} que <b>devolve</b> a exceção a serializaria como objeto, e
   * sairia um corpo com os campos de uma exceção Java em vez do problema. O que o cliente precisa
   * é do {@code ProblemDetail} de dentro dela, e é ele que vai aqui.
   */
  private static ResponseEntity<ProblemDetail> body(ErrorResponseException problem) {
    return ResponseEntity.status(problem.getStatusCode())
        .contentType(MediaType.APPLICATION_PROBLEM_JSON)
        .body(problem.getBody());
  }
}
