import { REEL_CHANGE_DIAMETER_MM, shiftWindowAt } from '@mp1/shared';
import { describe, expect, it } from 'vitest';

import { DEFAULT_SEED, SIM_EPOCH_MS, tickAt, tickTime, TICKS_PER_HOUR } from './clock';
import {
  ALTERNATE_GSM,
  BREAK_DURATION_S,
  GRADE_CHANGE_SHIFT,
  gradeChangeOf,
  nominalShiftProductionT,
  planAt,
  reelAt,
  reelDiameterMm,
  reelDurationS,
  reelLengthM,
  REEL_TICKS,
  reelWoundM,
  roundOf,
  shiftPlan,
  UPSET_LEAD_S,
  webBreakOf,
} from './scenarios';

const DIA = new Date('2026-06-15T12:00:00Z');
const TURNO = shiftWindowAt(DIA);

describe('geometria da bobina', () => {
  it('tira o comprimento da área da seção do rolo', () => {
    // π/4 · (3,0² − 0,6²) / 102 µm ≈ 66,5 km
    expect(reelLengthM()).toBeGreaterThan(66_000);
    expect(reelLengthM()).toBeLessThan(67_000);
  });

  /**
   * A pesquisa diz "~45 min" e a geometria diz ~53. O desempate está no
   * código-fonte: um é prosa aproximada, o outro sai de três valores
   * especificados. Este teste fixa o que foi adotado, para a divergência não
   * sumir de vista.
   */
  it('dá ~53 min por bobina, e não os ~45 da prosa da pesquisa', () => {
    const minutos = reelDurationS() / 60;

    expect(minutos).toBeGreaterThan(50);
    expect(minutos).toBeLessThan(56);
  });

  it('com núcleo de 1,2 m os 45 min da pesquisa voltam a fechar', () => {
    const comprimento = reelLengthM(1200);
    const minutos = (comprimento / 1250 / 60) * 60;

    expect(minutos).toBeGreaterThan(44);
    expect(minutos).toBeLessThan(49);
  });

  it('cresce o diâmetro com a raiz do papel enrolado', () => {
    const plan = reelAt(tickAt(DIA));

    expect(reelDiameterMm(plan.startTick, plan)).toBeCloseTo(600, 6);
    expect(reelDiameterMm(plan.endTick, plan)).toBeCloseTo(REEL_CHANGE_DIAMETER_MM, 6);

    // na metade do tempo o rolo já passou de 70 % do diâmetro final
    const meio = reelDiameterMm(plan.startTick + REEL_TICKS / 2, plan);
    expect(meio / REEL_CHANGE_DIAMETER_MM).toBeGreaterThan(0.7);
  });

  it('enrola o comprimento proporcional ao tempo', () => {
    const plan = reelAt(tickAt(DIA));

    expect(reelWoundM(plan.startTick, plan)).toBe(0);
    expect(reelWoundM(plan.endTick, plan)).toBeCloseTo(reelLengthM(), 6);
  });
});

describe('numeração das bobinas', () => {
  it('é função do instante, sem contador guardado', () => {
    const tick = tickAt(DIA);
    expect(reelAt(tick)).toEqual(reelAt(tick));
  });

  it('começa em 1 no instante zero da simulação', () => {
    expect(reelAt(tickAt(new Date(SIM_EPOCH_MS))).number).toBe(1);
  });

  it('avança de um em um, sem buraco entre bobinas', () => {
    const primeira = reelAt(tickAt(DIA));
    const seguinte = reelAt(primeira.endTick);

    expect(seguinte.number).toBe(primeira.number + 1);
    expect(seguinte.startTick).toBe(primeira.endTick);
  });

  it('põe o mesmo passo sempre na mesma bobina', () => {
    const tick = tickAt(DIA);
    const plan = reelAt(tick);

    expect(tick).toBeGreaterThanOrEqual(plan.startTick);
    expect(tick).toBeLessThan(plan.endTick);
  });
});

describe('troca de gramatura', () => {
  it('acontece só no turno declarado', () => {
    for (const letra of ['A', 'B', 'C'] as const) {
      const turno = { ...TURNO, letter: letra };
      const troca = gradeChangeOf(turno);

      if (letra === GRADE_CHANGE_SHIFT) expect(troca).not.toBeNull();
      else expect(troca).toBeNull();
    }
  });

  it('alterna o sentido entre dias consecutivos', () => {
    const hoje = gradeChangeOf({
      ...shiftWindowAt(new Date('2026-06-15T18:00:00Z')),
      letter: 'B',
    });
    const amanhã = gradeChangeOf({
      ...shiftWindowAt(new Date('2026-06-16T18:00:00Z')),
      letter: 'B',
    });

    expect(hoje?.toGsm).not.toBe(amanhã?.toGsm);
    expect([hoje?.fromGsm, hoje?.toGsm].sort()).toEqual([75, ALTERNATE_GSM].sort());
  });

  it('usa gramaturas dentro da faixa do catálogo', () => {
    const troca = gradeChangeOf({ ...TURNO, letter: 'B' });

    for (const gsm of [troca?.fromGsm ?? 0, troca?.toGsm ?? 0]) {
      expect(gsm).toBeGreaterThanOrEqual(68);
      expect(gsm).toBeLessThanOrEqual(92);
    }
  });

  it('cai dentro do turno', () => {
    const turno = { ...TURNO, letter: 'B' as const };
    const troca = gradeChangeOf(turno);

    expect(troca?.startTick).toBeGreaterThan(tickAt(new Date(turno.startedAt)));
    expect(troca?.startTick).toBeLessThan(tickAt(new Date(turno.endedAt)));
  });
});

describe('quebra de folha', () => {
  /** O dia escolhe o turno; a média é de uma quebra por dia. */
  it('dá uma quebra por dia de operação', () => {
    for (const dia of ['2026-06-15', '2026-06-16', '2026-06-17', '2026-07-01']) {
      const turnos = (['A', 'B', 'C'] as const).map((letter) => ({
        ...shiftWindowAt(new Date(`${dia}T12:00:00Z`)),
        letter,
      }));

      const comQuebra = turnos.filter((turno) => webBreakOf(DEFAULT_SEED, turno) !== null);
      expect(comQuebra, dia).toHaveLength(1);
    }
  });

  it('é a mesma quebra sempre, para o mesmo dia e a mesma semente', () => {
    const a = webBreakOf(DEFAULT_SEED, TURNO);
    const b = webBreakOf(DEFAULT_SEED, TURNO);
    expect(a).toEqual(b);
  });

  it('põe a perturbação exatamente na janela de sinais da LISTA-BASE', () => {
    const quebra = (['A', 'B', 'C'] as const)
      .map((letter) => webBreakOf(DEFAULT_SEED, { ...TURNO, letter }))
      .find((plan) => plan !== null);

    expect(quebra).toBeDefined();
    expect((quebra?.startTick ?? 0) - (quebra?.upsetTick ?? 0)).toBe(UPSET_LEAD_S);
  });

  it('dura o que foi declarado', () => {
    const quebra = (['A', 'B', 'C'] as const)
      .map((letter) => webBreakOf(DEFAULT_SEED, { ...TURNO, letter }))
      .find((plan) => plan !== null);

    expect((quebra?.endTick ?? 0) - (quebra?.startTick ?? 0)).toBe(BREAK_DURATION_S);
  });

  it('fica longe das bordas do turno', () => {
    const turnos = (['A', 'B', 'C'] as const).map((letter) => ({ ...TURNO, letter }));

    for (const turno of turnos) {
      const quebra = webBreakOf(DEFAULT_SEED, turno);
      if (!quebra) continue;

      const início = tickAt(new Date(turno.startedAt));
      const fim = tickAt(new Date(turno.endedAt));
      const fração = (quebra.startTick - início) / (fim - início);

      expect(fração).toBeGreaterThanOrEqual(0.25);
      expect(fração).toBeLessThanOrEqual(0.75);
    }
  });

  it('perturba uma malha que existe e aponta uma seção da máquina', () => {
    for (const dia of ['2026-06-15', '2026-06-16', '2026-06-17', '2026-06-18', '2026-06-19']) {
      for (const letter of ['A', 'B', 'C'] as const) {
        const quebra = webBreakOf(DEFAULT_SEED, {
          ...shiftWindowAt(new Date(`${dia}T12:00:00Z`)),
          letter,
        });
        if (!quebra) continue;

        expect(quebra.upsetTag).toMatch(/^[A-Z]+-\d+[A-Z]?$/);
        expect(quebra.probableCause.trim()).not.toBe('');
      }
    }
  });

  it('muda de semente, muda de turno', () => {
    const porSemente = [1, 2, 3, 4, 5].map((seed) =>
      (['A', 'B', 'C'] as const).find((letter) => webBreakOf(seed, { ...TURNO, letter }) !== null),
    );

    expect(new Set(porSemente).size).toBeGreaterThan(1);
  });
});

describe('ronda', () => {
  it('começa duas horas depois do turno', () => {
    const ronda = roundOf(TURNO);
    expect(ronda.startTick - tickAt(new Date(TURNO.startedAt))).toBe(2 * TICKS_PER_HOUR);
  });

  it('dura quarenta minutos', () => {
    const ronda = roundOf(TURNO);
    expect(ronda.endTick - ronda.startTick).toBe(40 * 60);
  });
});

describe('plano do turno', () => {
  const plano = shiftPlan(DEFAULT_SEED, TURNO);

  it('cobre o turno com bobinas, sem buraco', () => {
    expect(plano.reels.length).toBeGreaterThan(5);

    for (const [index, bobina] of plano.reels.entries()) {
      const anterior = plano.reels[index - 1];
      if (anterior) expect(bobina.startTick).toBe(anterior.endTick);
    }

    expect(plano.reels[0]?.startTick).toBeLessThanOrEqual(plano.startTick);
    expect(plano.reels.at(-1)?.endTick).toBeGreaterThanOrEqual(plano.endTick);
  });

  it('é o mesmo plano para o mesmo turno', () => {
    expect(shiftPlan(DEFAULT_SEED, TURNO)).toEqual(plano);
  });

  it('acha o plano a partir de um passo qualquer do turno', () => {
    const doPasso = planAt(DEFAULT_SEED, tickAt(DIA));
    expect(doPasso.shift.id).toBe(TURNO.id);
  });

  it('põe a ronda e a troca dentro da janela do turno', () => {
    expect(plano.round.startTick).toBeGreaterThan(plano.startTick);
    expect(plano.round.endTick).toBeLessThan(plano.endTick);

    if (plano.gradeChange) {
      expect(plano.gradeChange.startTick).toBeGreaterThan(plano.startTick);
      expect(plano.gradeChange.startTick).toBeLessThan(plano.endTick);
    }
  });

  it('não muda quando o mesmo turno é pedido por outro instante dele', () => {
    const outro = shiftPlan(DEFAULT_SEED, shiftWindowAt(tickTime(plano.startTick + 3600)));
    expect(outro).toEqual(plano);
  });
});

describe('produção nominal do turno', () => {
  it('é 45 t/h pelas oito horas', () => {
    expect(nominalShiftProductionT(TURNO)).toBeCloseTo(45 * 8, 6);
  });
});
