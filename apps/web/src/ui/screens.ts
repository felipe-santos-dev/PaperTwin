import { useCallback, useEffect, useState } from 'react';

/**
 * As oito telas, na ordem do design.
 *
 * Turno primeiro, porque é o recorte em que tudo acontece; depois o caminho do
 * papel (processo, laboratório, bobinas), a condição dos equipamentos (mancais,
 * rondas, notas) e, por último, a máquina em 3D em tela cheia.
 */

export const SCREEN_IDS = [
  'turno',
  'processo',
  'laboratorio',
  'bobinas',
  'mancais',
  'rondas',
  'notas',
  'maquina',
] as const;

export type ScreenId = (typeof SCREEN_IDS)[number];

export interface Screen {
  readonly id: ScreenId;
  /** O nome por extenso, para o título e para o leitor de tela. */
  readonly label: string;
  /** O rótulo curto da navegação lateral, que tem 56 px de largura. */
  readonly short: string;
  /** A tecla que leva a ela: 1 a 8. */
  readonly key: string;
}

const LABELS: Readonly<Record<ScreenId, { label: string; short: string }>> = {
  turno: { label: 'Turno', short: 'Turno' },
  processo: { label: 'Processo', short: 'Processo' },
  laboratorio: { label: 'Laboratório', short: 'Lab.' },
  bobinas: { label: 'Bobinas', short: 'Bobinas' },
  mancais: { label: 'Mancais', short: 'Mancais' },
  rondas: { label: 'Rondas', short: 'Rondas' },
  notas: { label: 'Notas de manutenção', short: 'Notas' },
  maquina: { label: 'Máquina', short: 'Máquina' },
};

export const SCREENS: readonly Screen[] = SCREEN_IDS.map((id, index) => ({
  id,
  ...LABELS[id],
  key: String(index + 1),
}));

export const DEFAULT_SCREEN: ScreenId = 'turno';

/** A tela de um id, ou a padrão. */
export function screenOf(id: string | null): ScreenId {
  return SCREEN_IDS.includes(id as ScreenId) ? (id as ScreenId) : DEFAULT_SCREEN;
}

/** O id na âncora da URL, sem o `#`. */
function hashScreen(): ScreenId {
  return screenOf(window.location.hash.replace(/^#/, ''));
}

/**
 * A tela aberta, na URL e nas teclas 1–8.
 *
 * A tela mora na âncora da URL, e não num estado solto, por três razões: o botão
 * voltar do navegador funciona, um link para a tela de Mancais pode ser colado
 * numa conversa, e recarregar a página não joga quem estava olhando de volta
 * para o começo. `#maquina` continua valendo.
 *
 * As teclas são ignoradas quando o foco está num campo de texto — digitar "3" no
 * motivo de uma escrita de setpoint não pode levar a pessoa para outra tela e
 * perder o que ela escreveu.
 */
export function useScreen(): { screen: ScreenId; go: (id: ScreenId) => void } {
  const [screen, setScreen] = useState<ScreenId>(() =>
    typeof window === 'undefined' ? DEFAULT_SCREEN : hashScreen(),
  );

  const go = useCallback((id: ScreenId) => {
    window.location.hash = id;
    setScreen(id);
  }, []);

  useEffect(() => {
    const onHashChange = (): void => {
      setScreen(hashScreen());
    };

    window.addEventListener('hashchange', onHashChange);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const target = event.target;
      if (target instanceof HTMLElement) {
        const typing =
          target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
        if (typing) return;
      }

      const found = SCREENS.find((candidate) => candidate.key === event.key);
      if (!found) return;

      event.preventDefault();
      window.location.hash = found.id;
      setScreen(found.id);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return { screen, go };
}
