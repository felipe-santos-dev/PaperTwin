package dev.felipesantos.papertwin.historian;

import dev.felipesantos.papertwin.historian.Samples.ArchivedSample;
import dev.felipesantos.papertwin.historian.Samples.Sample;
import java.util.ArrayList;
import java.util.List;

/**
 * A compressão do historiador, no modelo do PI: filtro de exceção na coleta e porta oscilante no
 * arquivo.
 *
 * <p>As duas etapas são separadas de propósito. O filtro decide o que é <b>descartado</b> antes de
 * chegar ao arquivo; a porta decide o que, do que chegou, precisa de uma linha própria. Juntá-las
 * num passo só esconderia qual das duas é responsável quando a taxa de compressão surpreende.
 */
public final class Compression {

  /** Um estágio da compressão: recebe amostras, devolve as que passam. */
  public interface Stage<T> {
    /** Processa uma amostra e devolve o que ela produziu — zero, uma ou duas. */
    List<T> feed(Sample sample);

    /** Fecha a janela, devolvendo o que estava retido. */
    List<T> flush();
  }

  private Compression() {}

  /**
   * O filtro de exceção.
   *
   * <p>Quando a amostra é novidade, o filtro envia <b>duas</b>: a amostra anterior, que ainda não
   * havia sido enviada, e a nova. Sem isso um degrau viraria rampa.
   *
   * <p>Imagine um sinal em 100 por dez minutos que salta para 140 num segundo. Sem enviar a
   * anterior, o arquivo teria o 100 de dez minutos atrás e o 140 de agora, e qualquer interpolação
   * entre os dois desenharia uma subida de dez minutos que não aconteceu. Enviando as duas, o
   * arquivo tem o 100 de um segundo antes do salto, e a subida fica onde foi.
   */
  public static Stage<Sample> exceptionFilter(double excDev, long maxGapS) {
    long maxGapMs = maxGapS * 1000;
    double deviation = Math.abs(excDev);

    return new Stage<>() {
      private Sample lastSent;
      /** A última amostra vista e não enviada. */
      private Sample held;

      @Override
      public List<Sample> feed(Sample sample) {
        if (lastSent == null) {
          lastSent = sample;
          held = null;
          return List.of(sample);
        }

        boolean isNews = Math.abs(sample.v() - lastSent.v()) > deviation;
        boolean isStale = sample.t() - lastSent.t() >= maxGapMs;

        if (!isNews && !isStale) {
          held = sample;
          return List.of();
        }

        /*
         * A anterior acompanha a NOVIDADE, nunca o teto de tempo.
         *
         * No degrau ela é indispensável: sem ela, a subida apareceria
         * começando no último valor enviado, que pode ser de minutos atrás. No
         * teto de tempo não há degrau nenhum para preservar — o valor não
         * mudou, só o tempo passou — e mandar a anterior junto gravaria duas
         * linhas praticamente iguais a cada estouro do teto.
         */
        List<Sample> sending =
            isNews && held != null && held.t() > lastSent.t()
                ? List.of(held, sample)
                : List.of(sample);

        lastSent = sample;
        held = null;
        return sending;
      }

      @Override
      public List<Sample> flush() {
        if (held == null || lastSent == null || held.t() <= lastSent.t()) {
          return List.of();
        }
        var last = held;
        lastSent = last;
        held = null;
        return List.of(last);
      }
    };
  }

  /**
   * A porta oscilante.
   *
   * <p>O arquivo guarda uma âncora e, enquanto puder, nada mais: tudo que vem depois é descartado
   * se uma reta saindo da âncora puder passar a menos de {@code compDev} de cada amostra
   * descartada.
   *
   * <p>O algoritmo mantém duas inclinações, que formam um corredor em leque a partir da âncora.
   * Cada amostra nova aperta o corredor: a máxima nunca sobe, a mínima nunca desce. Quando o
   * corredor fecha — máxima abaixo da mínima — não existe mais reta que sirva para todas, e aí a
   * amostra <b>anterior</b> vai para o arquivo e vira a nova âncora. É a anterior, e não a atual,
   * porque a anterior é a última que a reta antiga ainda explicava.
   *
   * <p>Com {@code compDev} zero o corredor tem largura nula, então qualquer amostra fora da reta
   * o fecha — que é o comportamento certo para uma tag sem compressão no catálogo. A exceção vale
   * saber: numa rampa <b>exata</b> o corredor degenera numa inclinação só e nunca fecha, e a
   * rampa sai em dois pontos. Dado de processo tem ruído de instrumento e nunca é exato, mas um
   * sinal sintético pode ser.
   *
   * <h2>O que {@code compDev} garante, exatamente</h2>
   *
   * <p>O corredor garante que <b>existe</b> uma reta saindo da faixa {@code âncora ± compDev} que
   * passa a menos de {@code compDev} de cada amostra descartada. Mas a reta que quem lê o arquivo
   * desenha não é essa: é a corda entre dois valores arquivados. As duas podem divergir, e o erro
   * da corda chega a <b>2 · compDev</b> no pior caso.
   *
   * <p>Isso não é defeito da implementação, é o que a porta oscilante promete — e vale saber ao
   * escolher o {@code compDev} de uma tag: o desvio que o gráfico pode mostrar é o dobro do que
   * está no catálogo.
   *
   * <p>Por consequência, a porta também fecha <b>uma amostra depois</b> da mudança: ela só descobre
   * que a reta não serve mais quando chega a amostra que não cabe. Num canto de rampa, o vértice
   * arquivado é o ponto seguinte ao vértice real.
   */
  public static Stage<ArchivedSample> swingingDoor(double compDev, long maxGapS) {
    long maxGapMs = maxGapS * 1000;
    double deviation = Math.abs(compDev);

    return new Stage<>() {
      private Sample anchor;
      private Sample held;
      private double maxSlope = Double.POSITIVE_INFINITY;
      private double minSlope = Double.NEGATIVE_INFINITY;

      private void openDoorAt(Sample sample) {
        anchor = sample;
        held = null;
        maxSlope = Double.POSITIVE_INFINITY;
        minSlope = Double.NEGATIVE_INFINITY;
      }

      /** Aperta o corredor com a amostra; devolve {@code false} quando ele fecha. */
      private boolean narrow(Sample sample) {
        if (anchor == null) {
          return true;
        }

        double dtS = (sample.t() - anchor.t()) / 1000.0;
        // amostra no mesmo instante da âncora não diz nada sobre inclinação
        if (dtS <= 0) {
          return true;
        }

        double up = (sample.v() + deviation - anchor.v()) / dtS;
        double down = (sample.v() - deviation - anchor.v()) / dtS;

        double nextMax = Math.min(maxSlope, up);
        double nextMin = Math.max(minSlope, down);

        if (nextMax < nextMin) {
          return false;
        }

        maxSlope = nextMax;
        minSlope = nextMin;
        return true;
      }

      @Override
      public List<ArchivedSample> feed(Sample sample) {
        if (anchor == null) {
          openDoorAt(sample);
          return List.of(new ArchivedSample(sample.t(), sample.v(), ArchiveReason.INICIAL));
        }

        if (sample.t() - anchor.t() >= maxGapMs) {
          /*
           * O teto de tempo vence antes de a porta fechar.
           *
           * Aqui a amostra arquivada é a ATUAL, e não a retida. Quando a porta
           * fecha, a retida importa porque ela é a última que a reta antiga
           * ainda explicava. No teto de tempo não houve nada que a reta
           * deixasse de explicar: o que se quer registrar é "o ponto estava
           * vivo e valia isto agora". Arquivar a retida deixaria uma marca um
           * segundo antes do teto, sem razão.
           */
          openDoorAt(sample);
          return List.of(new ArchivedSample(sample.t(), sample.v(), ArchiveReason.INTERVALO));
        }

        if (narrow(sample)) {
          held = sample;
          return List.of();
        }

        // a porta fechou: a anterior é a última que a reta antiga explicava
        var archived = held != null ? held : sample;
        boolean archivedIsCurrent = archived == sample;
        openDoorAt(archived);

        var out = List.of(new ArchivedSample(archived.t(), archived.v(), ArchiveReason.PORTA));

        if (!archivedIsCurrent) {
          held = sample;
          narrow(sample);
        }
        return out;
      }

      @Override
      public List<ArchivedSample> flush() {
        if (held == null || anchor == null || held.t() <= anchor.t()) {
          return List.of();
        }
        var last = held;
        openDoorAt(last);
        return List.of(new ArchivedSample(last.t(), last.v(), ArchiveReason.FINAL));
      }
    };
  }

  /** Quanto a compressão economizou. */
  public record Stats(int samples, int afterException, int archived, double ratio) {}

  /** O resultado de passar uma série inteira pelas duas etapas. */
  public record Recorded(List<ArchivedSample> archived, Stats stats) {}

  /**
   * Passa uma série pelas duas etapas e devolve o arquivo mais as contas.
   *
   * <p>Um ponto sem {@code excDev} nem {@code compDev} no catálogo não é comprimido: as duas
   * etapas rodam com desvio zero, e aí tudo que entra sai.
   */
  public static Recorded record(Double excDev, Double compDev, List<Sample> samples) {
    var exception = exceptionFilter(excDev == null ? 0 : excDev, Retention.EXCEPTION_MAX_GAP_S);
    var door = swingingDoor(compDev == null ? 0 : compDev, Retention.ARCHIVE_MAX_GAP_S);

    var afterException = new ArrayList<Sample>();
    for (var sample : samples) {
      afterException.addAll(exception.feed(sample));
    }
    afterException.addAll(exception.flush());

    var archived = new ArrayList<ArchivedSample>();
    for (var sample : afterException) {
      archived.addAll(door.feed(sample));
    }
    archived.addAll(door.flush());

    double ratio = archived.isEmpty() ? 0 : (double) samples.size() / archived.size();

    return new Recorded(
        List.copyOf(archived),
        new Stats(samples.size(), afterException.size(), archived.size(), ratio));
  }
}
