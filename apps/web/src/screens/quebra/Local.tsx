import { MP1, type MaintenanceNote, type WebBreak } from '@mp1/shared';

import type { BreakPattern } from '../../api/process';
import { Panel } from '../../ui/Panel';
import { MachineMap2D } from '../mancais/MachineMap2D';

/**
 * Onde a folha arrebentou, o que já aconteceu ali antes, e a quem avisar.
 *
 * O mapa é o mesmo da tela de Mancais, com a seção da quebra marcada. Reusá-lo
 * não é economia de código: é a mesma máquina, e duas vistas laterais
 * diferentes na mesma aplicação fariam quem opera reaprender a geometria a cada
 * tela.
 */

export interface LocalProps {
  readonly webBreak: WebBreak;
  readonly pattern: BreakPattern;
  /** Notas abertas de equipamento da mesma seção. */
  readonly notas: readonly MaintenanceNote[];
  readonly onOpenNote: (number: string) => void;
  readonly className?: string;
}

export function Local({ webBreak, pattern, notas, onOpenNote, className = '' }: LocalProps) {
  const seção = MP1.sections.find((item) => item.id === webBreak.section);

  return (
    <Panel
      help="quebra.local"
      title="Onde, e o que já aconteceu ali"
      context={<span className="text-fg">{seção?.label ?? webBreak.section}</span>}
      className={className}
      bodyClassName="grid grid-cols-[minmax(0,1fr)_320px] gap-4"
    >
      <MachineMap2D rows={[]} selected={null} breakSection={webBreak.section} />

      <div className="flex min-h-0 flex-col gap-3">
        <div>
          <h3 className="mb-1 text-[11px] tracking-[0.05em] text-fg-3 uppercase">Padrão</h3>
          <p className="text-[12px] leading-[1.45] text-fg-2">{frase(pattern, seção?.label)}</p>
        </div>

        <div>
          <h3 className="mb-1 text-[11px] tracking-[0.05em] text-fg-3 uppercase">
            Notas abertas nesta seção
          </h3>
          {notas.length === 0 ? (
            <p className="text-[12px] text-fg-3">
              Nenhuma nota de manutenção aberta em equipamento desta seção.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {notas.slice(0, 6).map((nota) => (
                <li key={nota.number}>
                  <button
                    type="button"
                    onClick={() => {
                      onOpenNote(nota.number);
                    }}
                    className="flex w-full items-baseline gap-2 text-left text-[12px] hover:underline"
                  >
                    <span className="font-mono text-[11px] text-action">{nota.number}</span>
                    <span className="min-w-0 flex-1 truncate text-fg-2" title={nota.symptom}>
                      {nota.symptom}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-[11px] leading-[1.4] text-fg-3">
          Causa anotada pela operação: {webBreak.probableCause}. Ela é um palpite do turno, e pode
          não bater com o que os sinais mostram — as duas coisas ficam guardadas separadas.
        </p>
      </div>
    </Panel>
  );
}

/**
 * O padrão, dito com cuidado.
 *
 * Conta coincidências, não prevê a próxima. "Três das oito quebras anteriores
 * aqui começaram pela mesma variável" é uma informação que faz alguém ir olhar
 * aquele instrumento; "a causa é X" seria outra coisa, e esta conta não dá.
 */
function frase(pattern: BreakPattern, seção: string | undefined): string {
  const onde = seção ?? 'nesta seção';

  if (pattern.tag === null) {
    return `Esta quebra não teve um primeiro desvio para comparar com as anteriores em ${onde}.`;
  }

  if (pattern.sameSection === 0) {
    return `É a primeira quebra registrada em ${onde} no período guardado.`;
  }

  if (pattern.sameFirst === 0) {
    return `Nenhuma das ${String(pattern.sameSection)} quebras anteriores em ${onde} começou por ${pattern.tag}.`;
  }

  return (
    `${String(pattern.sameFirst)} das ${String(pattern.sameSection)} quebras anteriores em ` +
    `${onde} também começaram por ${pattern.tag}.`
  );
}
