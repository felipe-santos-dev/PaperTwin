import { useCallback, useEffect, useState } from 'react';

/**
 * As sete telas, na ordem do protótipo aprovado.
 *
 * A ordem é a do trabalho, não a da arquitetura: o turno primeiro, porque é o
 * recorte em que tudo acontece; a máquina por último, porque é a vista geral a
 * que se volta. Entre elas, o caminho do papel e o da condição.
 */

export const SCREEN_IDS = [
  'turno',
  'bobinas',
  'processo',
  'mancais',
  'rondas',
  'notas',
  'maquina',
] as const;

export type ScreenId = (typeof SCREEN_IDS)[number];

export interface Screen {
  readonly id: ScreenId;
  readonly label: string;
  /** A tecla que leva a ela: 1 a 7, como no protótipo. */
  readonly key: string;
}

export const SCREENS: readonly Screen[] = SCREEN_IDS.map((id, index) => ({
  id,
  label: {
    turno: 'Turno',
    bobinas: 'Bobinas',
    processo: 'Processo',
    mancais: 'Mancais',
    rondas: 'Rondas',
    notas: 'Notas de manutenção',
    maquina: 'Máquina',
  }[id],
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
 * A tela aberta, na URL e nas teclas 1–7.
 *
 * A tela mora na âncora da URL, e não num estado solto, por três razões: o botão
 * voltar do navegador funciona, um link para a tela de Mancais pode ser colado
 * numa conversa, e recarregar a página não joga quem estava olhando de volta
 * para o começo.
 *
 * As teclas são as do protótipo. Elas são ignoradas quando o foco está num campo
 * de texto — digitar "3" no motivo de uma escrita de setpoint não pode levar a
 * pessoa para outra tela e perder o que ela escreveu.
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
