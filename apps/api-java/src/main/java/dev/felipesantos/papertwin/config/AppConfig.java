package dev.felipesantos.papertwin.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.felipesantos.papertwin.db.HistorianRepository;
import dev.felipesantos.papertwin.db.OperationsRepository;
import dev.felipesantos.papertwin.db.SimStateRepository;
import dev.felipesantos.papertwin.historian.Recorder;
import dev.felipesantos.papertwin.runtime.CatchUp;
import dev.felipesantos.papertwin.runtime.SimulationService;
import dev.felipesantos.papertwin.simulation.SimClock;
import java.time.Clock;
import javax.sql.DataSource;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * As peças da aplicação, montadas.
 *
 * <p>Os repositórios recebem a {@code DataSource} e nada mais: eles são SQL e mapeamento, sem
 * dependência do Spring além disso, o que é o que permite testá-los contra um Postgres embarcado
 * sem subir um contexto.
 *
 * <p>O relógio é um bean de propósito. A geração do instantâneo de demonstração precisa de um
 * instante fixo, e os testes de rota também — sem isso, cada execução produziria um corpo
 * diferente e não haveria o que comparar com o gabarito.
 */
@Configuration
public class AppConfig {

  @Bean
  public Clock clock() {
    return Clock.systemUTC();
  }

  @Bean
  public HistorianRepository historianRepository(DataSource dataSource) {
    return new HistorianRepository(dataSource);
  }

  @Bean
  public OperationsRepository operationsRepository(DataSource dataSource) {
    return new OperationsRepository(dataSource);
  }

  @Bean
  public SimStateRepository simStateRepository(DataSource dataSource, ObjectMapper mapper) {
    return new SimStateRepository(dataSource, mapper);
  }

  @Bean
  public CatchUp catchUp(
      HistorianRepository historian,
      OperationsRepository operations,
      SimStateRepository simState) {
    return new CatchUp(historian, operations, simState);
  }

  @Bean
  public SimulationService simulationService(
      CatchUp catchUp,
      DataSource dataSource,
      Clock clock,
      @Value("${papertwin.seed:" + SimClock.DEFAULT_SEED + "}") int seed) {

    return new SimulationService(catchUp, dataSource, clock, seed, Recorder.SCAN_TICKS);
  }
}
