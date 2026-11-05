package dev.felipesantos.papertwin.api;

import dev.felipesantos.papertwin.catalog.ProcessCatalog;
import dev.felipesantos.papertwin.runtime.SimulationService;
import dev.felipesantos.papertwin.simulation.SimClock;
import java.io.IOException;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * O fluxo de valores ao vivo, por SSE.
 *
 * <p>SSE e não WebSocket: o tráfego é de um lado só — o servidor empurra, o cliente não fala — e
 * SSE é HTTP comum, que atravessa qualquer proxy, reconecta sozinho e não precisa de biblioteca
 * no navegador. Um WebSocket aqui seria carregar um canal bidirecional para usar metade dele.
 *
 * <h2>Só o que mudou</h2>
 *
 * <p>Cada evento leva apenas as tags cujo valor se afastou mais que o {@code excDev} do catálogo
 * desde o último envio. São 320 tags: mandar todas a cada dois segundos seriam ~20 kB por evento
 * numa máquina que, em regime, mexe em meia dúzia delas. O mesmo {@code excDev} que o historiador
 * usa para decidir o que arquivar decide aqui o que vale transmitir — e com isso as duas coisas
 * concordam por construção sobre o que é ruído.
 */
@RestController
public class StreamController {

  private static final Logger log = LoggerFactory.getLogger(StreamController.class);

  /** Intervalo entre eventos. */
  private static final long INTERVAL_MS = 2000;

  /**
   * Um comentário a cada quinze segundos, para o canal não ser fechado por inatividade.
   *
   * <p>Proxies e balanceadores derrubam conexões ociosas, e numa máquina em regime o filtro acima
   * pode deixar minutos sem nenhum evento. O comentário não é evento — o cliente o ignora — e é
   * o bastante para o canal continuar vivo.
   */
  private static final long KEEPALIVE_MS = 15_000;

  private final SimulationService simulation;
  private final ScheduledExecutorService scheduler =
      Executors.newSingleThreadScheduledExecutor(
          runnable -> {
            var thread = new Thread(runnable, "sse-stream");
            thread.setDaemon(true);
            return thread;
          });

  public StreamController(SimulationService simulation) {
    this.simulation = simulation;
  }

  public record Change(String tag, double value, String unit) {}

  public record Tick(Instant ts, long tick, java.util.List<Change> changes) {}

  @GetMapping(path = "/stream", produces = "text/event-stream")
  public SseEmitter stream() {
    var emitter = new SseEmitter(Long.MAX_VALUE);
    var lastSent = new LinkedHashMap<String, Double>();
    var lastKeepalive = new long[] {System.currentTimeMillis()};

    ScheduledFuture<?> job =
        scheduler.scheduleAtFixedRate(
            () -> {
              try {
                var report = simulation.ensureCurrent();
                var changes = changesSince(lastSent, report.values());

                if (!changes.isEmpty()) {
                  emitter.send(
                      SseEmitter.event()
                          .name("values")
                          .data(
                              new Tick(
                                  SimClock.tickTime(report.toTick()),
                                  report.toTick(),
                                  changes)));
                  lastKeepalive[0] = System.currentTimeMillis();
                } else if (System.currentTimeMillis() - lastKeepalive[0] > KEEPALIVE_MS) {
                  emitter.send(SseEmitter.event().comment("vivo"));
                  lastKeepalive[0] = System.currentTimeMillis();
                }
              } catch (IOException | IllegalStateException e) {
                // o cliente fechou; não é erro, é o fim normal de um fluxo
                emitter.complete();
              } catch (RuntimeException e) {
                log.warn("fluxo interrompido: {}", e.getMessage());
                emitter.completeWithError(e);
              }
            },
            0,
            INTERVAL_MS,
            TimeUnit.MILLISECONDS);

    /*
     * O cancelamento é registrado para os três finais possíveis.
     *
     * Sem isso, o trabalho agendado continua rodando depois de o cliente sumir
     * — e num host de 512 MB, uma tarefa por aba que alguém já fechou é
     * exatamente o vazamento que derruba a instância na segunda semana.
     */
    emitter.onCompletion(() -> job.cancel(false));
    emitter.onTimeout(() -> job.cancel(false));
    emitter.onError(error -> job.cancel(false));

    return emitter;
  }

  /** As tags que se moveram mais que o próprio ruído desde o último envio. */
  private static java.util.List<Change> changesSince(
      Map<String, Double> lastSent, Map<String, Double> current) {

    var changes = new java.util.ArrayList<Change>();

    for (var variable : ProcessCatalog.ALL) {
      var value = current.get(variable.tag());
      if (value == null) {
        continue;
      }

      var previous = lastSent.get(variable.tag());
      var excDev = variable.compression().excDev();
      double threshold = excDev == null ? 0 : excDev;

      if (previous == null || Math.abs(value - previous) > threshold) {
        changes.add(new Change(variable.tag(), value, variable.unit()));
        lastSent.put(variable.tag(), value);
      }
    }

    return java.util.List.copyOf(changes);
  }
}
