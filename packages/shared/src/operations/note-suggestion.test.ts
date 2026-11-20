import { describe, expect, it } from 'vitest';

import { DRYER_BEARING_ISO, isoLimitsOf } from '../iso20816';
import type { VibrationBucket } from '../vibration';
import { noteOriginIsConsistent, noteStatusIsConsistent } from './maintenance';
import {
  noteFromSuggestion,
  priorityForDays,
  reopensAfterDismissal,
  suggestFromTrend,
  suggestionId,
  SUGGESTION_RULE,
  temperatureLife,
  type SuggestionRefs,
} from './note-suggestion';

/**
 * A regra que vira sugestão.
 *
 * O que estes testes cobram é o par que define a fase: uma tendência de verdade
 * **tem** de virar nota sem ninguém digitar, e um mancal saudável **não** pode
 * virar nada. O segundo é o que impede o primeiro de ser um gerador de ordens
 * de serviço.
 */

const LIMITS = isoLimitsOf(DRYER_BEARING_ISO);
const INÍCIO = Date.parse('2026-06-12T12:00:00Z');
const HORA = 3_600_000;
const DIA = 24 * HORA;

const REFS: SuggestionRefs = {
  vibrationTag: 'VI-5123B',
  temperatureTag: 'TI-5323B',
  alarm: { id: 'AL-1', tag: 'VI-5123B', limit: 'H' },
  round: { id: 'RD-1', fieldTempC: 71.4 },
};

/** Uma série de 72 h, de hora em hora, com vibração e temperatura dadas. */
function série(
  rms: (dias: number) => number,
  temp: (dias: number) => number = () => 62,
  horas = 72,
): VibrationBucket[] {
  return Array.from({ length: horas }, (_, i) => {
    const dias = (i * HORA) / DIA;
    return {
      bucketStart: new Date(INÍCIO + i * HORA).toISOString(),
      samples: 4,
      rmsAvgMmS: rms(dias),
      rmsMaxMmS: rms(dias) + 0.05,
      tempAvgC: temp(dias),
      envelopeMaxGe: 0.4,
    };
  });
}

/** Ruído determinístico, para a série parada não ser uma reta perfeita. */
const tremor = (i: number, amplitude = 0.02): number => amplitude * Math.sin(i * 2.399963);

const sugere = (buckets: VibrationBucket[], rule = SUGGESTION_RULE) =>
  suggestFromTrend({
    assetTag: 'MP1-SEC-G4-CS23-MLC',
    buckets,
    limits: LIMITS,
    tempLimitC: 85,
    at: '2026-06-15T12:00:00Z',
    refs: REFS,
    rule,
  });

describe('a regra da nota sugerida', () => {
  it('uma tendência significativa vira sugestão', () => {
    // a série acaba em 3,0 mm/s subindo 0,4 por dia: 4,5 em ~4 dias
    const s = sugere(série((dias) => 1.8 + 0.4 * dias + tremor(dias * 24)));

    expect(s).not.toBeNull();
    expect(s?.measure).toBe('vibração');
    expect(s?.daysToLimit).toBeGreaterThan(3);
    expect(s?.daysToLimit).toBeLessThan(5);
    expect(s?.perDay).toBeCloseTo(0.4, 1);
    expect(s?.status).toBe('sugerida');
    expect(s?.noteNumber).toBeNull();
  });

  /** O teste irmão: sem tendência, sem nota. */
  it('mancal parado com ruído não gera nada', () => {
    const s = sugere(
      série(
        (dias) => 1.4 + tremor(dias * 24),
        (dias) => 62 + tremor(dias * 24, 0.2),
      ),
    );

    expect(s).toBeNull();
  });

  it('não gera quando a projeção cruza depois do horizonte', () => {
    // 1,4 subindo 0,05 por dia: 62 dias até 4,5, com o horizonte em 30
    const s = sugere(série((dias) => 1.4 + 0.05 * dias + tremor(dias * 24, 0.005)));

    expect(s).toBeNull();
  });

  it('a mesma tendência gera com um horizonte maior', () => {
    const buckets = série((dias) => 1.4 + 0.05 * dias + tremor(dias * 24, 0.005));

    expect(sugere(buckets)).toBeNull();
    expect(sugere(buckets, { ...SUGGESTION_RULE, horizonDays: 90 })).not.toBeNull();
  });

  it('menos de três janelas não sustentam previsão', () => {
    const s = sugere(série((dias) => 1.8 + 0.4 * dias, undefined, 2));

    expect(s).toBeNull();
  });

  it('vale a medição que cruza primeiro', () => {
    /**
     * Vibração subindo devagar (cruza 4,5 em ~15 dias) e temperatura subindo
     * rápido (cruza 85 em ~3). A sugestão é da temperatura, e a frase fala de
     * °C — é o limite que chega antes que decide o que alguém vai olhar.
     */
    const s = sugere(
      série(
        (dias) => 2.0 + 0.17 * dias + tremor(dias * 24, 0.01),
        (dias) => 76 + 3 * dias + tremor(dias * 24, 0.1),
      ),
    );

    expect(s?.measure).toBe('temperatura');
    expect(s?.limit).toBe(85);
    expect(s?.symptom).toContain('°C');
    expect(s?.evidence[0]?.ref).toBe('TI-5323B');
  });

  it('a prioridade sai do prazo', () => {
    expect(priorityForDays(0)).toBe(1);
    expect(priorityForDays(3)).toBe(1);
    expect(priorityForDays(4)).toBe(2);
    expect(priorityForDays(10)).toBe(2);
    expect(priorityForDays(18)).toBe(3);
    expect(priorityForDays(29)).toBe(4);
  });

  it('exige parada só a partir da zona C', () => {
    // em B (abaixo de 2,8) subindo para cruzar dentro do horizonte
    const emB = sugere(série((dias) => 1.2 + 0.25 * dias + tremor(dias * 24, 0.01)));
    expect(emB?.requiresShutdown).toBe(false);

    const emD = sugere(série((dias) => 4.6 + 0.3 * dias + tremor(dias * 24, 0.01)));
    expect(emD?.requiresShutdown).toBe(true);
  });

  it('a frase diz o número, o prazo e nada além deles', () => {
    const s = sugere(série((dias) => 1.8 + 0.4 * dias + tremor(dias * 24)));

    expect(s?.symptom).toMatch(/^vibração \d,\d\d mm\/s \(zona [ABCD]\), subindo /);
    expect(s?.symptom).toContain('a projeção cruza a fronteira C→D de 4,5 mm/s em');
    expect(s?.symptom ?? '').not.toMatch(/falh|vai quebrar|causa/i);
  });

  it('diz que já passou quando a projeção já cruzou', () => {
    const s = sugere(série((dias) => 3.6 + 0.6 * dias + tremor(dias * 24, 0.01)));

    expect(s?.daysToLimit).toBe(0);
    expect(s?.symptom).toContain('a projeção já passou');
    expect(s?.priority).toBe(1);
  });

  it('o id é a chave: mancal e início da tendência', () => {
    const buckets = série((dias) => 1.8 + 0.4 * dias + tremor(dias * 24));
    const s = sugere(buckets);

    expect(s?.id).toBe(suggestionId('MP1-SEC-G4-CS23-MLC', buckets[0]?.bucketStart ?? ''));
    expect(s?.trendStart).toBe(buckets[0]?.bucketStart);
    // duas contas sobre a mesma janela dão o mesmo id, e não duas sugestões
    expect(sugere(buckets)?.id).toBe(s?.id);
  });

  it('as evidências apontam para o que o gêmeo já tem', () => {
    const s = sugere(série((dias) => 1.8 + 0.4 * dias + tremor(dias * 24)));

    expect(s?.evidence.map((item) => item.kind)).toEqual(['tendência', 'alarme', 'ronda']);
    expect(s?.evidence[1]?.ref).toBe('AL-1');
    expect(s?.evidence[2]?.label).toContain('71,4 °C');
  });

  it('sem alarme nem ronda, a evidência é só a tendência', () => {
    const s = suggestFromTrend({
      assetTag: 'MP1-SEC-G4-CS23-MLC',
      buckets: série((dias) => 1.8 + 0.4 * dias + tremor(dias * 24)),
      limits: LIMITS,
      tempLimitC: 85,
      at: '2026-06-15T12:00:00Z',
      refs: { ...REFS, alarm: null, round: null },
    });

    expect(s?.evidence).toHaveLength(1);
  });
});

describe('a temperatura passa pela mesma régua', () => {
  it('série de temperatura parada não dá prazo', () => {
    const buckets = série(
      () => 1.4,
      (dias) => 62 + tremor(dias * 24, 0.2),
    );

    expect(temperatureLife(buckets, 85).daysToZoneD).toBeNull();
  });

  it('série de temperatura subindo dá o prazo em dias', () => {
    const buckets = série(
      () => 1.4,
      (dias) => 70 + 2 * dias + tremor(dias * 24, 0.1),
    );
    const vida = temperatureLife(buckets, 85);

    // a série acaba em 75,9 °C subindo 2 por dia: 85 °C em ~4,5 dias
    expect(vida.trendMmSPerDay).toBeCloseTo(2, 1);
    expect(vida.daysToZoneD ?? 0).toBeGreaterThan(4);
    expect(vida.daysToZoneD ?? 0).toBeLessThan(6);
  });
});

describe('a dispensa, e quando ela deixa de valer', () => {
  it('não volta enquanto a medição não piora além do degrau', () => {
    const antes = { measure: 'vibração' as const, level: 3.0 };

    expect(reopensAfterDismissal(antes, { measure: 'vibração', level: 3.2 })).toBe(false);
    expect(reopensAfterDismissal(antes, { measure: 'vibração', level: 3.4 })).toBe(true);
  });

  it('melhorar não faz voltar', () => {
    expect(
      reopensAfterDismissal(
        { measure: 'vibração', level: 3.0 },
        { measure: 'vibração', level: 2.0 },
      ),
    ).toBe(false);
  });

  it('a outra medição é outra pergunta, e volta', () => {
    expect(
      reopensAfterDismissal(
        { measure: 'vibração', level: 3.0 },
        { measure: 'temperatura', level: 80 },
      ),
    ).toBe(true);
  });
});

describe('a nota que sai da sugestão', () => {
  const sugestão = sugere(série((dias) => 1.8 + 0.4 * dias + tremor(dias * 24)));

  it('nasce aberta, com origem tendência apontando para a sugestão', () => {
    if (!sugestão) throw new Error('a tendência deveria ter gerado sugestão');
    const nota = noteFromSuggestion(sugestão, 'NM-000123', '2026-06-15T13:00:00Z');

    expect(nota.status).toBe('aberta');
    expect(nota.origin).toBe('tendência');
    expect(nota.originRef).toBe(sugestão.id);
    expect(nota.symptom).toBe(sugestão.symptom);
    expect(nota.createdAt).toBe('2026-06-15T13:00:00Z');
    expect(noteOriginIsConsistent(nota)).toBe(true);
    expect(noteStatusIsConsistent(nota)).toBe(true);
  });

  it('a edição antes de confirmar substitui o que foi editado, e só isso', () => {
    if (!sugestão) throw new Error('a tendência deveria ter gerado sugestão');
    const nota = noteFromSuggestion(sugestão, 'NM-000123', '2026-06-15T13:00:00Z', {
      symptom: 'rolamento com ruído de pista, trocar na parada',
      priority: 1,
    });

    expect(nota.symptom).toBe('rolamento com ruído de pista, trocar na parada');
    expect(nota.priority).toBe(1);
    expect(nota.requiresShutdown).toBe(sugestão.requiresShutdown);
    expect(nota.evidence).toEqual(sugestão.evidence);
  });
});
