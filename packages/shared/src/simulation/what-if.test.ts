import { describe, expect, it } from 'vitest';

import { relation } from '../process/relations';
import { processEngine, type EngineState } from './process-engine';
import { affectedBy, runWhatIf, WHAT_IF_MAX_HORIZON_S } from './what-if';

/**
 * O "e se" tem de dizer o que o CSV mediu.
 *
 * Em malha aberta, um degrau na entrada de uma relação deve devolver o ganho, o
 * tempo morto e o τ daquela linha do `relacoes-fopdt.csv` — não um número
 * parecido, o número. Se um dia alguém mexer no motor e a resposta sair com
 * outro τ, é aqui que aparece, e com o nome da relação na mensagem.
 */

/** Um estado de rede em regime, de onde as previsões partem. */
function estado(): EngineState {
  const engine = processEngine(1000);
  // alguns minutos para a rede assentar antes de servir de ponto de partida
  engine.runTo(1600);
  return engine.snapshotState();
}

describe('resposta ao degrau em malha aberta', () => {
  /**
   * Cada caso é uma relação do CSV, com um degrau que cabe na faixa da válvula.
   * O horizonte é θ + 4τ, que é quando a primeira ordem já chegou a 98 %.
   */
  const casos = [
    { id: '4', input: 'PIC-514', step: 40, output: 'AIC-901' },
    { id: '14', input: 'WIC-801', step: 20, output: 'AIC-905' },
    { id: '3', input: 'SIC-1104', step: 30, output: 'AIC-902' },
    { id: '6', input: 'WIC-401', step: 80, output: 'AI-407' },
  ] as const;

  for (const caso of casos) {
    it(`relação ${caso.id}: ${caso.input} → ${caso.output}`, () => {
      const modelo = relation(caso.id);
      expect(modelo, `relação ${caso.id} saiu do CSV`).not.toBeNull();
      if (!modelo) return;

      const início = estado();
      const partida = processEngine(início.tick, { state: início, noise: false }).measured(
        caso.input,
      );
      expect(partida).not.toBeNull();

      // θ + 6τ: a primeira ordem chega a 99,8 %, e o ganho pode ser comparado
      const horizonS = Math.min(
        WHAT_IF_MAX_HORIZON_S,
        Math.round(modelo.deadTimeS + 6 * modelo.tauS),
      );

      const resultado = runWhatIf(início, {
        changes: [{ tag: caso.input, value: (partida ?? 0) + caso.step }],
        horizonS,
        mode: 'manual',
      });

      const saída = resultado.variables.find((item) => item.tag === caso.output);
      expect(saída, `${caso.output} não apareceu entre as alcançadas`).toBeDefined();
      if (!saída) return;

      // ganho: o CSV dá por unidade de entrada
      const esperado = modelo.kp * caso.step;
      expect(saída.finalDelta).toBeCloseTo(esperado, Math.abs(esperado) > 1 ? 1 : 2);

      // tempo morto: a resposta começa a aparecer logo depois de θ
      expect(saída.deadTimeS).not.toBeNull();
      expect(saída.deadTimeS ?? 0).toBeGreaterThanOrEqual(modelo.deadTimeS - 2);
      expect(saída.deadTimeS ?? 0).toBeLessThanOrEqual(modelo.deadTimeS + 0.2 * modelo.tauS + 3);

      // 63 % da variação acontece em θ + τ
      expect(saída.t63S).not.toBeNull();
      expect(saída.t63S ?? 0).toBeGreaterThanOrEqual(modelo.deadTimeS + modelo.tauS - 4);
      expect(saída.t63S ?? 0).toBeLessThanOrEqual(modelo.deadTimeS + modelo.tauS + 4);
    });
  }
});

describe('a previsão não encosta no processo', () => {
  it('a cópia do estado não vaza para quem chamou', () => {
    const início = estado();
    const antes = structuredClone(início);

    runWhatIf(início, {
      changes: [{ tag: 'AIC-902', value: 78 }],
      horizonS: 300,
      mode: 'auto',
    });

    expect(início).toEqual(antes);
  });

  it('o motor de onde o estado saiu continua onde estava', () => {
    const engine = processEngine(1000);
    engine.runTo(1600);
    const antes = engine.measured('AIC-901');

    runWhatIf(engine.snapshotState(), {
      changes: [{ tag: 'AIC-902', value: 78 }],
      horizonS: 600,
      mode: 'auto',
    });

    expect(engine.tick).toBe(1600);
    expect(engine.measured('AIC-901')).toBe(antes);
  });

  it('duas chamadas iguais dão a mesma série', () => {
    const início = estado();
    const opções = {
      changes: [{ tag: 'AIC-902', value: 78 }],
      horizonS: 300,
      mode: 'auto' as const,
    };

    expect(runWhatIf(início, opções)).toEqual(runWhatIf(início, opções));
  });

  /**
   * A escrava de cascata não aceita setpoint nem aqui.
   *
   * É a mesma regra da escrita de verdade: com o mestre em automático, quem
   * manda na pressão do grupo é a umidade. Prever uma escrita que a máquina
   * recusaria seria ensinar errado.
   */
  it('recusa escrever na escrava de cascata, como a rota real', () => {
    expect(() =>
      runWhatIf(estado(), {
        changes: [{ tag: 'PIC-514', value: 300 }],
        horizonS: 300,
        mode: 'auto',
      }),
    ).toThrow(/escrava de uma cascata/);
  });
});

describe('o que a mudança alcança', () => {
  it('anda pelo grafo de relações, e não por uma lista escrita à mão', () => {
    // PIC-514 move a umidade antes da colagem, que a cascata usa
    expect(affectedBy(['PIC-514'])).toContain('AIC-901');
    // a velocidade move gramatura e umidade final, e elas movem o resto
    const pelaVelocidade = affectedBy(['SIC-1104']);
    expect(pelaVelocidade).toContain('AIC-902');
    expect(pelaVelocidade).toContain('AIC-903');
    // e as calculadas que leem essas saídas vêm junto
    expect(pelaVelocidade).toContain('XI-1005');
  });

  it('não devolve ensaio de laboratório, que a tela de processo não desenha', () => {
    expect(affectedBy(['JIC-101']).some((tag) => tag.startsWith('LAB-'))).toBe(false);
  });
});

describe('o que ele recusa', () => {
  it('mudança vazia', () => {
    expect(() => runWhatIf(estado(), { changes: [], horizonS: 300, mode: 'auto' })).toThrow(
      /pelo menos uma/,
    );
  });

  it('horizonte acima do teto', () => {
    expect(() =>
      runWhatIf(estado(), {
        changes: [{ tag: 'PIC-514', value: 240 }],
        horizonS: WHAT_IF_MAX_HORIZON_S + 1,
        mode: 'auto',
      }),
    ).toThrow(/teto/);
  });

  it('valor fora da faixa da válvula', () => {
    expect(() =>
      runWhatIf(estado(), {
        changes: [{ tag: 'PIC-514', value: 9000 }],
        horizonS: 300,
        mode: 'auto',
      }),
    ).toThrow(/faixa da válvula/);
  });

  it('em malha aberta, só o que tem válvula', () => {
    expect(() =>
      runWhatIf(estado(), {
        changes: [{ tag: 'AIC-902', value: 80 }],
        horizonS: 300,
        mode: 'manual',
      }),
    ).toThrow(/malha de campo/);
  });
});

describe('automático contra manual', () => {
  /**
   * É a diferença que a tela existe para mostrar: em automático a cascata puxa
   * a umidade de volta para o setpoint, em manual ela fica onde o processo a
   * deixou.
   */
  it('a cascata traz a umidade de volta em automático, e não em manual', () => {
    const início = estado();
    const partida = processEngine(início.tick, { state: início, noise: false }).measured(
      'SIC-1104',
    );
    const mudança = {
      changes: [{ tag: 'SIC-1104', value: (partida ?? 1250) + 30 }],
      horizonS: 900,
    };

    const manual = runWhatIf(início, { ...mudança, mode: 'manual' });
    const automático = runWhatIf(início, { ...mudança, mode: 'auto' });

    const umidadeManual = manual.variables.find((item) => item.tag === 'AIC-903');
    const umidadeAuto = automático.variables.find((item) => item.tag === 'AIC-903');

    expect(umidadeManual).toBeDefined();
    expect(Math.abs(umidadeManual?.finalDelta ?? 0)).toBeGreaterThan(0.05);
    // em automático o desvio final é menor: a malha reagiu
    expect(Math.abs(umidadeAuto?.finalDelta ?? 99)).toBeLessThan(
      Math.abs(umidadeManual?.finalDelta ?? 0),
    );
  });
});
