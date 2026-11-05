package dev.felipesantos.papertwin.config;

import dev.felipesantos.papertwin.api.Nullable;
import io.swagger.v3.core.converter.AnnotatedType;
import io.swagger.v3.core.converter.ModelConverter;
import io.swagger.v3.core.converter.ModelConverterContext;
import io.swagger.v3.oas.models.media.Schema;
import java.lang.reflect.RecordComponent;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashSet;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * Marca no contrato os campos que o Java garante.
 *
 * <p>O springdoc, sem anotação, declara <b>todos</b> os campos opcionais. O efeito disso aparece do
 * outro lado: os tipos gerados para o front saem com {@code ?} em tudo, e {@code count} — um {@code
 * int} que sempre existe — chega como {@code number | undefined}. O front então enche de {@code ??
 * 0} para contornar uma incerteza que não existe.
 *
 * <p>Este conversor olha os <b>componentes do registro</b> e marca obrigatório tudo o que não
 * esteja anotado com {@link dev.felipesantos.papertwin.api.Nullable}. O padrão é obrigatório
 * porque é o caso comum: a maioria esmagadora dos campos de resposta sempre vem. O que aceita
 * nulo está dito no próprio registro — a bobina aberta não tem gramatura, o ativo sem classe ISO
 * não tem limites — e a anotação serve também a quem lê o Java.
 *
 * <p>Esquecer a anotação faz o contrato mentir, e por isso ela não é opcional por descuido: um
 * componente que pode ser nulo e não está marcado leva o front a não tratar o nulo. O caminho
 * inverso — marcar o que nunca é nulo — só deixa o contrato pessimista, e o {@code tsc} cobra na
 * hora.
 *
 * <p>Primitivo nunca pode ser nulo, então uma anotação nele é contradição: o conversor recusa,
 * em vez de ignorar em silêncio.
 *
 */
@Component
public class RequiredWhenNotNullable implements ModelConverter {

  @Override
  public Schema<?> resolve(
      AnnotatedType type, ModelConverterContext context, Iterator<ModelConverter> chain) {

    var schema = chain.hasNext() ? chain.next().resolve(type, context, chain) : null;
    if (schema == null) {
      return null;
    }

    /*
     * O esquema que volta aqui pode ser só uma referência (`$ref`): o objeto de
     * verdade fica no mapa de definições do contexto, e é lá que a marcação
     * tem de ser feita. Mexer apenas no que volta não alcançaria nada.
     */
    var raw = type.getType();
    Class<?> target = null;
    if (raw instanceof Class<?> clazz) {
      target = clazz;
    } else if (raw instanceof com.fasterxml.jackson.databind.JavaType javaType) {
      target = javaType.getRawClass();
    }

    if (target == null || !target.isRecord()) {
      return schema;
    }

    var required = new ArrayList<String>();
    var nullable = new ArrayList<String>();

    for (RecordComponent component : target.getRecordComponents()) {
      if (component.isAnnotationPresent(Nullable.class)) {
        if (component.getType().isPrimitive()) {
          throw new IllegalStateException(
              "%s.%s é primitivo e está marcado @Nullable: um deles está errado"
                  .formatted(target.getSimpleName(), component.getName()));
        }
        nullable.add(component.getName());
      }

      /*
       * Obrigatório sempre, inclusive o que aceita nulo.
       *
       * No OpenAPI as duas coisas são independentes: "obrigatório" diz que a
       * CHAVE está presente, e o tipo diz o que o valor pode ser. O Jackson
       * escreve `"endedAt": null` — chave presente, valor nulo — e nunca omite
       * a chave, então dizer que ela é opcional seria descrever um corpo que
       * esta API não produz.
       *
       * A diferença aparece do outro lado: `endedAt?: string | null` obriga o
       * front a tratar três casos onde existem dois, e com
       * `exactOptionalPropertyTypes` ligado ele não consegue nem passar o valor
       * adiante sem um `?? null` que não significa nada.
       */
      required.add(component.getName());
    }

    var defined = context.getDefinedModels().get(target.getSimpleName());
    var holder = defined != null ? defined : schema;
    var properties = holder.getProperties();

    if (properties == null) {
      return schema;
    }

    for (var name : required) {
      if (properties.containsKey(name)
          && (holder.getRequired() == null || !holder.getRequired().contains(name))) {
        holder.addRequiredItem(name);
      }
    }

    /*
     * O que aceita nulo também vai marcado como tal, e não só como opcional.
     *
     * No OpenAPI, "não obrigatório" significa que a chave pode <b>faltar</b>, e
     * é outra coisa: o Jackson escreve `"endedAt": null`, com a chave presente.
     * Um gerador honesto produz `endedAt?: string` do primeiro e
     * `endedAt?: string | null` do segundo — e o front que compara com `null`
     * precisa do segundo, senão o `tsc` recusa a comparação.
     *
     * No 3.1 isso não é um campo `nullable`: nulo passou a ser um TIPO, e o
     * `setNullable` do swagger não aparece na saída 3.1 — some em silêncio, que
     * foi como isto apareceu.
     *
     * O caminho é um `anyOf` com o tipo nulo ao lado do esquema original, para
     * todos os casos. Acrescentar `"null"` à lista de tipos funcionaria para um
     * tipo simples e não para os esquemas tipados do swagger — um
     * `DateTimeSchema` responde `"string"` de dentro da classe, e ignora o que
     * se escreve na lista. O `anyOf` preserva formato e enumeração, porque o
     * esquema original vai inteiro para dentro dele.
     */
    for (var name : nullable) {
      if (properties.get(name) instanceof Schema<?> property) {
        properties.put(name, orNull(property));
      }
    }

    return schema;
  }

  /** Uma referência que também aceita nulo. */
  private static Schema<?> orNull(Schema<?> ref) {
    var nullType = new Schema<>();
    nullType.setTypes(new LinkedHashSet<>(List.of("null")));

    var wrapper = new Schema<>();
    wrapper.setAnyOf(List.of(ref, nullType));
    return wrapper;
  }
}
