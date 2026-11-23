import { describe, expect, it } from 'vitest';

import { labResultId, type LabResult } from '../operations/lab-result';
import { operatingPoint } from '../simulation/operating-point';
import {
  calibrate,
  estimate,
  modelValue,
  residualsOf,
  softSensorModel,
  SOFT_SENSOR_WINDOW,
  type SoftSensorInput,
} from './soft-sensor';

/**
 * O sensor virtual da tração MD.
 *
 * O que estes testes cobram é a divisão de trabalho entre o modelo e o
 * laboratório: o ganho vem do teste de degrau da pesquisa e não se move; o
 * viés e a faixa vêm dos laudos e se movem a cada um deles. E a parte que o
 * projeto mais precisa que seja verdade: sem laudo nenhum, a resposta é uma
 * estimativa **sem faixa**, e não uma incerteza inventada.
 */

const REFINO = 'JIC-101';
const TRAÇÃO = 'LAB-1206';

const noPonto = operatingPoint(REFINO) ?? 0;

const laudo = (reel: number, value: number, minuto: number): LabResult => ({
  id: labResultId(reel, TRAÇÃO),
  tag: TRAÇÃO,
  reelNumber: reel,
  value,
  unit: 'kN/m',
  sampledAt: new Date(Date.UTC(2026, 5, 15, 18, minuto)).toISOString(),
  reportedAt: new Date(Date.UTC(2026, 5, 15, 18, minuto + 25)).toISOString(),
  withinSpec: true,
});

const entrada = (value: number): SoftSensorInput[] => [{ tag: REFINO, value }];

describe('o modelo sai do grafo de relações', () => {
  it('a tração MD tem modelo, com o ganho do teste de degrau', () => {
    const model = softSensorModel(TRAÇÃO);

    expect(model).not.toBeNull();
    expect(model?.base).toBe(operatingPoint(TRAÇÃO));
    expect(model?.terms).toHaveLength(1);
    expect(model?.terms[0]?.tag).toBe(REFINO);
    expect(model?.terms[0]?.kp).toBeCloseTo(0.0425, 4);
  });

  it('um ensaio sem relação declarada não tem modelo', () => {
    // a lisura Bendtsen é medida e não é ponta de nenhuma relação do CSV
    expect(softSensorModel('LAB-1204')).toBeNull();
  });

  it('no ponto de operação, o modelo dá o ponto de operação', () => {
    const model = softSensorModel(TRAÇÃO);
    if (!model) throw new Error('a tração deveria ter modelo');

    expect(modelValue(model, entrada(noPonto))).toBeCloseTo(model.base, 6);
  });

  it('dez kWh/t a mais dão 0,425 kN/m a mais', () => {
    const model = softSensorModel(TRAÇÃO);
    if (!model) throw new Error('a tração deveria ter modelo');

    const subiu = modelValue(model, entrada(noPonto + 10)) ?? 0;
    expect(subiu - model.base).toBeCloseTo(0.425, 3);
  });

  it('sem a entrada, não há valor — e isso não é zero', () => {
    const model = softSensorModel(TRAÇÃO);
    if (!model) throw new Error('a tração deveria ter modelo');

    expect(modelValue(model, [])).toBeNull();
  });
});

describe('a calibração vem dos laudos', () => {
  const model = softSensorModel(TRAÇÃO);
  if (!model) throw new Error('a tração deveria ter modelo');
  const base = model.base;

  it('sem laudo não há viés nem faixa', () => {
    const cal = calibrate([]);

    expect(cal.bias).toBe(0);
    expect(cal.sd).toBeNull();
    expect(cal.samples).toBe(0);
    expect(estimate(model, entrada(noPonto), cal)?.band).toBeNull();
  });

  it('com dois laudos há viés e ainda não há faixa', () => {
    const residuals = residualsOf(model, [laudo(1, base + 0.2, 0), laudo(2, base + 0.1, 45)], () =>
      entrada(noPonto),
    );
    const cal = calibrate(residuals);

    expect(cal.samples).toBe(2);
    expect(cal.bias).toBeCloseTo(0.15, 6);
    expect(cal.sd).toBeNull();
  });

  it('com três, a faixa aparece e sai do espalhamento dos resíduos', () => {
    const residuals = residualsOf(
      model,
      [laudo(1, base + 0.1, 0), laudo(2, base + 0.2, 45), laudo(3, base + 0.3, 90)],
      () => entrada(noPonto),
    );
    const cal = calibrate(residuals);

    expect(cal.bias).toBeCloseTo(0.2, 6);
    // desvio amostral de (0,1 / 0,2 / 0,3) = 0,1
    expect(cal.sd).toBeCloseTo(0.1, 6);

    const previsão = estimate(model, entrada(noPonto), cal);
    expect(previsão?.value).toBeCloseTo(base + 0.2, 6);
    expect(previsão?.band).toBeCloseTo(0.2, 6);
    expect(previsão?.lo).toBeCloseTo(base, 6);
    expect(previsão?.hi).toBeCloseTo(base + 0.4, 6);
  });

  it('só os últimos laudos contam', () => {
    const muitos = Array.from({ length: SOFT_SENSOR_WINDOW + 4 }, (_, i) =>
      // os quatro primeiros são de outro patamar, e precisam sair da conta
      laudo(i + 1, base + (i < 4 ? 1 : 0.1), i * 45),
    );
    const cal = calibrate(residualsOf(model, muitos, () => entrada(noPonto)));

    expect(cal.samples).toBe(SOFT_SENSOR_WINDOW);
    expect(cal.bias).toBeCloseTo(0.1, 6);
  });

  it('o resíduo é contra o modelo **daquela** bobina, não contra o alvo', () => {
    /**
     * A bobina 2 rodou com 10 kWh/t a mais de refino, então o modelo esperava
     * 0,425 kN/m a mais nela. O laudo que veio exatamente nesse valor tem
     * resíduo zero — se o resíduo fosse contra o alvo, ele apareceria como
     * desvio e o viés passaria a corrigir o que o modelo já explicava.
     */
    const residuals = residualsOf(
      model,
      [laudo(1, base, 0), laudo(2, base + 0.425, 45)],
      (result) => entrada(result.reelNumber === 2 ? noPonto + 10 : noPonto),
    );

    expect(residuals).toHaveLength(2);
    expect(residuals[0]?.residual).toBeCloseTo(0, 6);
    expect(residuals[1]?.residual).toBeCloseTo(0, 3);
    expect(calibrate(residuals).bias).toBeCloseTo(0, 3);
  });

  it('um laudo sem as entradas da janela fica de fora', () => {
    const residuals = residualsOf(model, [laudo(1, base, 0), laudo(2, base, 45)], (result) =>
      result.reelNumber === 2 ? null : entrada(noPonto),
    );

    expect(residuals).toHaveLength(1);
  });
});

/**
 * O pulo quando o laudo chega.
 *
 * É o comportamento que a tela mostra e o que mais precisa estar certo: a
 * estimativa anda lisa enquanto o processo anda, e **salta** quando entra uma
 * medida que diz que o modelo estava deslocado. O salto é do tamanho da
 * mudança de viés, nem mais nem menos.
 */
describe('a estimativa pula quando o laboratório chega', () => {
  const model = softSensorModel(TRAÇÃO);
  if (!model) throw new Error('a tração deveria ter modelo');
  const base = model.base;

  it('o salto é a diferença de viés, e nada além dela', () => {
    const antes = [laudo(1, base + 0.1, 0), laudo(2, base + 0.1, 45), laudo(3, base + 0.1, 90)];
    const depois = [...antes, laudo(4, base + 0.5, 135)];

    const calAntes = calibrate(residualsOf(model, antes, () => entrada(noPonto)));
    const calDepois = calibrate(residualsOf(model, depois, () => entrada(noPonto)));

    const antesDoLaudo = estimate(model, entrada(noPonto), calAntes);
    const depoisDoLaudo = estimate(model, entrada(noPonto), calDepois);

    expect(antesDoLaudo?.value).toBeCloseTo(base + 0.1, 6);
    expect(depoisDoLaudo?.value).toBeCloseTo(base + 0.2, 6);
    expect((depoisDoLaudo?.value ?? 0) - (antesDoLaudo?.value ?? 0)).toBeCloseTo(
      calDepois.bias - calAntes.bias,
      6,
    );
    // e a faixa abre, porque os laudos passaram a discordar mais entre si
    expect(depoisDoLaudo?.band ?? 0).toBeGreaterThan(antesDoLaudo?.band ?? 0);
  });

  it('o modelo continua respondendo ao processo entre dois laudos', () => {
    const cal = calibrate(
      residualsOf(model, [laudo(1, base, 0), laudo(2, base, 45), laudo(3, base, 90)], () =>
        entrada(noPonto),
      ),
    );

    const parado = estimate(model, entrada(noPonto), cal)?.value ?? 0;
    const comRefino = estimate(model, entrada(noPonto + 20), cal)?.value ?? 0;

    expect(comRefino - parado).toBeCloseTo(0.85, 3);
  });
});
