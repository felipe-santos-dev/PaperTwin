import { processVariable, relation } from '@mp1/shared';
import { describe, expect, it } from 'vitest';

import { TICKS_PER_HOUR, TICKS_PER_MINUTE } from './clock';
import { instrumentNoiseSd, operatingPoint, requireOperatingPoint } from './operating-point';
import {
  ATMOSPHERIC_KPA,
  cylinderSurfaceTempC,
  piController,
  saturationTemperatureC,
  simcTuning,
} from './pi';
import {
  cascadePairs,
  isCascadeSlave,
  MV_LAG_S,
  networkInputs,
  processEngine,
  drivenTags,
} from './process-engine';

const START = 1_000_000;

describe('ajuste SIMC', () => {
  it('sai dos coeficientes da relação, pela fórmula do método', () => {
    // relação 1: FIC-105 → AIC-902, kp 0,0825, θ 75 s, τ 23 s
    const rel = relation('1');
    expect(rel).not.toBeNull();

    const tuning = simcTuning({ kp: rel?.kp ?? 0, deadTimeS: 75, tauS: 23 });

    // λ = θ: Kc = τ / (K · 2θ) e Ti = min(τ, 8θ)
    expect(tuning.kc).toBeCloseTo(23 / (0.0825 * 150), 6);
    expect(tuning.tiS).toBe(23);
  });

  it('dá ganho negativo quando o processo é de ganho negativo', () => {
    // relação 5: PIC-711 → AIC-903, kp −0,02 — mais vapor, menos umidade
    const tuning = simcTuning({ kp: -0.02, deadTimeS: 14, tauS: 45 });

    expect(tuning.kc).toBeLessThan(0);
    expect(tuning.kc).toBeCloseTo(45 / (-0.02 * 28), 6);
  });

  it('usa metade de τ como λ quando não há tempo morto', () => {
    const tuning = simcTuning({ kp: 2, deadTimeS: 0, tauS: 20 });
    expect(tuning.kc).toBeCloseTo(20 / (2 * 10), 6);
  });

  it('recusa malha sem ganho ou sem τ', () => {
    expect(() => simcTuning({ kp: 0, deadTimeS: 10, tauS: 10 })).toThrow(/ganho de processo zero/);
    expect(() => simcTuning({ kp: 1, deadTimeS: 10, tauS: 0 })).toThrow(/τ precisa/);
  });

  it('respeita o λ pedido', () => {
    const rápido = simcTuning({ kp: 1, deadTimeS: 10, tauS: 100 });
    const lento = simcTuning({ kp: 1, deadTimeS: 10, tauS: 100 }, 100);

    expect(Math.abs(lento.kc)).toBeLessThan(Math.abs(rápido.kc));
  });
});

describe('controlador PI', () => {
  const tuning = { kc: 2, tiS: 10 };
  const options = { tuning, bias: 50, min: 0, max: 100 };

  it('fica no bias quando o erro é zero', () => {
    const pi = piController(options);
    expect(pi.step(10, 10, 1)).toBe(50);
    expect(pi.integral).toBe(0);
  });

  it('age proporcionalmente ao erro, no primeiro passo', () => {
    const pi = piController(options);
    // e = 2; P = 2·2 = 4; I = 2·(2·1)/10 = 0,4
    expect(pi.step(12, 10, 1)).toBeCloseTo(50 + 4 + 0.4, 6);
  });

  it('acumula o integral enquanto o erro persiste', () => {
    const pi = piController(options);
    const primeiro = pi.step(12, 10, 1);
    const segundo = pi.step(12, 10, 1);

    expect(segundo).toBeGreaterThan(primeiro);
    expect(pi.integral).toBeCloseTo(4, 6);
  });

  it('não passa dos limites da válvula', () => {
    const pi = piController(options);
    for (let k = 0; k < 500; k += 1) pi.step(1000, 0, 1);

    expect(pi.output).toBe(100);

    const outro = piController(options);
    for (let k = 0; k < 500; k += 1) outro.step(-1000, 0, 1);
    expect(outro.output).toBe(0);
  });

  /**
   * A trava que separa um PI que funciona de um que parece funcionar.
   *
   * Sem ela, o integral cresceria sem limite durante a saturação e a malha
   * levaria minutos para sair dela quando o processo voltasse — com a medida
   * passando longe do setpoint no caminho. É o windup, e numa máquina de papel
   * ele aparece logo depois de uma quebra de folha.
   */
  /**
   * O erro de +10 é escolhido para a malha **acumular antes de saturar**.
   *
   * Com Kc 2, Ti 10 s, bias 50 e teto 100, a saída sem limite é `70 + 2k` no
   * passo k: ela só bate no teto depois de uns quinze passos, e nesse tempo o
   * integral sobe de verdade. Um erro gigante saturaria no primeiro passo e o
   * teste não mostraria nada — foi o que a primeira versão dele fazia.
   */
  it('trava o integral na saturação em vez de deixá-lo crescer sem limite', () => {
    const pi = piController(options);

    for (let k = 0; k < 20; k += 1) pi.step(20, 10, 1);
    const aoSaturar = pi.integral;
    expect(aoSaturar).toBeGreaterThan(50);
    expect(pi.output).toBe(100);

    for (let k = 0; k < 200; k += 1) pi.step(20, 10, 1);

    // sem a trava, 220 passos de erro 10 teriam dado integral 2200
    expect(pi.integral).toBeCloseTo(aoSaturar, 6);
    expect(pi.integral).toBeLessThan(200);
  });

  it('solta o integral no passo em que o erro muda de lado', () => {
    const pi = piController(options);
    for (let k = 0; k < 50; k += 1) pi.step(20, 10, 1);
    const travado = pi.integral;

    pi.step(0, 10, 1);
    expect(pi.integral).toBeLessThan(travado);
  });

  it('trava e solta do mesmo jeito no limite inferior', () => {
    const pi = piController(options);

    for (let k = 0; k < 20; k += 1) pi.step(0, 10, 1);
    const aoSaturar = pi.integral;
    expect(aoSaturar).toBeLessThan(-50);
    expect(pi.output).toBe(0);

    for (let k = 0; k < 200; k += 1) pi.step(0, 10, 1);
    expect(pi.integral).toBeCloseTo(aoSaturar, 6);

    pi.step(20, 10, 1);
    expect(pi.integral).toBeGreaterThan(aoSaturar);
  });

  it('recusa faixa e Ti inválidos', () => {
    expect(() => piController({ ...options, min: 100, max: 0 })).toThrow(/Faixa da MV/);
    expect(() => piController({ ...options, tuning: { kc: 1, tiS: 0 } })).toThrow(/Ti precisa/);
    expect(() => piController(options).step(1, 0, 0)).toThrow(/dt precisa/);
  });
});

describe('temperatura de saturação', () => {
  it('dá 100 °C na pressão atmosférica', () => {
    expect(saturationTemperatureC(0)).toBeCloseTo(100, 6);
  });

  it('bate com a tabela de vapor dentro de ~1,5 % na faixa da secagem', () => {
    // 15 kPa rel (aquecimento do G1): real ≈ 103,3 °C
    expect(saturationTemperatureC(15)).toBeGreaterThan(102);
    expect(saturationTemperatureC(15)).toBeLessThan(105);

    // 230 kPa rel (grupo principal): real ≈ 136,5 °C
    expect(saturationTemperatureC(230)).toBeGreaterThan(132);
    expect(saturationTemperatureC(230)).toBeLessThan(138);
  });

  it('aceita o vácuo parcial do G1 sem explodir', () => {
    // o catálogo deixa a PIC-511 descer a −30 kPa rel
    expect(saturationTemperatureC(-30)).toBeGreaterThan(60);
    expect(saturationTemperatureC(-30)).toBeLessThan(100);
    expect(Number.isFinite(saturationTemperatureC(-ATMOSPHERIC_KPA))).toBe(true);
  });

  it('põe a superfície do grupo principal no alvo do catálogo', () => {
    const alvoDoCatálogo = processVariable('TI-5201')?.target;
    expect(alvoDoCatálogo).toBe(125);

    // a PIC-514 opera em 230 kPa rel
    expect(cylinderSurfaceTempC(230)).toBeGreaterThan(120);
    expect(cylinderSurfaceTempC(230)).toBeLessThan(132);
  });
});

describe('ponto de operação', () => {
  it('é o alvo do catálogo quando há alvo', () => {
    expect(operatingPoint('PIC-514')).toBe(230);
    expect(operatingPoint('AIC-903')).toBe(4.8);
  });

  it('é o meio da faixa quando não há alvo', () => {
    // ZI-1004 vai de 600 a 3000 mm e não tem alvo: a bobina cresce e volta
    expect(operatingPoint('ZI-1004')).toBe(1800);
  });

  it('cobre os três ensaios que as relações movem', () => {
    expect(operatingPoint('LAB-1206')).toBe(5.2);
    expect(operatingPoint('LAB-1206R')).toBe(2.17);
    expect(operatingPoint('LAB-1212')).toBe(0);
  });

  it('não inventa ponto para o que não tem', () => {
    expect(operatingPoint('LAB-1204')).toBeNull();
    expect(() => requireOperatingPoint('NAO-EXISTE')).toThrow(/não tem ponto de operação/);
  });

  it('tira o ruído do excDev do catálogo', () => {
    // PIC-514 tem excDev 1 kPa
    expect(instrumentNoiseSd('PIC-514')).toBe(0.5);
    // AIC-903 tem excDev 0,02 %
    expect(instrumentNoiseSd('AIC-903')).toBeCloseTo(0.01, 10);
  });

  it('cai para uma fração da faixa quando não há excDev', () => {
    // XI-0002 é a largura constante, sem exc/comp
    expect(instrumentNoiseSd('XI-0002')).toBe(0);
    expect(instrumentNoiseSd('NAO-EXISTE')).toBe(0);
  });
});

describe('montagem da rede', () => {
  it('declara as seis cascatas', () => {
    expect(cascadePairs()).toEqual([
      { pv: 'AIC-901', mv: 'PIC-514' },
      { pv: 'AIC-902', mv: 'FIC-105' },
      { pv: 'AIC-903', mv: 'PIC-711' },
      { pv: 'AIC-904', mv: 'FIC-106' },
      { pv: 'AIC-905', mv: 'WIC-801' },
      { pv: 'AIC-306', mv: 'FIC-109' },
    ]);
  });

  it('deixa a relação zonada fora da rede MD', () => {
    // a relação 11 é ZIC-205[k] → AIC-902[k], resolvida por cd-profile.ts
    expect(networkInputs()).not.toContain('ZIC-205');
  });

  it('move as doze saídas que as relações alcançam', () => {
    expect(drivenTags()).toEqual([
      'AI-407',
      'AI-907',
      'AIC-306',
      'AIC-901',
      'AIC-902',
      'AIC-903',
      'AIC-904',
      'AIC-905',
      'LAB-1206',
      'LAB-1206R',
      'LAB-1212',
      'XI-606A',
    ]);
  });

  it('reconhece a escrava de cascata', () => {
    expect(isCascadeSlave('PIC-711')).toBe(true);
    expect(isCascadeSlave('PIC-712')).toBe(false);
  });
});

describe('motor de processo', () => {
  it('começa no ponto de operação', () => {
    const engine = processEngine(START);

    expect(engine.truth('PIC-514')).toBe(230);
    expect(engine.truth('AIC-903')).toBe(4.8);
    expect(engine.truth('XI-0002')).toBe(8);
  });

  it('calcula a produção pela nota do catálogo', () => {
    const engine = processEngine(START);
    // 8 m × 1250 m/min × 75 g/m² × 60 / 1e6 = 45 t/h
    expect(engine.truth('XI-0001')).toBeCloseTo(45, 6);
  });

  it('separa a verdade da medida', () => {
    const engine = processEngine(START);
    engine.runTo(START + 60);

    const verdade = engine.truth('AIC-903') ?? 0;
    const medida = engine.measured('AIC-903') ?? 0;

    expect(medida).not.toBe(verdade);
    // o ruído é da ordem do excDev/2, não da faixa inteira
    expect(Math.abs(medida - verdade)).toBeLessThan(0.05);
  });

  it('não deixa a malha sair da faixa da válvula', () => {
    const engine = processEngine(START);
    const pic514 = processVariable('PIC-514');

    engine.setSetpoint('AIC-901', 3.5);
    engine.runTo(START + 30 * TICKS_PER_MINUTE);

    const valor = engine.truth('PIC-514') ?? 0;
    expect(valor).toBeGreaterThanOrEqual(pic514?.min ?? 0);
    expect(valor).toBeLessThanOrEqual(pic514?.max ?? 0);
  });

  /**
   * A cascata fechando: mexer no setpoint da umidade final move o vapor da
   * pós-secagem, e a umidade vai para onde foi pedido.
   */
  it('fecha a cascata de umidade final', () => {
    const engine = processEngine(START);
    const vaporAntes = engine.truth('PIC-711') ?? 0;

    engine.setSetpoint('AIC-903', 4.4);
    engine.runTo(START + 40 * TICKS_PER_MINUTE);

    const vaporDepois = engine.truth('PIC-711') ?? 0;
    const umidade = engine.truth('AIC-903') ?? 0;

    // menos umidade pede mais vapor
    expect(vaporDepois).toBeGreaterThan(vaporAntes);
    expect(umidade).toBeLessThan(4.8);
    expect(Math.abs(umidade - 4.4)).toBeLessThan(0.1);
  });

  it('fecha a cascata de gramatura', () => {
    const engine = processEngine(START);
    const massaAntes = engine.truth('FIC-105') ?? 0;

    engine.setSetpoint('AIC-902', 80);
    engine.runTo(START + 40 * TICKS_PER_MINUTE);

    expect(engine.truth('FIC-105') ?? 0).toBeGreaterThan(massaAntes);
    expect(Math.abs((engine.truth('AIC-902') ?? 0) - 80)).toBeLessThan(0.5);
  });

  /** Sem a relação herdada 5d, mexer no G6 não mudaria nada. */
  it('responde ao vapor do G6, pela relação herdada', () => {
    const engine = processEngine(START);
    const antes = engine.truth('AIC-903') ?? 0;

    engine.setSetpoint('PIC-712', 200);
    engine.runTo(START + 10 * TICKS_PER_MINUTE);

    expect(engine.truth('AIC-903') ?? 0).toBeLessThan(antes);
  });

  /**
   * Cada grupo tem a sua temperatura de superfície, porque cada grupo tem a sua
   * pressão. O catálogo dá um alvo só para o padrão `TI-52nn`, e não poderia
   * dar seis: é uma linha no CSV.
   */
  it('dá a cada grupo a superfície da sua própria pressão', () => {
    const engine = processEngine(START);

    const g1 = engine.truth('TI-5201') ?? 0; // PIC-511, 15 kPa rel
    const g4 = engine.truth('TI-5223') ?? 0; // PIC-514, 230 kPa rel
    const g5 = engine.truth('TI-5230') ?? 0; // PIC-711, 120 kPa rel

    expect(g1).toBeLessThan(g5);
    expect(g5).toBeLessThan(g4);

    const faixa = processVariable('TI-5201');
    for (const valor of [g1, g4, g5]) {
      expect(valor).toBeGreaterThanOrEqual(faixa?.min ?? 0);
      expect(valor).toBeLessThanOrEqual(faixa?.max ?? 0);
    }
  });

  it('sobe a superfície quando o vapor do grupo sobe', () => {
    const engine = processEngine(START);
    const antes = engine.truth('TI-5230') ?? 0;

    // o CS30 é do G5, alimentado pela PIC-711
    engine.setSetpoint('AIC-903', 4.2);
    engine.runTo(START + 20 * TICKS_PER_MINUTE);

    expect(engine.truth('TI-5230') ?? 0).toBeGreaterThan(antes);
  });

  it('recusa setpoint em medição e em escrava de cascata', () => {
    const engine = processEngine(START);

    expect(() => engine.setSetpoint('AI-407', 50)).toThrow(/não aceita setpoint/);
    expect(() => engine.setSetpoint('PIC-711', 150)).toThrow(/pertence ao mestre/);
    expect(engine.settableTags()).not.toContain('PIC-711');
    expect(engine.settableTags()).toContain('AIC-903');
    expect(engine.settableTags()).toContain('PIC-712');
  });

  it('recusa setpoint inicial em tag que não aceita', () => {
    expect(() => processEngine(START, { setpoints: { 'PIC-711': 150 } })).toThrow(
      /não aceita setpoint/,
    );
  });

  it('aceita setpoint inicial nas que aceitam', () => {
    const engine = processEngine(START, { setpoints: { 'AIC-903': 4.5 } });
    expect(engine.setpoint('AIC-903')).toBe(4.5);
  });

  it('a malha segue o setpoint com a dinâmica declarada, não em degrau', () => {
    const engine = processEngine(START);
    engine.setSetpoint('TIC-802', 140);

    engine.advance();
    const umPasso = engine.truth('TIC-802') ?? 0;

    // em um passo de 1 s, com τ de MV_LAG_S, anda ~1/6 do caminho
    expect(umPasso).toBeGreaterThan(120);
    expect(umPasso).toBeLessThan(126);
    expect(MV_LAG_S).toBeGreaterThan(1);

    engine.runTo(START + 60);
    expect(engine.truth('TIC-802') ?? 0).toBeCloseTo(140, 1);
  });

  it('não produz NaN nem infinito depois de uma hora', () => {
    const engine = processEngine(START);
    engine.setSetpoint('AIC-902', 85);
    engine.setSetpoint('AIC-903', 4.2);
    engine.runTo(START + TICKS_PER_HOUR);

    for (const [tag, value] of engine.snapshot()) {
      expect(Number.isFinite(value), `${tag} saiu finito`).toBe(true);
    }
  });
});

describe('determinismo', () => {
  /** A propriedade da regra 9: mesma semente + mesmo intervalo = mesmos dados. */
  it('dá a mesma série para a mesma semente e o mesmo intervalo', () => {
    const a = processEngine(START, { seed: 4242 });
    const b = processEngine(START, { seed: 4242 });

    a.runTo(START + 600);
    b.runTo(START + 600);

    expect([...a.snapshot()]).toEqual([...b.snapshot()]);
  });

  /**
   * A outra metade da regra 9: recalcular depois de dormir dá o mesmo que rodar
   * contínuo.
   *
   * Aqui isso é testado pelo que o faz valer — o resultado depende só de
   * (semente, passo inicial, passo final), e não de como o intervalo foi
   * fatiado. Um gerador pseudoaleatório sequencial falharia: o ruído dele
   * depende de quantas vezes foi chamado, e fatiar muda essa contagem.
   */
  it('não muda se o intervalo for executado em pedaços', () => {
    const contínuo = processEngine(START, { seed: 777 });
    contínuo.runTo(START + 900);

    const fatiado = processEngine(START, { seed: 777 });
    for (const parada of [120, 300, 301, 650, 900]) fatiado.runTo(START + parada);

    expect(fatiado.tick).toBe(contínuo.tick);
    expect([...fatiado.snapshot()]).toEqual([...contínuo.snapshot()]);
  });

  it('não volta atrás quando pedem um passo anterior', () => {
    const engine = processEngine(START);
    engine.runTo(START + 100);
    engine.runTo(START + 50);

    expect(engine.tick).toBe(START + 100);
  });

  it('dá séries diferentes para sementes diferentes, no mesmo ponto de operação', () => {
    const a = processEngine(START, { seed: 1 });
    const b = processEngine(START, { seed: 2 });

    a.runTo(START + 600);
    b.runTo(START + 600);

    expect(a.measured('AIC-903')).not.toBe(b.measured('AIC-903'));
    // mas as duas ficam perto do alvo: o que muda é o ruído, não a máquina
    for (const engine of [a, b]) {
      expect(Math.abs((engine.truth('AIC-903') ?? 0) - 4.8)).toBeLessThan(0.2);
    }
  });

  it('o mesmo passo dá o mesmo valor em dois motores com o mesmo histórico', () => {
    const a = processEngine(START, { seed: 99, setpoints: { 'AIC-902': 78 } });
    const b = processEngine(START, { seed: 99, setpoints: { 'AIC-902': 78 } });

    for (let k = 0; k < 300; k += 1) {
      a.advance();
      b.advance();
      expect(a.measured('AIC-902')).toBe(b.measured('AIC-902'));
    }
  });
});
