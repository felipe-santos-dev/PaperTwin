import { ALARM_FLOOD_THRESHOLD, alarmDeadband, alarmThreshold, type Alarm } from '@mp1/shared';
import { describe, expect, it } from 'vitest';

import { alarmEngine, alarmId, MONITORED_LIMITS } from './alarm-engine';

const T0 = new Date('2026-10-31T10:00:00Z');
const at = (seconds: number): Date => new Date(T0.getTime() + seconds * 1000);

/** Só as tags que interessam ao teste; o resto do catálogo fica sem valor. */
const values = (entries: Readonly<Record<string, number>>): Map<string, number> =>
  new Map(Object.entries(entries));

describe('pares monitorados', () => {
  it('monta um par por limite declarado no catálogo', () => {
    const pdic = MONITORED_LIMITS.filter((item) => item.tag === 'PDIC-524');

    expect(pdic).toHaveLength(1);
    expect(pdic[0]).toEqual({ tag: 'PDIC-524', limit: 'LL', threshold: 18, low: true });
  });

  it('marca os limites de baixo como baixo', () => {
    for (const item of MONITORED_LIMITS) {
      expect(item.low, `${item.tag} ${item.limit}`).toBe(item.limit === 'LL' || item.limit === 'L');
    }
  });

  it('cobre as tags por cilindro, que são a maioria', () => {
    const porCilindro = MONITORED_LIMITS.filter((item) => /^(VI|VE|TI-53)/.test(item.tag));
    // 3 medições × 2 lados × 36 cilindros × 2 limites (H e HH)
    expect(porCilindro).toHaveLength(3 * 2 * 36 * 2);
  });

  it('não monta par para tag sem limite', () => {
    expect(MONITORED_LIMITS.some((item) => item.tag === 'PIC-514')).toBe(false);
  });
});

describe('disparo e normalização', () => {
  it('dispara no limite exato', () => {
    const engine = alarmEngine();

    expect(engine.scan(values({ 'PDIC-524': 18.5 }), at(0)).raised).toEqual([]);

    const scan = engine.scan(values({ 'PDIC-524': 18 }), at(1));
    expect(scan.raised).toHaveLength(1);
    expect(scan.raised[0]).toMatchObject({
      tag: 'PDIC-524',
      limit: 'LL',
      threshold: 18,
      priority: 'alta',
      state: 'ativo',
      peakValue: 18,
    });
  });

  it('mantém um alarme só por par, por mais que o valor oscile', () => {
    const engine = alarmEngine();

    for (let k = 0; k < 50; k += 1) {
      engine.scan(values({ 'PDIC-524': 17.9 + (k % 2) * 0.05 }), at(k));
    }

    expect(engine.all()).toHaveLength(1);
  });

  it('piora o pico na direção do limite', () => {
    const engine = alarmEngine();
    engine.scan(values({ 'PDIC-524': 17 }), at(0));

    // um valor mais baixo é pior num alarme de LL
    const pior = engine.scan(values({ 'PDIC-524': 14 }), at(1));
    expect(pior.updated[0]?.peakValue).toBe(14);

    // um valor mais alto, ainda em alarme, não melhora o registro do pico
    engine.scan(values({ 'PDIC-524': 17.5 }), at(2));
    expect(engine.all()[0]?.peakValue).toBe(14);
  });

  it('guarda o máximo num alarme de limite alto', () => {
    const engine = alarmEngine();
    const limite = alarmThreshold('AIC-903', 'H') ?? 0;

    engine.scan(values({ 'AIC-903': limite + 0.1 }), at(0));
    engine.scan(values({ 'AIC-903': limite + 0.5 }), at(1));
    engine.scan(values({ 'AIC-903': limite + 0.2 }), at(2));

    expect(engine.all()[0]?.peakValue).toBeCloseTo(limite + 0.5, 6);
  });

  it('só normaliza depois da banda morta', () => {
    const engine = alarmEngine();
    const banda = alarmDeadband('PDIC-524') ?? 0;

    engine.scan(values({ 'PDIC-524': 17 }), at(0));

    // de volta acima do limite, mas dentro da banda: continua em alarme
    expect(engine.scan(values({ 'PDIC-524': 18 + banda / 2 }), at(1)).cleared).toEqual([]);
    expect(engine.all()[0]?.state).toBe('ativo');

    const scan = engine.scan(values({ 'PDIC-524': 18 + banda * 2 }), at(2));
    expect(scan.cleared).toHaveLength(1);
    expect(scan.cleared[0]?.state).toBe('normalizado');
    expect(scan.cleared[0]?.clearedAt).toBe(at(2).toISOString());
  });

  it('abre um alarme novo se a condição voltar depois de normalizar', () => {
    const engine = alarmEngine();

    engine.scan(values({ 'PDIC-524': 17 }), at(0));
    engine.scan(values({ 'PDIC-524': 25 }), at(1));
    engine.scan(values({ 'PDIC-524': 17 }), at(2));

    expect(engine.all()).toHaveLength(2);
    expect(engine.all().filter((a) => a.state === 'ativo')).toHaveLength(1);
  });

  it('ignora tag sem valor e valor não finito', () => {
    const engine = alarmEngine();

    expect(engine.scan(new Map(), at(0)).raised).toEqual([]);
    expect(engine.scan(values({ 'PDIC-524': Number.NaN }), at(1)).raised).toEqual([]);
  });

  it('monta id determinístico do instante e do par', () => {
    expect(alarmId(T0, 'PDIC-524', 'LL')).toBe(
      `AL-${String(Math.floor(T0.getTime() / 1000))}-PDIC-524-LL`,
    );
  });
});

describe('reconhecimento', () => {
  it('reconhece uma vez e leva o ativo para reconhecido', () => {
    const engine = alarmEngine();
    const [alarme] = engine.scan(values({ 'PDIC-524': 17 }), at(0)).raised;
    const id = alarme?.id ?? '';

    const reconhecido = engine.acknowledge(id, 'turno A', at(10));
    expect(reconhecido?.state).toBe('reconhecido');
    expect(reconhecido?.acknowledgedBy).toBe('turno A');

    expect(engine.acknowledge(id, 'turno B', at(20))).toBeNull();
    expect(engine.find(id)?.acknowledgedBy).toBe('turno A');
  });

  it('não muda o estado de um alarme já normalizado ao reconhecer', () => {
    const engine = alarmEngine();
    const [alarme] = engine.scan(values({ 'PDIC-524': 17 }), at(0)).raised;
    engine.scan(values({ 'PDIC-524': 30 }), at(1));

    const reconhecido = engine.acknowledge(alarme?.id ?? '', 'turno A', at(2));
    expect(reconhecido?.state).toBe('normalizado');
    expect(reconhecido?.acknowledgedAt).not.toBeNull();
  });

  it('devolve null para alarme que não existe', () => {
    expect(alarmEngine().acknowledge('AL-NAO-EXISTE', 'turno A', T0)).toBeNull();
  });
});

describe('fila anunciada', () => {
  it('mantém o ativo e o que normalizou sem reconhecimento', () => {
    const engine = alarmEngine();
    engine.scan(values({ 'PDIC-524': 17, 'AIC-903': 5.4 }), at(0));
    // a umidade volta à faixa sem ninguém reconhecer
    engine.scan(values({ 'PDIC-524': 17, 'AIC-903': 4.8 }), at(1));

    const fila = engine.annunciated(at(2)).map((a) => a.tag);
    expect(fila).toContain('PDIC-524');
    expect(fila).toContain('AIC-903');
  });

  it('tira da fila o que normalizou e foi reconhecido', () => {
    const engine = alarmEngine();
    const [alarme] = engine.scan(values({ 'AIC-903': 5.4 }), at(0)).raised;
    engine.scan(values({ 'AIC-903': 4.8 }), at(1));
    engine.acknowledge(alarme?.id ?? '', 'turno A', at(2));

    expect(engine.annunciated(at(3))).toEqual([]);
  });

  /**
   * A gaveta suprime o anúncio, não a detecção.
   *
   * O alarme sai da fila de quem está no painel e continua acompanhando o
   * processo: o pico continua sendo registrado e, quando o valor volta, ele
   * normaliza. Uma gaveta que parasse a detecção perderia o que aconteceu
   * enquanto estava fechada — que é justamente o que alguém vai querer saber
   * depois.
   */
  it('engaveta o anúncio e continua detectando', () => {
    const engine = alarmEngine();
    const [alarme] = engine.scan(values({ 'PDIC-524': 17 }), at(0)).raised;
    const id = alarme?.id ?? '';

    engine.shelve(id, 'turno A', at(3600));
    expect(engine.annunciated(at(10)).map((a) => a.id)).not.toContain(id);

    // continua detectando: o pico piora
    engine.scan(values({ 'PDIC-524': 12 }), at(20));
    expect(engine.find(id)?.peakValue).toBe(12);

    // e normaliza normalmente
    engine.scan(values({ 'PDIC-524': 30 }), at(30));
    expect(engine.find(id)?.state).toBe('normalizado');

    // passado o prazo, volta à fila se ainda pedir ação
    expect(engine.annunciated(at(7200)).map((a) => a.id)).toContain(id);
  });

  it('desengaveta antes do prazo', () => {
    const engine = alarmEngine();
    const [alarme] = engine.scan(values({ 'PDIC-524': 17 }), at(0)).raised;
    const id = alarme?.id ?? '';

    engine.shelve(id, 'turno A', at(3600));
    engine.unshelve(id);

    expect(engine.find(id)?.shelvedUntil).toBeNull();
    expect(engine.annunciated(at(10)).map((a) => a.id)).toContain(id);
  });
});

describe('inundação', () => {
  it('conta os disparos da janela de 10 min', () => {
    const engine = alarmEngine();

    /**
     * 3,0 mm/s passa do `H` (2,8) e não chega ao `HH` (4,5), então cada tag dá
     * **um** alarme. Com 5,0 daria dois por tag, e o teste contaria o dobro
     * sem que isso dissesse nada sobre a janela de inundação.
     */
    const muitos: Record<string, number> = {};
    for (let n = 1; n <= ALARM_FLOOD_THRESHOLD + 2; n += 1) {
      muitos[`VI-51${String(n).padStart(2, '0')}A`] = 3;
    }

    engine.scan(values(muitos), at(0));
    expect(engine.floodCount(at(60))).toBe(ALARM_FLOOD_THRESHOLD + 2);
    // passada a janela, a contagem zera
    expect(engine.floodCount(at(700))).toBe(0);
  });
});

describe('retomada', () => {
  it('retoma os alarmes gravados em vez de abrir outros', () => {
    const gravado: Alarm = {
      id: 'AL-1-PDIC-524-LL',
      tag: 'PDIC-524',
      limit: 'LL',
      threshold: 18,
      priority: 'alta',
      state: 'reconhecido',
      raisedAt: at(-600).toISOString(),
      peakValue: 15,
      acknowledgedAt: at(-500).toISOString(),
      acknowledgedBy: 'turno A',
      clearedAt: null,
      shelvedUntil: null,
      shelvedBy: null,
    };

    const engine = alarmEngine([gravado]);
    const scan = engine.scan(values({ 'PDIC-524': 16 }), at(0));

    expect(scan.raised).toEqual([]);
    expect(engine.all()).toHaveLength(1);
    expect(engine.find(gravado.id)?.acknowledgedBy).toBe('turno A');
  });

  it('não reabre o par de um alarme já normalizado', () => {
    const normalizado: Alarm = {
      id: 'AL-1-PDIC-524-LL',
      tag: 'PDIC-524',
      limit: 'LL',
      threshold: 18,
      priority: 'alta',
      state: 'normalizado',
      raisedAt: at(-600).toISOString(),
      peakValue: 15,
      acknowledgedAt: at(-500).toISOString(),
      acknowledgedBy: 'turno A',
      clearedAt: at(-400).toISOString(),
      shelvedUntil: null,
      shelvedBy: null,
    };

    const engine = alarmEngine([normalizado]);
    // a condição voltou: aqui um alarme novo é o certo
    expect(engine.scan(values({ 'PDIC-524': 16 }), at(0)).raised).toHaveLength(1);
    expect(engine.all()).toHaveLength(2);
  });
});

describe('custo da varredura', () => {
  /**
   * A varredura roda a cada passo de uma retomada, que pode ser de um dia —
   * 86.400 passos. Com centenas de pares monitorados, isso precisa custar
   * microssegundos, não milissegundos.
   */
  it('varre todos os pares em tempo desprezível', () => {
    const engine = alarmEngine();
    const todos = new Map(MONITORED_LIMITS.map((item) => [item.tag, item.threshold + 1]));

    const início = performance.now();
    for (let k = 0; k < 1000; k += 1) engine.scan(todos, at(k));
    const porVarredura = (performance.now() - início) / 1000;

    // folga grande de propósito: o teste é contra regressão de ordem de
    // grandeza, não um banco de medição
    expect(porVarredura).toBeLessThan(2);
  });
});
