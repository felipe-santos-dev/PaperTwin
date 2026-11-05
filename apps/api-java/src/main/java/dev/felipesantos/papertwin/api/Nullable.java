package dev.felipesantos.papertwin.api;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Este componente de registro pode ser nulo.
 *
 * <p>Serve a duas pessoas. Para quem lê o Java, diz onde há de verdade a possibilidade de nulo —
 * uma bobina aberta não tem gramatura, um ativo sem classe ISO não tem limites — em vez de deixar
 * isso só no comentário. Para o contrato, é o que permite marcar <b>obrigatório</b> todo o resto:
 * sem este sinal, o springdoc declara todos os campos opcionais, e os tipos gerados para o front
 * saem com {@code ?} até no {@code count}.
 *
 * <p>Não existe o oposto. O padrão é obrigatório, e isso é deliberado: um padrão que exige
 * anotação é um padrão que alguém esquece, e esquecer aqui faria o contrato <b>mentir</b> — o front
 * deixaria de tratar um nulo que acontece. Esquecer na outra direção só torna o contrato
 * pessimista, e o {@code tsc} cobra na hora.
 *
 * <p>Fica no projeto em vez de vir do JSpecify ou do Spring porque é uma decisão de contrato, não
 * de análise estática: nada aqui verifica nulo em tempo de compilação, e usar uma anotação que
 * sugere isso prometeria o que o código não cumpre.
 *
 * @see dev.felipesantos.papertwin.config.RequiredWhenNotNullable
 */
@Documented
@Retention(RetentionPolicy.RUNTIME)
@Target({
  ElementType.RECORD_COMPONENT,
  ElementType.FIELD,
  ElementType.METHOD,
  ElementType.PARAMETER
})
public @interface Nullable {}
