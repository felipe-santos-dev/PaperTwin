import type { ReactNode } from 'react';

/**
 * Número e unidade, do jeito do sistema visual.
 *
 * O número é JetBrains Mono com dígitos tabulares — numa coluna de valores os
 * algarismos alinham pela casa, e um 1 não é mais estreito que um 8. A unidade
 * vem sempre ao lado, menor e em cinza: ela informa, mas não compete com o
 * valor.
 */

export interface NumProps {
  /** O número já formatado (vírgula decimal, ponto de milhar). */
  readonly children: ReactNode;
  readonly unit?: string | null;
  /** Classe do número: tamanho, peso e cor. */
  readonly className?: string;
  /** Classe da unidade, quando precisa fugir do padrão. */
  readonly unitClassName?: string;
}

export function Num({ children, unit, className = '', unitClassName = '' }: NumProps) {
  return (
    <span className="whitespace-nowrap">
      <span className={`font-mono ${className}`}>{children}</span>
      {unit ? (
        <span className={`ml-1 text-[11px] font-normal text-fg-2 ${unitClassName}`}>{unit}</span>
      ) : null}
    </span>
  );
}

/** TAG de instrumento ou de ativo: mono, pequena, cinza. */
export function Tag({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`font-mono text-[10px] text-fg-3 ${className}`}>{children}</span>;
}
